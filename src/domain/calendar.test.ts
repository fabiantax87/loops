import { describe, expect, it } from "vitest";
import { fixedClock } from "../lib/clock";
import { minutesOfDay } from "../lib/time";
import type { Snapshot } from "./snapshot";
import type { Item } from "./types";
import {
  type Block,
  type Meeting,
  type TaskEntry,
  buildCalendar,
  entriesForDay,
  hourRange,
  layoutBlocks,
  minutesToHhmm,
  nextRange,
  pillLabel,
  rescheduleWrite,
  tasksForDay,
  weekPill,
} from "./calendar";

/* Monday 14 September 2026, mid-morning. */
const clock = fixedClock(new Date(2026, 8, 14, 10, 30));

let nextId = 1;

function mkItem(overrides: Partial<Item>): Item {
  const id = nextId++;
  return {
    id,
    clientId: 1,
    projectId: null,
    contactId: null,
    kind: "todo",
    title: `Item ${id}`,
    notes: null,
    deadline: null,
    deadlineTime: null,
    durationMinutes: null,
    ideaSince: null,
    startedOn: null,
    sentOn: null,
    checkinOn: null,
    checkinTime: null,
    lastChasedOn: null,
    chaseCount: 0,
    status: "open",
    outcome: null,
    createdAt: new Date(2026, 8, 1, 9).toISOString(),
    updatedAt: new Date(2026, 8, 1, 9).toISOString(),
    closedAt: null,
    ...overrides,
  };
}

function mkSnapshot(items: Item[]): Snapshot {
  return {
    clients: [
      { id: 1, name: "Eurotransplant", notes: null, leading: false, archivedAt: null, createdAt: "" },
    ],
    projects: [{ id: 1, clientId: 1, name: "ETRL", status: "active", createdAt: "" }],
    contacts: [],
    items,
    ideasOfDay: null,
  };
}

function mkMeeting(overrides: Partial<Meeting>): Meeting {
  return {
    id: `m${nextId++}`,
    calendarId: "primary",
    title: "Meeting",
    allDay: false,
    start: null,
    end: null,
    startDay: null,
    endDay: null,
    location: null,
    description: null,
    attendees: [],
    meetUrl: null,
    htmlLink: null,
    status: "confirmed",
    ...overrides,
  };
}

/** A timed meeting on local wall-clock hours of a day. */
function timedMeeting(day: string, from: number, to: number, title = "Meeting"): Meeting {
  const [y, m, d] = day.split("-").map(Number);
  return mkMeeting({
    title,
    start: new Date(y, m - 1, d, Math.floor(from), (from % 1) * 60).toISOString(),
    end: new Date(y, m - 1, d, Math.floor(to), (to % 1) * 60).toISOString(),
  });
}

describe("tasksForDay", () => {
  it("shows a todo on its deadline day and a waiting-on on its check-in day", () => {
    const snapshot = mkSnapshot([
      mkItem({ deadline: "2026-09-16" }),
      mkItem({ kind: "waiting", sentOn: "2026-09-10", checkinOn: "2026-09-16" }),
      mkItem({ kind: "idea", ideaSince: "2026-09-01" }),
    ]);
    const entries = tasksForDay(snapshot, clock, "2026-09-16");
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.kind).sort()).toEqual(["checkin", "task"]);
    expect(tasksForDay(snapshot, clock, "2026-09-15")).toHaveLength(0);
  });

  it("collects everything overdue on today when asked, marked late", () => {
    const snapshot = mkSnapshot([
      mkItem({ deadline: "2026-09-11" }),
      mkItem({ deadline: "2026-09-14" }),
      mkItem({ kind: "waiting", sentOn: "2026-09-01", checkinOn: "2026-09-12" }),
    ]);
    const collected = tasksForDay(snapshot, clock, "2026-09-14", { collectOverdue: true });
    expect(collected).toHaveLength(3);
    expect(collected.filter((e) => e.late)).toHaveLength(2);
    // Late leads the list.
    expect(collected[0].late).toBe(true);
    // Without collecting, each stays on its own day — nothing counts twice.
    expect(tasksForDay(snapshot, clock, "2026-09-14")).toHaveLength(1);
    expect(tasksForDay(snapshot, clock, "2026-09-11")[0].late).toBe(true);
  });

  it("leaves closed items and undated todos alone", () => {
    const snapshot = mkSnapshot([
      mkItem({ deadline: "2026-09-14", status: "closed", outcome: "done", closedAt: "x" }),
      mkItem({ deadline: null, startedOn: "2026-09-14" }),
    ]);
    expect(tasksForDay(snapshot, clock, "2026-09-14")).toHaveLength(0);
  });
});

