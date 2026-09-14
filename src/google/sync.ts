import type { SqlDriver } from "../db/driver";
import { googleCalendars, googleEvents, meta } from "../db/repo";
import type { Clock } from "../lib/clock";
import { type Instant, nowInstant } from "../lib/time";
import { META_EMAIL, META_LAST_SYNC, getAccessToken } from "./auth";
import { listCalendars, listEvents } from "./api";

/**
 * One sync: refresh the calendar list, then replace the window of events for
 * every calendar still enabled. Whole-window replace means cancellations and
 * moves need no bookkeeping — what Google no longer returns simply disappears.
 */
export async function syncWindow(
  db: SqlDriver,
  clock: Clock,
  timeMin: Instant,
  timeMax: Instant,
): Promise<void> {
  const token = await getAccessToken(db, clock);

  const listings = await listCalendars(token);
  for (const listing of listings) {
    await googleCalendars.upsert(db, listing.id, listing.summary);
    // The primary calendar's id is the account's address — which saves the
    // app asking for a whole extra scope just to show who is signed in.
    if (listing.primary) await meta.set(db, META_EMAIL, listing.id);
  }

  const enabled = (await googleCalendars.list(db)).filter((c) => c.enabled);
  for (const calendar of enabled) {
    const events = await listEvents(token, calendar.id, timeMin, timeMax);
    await googleEvents.replaceWindow(db, clock, calendar.id, timeMin, timeMax, events);
  }

  await meta.set(db, META_LAST_SYNC, nowInstant(clock));
}
