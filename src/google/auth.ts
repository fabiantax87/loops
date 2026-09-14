import type { SqlDriver } from "../db/driver";
import { googleEvents, meta } from "../db/repo";
import type { Clock } from "../lib/clock";

/**
 * Google sign-in, the installed-app way: a loopback listener on 127.0.0.1
 * catches the redirect, PKCE proves the exchange is ours, and the consent
 * screen opens in the real browser — never the webview. Google's "Desktop app"
 * clients ship a client secret that Google itself documents as not
 * confidential, so it lives in app_meta with the client id; the refresh token
 * is the actual credential and goes to the macOS Keychain.
 */

export const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const META_CLIENT_ID = "google_client_id";
export const META_CLIENT_SECRET = "google_client_secret";
export const META_EMAIL = "google_email";
export const META_LAST_SYNC = "google_last_sync";
const SECRET_REFRESH_TOKEN = "google_refresh_token";

/** Thrown when Google says the refresh token is dead — reconnect, don't retry. */
export class Disconnected extends Error {}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

let accessToken: { token: string; expiresAt: number } | null = null;

async function httpFetch(): Promise<typeof globalThis.fetch> {
  // The webview's own fetch is walled in by CORS; the plugin's goes via Rust.
  const { fetch } = await import("@tauri-apps/plugin-http");
  return fetch as typeof globalThis.fetch;
}

async function secret(op: "get"): Promise<string | null>;
async function secret(op: "set", value: string): Promise<null>;
async function secret(op: "delete"): Promise<null>;
async function secret(op: "get" | "set" | "delete", value?: string): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  if (op === "get") return await invoke<string | null>("secret_get", { key: SECRET_REFRESH_TOKEN });
  if (op === "set") await invoke("secret_set", { key: SECRET_REFRESH_TOKEN, value });
  if (op === "delete") await invoke("secret_delete", { key: SECRET_REFRESH_TOKEN });
  return null;
}

export async function isConnected(): Promise<boolean> {
  if (!("__TAURI_INTERNALS__" in window)) return false;
  try {
    return (await secret("get")) !== null;
  } catch {
    return false;
  }
}

/* ---- PKCE --------------------------------------------------------------- */

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/* ---- The dance ---------------------------------------------------------- */

/**
 * Opens the consent screen and waits for Google to knock on the loopback
 * port. Resolves once the refresh token is safely in the keychain.
 */
export async function connect(db: SqlDriver, clock: Clock): Promise<void> {
  const clientId = await meta.get(db, META_CLIENT_ID);
  const clientSecret = await meta.get(db, META_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error("no Google client configured");

  const { verifier, challenge } = await pkce();
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

  const oauth = await import("@fabianlars/tauri-plugin-oauth");
  const port = await oauth.start({
    response:
      "<html><body style='background:#101211;color:#b6bcb9;font-family:sans-serif;display:grid;place-items:center;height:100vh'>Signed in — you can close this tab and return to Loops.</body></html>",
  });
  const redirectUri = `http://127.0.0.1:${port}`;

  const redirect = new Promise<URL>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("sign-in timed out")),
      5 * 60 * 1000,
    );
    void oauth.onUrl((url) => {
      window.clearTimeout(timeout);
      resolve(new URL(url));
    });
  });

  const consent = new URL(AUTH_URL);
  consent.searchParams.set("client_id", clientId);
  consent.searchParams.set("redirect_uri", redirectUri);
  consent.searchParams.set("response_type", "code");
  consent.searchParams.set("scope", SCOPE);
  consent.searchParams.set("code_challenge", challenge);
  consent.searchParams.set("code_challenge_method", "S256");
  consent.searchParams.set("state", state);
  consent.searchParams.set("access_type", "offline");
  consent.searchParams.set("prompt", "consent");

  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(consent.toString());

  try {
    const landed = await redirect;
    if (landed.searchParams.get("state") !== state) throw new Error("state mismatch");
    const error = landed.searchParams.get("error");
    if (error) throw new Error(`Google said: ${error}`);
    const code = landed.searchParams.get("code");
    if (!code) throw new Error("no authorization code in the redirect");

    const fetch = await httpFetch();
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!response.ok) throw new Error(`token exchange failed (${response.status})`);
    const tokens = (await response.json()) as TokenResponse;
    if (!tokens.refresh_token) throw new Error("Google sent no refresh token");

    await secret("set", tokens.refresh_token);
    accessToken = {
      token: tokens.access_token,
      expiresAt: clock.now().getTime() + (tokens.expires_in - 60) * 1000,
    };
  } finally {
    await oauth.cancel(port).catch(() => undefined);
  }
}

/** A live access token, refreshed behind the scenes when it runs short. */
export async function getAccessToken(db: SqlDriver, clock: Clock): Promise<string> {
  if (accessToken && accessToken.expiresAt > clock.now().getTime()) return accessToken.token;

  const refreshToken = await secret("get");
  if (!refreshToken) throw new Disconnected("not connected to Google");
  const clientId = await meta.get(db, META_CLIENT_ID);
  const clientSecret = await meta.get(db, META_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Disconnected("no Google client configured");

  const fetch = await httpFetch();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // A revoked or expired grant means the connection itself is gone.
    if (body.includes("invalid_grant")) {
      await secret("delete").catch(() => undefined);
      throw new Disconnected("Google access was revoked");
    }
    throw new Error(`token refresh failed (${response.status})`);
  }
  const tokens = (await response.json()) as TokenResponse;
  accessToken = {
    token: tokens.access_token,
    expiresAt: clock.now().getTime() + (tokens.expires_in - 60) * 1000,
  };
  return accessToken.token;
}

/** Lets go of everything: the grant, the keychain entry, the cached events. */
export async function disconnect(db: SqlDriver): Promise<void> {
  const refreshToken = await secret("get").catch(() => null);
  if (refreshToken) {
    const fetch = await httpFetch();
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
      method: "POST",
    }).catch(() => undefined);
  }
  await secret("delete").catch(() => undefined);
  accessToken = null;
  await googleEvents.clear(db);
  await meta.set(db, META_EMAIL, "");
  await meta.set(db, META_LAST_SYNC, "");
}