describe("entriesForDay", () => {
  it("splits timed tasks onto the grid and leaves the rest in the pill", () => {
    const snapshot = mkSnapshot([
      mkItem({ deadline: "2026-09-14" }),
      mkItem({ deadline: "2026-09-14", deadlineTime: "15:00" }),
      mkItem({ deadline: "2026-09-14", deadlineTime: "16:00", durationMinutes: 90 }),
    ]);
    const entries = entriesForDay(snapshot, [], clock, "2026-09-14");
    expect(entries.untimedTasks).toHaveLength(1);
    expect(entries.blocks).toHaveLength(2);
    const [first, second] = entries.blocks;
    // The default length is half an hour; a set duration wins.
    expect(first.endMinutes - first.startMinutes).toBe(30);
    expect(second.endMinutes - second.startMinutes).toBe(90);
    expect(second.timeLabel).toBe("16:00 – 17:30");
  });

  it("keeps a late timed todo in the pill — its moment was another day's", () => {
    const snapshot = mkSnapshot([
      mkItem({ deadline: "2026-09-11", deadlineTime: "15:00" }),
    ]);
    const entries = entriesForDay(snapshot, [], clock, "2026-09-14", { collectOverdue: true });
    expect(entries.blocks).toHaveLength(0);
    expect(entries.untimedTasks).toHaveLength(1);
    expect(entries.untimedTasks[0].late).toBe(true);
  });

  it("places meetings by local wall clock and lists all-day ones apart", () => {
    const meetings = [
      timedMeeting("2026-09-14", 10, 10.5, "Standup"),
      mkMeeting({ allDay: true, startDay: "2026-09-14", endDay: "2026-09-16", title: "Offsite" }),
      timedMeeting("2026-09-15", 9, 10, "Elsewhere"),
    ];
    const entries = entriesForDay(mkSnapshot([]), meetings, clock, "2026-09-14");
    expect(entries.blocks).toHaveLength(1);
    expect(entries.blocks[0].startMinutes).toBe(600);
    expect(entries.blocks[0].endMinutes).toBe(630);
    expect(entries.allDayMeetings.map((m) => m.title)).toEqual(["Offsite"]);
    // The exclusive end day: the offsite covers the 15th but not the 16th.
    expect(
      entriesForDay(mkSnapshot([]), meetings, clock, "2026-09-15").allDayMeetings,
    ).toHaveLength(1);
    expect(
      entriesForDay(mkSnapshot([]), meetings, clock, "2026-09-16").allDayMeetings,
    ).toHaveLength(0);
  });

  it("clips a meeting that runs past midnight to the rendered day", () => {
    const meetings = [timedMeeting("2026-09-14", 22, 26, "Red-eye deploy")];
    const on14 = entriesForDay(mkSnapshot([]), meetings, clock, "2026-09-14");
    expect(on14.blocks[0].startMinutes).toBe(22 * 60);
    expect(on14.blocks[0].endMinutes).toBe(24 * 60);
    const on15 = entriesForDay(mkSnapshot([]), meetings, clock, "2026-09-15");
    expect(on15.blocks[0].startMinutes).toBe(0);
    expect(on15.blocks[0].endMinutes).toBe(2 * 60);
  });
});

function bareBlock(start: number, end: number): Block {
  return {
    key: `${start}-${end}`,
    startMinutes: start,
    endMinutes: end,
    timeLabel: "",
    lane: 0,
    lanes: 1,
    content: { type: "meeting", meeting: mkMeeting({}) },
  };
}

