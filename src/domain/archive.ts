import type { Clock } from "../lib/clock";
import { dayStart, daysBetween, toDay, today } from "../lib/time";
import { attribution, type Snapshot } from "./snapshot";
import type { Item, ItemOutcome } from "./types";
import { spellCapitalised } from "./words";

/**
 * The archive: everything finished, closed, or decided against. Nothing is
 * ever deleted, only put down — so the groups read like a diary, newest first.
 */
export interface ArchiveRow {
  item: Item;
  /** done · replied · dropped — the little grey verb in the margin. */
  verb: ItemOutcome;
  where: string;
  /** "4 Sep" */
  when: string;
}

export interface ArchiveGroup {
  /** "This week", "August", "December 2025" */
  label: string;
  rows: ArchiveRow[];
}

export interface ArchiveModel {
  groups: ArchiveGroup[];
  /** "Ninety-one older items · nothing is ever deleted, only put down" */
  footer: string | null;
  total: number;
}

const SHOWN = 40;

export function buildArchive(
  snapshot: Snapshot,
  clock: Clock,
  clientId: number | null,
): ArchiveModel {
  const now = today(clock);
  const closed = snapshot.items
    .filter(
      (i) =>
        i.status === "closed" &&
        i.closedAt !== null &&
        (clientId === null || i.clientId === clientId),
    )
    .sort((a, b) => (b.closedAt as string).localeCompare(a.closedAt as string));

  const groups: ArchiveGroup[] = [];
  for (const item of closed.slice(0, SHOWN)) {
    const day = toDay(new Date(item.closedAt as string));
    const label =
      daysBetween(day, now) < 7
        ? "This week"
        : new Intl.DateTimeFormat("en-GB", {
            month: "long",
            ...(day.slice(0, 4) !== now.slice(0, 4) ? { year: "numeric" as const } : {}),
          }).format(dayStart(day));
    const last = groups[groups.length - 1];
    const row: ArchiveRow = {
      item,
      verb: item.outcome as ItemOutcome,
      where: attribution(snapshot, item),
      when: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
        dayStart(day),
      ),
    };
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }

  const older = closed.length - Math.min(closed.length, SHOWN);
  return {
    groups,
    footer:
      older > 0
        ? `${spellCapitalised(older)} older ${older === 1 ? "item" : "items"} · nothing is ever deleted, only put down`
        : closed.length > 0
          ? "Nothing is ever deleted, only put down."
          : null,
    total: closed.length,
  };
}
