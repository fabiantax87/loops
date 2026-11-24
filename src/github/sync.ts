import type { SqlDriver } from "../db/driver";
import { type PullFate, githubPulls, meta } from "../db/repo";
import type { Clock } from "../lib/clock";
import { nowInstant } from "../lib/time";
import { Unauthorized, listOpenPulls, pullFate } from "./api";
import { Disconnected, META_LAST_SYNC, credentials, forgetToken } from "./auth";

/**
 * One sync: ask GitHub which open pull requests are yours, find out what
 * became of the ones that no longer are, and hand both to the cache — which
 * closes the todos of the departed and makes todos for the arrivals.
 *
 * Nothing is written until every answer is in, so a sync that fails halfway
 * leaves the cache and the todos exactly as they were.
 */
export async function syncPulls(db: SqlDriver, clock: Clock): Promise<void> {
  const { token, login } = await credentials(db);
  try {
    const open = await listOpenPulls(token, login);
    const still = new Set(open.map((p) => p.key));
    const fates = new Map<string, PullFate>();
    for (const cached of await githubPulls.list(db)) {
      if (!still.has(cached.key)) fates.set(cached.key, await pullFate(token, login, cached));
    }
    await githubPulls.replaceAll(db, clock, open, fates);
  } catch (error) {
    if (error instanceof Unauthorized) {
      await forgetToken();
      throw new Disconnected("GitHub rejected the token");
    }
    throw error;
  }
  await meta.set(db, META_LAST_SYNC, nowInstant(clock));
}