describe("layoutBlocks", () => {
  it("gives non-overlapping blocks the full width", () => {
    const laid = layoutBlocks([bareBlock(540, 600), bareBlock(600, 660)]);
    expect(laid.every((b) => b.lane === 0 && b.lanes === 1)).toBe(true);
  });

  it("splits an overlapping pair side by side", () => {
    const laid = layoutBlocks([bareBlock(540, 660), bareBlock(600, 720)]);
    expect(laid.map((b) => b.lane)).toEqual([0, 1]);
    expect(laid.every((b) => b.lanes === 2)).toBe(true);
  });

  it("reuses a freed lane and keeps clusters separate", () => {
    const laid = layoutBlocks([
      bareBlock(540, 600), // 09:00 – 10:00
      bareBlock(570, 630), // overlaps the first
      bareBlock(600, 660), // fits back in lane 0
      bareBlock(900, 960), // the afternoon is its own cluster
    ]);
    expect(laid.map((b) => b.lane)).toEqual([0, 1, 0, 0]);
    expect(laid.slice(0, 3).every((b) => b.lanes === 2)).toBe(true);
    expect(laid[3].lanes).toBe(1);
  });
});

describe("hourRange", () => {
  it("holds the working day when nothing falls outside it", () => {
    expect(hourRange([[bareBlock(600, 660)]], { start: 9, end: 19 })).toEqual({
      startHour: 9,
      endHour: 19,
    });
  });

  it("stretches for an early start and a late end", () => {
    expect(hourRange([[bareBlock(7 * 60 + 30, 20 * 60 + 15)]], { start: 9, end: 19 })).toEqual({
      startHour: 7,
      endHour: 21,
    });
  });
});

