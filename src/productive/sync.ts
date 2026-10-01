import type { SqlDriver } from "../db/driver";
import { meta, productiveBookings } from "../db/repo";
import type { Clock } from "../lib/clock";
import { type Day, nowInstant } from "../lib/time";
import { listBookings, Unauthorized } from "./api";
import { Disconnected, META_LAST_SYNC, credentials, forgetToken } from "./auth";

/**
 * One sync: fetch the window of bookings and replace the cache for it. A
 * rejected token is forgotten on the spot, so the footer can say the
 * bookings are hidden rather than quietly showing stale ones.
 */
export async function syncWindow(
  db: SqlDriver,
  clock: Clock,
  fromDay: Day,
  toDay: Day,
): Promise<void> {
  const { token, orgId, personId } = await credentials(db);
  let bookings;
  try {
    bookings = await listBookings(token, orgId, personId, fromDay, toDay);
  } catch (error) {
    if (error instanceof Unauthorized) {
      await forgetToken();
      throw new Disconnected("Productive rejected the token");
    }
    throw error;
  }
  await productiveBookings.replaceWindow(db, clock, fromDay, toDay, bookings);
  await meta.set(db, META_LAST_SYNC, nowInstant(clock));
}
