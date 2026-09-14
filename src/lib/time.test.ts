import { describe, expect, it } from "vitest";
import { ManualClock, fixedClock } from "./clock";
import {
  addDays,
  addMonths,
  daysAgo,
  daysBetween,
  endOfDayInstant,
  instantToDay,
  isDue,
  isDueToday,
  isOverdue,
  minutesOfDay,
  monthGrid,
  startOfMonth,
  startOfWeek,
  toDay,
  today,
  weekdays,
} from "./time";

describe("ManualClock", () => {
  it("stays put until told to move", () => {
    const clock = new ManualClock("2026-08-28T09:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-08-28T09:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-08-28T09:00:00.000Z");
  });

  it("advances by days and hours", () => {
    const clock = new ManualClock("2026-08-28T09:00:00.000Z");
    clock.advance({ days: 3, hours: 2 });
    expect(clock.now().toISOString()).toBe("2026-08-31T11:00:00.000Z");
  });

  it("hands out copies, so callers cannot shift it by mutating", () => {
    const clock = new ManualClock("2026-08-28T09:00:00.000Z");
    clock.now().setFullYear(2030);
    expect(clock.now().getFullYear()).toBe(2026);
  });
});

describe("days", () => {
  const clock = fixedClock(new Date(2026, 7, 28, 9, 0));

  it("reads the local calendar day", () => {
    expect(today(clock)).toBe("2026-08-28");
    expect(toDay(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("counts across a month boundary", () => {
    expect(daysBetween("2026-08-28", "2026-09-02")).toBe(5);
    expect(daysBetween("2026-09-02", "2026-08-28")).toBe(-5);
  });

  it("adds days across a DST change without drifting", () => {
    // Europe/Amsterdam falls back on 2026-10-25; a naive +86_400_000 lands on
    // the wrong day here.
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("separates due, due today and overdue", () => {
    expect(isDueToday("2026-08-28", clock)).toBe(true);
    expect(isOverdue("2026-08-28", clock)).toBe(false);
    expect(isOverdue("2026-08-27", clock)).toBe(true);
    expect(isDue("2026-08-27", clock)).toBe(true);
    expect(isDue("2026-08-29", clock)).toBe(false);
  });

  it("gives a silence timer until the end of its day", () => {
    const deadline = endOfDayInstant("2026-08-28");
    // A reply landing at 23:30 local on the 28th still beats the deadline;
    // one at 00:30 on the 29th does not.
    expect(new Date(2026, 7, 28, 23, 30).toISOString() < deadline).toBe(true);
    expect(new Date(2026, 7, 29, 0, 30).toISOString() < deadline).toBe(false);
    expect(deadline).toBe(new Date(2026, 7, 29).toISOString());
  });

  it("counts how long ago something happened", () => {
    expect(daysAgo(new Date(2026, 7, 22, 14, 0).toISOString(), clock)).toBe(6);
  });
});

describe("calendar helpers", () => {
  it("reads a time of day as minutes", () => {
    expect(minutesOfDay("00:00")).toBe(0);
    expect(minutesOfDay("09:30")).toBe(570);
    expect(minutesOfDay("23:59")).toBe(1439);
  });

  it("lands an instant on its local day", () => {
    expect(instantToDay(new Date(2026, 8, 14, 23, 30).toISOString())).toBe("2026-09-14");
  });

  it("finds the Monday of any weekday", () => {
    expect(startOfWeek("2026-09-14")).toBe("2026-09-14"); // a Monday stays put
    expect(startOfWeek("2026-09-16")).toBe("2026-09-14");
    expect(startOfWeek("2026-09-20")).toBe("2026-09-14"); // Sunday belongs to the week before
    expect(startOfWeek("2026-01-01")).toBe("2025-12-29"); // across the year
  });

  it("hands out the work week", () => {
    expect(weekdays("2026-09-17")).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
  });

  it("moves by months, clamped to what the month has", () => {
    expect(startOfMonth("2026-09-14")).toBe("2026-09-01");
    expect(addMonths("2026-09-14", 1)).toBe("2026-10-14");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("covers a month in Monday-first weeks", () => {
    const weeks = monthGrid("2026-09-14");
    expect(weeks[0][0]).toBe("2026-08-31"); // September 2026 starts on a Tuesday
    expect(weeks.at(-1)![6]).toBe("2026-10-04");
    expect(weeks).toHaveLength(5);
    for (const week of weeks) expect(week).toHaveLength(7);
    // A DST-crossing month keeps its shape (Amsterdam falls back 25 Oct 2026).
    const october = monthGrid("2026-10-10");
    expect(october[0][0]).toBe("2026-09-28");
    expect(october.at(-1)![6]).toBe("2026-11-01");
  });
});
