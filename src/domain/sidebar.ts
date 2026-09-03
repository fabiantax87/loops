import type { Clock } from "../lib/clock";
import { today } from "../lib/time";
import type { Snapshot } from "./snapshot";
import type { Tone } from "./today";
import type { Client } from "./types";
import { countOf } from "./words";

/**
 * The sidebar is exception-based: a client who is fine renders dim and says
 * nothing. Only a missed deadline or an answer overdue earn ink — which is
 * what makes "grey means fine" true rather than decorative.
 */
export interface ClientSignal {
  client: Client;
  late: number;
  owed: number;
  /** The one word the sidebar shows, or null when the client is fine. */
  badge: string | null;
  tone: Tone;
  fine: boolean;
}

export function clientSignals(snapshot: Snapshot, clock: Clock): ClientSignal[] {
  const now = today(clock);

  const signals = snapshot.clients
    .filter((c) => c.archivedAt === null)
    .map((client) => {
      const open = snapshot.items.filter(
        (i) => i.clientId === client.id && i.status === "open",
      );
      const late = open.filter(
        (i) => i.kind === "todo" && i.deadline !== null && i.deadline < now,
      ).length;
      const owed = open.filter(
        (i) => i.kind === "waiting" && i.checkinOn !== null && i.checkinOn <= now,
      ).length;

      // Lateness is the only red thing in the app, and it outranks the rest.
      let badge: string | null = null;
      let tone: Tone = "grey";
      if (late > 0) {
        badge = countOf(late, "late", "late");
        tone = "red";
      } else if (owed > 0) {
        badge = "waiting";
        tone = "amber";
      }

      return { client, late, owed, badge, tone, fine: badge === null };
    });

  // Everyone who wants something, then everyone who doesn't.
  return signals.sort(
    (a, b) =>
      Number(a.fine) - Number(b.fine) ||
      a.client.name.localeCompare(b.client.name, "en", { sensitivity: "base" }),
  );
}
