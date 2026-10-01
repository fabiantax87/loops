import { describe, expect, it } from "vitest";
import { fixedClock } from "../lib/clock";
import { type Booking, buildCalendar, type Meeting } from "./calendar";
import { clockWords } from "./calendarSummary";
import { bookingsOn, dayCapacity, durationWords, hoursLabel, totalLabel } from "./capacity";
import type { Snapshot } from "./snapshot";
import type { Item } from "./types";

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

function meeting(day: string, from: number, to: number, title = "Meeting"): Meeting {
  const [y, m, d] = day.split("-").map(Number);
  return {
    id: `m${nextId++}`,
    calendarId: "primary",
    title,
    allDay: false,
    start: new Date(y, m - 1, d, Math.floor(from), (from % 1) * 60).toISOString(),
    end: new Date(y, m - 1, d, Math.floor(to), (to % 1) * 60).toISOString(),
    startDay: null,
    endDay: null,
    location: null,
    description: null,
    attendees: [],
    meetUrl: null,
    htmlLink: null,
    status: "confirmed",
  };
}

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: `b${nextId++}`,
    project: "Corporate",
    client: "Eurotransplant",
    startDay: "2026-09-14",
    endDay: "2026-09-14",
    minutesPerDay: 360,
    note: null,
    url: null,
    draft: false,
    ...overrides,
  };
}

/* The design's day: a 6h booking, three meetings (1h45), one timed hour. */
const snapshot = mkSnapshot([
  mkItem({ deadline: "2026-09-14", title: "Ship the redirect map" }),
  mkItem({ deadline: "2026-09-14", title: "Review the PR" }),
  mkItem({
    deadline: "2026-09-14",
    deadlineTime: "15:00",
    durationMinutes: 60,
    title: "Draft steering follow-up",
  }),
]);
const meetings = [
  meeting("2026-09-14", 10, 10.25, "Standup"),
  meeting("2026-09-14", 11, 12, "Steering"),
  meeting("2026-09-14", 14, 14.5, "Check-in"),
];

describe("bookingsOn", () => {
  it("expands a multi-day booking over working days only", () => {
    const b = booking({ startDay: "2026-09-14", endDay: "2026-09-21" });
    expect(bookingsOn([b], "2026-09-16")).toHaveLength(1);
    expect(bookingsOn([b], "2026-09-19")).toHaveLength(0); // Saturday
    expect(bookingsOn([b], "2026-09-21")).toHaveLength(1);
    expect(bookingsOn([b], "2026-09-22")).toHaveLength(0);
  });
});

