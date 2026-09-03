import { describe, expect, it } from "vitest";
import { ManualClock, fixedClock } from "./clock";
import {
  addDays,
  daysAgo,
  daysBetween,
  endOfDayInstant,
  isDue,
  isDueToday,
  isOverdue,
  toDay,
  today,
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
