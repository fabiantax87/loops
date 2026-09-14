import type { Clock } from "../lib/clock";
import {
  type Day,
  type Instant,
  addDays,
  dayEnd,
  dayStart,
  instantToDay,
  localTime,
  minutesOfDay,
  monthGrid,
  startOfWeek,
  today,
  weekdays,
} from "../lib/time";
import { attribution, openItems, type Snapshot } from "./snapshot";
import type { Item } from "./types";
import { countOf } from "./words";

/**
 * The calendar puts two different worlds on one grid: the app's own items
 * (todos owed on a day, waiting-ons to chase) and Google Calendar meetings.
 * Meetings are somebody else's data — read-only here, edited only in Google —
 * so they are a shape of their own, never coerced into an Item.
 */

export interface MeetingAttendee {
  name: string | null;
  email: string;
  self: boolean;
  /** Google's responseStatus: accepted, declined, tentative, needsAction. */
  response: string | null;
}

export interface Meeting {
  id: string;
  calendarId: string;
  title: string;
  /** Timed events carry UTC instants; all-day events carry local days. */
  allDay: boolean;
  start: Instant | null;
  end: Instant | null;
  startDay: Day | null;
  /** Exclusive, exactly as Google hands it over. */
  endDay: Day | null;
  location: string | null;
  description: string | null;
  attendees: MeetingAttendee[];
  meetUrl: string | null;
  htmlLink: string | null;
  status: string;
}

export type CalendarView = "day" | "week" | "month";

/** An item as the calendar sees it: a task owed, or a check-in to make. */
export interface TaskEntry {
  item: Item;
  kind: "task" | "checkin";
  /** Its day is behind us and it is still open — the only red on the grid. */
  late: boolean;
  where: string;
}

export type BlockContent =
  | { type: "meeting"; meeting: Meeting }
  | { type: "task"; task: TaskEntry };

/** Anything with a moment and a length, placed on the hour grid. */
export interface Block {
  key: string;
  /** Minutes past local midnight, clipped to the rendered day. */
  startMinutes: number;
  endMinutes: number;
  /** 'HH:MM – HH:MM' of the real thing, unclipped. */
  timeLabel: string;
  lane: number;
  lanes: number;
  content: BlockContent;
}

export interface DayEntries {
  day: Day;
  allDayMeetings: Meeting[];
  /** Tasks with no moment on this day — the "N tasks due today" pill. */
  untimedTasks: TaskEntry[];
  blocks: Block[];
}

export interface WeekPill {
  kind: "single" | "grouped";
  /** The task itself when it is alone and on time. */
  title: string | null;
  count: number;
  lateCount: number;
}

export interface WeekDayModel {
  day: Day;
  isToday: boolean;
  entries: DayEntries;
  pill: WeekPill | null;
  nowMinutes: number | null;
}

export interface MonthCell {
  day: Day;
  inMonth: boolean;
  isWeekend: boolean;
  isToday: boolean;
  taskCount: number;
  lateCount: number;
  meetingCount: number;
}

export interface CalendarHeader {
  /** "Monday 14 September" · "14 – 20 September" · "September 2026" */
  rangeLabel: string;
}

export type CalendarModel = CalendarHeader &
  (
    | {
        view: "day";
        anchor: Day;
        entries: DayEntries;
        startHour: number;
        endHour: number;
        nowMinutes: number | null;
      }
    | {
        view: "week";
        anchor: Day;
        days: WeekDayModel[];
        startHour: number;
        endHour: number;
      }
    | { view: "month"; anchor: Day; weeks: MonthCell[][] }
  );

export const DEFAULT_TASK_MINUTES = 30;

export function taskMinutes(item: Item): number {
  return item.durationMinutes ?? DEFAULT_TASK_MINUTES;
}

/* ---- What belongs to a day --------------------------------------------- */

/**
 * The items a day carries. Every open item shows on its own day — late when
 * that day has passed. The day view additionally collects everything overdue
 * onto today (`collectOverdue`), because today is where the chasing happens;
 * the week and month keep each item on its own day so nothing counts twice.
 */
