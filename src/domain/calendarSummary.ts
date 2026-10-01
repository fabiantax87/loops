import { type Day, dayStart } from "../lib/time";
import type { DayEntries, MonthCell, WeekDayModel } from "./calendar";
import {
  type Booking,
  type DayCapacity,
  DAY_CAPACITY_MINUTES,
  capitalise,
  durationWords,
} from "./capacity";
import { plural, sentences, spell, spellCapitalised } from "./words";

/**
 * The line under the date: the day as a sentence, so the shape of it reads
 * before the grid does. Project time first (it frames the day), then the
 * meetings and timed work, then the deadlines, and last the verdict on
 * capacity — which is the one part allowed to raise its voice.
 */
export interface Summary {
  text: string;
  /** The amber clause, when the day or week runs over or can't be trusted. */
  warning: string | null;
}

/* ---- Bits of sentences --------------------------------------------------- */

/** "ten" · "half past ten" · "quarter to eleven" · "10:20" */
export function clockWords(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour = (n: number) => spell(((n + 11) % 12) + 1);
  if (m === 0) return hour(h);
  if (m === 30) return `half past ${hour(h)}`;
  if (m === 15) return `quarter past ${hour(h)}`;
  if (m === 45) return `quarter to ${hour(h + 1)}`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function weekdayName(day: Day): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(dayStart(day));
}

