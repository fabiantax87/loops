/**
 * Every "what time is it" in Loops goes through a Clock, so tests (and the dev
 * time-travel control) can move the day forward without touching the system
 * clock. Nothing in the app may call `new Date()` with no argument or
 * `Date.now()` directly — reach for `clock.now()` instead.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock you drive by hand. Used in tests and behind the dev time-travel UI. */
export class ManualClock implements Clock {
  private current: Date;

  constructor(start: Date | string) {
    this.current = typeof start === "string" ? new Date(start) : new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(next: Date | string): void {
    this.current = typeof next === "string" ? new Date(next) : new Date(next);
  }

  advance(by: { days?: number; hours?: number; minutes?: number; ms?: number }): Date {
    const ms =
      (by.days ?? 0) * 86_400_000 +
      (by.hours ?? 0) * 3_600_000 +
      (by.minutes ?? 0) * 60_000 +
      (by.ms ?? 0);
    this.current = new Date(this.current.getTime() + ms);
    return this.now();
  }
}

/** A clock frozen at one instant — for rendering a snapshot deterministically. */
export function fixedClock(at: Date | string): Clock {
  const frozen = typeof at === "string" ? new Date(at) : new Date(at);
  return { now: () => new Date(frozen) };
}