export function tasksForDay(
  snapshot: Snapshot,
  clock: Clock,
  day: Day,
  options: { collectOverdue?: boolean } = {},
): TaskEntry[] {
  const now = today(clock);
  const entries: TaskEntry[] = [];
  for (const item of openItems(snapshot)) {
    const owed =
      item.kind === "todo" ? item.deadline : item.kind === "waiting" ? item.checkinOn : null;
    if (owed === null) continue;
    const late = owed < now;
    const shownHere = owed === day || (options.collectOverdue === true && day === now && late);
    if (!shownHere) continue;
    entries.push({
      item,
      kind: item.kind === "waiting" ? "checkin" : "task",
      late,
      where: attribution(snapshot, item),
    });
  }
  // Late first, then by their moment, then by age — a stable read.
  return entries.sort(
    (a, b) =>
      Number(b.late) - Number(a.late) ||
      (timeOf(a.item) ?? "99").localeCompare(timeOf(b.item) ?? "99") ||
      a.item.createdAt.localeCompare(b.item.createdAt),
  );
}

function timeOf(item: Item): string | null {
  return item.kind === "waiting" ? item.checkinTime : item.deadlineTime;
}

/** A task earns a spot on the hour grid only on its own day, at its moment. */
function isTimedOn(entry: TaskEntry, day: Day): boolean {
  const owed = entry.item.kind === "waiting" ? entry.item.checkinOn : entry.item.deadline;
  return owed === day && timeOf(entry.item) !== null;
}

function meetingOnDay(meeting: Meeting, day: Day): "allDay" | "timed" | null {
  if (meeting.status === "cancelled") return null;
  if (meeting.allDay) {
    return meeting.startDay !== null &&
      meeting.startDay <= day &&
      day < (meeting.endDay ?? addDays(meeting.startDay, 1))
      ? "allDay"
      : null;
  }
  if (meeting.start === null || meeting.end === null) return null;
  const start = new Date(meeting.start);
  const end = new Date(meeting.end);
  return start < dayEnd(day) && end > dayStart(day) ? "timed" : null;
}

function clipMinutes(instant: Instant, day: Day, edge: "start" | "end"): number {
  if (instantToDay(instant) !== day) return edge === "start" ? 0 : 24 * 60;
  const at = new Date(instant);
  return at.getHours() * 60 + at.getMinutes();
}

