import type { SqlDriver } from "../db/driver";
import { githubPulls, meta } from "../db/repo";
import { identify } from "./api";

/**
 * GitHub is reached with a personal access token: a classic one with the
 * `repo` scope, or a fine-grained one that can read pull requests in the
 * repositories that matter. The token is the credential, so it goes to the
 * macOS Keychain beside the other two; the login it resolves to is just a
 * fact and lives in app_meta.
 */

export const META_LOGIN = "github_login";
export const META_LAST_SYNC = "github_last_sync";
const SECRET_TOKEN = "github_token";

/** Thrown when GitHub rejects the token — reconnect, don't retry. */
export class Disconnected extends Error {}

export interface Credentials {
  token: string;
  login: string;
}

async function secret(op: "get"): Promise<string | null>;
async function secret(op: "set", value: string): Promise<null>;
async function secret(op: "delete"): Promise<null>;
async function secret(op: "get" | "set" | "delete", value?: string): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  if (op === "get") return await invoke<string | null>("secret_get", { key: SECRET_TOKEN });
  if (op === "set") await invoke("secret_set", { key: SECRET_TOKEN, value });
  if (op === "delete") await invoke("secret_delete", { key: SECRET_TOKEN });
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

/** Proves the token works, learns whose it is, and only then keeps it. */
export async function connect(db: SqlDriver, token: string): Promise<void> {
  const login = await identify(token.trim());
  await secret("set", token.trim());
  await meta.set(db, META_LOGIN, login);
}

export async function credentials(db: SqlDriver): Promise<Credentials> {
  const token = await secret("get");
  const login = await meta.get(db, META_LOGIN);
  if (!token || !login) throw new Disconnected("not connected to GitHub");
  return { token, login };
}

/** A rejected token is gone for good; forget it so the rail says so. */
export async function forgetToken(): Promise<void> {
  await secret("delete").catch(() => undefined);
}

/**
 * Lets go of the token and the cached pull requests. The todos they made are
 * yours and stay, as do the repositories each project was given.
 */
export async function disconnect(db: SqlDriver): Promise<void> {
  await forgetToken();
  await githubPulls.clear(db);
  await meta.set(db, META_LOGIN, "");
  await meta.set(db, META_LAST_SYNC, "");
}