describe("dayCapacity", () => {
  it("adds booking, timed meetings and timed tasks; untimed tasks don't count", () => {
    const model = buildCalendar(
      snapshot,
      { meetings, bookings: [booking({})], bookingsSynced: true },
      clock,
      "day",
      "2026-09-14",
    );
    if (model.view !== "day") throw new Error("expected day");
    expect(model.capacity).toMatchObject({
      bookedMinutes: 360,
      meetingMinutes: 105,
      taskMinutes: 60,
      totalMinutes: 525,
      overMinutes: 45,
    });
    expect(totalLabel(model.capacity)).toBe("8h45 · 45 min over");
    expect(model.summary.text).toBe(
      "You're on Corporate today, six hours. Three meetings, the first at ten, and an hour blocked for a task. Two tasks are due by end of day. Booked past eight today, three quarters of an hour over.",
    );
    expect(model.summary.warning).toBe(
      "Booked past eight today, three quarters of an hour over.",
    );
  });

  it("reads the split day and the exact fit", () => {
    const bookings = [
      booking({ minutesPerDay: 240 }),
      booking({ project: "Frontend", client: "Klokgroep", minutesPerDay: 120 }),
    ];
    const twoHours = [meeting("2026-09-14", 10, 11), meeting("2026-09-14", 13, 14)];
    const model = buildCalendar(
      mkSnapshot([]),
      { meetings: twoHours, bookings, bookingsSynced: true },
      clock,
      "day",
      "2026-09-14",
    );
    if (model.view !== "day") throw new Error("expected day");
    expect(model.capacity.overMinutes).toBe(0);
    expect(totalLabel(model.capacity)).toBe("8h of 8");
    expect(model.summary.text).toBe(
      "Four hours on Corporate, two on Frontend. Two meetings, the first at ten. That fills the day.",
    );
  });

  it("keeps the strip for a meeting-only day and hides it for a quiet one", () => {
    const busy = dayCapacity(
      buildDay(mkSnapshot([]), meetings, "2026-09-14"),
      [],
      { bookingsSynced: true },
    );
    expect(busy.totalMinutes).toBe(105);
    const quiet = dayCapacity(buildDay(mkSnapshot([]), [], "2026-09-14"), [], {
      bookingsSynced: true,
    });
    expect(quiet.totalMinutes).toBe(0);
  });

  it("leaves bookings out and says so while Productive is disconnected", () => {
    const model = buildCalendar(
      snapshot,
      { meetings, bookings: [booking({})], bookingsSynced: false },
      clock,
      "day",
      "2026-09-14",
    );
    if (model.view !== "day") throw new Error("expected day");
    expect(model.capacity.bookedMinutes).toBe(0);
    expect(model.capacity.bookingsUnavailable).toBe(true);
    expect(model.summary.warning).toBe(
      "Productive isn't syncing, so project time is missing from today.",
    );
  });

  it("marks the week's over-capacity day and the month cell", () => {
    const bookings = [
      booking({ startDay: "2026-09-14", endDay: "2026-09-15", minutesPerDay: 360 }),
      booking({
        project: "Frontend",
        client: "Klokgroep",
        startDay: "2026-09-16",
        endDay: "2026-09-16",
        minutesPerDay: 360,
      }),
    ];
    const week = buildCalendar(
      mkSnapshot([]),
      {
        meetings: [meeting("2026-09-16", 9, 11), meeting("2026-09-16", 14, 15)],
        bookings,
        bookingsSynced: true,
      },
      clock,
      "week",
      "2026-09-14",
    );
    if (week.view !== "week") throw new Error("expected week");
    expect(week.days.map((d) => d.capacity.overMinutes)).toEqual([0, 0, 60, 0, 0]);
    expect(week.summary.warning).toBe("Wednesday runs over.");
    expect(week.summary.text).toContain("Mostly Corporate this week, Frontend on Wednesday.");
    expect(week.summary.text).toContain("Thursday and Friday are clear.");

    const month = buildCalendar(
      mkSnapshot([]),
      { meetings: [meeting("2026-09-16", 9, 12)], bookings, bookingsSynced: true },
      clock,
      "month",
      "2026-09-14",
    );
    if (month.view !== "month") throw new Error("expected month");
    const wed = month.weeks.flat().find((c) => c.day === "2026-09-16")!;
    expect(wed.projects).toEqual(["Frontend"]);
    expect(wed.overMinutes).toBe(60);
  });
});

function buildDay(snapshot: Snapshot, meetings: Meeting[], day: string) {
  const model = buildCalendar(
    snapshot,
    { meetings, bookings: [], bookingsSynced: true },
    clock,
    "day",
    day,
  );
  if (model.view !== "day") throw new Error("expected day");
  return model.entries;
}

describe("words", () => {
  it("labels lengths the mono way", () => {
    expect(hoursLabel(360)).toBe("6h");
    expect(hoursLabel(105)).toBe("1h45");
    expect(hoursLabel(45)).toBe("45 min");
  });

  it("says lengths the way they're spoken", () => {
    expect(durationWords(360)).toBe("six hours");
    expect(durationWords(60)).toBe("an hour");
    expect(durationWords(90)).toBe("an hour and a half");
    expect(durationWords(150)).toBe("two and a half hours");
    expect(durationWords(15)).toBe("a quarter of an hour");
    expect(durationWords(50)).toBe("fifty minutes");
    expect(durationWords(100)).toBe("1h40");
  });

  it("tells the time", () => {
    expect(clockWords(600)).toBe("ten");
    expect(clockWords(630)).toBe("half past ten");
    expect(clockWords(645)).toBe("quarter to eleven");
    expect(clockWords(620)).toBe("10:20");
  });
});