function hhmm(instant: Instant): string {
  const at = new Date(instant);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

export function entriesForDay(
  snapshot: Snapshot,
  meetings: Meeting[],
  clock: Clock,
  day: Day,
  options: { collectOverdue?: boolean } = {},
): DayEntries {
  const tasks = tasksForDay(snapshot, clock, day, options);
  const untimedTasks = tasks.filter((t) => !isTimedOn(t, day));

  const blocks: Block[] = [];
  for (const entry of tasks.filter((t) => isTimedOn(t, day))) {
    const start = minutesOfDay(timeOf(entry.item) as string);
    const end = Math.min(24 * 60, start + taskMinutes(entry.item));
    blocks.push({
      key: `item-${entry.item.id}`,
      startMinutes: start,
      endMinutes: end,
      timeLabel: `${timeOf(entry.item)} – ${minutesToHhmm(end)}`,
      lane: 0,
      lanes: 1,
      content: { type: "task", task: entry },
    });
  }

  const allDayMeetings: Meeting[] = [];
  for (const meeting of meetings) {
    const on = meetingOnDay(meeting, day);
    if (on === "allDay") allDayMeetings.push(meeting);
    if (on !== "timed") continue;
    blocks.push({
      key: `meeting-${meeting.calendarId}-${meeting.id}`,
      startMinutes: clipMinutes(meeting.start as Instant, day, "start"),
      endMinutes: clipMinutes(meeting.end as Instant, day, "end"),
      timeLabel: `${hhmm(meeting.start as Instant)} – ${hhmm(meeting.end as Instant)}`,
      lane: 0,
      lanes: 1,
      content: { type: "meeting", meeting },
    });
  }

  return { day, allDayMeetings, untimedTasks, blocks: layoutBlocks(blocks) };
}

export function minutesToHhmm(minutes: number): string {
  const clamped = Math.min(Math.max(0, minutes), 24 * 60 - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/* ---- Laying blocks out side by side ------------------------------------ */

/**
 * Overlapping blocks share the width. Blocks are clustered by transitive
 * overlap; within a cluster each takes the first free lane, and every member
 * is told how many lanes the cluster ended up needing.
 */
export function layoutBlocks(blocks: Block[]): Block[] {
  const sorted = [...blocks].sort(
    (a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes,
  );

  let cluster: Block[] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    const lanes = Math.max(1, ...cluster.map((b) => b.lane + 1));
    for (const block of cluster) block.lanes = lanes;
    cluster = [];
  };

  const laneEnds: number[] = [];
  for (const block of sorted) {
    if (cluster.length > 0 && block.startMinutes >= clusterEnd) {
      closeCluster();
      laneEnds.length = 0;
    }
    let lane = laneEnds.findIndex((end) => end <= block.startMinutes);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = block.endMinutes;
    block.lane = lane;
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.endMinutes);
  }
  if (cluster.length > 0) closeCluster();

  return sorted;
}

/* ---- Dragging a block about ---------------------------------------------- */

/** What Google Calendar snaps to, and the shortest block worth drawing. */
export const DRAG_SNAP_MINUTES = 15;

export type DragMode = "move" | "resize";

export interface DragRange {
  startMinutes: number;
  endMinutes: number;
}

function snap(minutes: number): number {
  return Math.round(minutes / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
}

/**
 * Where a block lands after being dragged by `deltaMinutes`.
 *
 * The *result* is snapped rather than the delta, so a block starting at 09:07
 * lands on 09:15 rather than staying seven minutes off the grid forever. Moving
 * clamps the start and keeps the length, so bumping into the edge of the day
 * never quietly shortens a task; resizing holds the start and moves the end.
 * `bounds` is the rendered hour range — a block can only be dropped somewhere
 * it can be seen, which also means the grid never grows out from under the drop.
 */
export function nextRange(
  mode: DragMode,
  original: DragRange,
  deltaMinutes: number,
  bounds: { minMinutes: number; maxMinutes: number },
): DragRange {
  const length = original.endMinutes - original.startMinutes;
  if (mode === "move") {
    const start = Math.min(
      Math.max(snap(original.startMinutes + deltaMinutes), bounds.minMinutes),
      bounds.maxMinutes - length,
    );
    return { startMinutes: start, endMinutes: start + length };
  }
  const end = Math.min(
    Math.max(
      snap(original.endMinutes + deltaMinutes),
      original.startMinutes + DRAG_SNAP_MINUTES,
    ),
    bounds.maxMinutes,
  );
  return { startMinutes: original.startMinutes, endMinutes: end };
}

/**
 * The write a finished drag turns into. Moving deliberately passes the stored
 * duration through untouched: a block is clipped at midnight for rendering, so
 * reading its length back off the grid would quietly truncate a task that runs
 * past it. Only a resize is allowed to say how long something takes.
 */
export function rescheduleWrite(
  task: TaskEntry,
  range: DragRange,
  mode: DragMode,
): {
  time: string;
  durationMinutes: number | null;
} {
  const resized = range.endMinutes - range.startMinutes;
  const duration =
    mode === "resize"
      ? resized === DEFAULT_TASK_MINUTES
        ? null // the same normalisation the editor uses
        : resized
      : task.item.durationMinutes;
  return { time: minutesToHhmm(range.startMinutes), durationMinutes: duration };
}

/* ---- The visible slice of the day -------------------------------------- */

/**
 * The grid shows the working day and stretches for anything outside it:
 * rows from `startHour` up to (not including) `endHour`.
 */
export function hourRange(
  blockSets: Block[][],
  defaults: { start: number; end: number },
): { startHour: number; endHour: number } {
  let start = defaults.start;
  let end = defaults.end;
  for (const blocks of blockSets) {
    for (const block of blocks) {
      start = Math.min(start, Math.floor(block.startMinutes / 60));
      end = Math.max(end, Math.ceil(block.endMinutes / 60));
    }
  }
  return { startHour: Math.max(0, start), endHour: Math.min(24, end) };
}

export function nowLineMinutes(clock: Clock, day: Day): number | null {
  return day === today(clock) ? minutesOfDay(localTime(clock)) : null;
}

/* ---- Counting a day ---------------------------------------------------- */

function meetingsOf(entries: DayEntries): number {
  return entries.allDayMeetings.length + entries.blocks.filter((b) => b.content.type === "meeting").length;
}

function tasksOf(entries: DayEntries): TaskEntry[] {
  return [
    ...entries.untimedTasks,
    ...entries.blocks.flatMap((b) => (b.content.type === "task" ? [b.content.task] : [])),
  ];
}

/* ---- Range labels ------------------------------------------------------ */

/** "Monday 14 September" */
export function dayLabel(day: Day): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dayStart(day));
}

/** "14 – 20 September", or "28 September – 4 October" across a boundary. */
export function weekLabel(anchor: Day): string {
  const monday = startOfWeek(anchor);
  const sunday = addDays(monday, 6);
  const month = (d: Day) =>
    new Intl.DateTimeFormat("en-GB", { month: "long" }).format(dayStart(d));
  const dayNumber = (d: Day) => String(dayStart(d).getDate());
  if (month(monday) === month(sunday)) {
    return `${dayNumber(monday)} – ${dayNumber(sunday)} ${month(monday)}`;
  }
  return `${dayNumber(monday)} ${month(monday)} – ${dayNumber(sunday)} ${month(sunday)}`;
}

/** "September 2026" */
export function monthLabel(anchor: Day): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
    dayStart(anchor),
  );
}