/** "Tuesday" · "Tuesday and Wednesday" · "Monday, Tuesday and Wednesday" */
function listOf(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function bookingClause(capacity: DayCapacity, isToday: boolean): string | null {
  const bookings = capacity.bookings;
  if (bookings.length === 0) {
    return capacity.bookingsUnavailable || capacity.totalMinutes === 0
      ? null
      : `No project time booked${isToday ? " today" : ""}.`;
  }
  if (bookings.length === 1) {
    const [b] = bookings;
    return `You're on ${b.project}${isToday ? " today" : ""}, ${durationWords(b.minutesPerDay)}.`;
  }
  const [first, ...rest] = bookings;
  const parts = [
    `${capitalise(durationWords(first.minutesPerDay))} on ${first.project}`,
    ...rest.map((b) => `${shortDuration(b.minutesPerDay)} on ${b.project}`),
  ];
  return `${parts.join(", ")}.`;
}

/** After "four hours on X", the next reads "two on Y" — the unit carries. */
function shortDuration(minutes: number): string {
  if (minutes % 60 === 0) return spell(minutes / 60);
  return durationWords(minutes);
}

function meetingsClause(entries: DayEntries, isToday: boolean): string {
  const timed = entries.blocks
    .filter((b) => b.content.type === "meeting")
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const count = timed.length + entries.allDayMeetings.length;
  const tasks = entries.blocks.filter((b) => b.content.type === "task");
  const blocked = tasks.reduce((n, b) => n + (b.endMinutes - b.startMinutes), 0);
  const blockedClause =
    tasks.length === 0
      ? ""
      : `${durationWords(blocked)} blocked for ${
          tasks.length === 1 ? "a task" : `${spell(tasks.length)} tasks`
        }`;

  if (count === 0) {
    if (tasks.length === 0) return `No meetings${isToday ? " today" : ""}.`;
    return `No meetings${isToday ? " today" : ""}, but ${blockedClause}.`;
  }
  let head =
    count === 1
      ? timed.length === 1
        ? `One meeting, at ${clockWords(timed[0].startMinutes)}`
        : "One meeting, all day"
      : timed.length > 0
        ? `${spellCapitalised(count)} meetings, the first at ${clockWords(timed[0].startMinutes)}`
        : `${spellCapitalised(count)} meetings, all day`;
  if (blockedClause) head += `, and ${blockedClause}`;
  return `${head}.`;
}

function deadlinesClause(entries: DayEntries): string | null {
  const untimed = entries.untimedTasks;
  if (untimed.length === 0) return null;
  const late = untimed.filter((t) => t.late).length;
  const head = `${spellCapitalised(untimed.length)} ${plural(untimed.length, "task")} ${
    untimed.length === 1 ? "is" : "are"
  } due by end of day`;
  if (late === 0) return `${head}.`;
  return `${head}, ${late === untimed.length ? (late === 1 ? "already late" : "all already late") : `${spell(late)} already late`}.`;
}

function verdict(capacity: DayCapacity, isToday: boolean): { text: string; warning: boolean } {
  if (capacity.overMinutes > 0) {
    return {
      text: `Booked past eight${isToday ? " today" : ""}, ${durationWords(capacity.overMinutes)} over.`,
      warning: true,
    };
  }
  if (capacity.totalMinutes === 0) return { text: "The day is yours.", warning: false };
  const spare = DAY_CAPACITY_MINUTES - capacity.totalMinutes;
  if (spare === 0) return { text: "That fills the day.", warning: false };
  if (spare <= 2 * 60) return { text: `${capitalise(durationWords(spare))} to spare.`, warning: false };
  return { text: `${capitalise(durationWords(capacity.totalMinutes))} committed.`, warning: false };
}

const UNSYNCED_DAY = "Productive isn't syncing, so project time is missing from today.";
const UNSYNCED = "Productive isn't syncing, so project time is missing.";

/* ---- The three views ----------------------------------------------------- */

export function daySummary(
  entries: DayEntries,
  capacity: DayCapacity,
  isToday: boolean,
): Summary {
  const end = verdict(capacity, isToday);
  const unsynced = capacity.bookingsUnavailable && capacity.totalMinutes > 0;
  const text = sentences(
    bookingClause(capacity, isToday),
    meetingsClause(entries, isToday),
    deadlinesClause(entries),
    !unsynced && end.text,
  );
  if (unsynced) {
    return {
      text: sentences(text, isToday ? UNSYNCED_DAY : UNSYNCED),
      warning: isToday ? UNSYNCED_DAY : UNSYNCED,
    };
  }
  return { text, warning: end.warning ? end.text : null };
}

function weekBookingsClause(days: WeekDayModel[], thisWeek: boolean): string | null {
  const byProject = new Map<string, { minutes: number; days: Day[] }>();
  for (const day of days) {
    for (const b of day.capacity.bookings) {
      const entry = byProject.get(b.project) ?? { minutes: 0, days: [] };
      entry.minutes += b.minutesPerDay;
      entry.days.push(day.day);
      byProject.set(b.project, entry);
    }
  }
  if (byProject.size === 0) return null;
  const ranked = [...byProject.entries()].sort((a, b) => b[1].minutes - a[1].minutes);
  const total = ranked.reduce((n, [, v]) => n + v.minutes, 0);
  const when = thisWeek ? " this week" : "";
  const [lead, ...others] = ranked;
  if (others.length === 0) return `${lead[0]}${when}, ${durationWords(total)} in all.`;
  if (lead[1].minutes * 2 > total) {
    const rest = others.map(([name, v]) => `${name} on ${listOf(v.days.map(weekdayName))}`);
    return `Mostly ${lead[0]}${when}, ${listOf(rest)}.`;
  }
  return `${listOf(ranked.map(([name]) => name))}${when}.`;
}

function weekMeetingsClause(days: WeekDayModel[]): string {
  const counts = days.map(
    (d) =>
      d.entries.allDayMeetings.length +
      d.entries.blocks.filter((b) => b.content.type === "meeting").length,
  );
  const total = counts.reduce((n, c) => n + c, 0);
  if (total === 0) return "No meetings.";
  if (total === 1) return "One meeting.";
  const max = Math.max(...counts);
  const heaviest = days.filter((_, i) => counts[i] === max);
  const tail = heaviest.length === 1 && max > 1 ? `, heaviest on ${weekdayName(heaviest[0].day)}` : "";
  return `${spellCapitalised(total)} meetings${tail}.`;
}

function weekDeadlinesClause(days: WeekDayModel[]): string | null {
  const tasks = days.flatMap((d) => [
    ...d.entries.untimedTasks,
    ...d.entries.blocks.flatMap((b) => (b.content.type === "task" ? [b.content.task] : [])),
  ]);
  if (tasks.length === 0) return null;
  const late = tasks.filter((t) => t.late).length;
  const head = `${spellCapitalised(tasks.length)} ${plural(tasks.length, "deadline")}`;
  if (late === 0) return `${head}.`;
  return `${head}, ${late === 1 ? "one" : spell(late)} already past.`;
}

function clearDaysClause(days: WeekDayModel[]): string | null {
  const clear = days.filter(
    (d) =>
      d.capacity.totalMinutes === 0 &&
      d.entries.untimedTasks.length === 0 &&
      d.entries.allDayMeetings.length === 0,
  );
  if (clear.length === 0 || clear.length === days.length) return null;
  const names = listOf(clear.map((d) => weekdayName(d.day)));
  return `${names} ${clear.length === 1 ? "is" : "are"} clear.`;
}

export function weekSummary(days: WeekDayModel[], bookingsSynced: boolean): Summary {
  const over = days.filter((d) => d.capacity.overMinutes > 0);
  const overClause =
    over.length === 0
      ? null
      : `${listOf(over.map((d) => weekdayName(d.day)))} ${over.length === 1 ? "runs" : "run"} over.`;
  const thisWeek = days.some((d) => d.isToday);
  const warning = overClause ?? (bookingsSynced ? null : UNSYNCED);
  return {
    text: sentences(
      weekBookingsClause(days, thisWeek),
      weekMeetingsClause(days),
      weekDeadlinesClause(days),
      clearDaysClause(days),
      warning,
    ),
    warning,
  };
}

export function monthSummary(cells: MonthCell[], bookingsSynced: boolean): Summary {
  const inMonth = cells.filter((c) => c.inMonth);
  const tasks = inMonth.reduce((n, c) => n + c.taskCount + c.lateCount, 0);
  const late = inMonth.reduce((n, c) => n + c.lateCount, 0);
  const over = inMonth.filter((c) => c.overMinutes > 0).length;
  const deadlines =
    tasks === 0
      ? "No deadlines this month."
      : `${spellCapitalised(tasks)} ${plural(tasks, "deadline")} this month${
          late > 0 ? `, ${late === 1 ? "one" : spell(late)} already past` : ""
        }.`;
  const overClause =
    over === 0 ? null : `${spellCapitalised(over)} ${plural(over, "day")} ${over === 1 ? "runs" : "run"} over.`;
  const warning = overClause ?? (bookingsSynced ? null : UNSYNCED);
  return { text: sentences(deadlines, warning), warning };
}

/** Which projects a month cell names under its counts. */
export function cellProjects(bookings: Booking[]): string[] {
  return [...new Set(bookings.map((b) => b.project))];
}
