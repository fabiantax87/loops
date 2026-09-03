import type { Clock } from "./clock";

/**
 * Two shapes of time live in the database and they are not interchangeable:
 *
 *   Instant — a UTC ISO-8601 string, for things that happened at a moment
 *             (when an item was created or closed).
 *   Day     — a local 'YYYY-MM-DD' string, for things that are true of a day
 *             (a wake date, "expect a reply by Friday").
 *
 * Both sort lexicographically, so ordering and comparison stay plain string
 * work. Crossing between them is the only fiddly part, and it happens here.
 */
export type Instant = string;
export type Day = string;

export function toInstant(date: Date): Instant {
  return date.toISOString();
}

export function nowInstant(clock: Clock): Instant {
  return toInstant(clock.now());
}

/** The local calendar day a Date falls on. */
export function toDay(date: Date): Day {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function today(clock: Clock): Day {
  return toDay(clock.now());
}

/** Local midnight at the start of a day. */
export function dayStart(day: Day): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** The first instant of the following day — the exclusive end of `day`. */
export function dayEnd(day: Day): Date {
  const start = dayStart(day);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0);
}

/**
 * A silence timer expects an answer *by the end of* its day, so "did anything
 * come in before the deadline" compares an instant against this.
 */
export function endOfDayInstant(day: Day): Instant {
  return toInstant(dayEnd(day));
}

export function addDays(day: Day, count: number): Day {
  const start = dayStart(day);
  return toDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + count, 12));
}

/** Whole days from `from` to `to`, negative when `to` is in the past. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / 86_400_000);
}

export function isBefore(a: Day, b: Day): boolean {
  return a < b;
}

/** Overdue means the day has already passed — not merely arrived. */
export function isOverdue(day: Day, clock: Clock): boolean {
  return day < today(clock);
}

export function isDueToday(day: Day, clock: Clock): boolean {
  return day === today(clock);
}

/** Due means it has surfaced: today or any day before it. */
export function isDue(day: Day, clock: Clock): boolean {
  return day <= today(clock);
}

export function daysAgo(instant: Instant, clock: Clock): number {
  return daysBetween(toDay(new Date(instant)), today(clock));
}