/* ---- The whole model --------------------------------------------------- */

const DAY_HOURS = { start: 9, end: 19 };
const WEEK_HOURS = { start: 9, end: 18 };

export function buildCalendar(
  snapshot: Snapshot,
  meetings: Meeting[],
  clock: Clock,
  view: CalendarView,
  anchor: Day,
): CalendarModel {
  if (view === "day") {
    const entries = entriesForDay(snapshot, meetings, clock, anchor, { collectOverdue: true });
    const { startHour, endHour } = hourRange([entries.blocks], DAY_HOURS);
    return {
      view,
      anchor,
      rangeLabel: dayLabel(anchor),
      entries,
      startHour,
      endHour,
      nowMinutes: nowLineMinutes(clock, anchor),
    };
  }

  if (view === "week") {
    const now = today(clock);
    const days: WeekDayModel[] = weekdays(anchor).map((day) => {
      const entries = entriesForDay(snapshot, meetings, clock, day);
      return {
        day,
        isToday: day === now,
        entries,
        pill: weekPill(entries),
        nowMinutes: nowLineMinutes(clock, day),
      };
    });
    const { startHour, endHour } = hourRange(
      days.map((d) => d.entries.blocks),
      WEEK_HOURS,
    );
    return {
      view,
      anchor,
      rangeLabel: weekLabel(anchor),
      days,
      startHour,
      endHour,
    };
  }

  const now = today(clock);
  const inMonth = anchor.slice(0, 7);
  const weeks: MonthCell[][] = monthGrid(anchor).map((week) =>
    week.map((day) => {
      const entries = entriesForDay(snapshot, meetings, clock, day);
      const tasks = tasksOf(entries);
      const late = tasks.filter((t) => t.late).length;
      const dow = dayStart(day).getDay();
      return {
        day,
        inMonth: day.slice(0, 7) === inMonth,
        isWeekend: dow === 0 || dow === 6,
        isToday: day === now,
        taskCount: tasks.length - late,
        lateCount: late,
        meetingCount: meetingsOf(entries),
      };
    }),
  );
  return {
    view,
    anchor,
    rangeLabel: monthLabel(anchor),
    weeks,
  };
}

/** The little card at the top of a week column, when the day owes anything. */
export function weekPill(entries: DayEntries): WeekPill | null {
  const untimed = entries.untimedTasks;
  if (untimed.length === 0) return null;
  const lateCount = untimed.filter((t) => t.late).length;
  if (untimed.length === 1 && lateCount === 0) {
    return { kind: "single", title: untimed[0].item.title, count: 1, lateCount: 0 };
  }
  return { kind: "grouped", title: null, count: untimed.length, lateCount };
}

/** "2 tasks due today" · "1 late · 2 tasks" — the pill's own words. */
export function pillLabel(pill: WeekPill, options: { dueToday?: boolean } = {}): string {
  const onTime = pill.count - pill.lateCount;
  const parts: string[] = [];
  if (pill.lateCount > 0) parts.push(countOf(pill.lateCount, "late", "late"));
  if (onTime > 0) {
    parts.push(`${countOf(onTime, "task")}${options.dueToday ? " due today" : ""}`);
  }
  return parts.join(" · ");
}