describe("buildCalendar", () => {
  const snapshot = mkSnapshot([
    mkItem({ deadline: "2026-09-11", title: "Send the agreement" }),
    mkItem({ deadline: "2026-09-14", title: "Ship the redirect map" }),
    mkItem({ deadline: "2026-09-14", title: "Review the PR" }),
    mkItem({ deadline: "2026-09-16", title: "Draft cut-over plan" }),
  ]);
  const meetings = [
    timedMeeting("2026-09-14", 10, 10.5, "Standup"),
    timedMeeting("2026-09-14", 11, 12, "Steering"),
    timedMeeting("2026-09-14", 14, 14.75, "Check-in"),
    timedMeeting("2026-09-16", 9, 11, "Workshop"),
  ];

  it("lays the day out with its meetings, tasks and now-line", () => {
    const model = buildCalendar(snapshot, meetings, clock, "day", "2026-09-14");
    if (model.view !== "day") throw new Error("expected day");
    expect(model.rangeLabel).toBe("Monday 14 September");
    expect(model.entries.blocks.filter((b) => b.content.type === "meeting")).toHaveLength(3);
    expect(model.nowMinutes).toBe(630);
    expect(model.entries.untimedTasks).toHaveLength(3);
    expect(model.startHour).toBe(9);
    expect(model.endHour).toBe(19);
  });

  it("builds the work week with a pill per loaded day", () => {
    const model = buildCalendar(snapshot, meetings, clock, "week", "2026-09-16");
    if (model.view !== "week") throw new Error("expected week");
    expect(model.rangeLabel).toBe("14 – 20 September");
    expect(model.days.map((d) => d.day)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
    expect(model.days[0].isToday).toBe(true);
    // The late 11 September todo stays on its own day — the week doesn't
    // pile the past onto Monday.
    const monday = model.days[0].pill;
    expect(monday).toEqual({ kind: "grouped", title: null, count: 2, lateCount: 0 });
    expect(pillLabel(monday!)).toBe("2 tasks");
    expect(pillLabel({ kind: "grouped", title: null, count: 2, lateCount: 1 })).toBe(
      "1 late · 1 task",
    );
    const wednesday = model.days[2].pill;
    expect(wednesday?.kind).toBe("single");
    expect(wednesday?.title).toBe("Draft cut-over plan");
  });

  it("counts the month cell by cell", () => {
    const model = buildCalendar(snapshot, meetings, clock, "month", "2026-09-14");
    if (model.view !== "month") throw new Error("expected month");
    expect(model.rangeLabel).toBe("September 2026");
    const cells = new Map(model.weeks.flat().map((c) => [c.day, c]));
    const monday = cells.get("2026-09-14")!;
    expect(monday).toMatchObject({
      isToday: true,
      inMonth: true,
      taskCount: 2,
      lateCount: 0,
      meetingCount: 3,
    });
    // The 11th keeps its own late task; weekends dim; the spill-over is marked.
    expect(cells.get("2026-09-11")!.lateCount).toBe(1);
    expect(cells.get("2026-09-19")!.isWeekend).toBe(true);
    expect(cells.get("2026-08-31")!.inMonth).toBe(false);
  });
});

describe("nextRange", () => {
  const bounds = { minMinutes: 9 * 60, maxMinutes: 19 * 60 };
  const original = { startMinutes: 600, endMinutes: 660 }; // 10:00 – 11:00

  it("moves both edges and keeps the length", () => {
    expect(nextRange("move", original, 60, bounds)).toEqual({
      startMinutes: 660,
      endMinutes: 720,
    });
  });

  it("snaps where it lands, not how far it came", () => {
    // A block already off the grid is tidied onto it rather than kept askew.
    expect(nextRange("move", { startMinutes: 607, endMinutes: 667 }, 8, bounds)).toEqual({
      startMinutes: 615,
      endMinutes: 675,
    });
    // Anything under half a snap is no move at all.
    expect(nextRange("move", original, 7, bounds)).toEqual(original);
  });

  it("clamps to the rendered hours without shortening the block", () => {
    const early = nextRange("move", original, -10 * 60, bounds);
    expect(early).toEqual({ startMinutes: 540, endMinutes: 600 });
    const late = nextRange("move", original, 10 * 60, bounds);
    expect(late).toEqual({ startMinutes: 1080, endMinutes: 1140 });
    expect(late.endMinutes - late.startMinutes).toBe(60);
  });

  it("resizes from the bottom only, and never below one snap", () => {
    expect(nextRange("resize", original, 30, bounds)).toEqual({
      startMinutes: 600,
      endMinutes: 690,
    });
    expect(nextRange("resize", original, -600, bounds)).toEqual({
      startMinutes: 600,
      endMinutes: 615,
    });
    expect(nextRange("resize", original, 10 * 60, bounds).endMinutes).toBe(19 * 60);
  });
});

describe("rescheduleWrite", () => {
  const task = (durationMinutes: number | null): TaskEntry => ({
    item: mkItem({ durationMinutes, deadline: "2026-09-14", deadlineTime: "10:00" }),
    kind: "task",
    late: false,
    where: "",
  });

  it("leaves the duration alone when a block is only moved", () => {
    // A 23:30 block with a two-hour duration renders clipped to midnight;
    // reading its length back off the grid would silently truncate it.
    const clipped = { startMinutes: 23 * 60 + 30, endMinutes: 24 * 60 };
    expect(rescheduleWrite(task(120), clipped, "move")).toEqual({
      time: "23:30",
      durationMinutes: 120,
    });
    expect(rescheduleWrite(task(null), clipped, "move").durationMinutes).toBeNull();
  });

  it("writes the new length on a resize, normalising the default away", () => {
    expect(
      rescheduleWrite(task(60), { startMinutes: 600, endMinutes: 690 }, "resize"),
    ).toEqual({ time: "10:00", durationMinutes: 90 });
    // 30 minutes is the default, and the editor stores that as null.
    expect(
      rescheduleWrite(task(60), { startMinutes: 600, endMinutes: 630 }, "resize")
        .durationMinutes,
    ).toBeNull();
  });
});

describe("minutesToHhmm", () => {
  it("stays inside the day at both ends", () => {
    expect(minutesToHhmm(0)).toBe("00:00");
    expect(minutesToHhmm(9 * 60 + 5)).toBe("09:05");
    expect(minutesToHhmm(1439)).toBe("23:59");
    expect(minutesToHhmm(1440)).toBe("23:59");
    expect(minutesToHhmm(-30)).toBe("00:00");
  });

  it("round-trips against minutesOfDay", () => {
    for (const minutes of [0, 615, 780, 1439]) {
      expect(minutesOfDay(minutesToHhmm(minutes))).toBe(minutes);
    }
  });
});

describe("weekPill", () => {
  it("stays quiet on a day that owes nothing", () => {
    const entries = entriesForDay(mkSnapshot([]), [], clock, "2026-09-15");
    expect(weekPill(entries)).toBeNull();
  });
});
