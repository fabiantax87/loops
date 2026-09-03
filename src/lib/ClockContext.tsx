import { createContext, useContext, type ReactNode } from "react";
import { type Clock, systemClock } from "./clock";

const ClockContext = createContext<Clock>(systemClock);

/**
 * Components read the time through this, never through `new Date()`. Swapping
 * in a ManualClock is what lets a test — or the dev time-travel control — walk
 * the app through a week of silence timers.
 */
export function ClockProvider({ clock, children }: { clock: Clock; children: ReactNode }) {
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

export function useClock(): Clock {
  return useContext(ClockContext);
}
