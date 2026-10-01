import type { SqlDriver } from "../db/driver";
import { meta, productiveBookings } from "../db/repo";
import { identify } from "./api";

/**
 * Productive has no OAuth for personal use: you generate a personal API token
 * under Settings → API integrations and send it with every call, together
 * with the organization id. The token is the credential, so it goes to the
 * macOS Keychain beside the Google refresh token; the organization id and the
 * person id it resolves to are just facts and live in app_meta.
 */

export const META_ORG_ID = "productive_org_id";
export const META_ORG_NAME = "productive_org_name";
export const META_PERSON_ID = "productive_person_id";
export const META_LAST_SYNC = "productive_last_sync";
const SECRET_TOKEN = "productive_token";

/** Thrown when Productive rejects the token — reconnect, don't retry. */
export class Disconnected extends Error {}

export interface Credentials {
  token: string;
  orgId: string;
  personId: string;
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

/**
 * Proves the token works, learns who it belongs to, and only then keeps it.
 * `email` is a fallback for finding the person when the memberships call
 * doesn't give it away.
 */
export async function connect(
  db: SqlDriver,
  token: string,
  orgId: string,
  email: string | null,
): Promise<void> {
  const who = await identify(token.trim(), orgId.trim(), email?.trim() || null);
  await secret("set", token.trim());
  await meta.set(db, META_ORG_ID, orgId.trim());
  await meta.set(db, META_PERSON_ID, who.personId);
  await meta.set(db, META_ORG_NAME, who.orgName ?? "");
}

export async function credentials(db: SqlDriver): Promise<Credentials> {
  const token = await secret("get");
  const orgId = await meta.get(db, META_ORG_ID);
  const personId = await meta.get(db, META_PERSON_ID);
  if (!token || !orgId || !personId) throw new Disconnected("not connected to Productive");
  return { token, orgId, personId };
}

/** A rejected token is gone for good; forget it so the footer says so. */
export async function forgetToken(): Promise<void> {
  await secret("delete").catch(() => undefined);
}

/** Lets go of everything: the token, the identity, the cached bookings. */
export async function disconnect(db: SqlDriver): Promise<void> {
  await forgetToken();
  await productiveBookings.clear(db);
  await meta.set(db, META_PERSON_ID, "");
  await meta.set(db, META_ORG_NAME, "");
  await meta.set(db, META_LAST_SYNC, "");
}
