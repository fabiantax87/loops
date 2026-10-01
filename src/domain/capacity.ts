import { type Day, dayStart } from "../lib/time";
import type { Block, DayEntries } from "./calendar";

/**
 * Productive plans work in day-level allocations: "six hours on this project,
 * Monday to Wednesday". A booking never says *when* in the day, so it is not a
 * block on the hour grid — it is committed time, and the capacity strip is
 * where it meets the meetings and timed tasks that are.
 */
export interface Booking {
  id: string;
  /** The project's name, or the budget's when the deal has no project. */
  project: string;
  client: string | null;
  /** Local days, both ends inclusive, exactly as Productive stores them. */
  startDay: Day;
  endDay: Day;
  minutesPerDay: number;
  note: string | null;
  url: string | null;
  draft: boolean;
}

/** An eight-hour day: what the strip fills towards and what "over" means. */
export const DAY_CAPACITY_MINUTES = 8 * 60;

/** Bookings run over working days only; a Monday–Friday booking skips nothing. */
export function bookingsOn(bookings: Booking[], day: Day): Booking[] {
  const dow = dayStart(day).getDay();
  if (dow === 0 || dow === 6) return [];
  return bookings.filter((b) => b.startDay <= day && day <= b.endDay);
}

/** "Eurotransplant · Corporate" — the booking's own line. */
export function bookingLabel(booking: Booking): string {
  return booking.client && booking.client !== booking.project
    ? `${booking.client} · ${booking.project}`
    : booking.project;
}

export type CapacityKind = "booking" | "meeting" | "task";

/** One contributor to the day's total, as the detail sheet lists them. */
export type CapacityLine = { minutes: number } & (
  | { kind: "booking"; booking: Booking }
  | { kind: "meeting"; block: Block }
  | { kind: "task"; block: Block }
);

export interface DayCapacity {
  bookings: Booking[];
  bookedMinutes: number;
  meetingMinutes: number;
  taskMinutes: number;
  totalMinutes: number;
  /** Past the eight hours; zero when the day fits. */
  overMinutes: number;
  lines: CapacityLine[];
  /** Productive isn't syncing, so bookings are missing rather than absent. */
  bookingsUnavailable: boolean;
}

/**
 * The whole committed day. Segments add up: a booking is project hours and a
 * meeting for that client sits on top of them, which is exactly the overload
 * worth knowing about. Untimed tasks in the shelf have no length and don't
 * count.
 */
export function dayCapacity(
  entries: DayEntries,
  bookings: Booking[],
  options: { bookingsSynced: boolean },
): DayCapacity {
  const lines: CapacityLine[] = [];
  const onDay = options.bookingsSynced ? bookingsOn(bookings, entries.day) : [];
  for (const booking of onDay) {
    lines.push({ kind: "booking", booking, minutes: booking.minutesPerDay });
  }
  for (const block of entries.blocks) {
    const minutes = block.endMinutes - block.startMinutes;
    if (block.content.type === "meeting") lines.push({ kind: "meeting", block, minutes });
    else lines.push({ kind: "task", block, minutes });
  }
  const sum = (kind: CapacityKind) =>
    lines.filter((l) => l.kind === kind).reduce((n, l) => n + l.minutes, 0);
  const bookedMinutes = sum("booking");
  const meetingMinutes = sum("meeting");
  const taskMinutes = sum("task");
  const totalMinutes = bookedMinutes + meetingMinutes + taskMinutes;
  return {
    bookings: onDay,
    bookedMinutes,
    meetingMinutes,
    taskMinutes,
    totalMinutes,
    overMinutes: Math.max(0, totalMinutes - DAY_CAPACITY_MINUTES),
    lines,
    bookingsUnavailable: !options.bookingsSynced,
  };
}

/** The strip earns its row only when something has a length. */
export function showsStrip(capacity: DayCapacity): boolean {
  return capacity.totalMinutes > 0;
}

/* ---- Words for lengths -------------------------------------------------- */

/** "6h" · "1h45" · "45 min" — the mono label. */
export function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** "8h45 of 8" · "8h45 · 45 min over" — what sits beside the strip. */
export function totalLabel(capacity: DayCapacity): string {
  const total = hoursLabel(capacity.totalMinutes);
  if (capacity.overMinutes > 0) return `${total} · ${hoursLabel(capacity.overMinutes)} over`;
  return `${total} of ${DAY_CAPACITY_MINUTES / 60}`;
}

const HOUR_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

/**
 * A length as it would be said: "six hours", "an hour and a half", "forty-five
 * minutes". Anything that doesn't fall on a quarter goes back to the label.
 */
export function durationWords(minutes: number): string {
  if (minutes <= 0) return "nothing";
  if (minutes < 60) {
    if (minutes === 15) return "a quarter of an hour";
    if (minutes === 30) return "half an hour";
    if (minutes === 45) return "three quarters of an hour";
    return `${MINUTE_WORDS[minutes] ?? minutes} minutes`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = HOUR_WORDS[h] ?? String(h);
  if (m === 0) return h === 1 ? "an hour" : `${hours} hours`;
  if (h === 1) {
    if (m === 30) return "an hour and a half";
    if (m === 15) return "an hour and a quarter";
    if (m === 45) return "an hour and three quarters";
  } else {
    if (m === 30) return `${hours} and a half hours`;
    if (m === 15) return `${hours} and a quarter hours`;
    if (m === 45) return `${hours} and three quarter hours`;
  }
  return hoursLabel(minutes);
}

const MINUTE_WORDS: Record<number, string> = {
  5: "five",
  10: "ten",
  20: "twenty",
  25: "twenty-five",
  35: "thirty-five",
  40: "forty",
  50: "fifty",
  55: "fifty-five",
};

/** Sentence-leading: "Forty-five minutes to spare." */
export function capitalise(words: string): string {
  return words[0].toUpperCase() + words.slice(1);
}
