import { useEffect, useRef, useState } from "react";
import { meta } from "../db/repo";
import { chaseDue, criticalTodos, dueTodayTodos } from "../domain/today";
import type { Snapshot } from "../domain/snapshot";
import type { Clock } from "../lib/clock";
import { localTime, today } from "../lib/time";
import { useClock } from "../lib/ClockContext";
import { useStore } from "./store";

const NOTIFIED_KEY = "notified_checkins";
/** Long enough to be invisible, short enough that midnight isn't missed. */
const RECHECK_MS = 10 * 60 * 1000;

const inTauri = () => "__TAURI_INTERNALS__" in window;

async function setBadge(count: number): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_tray_badge", { count });
}

async function notify(title: string, body: string): Promise<void> {
  if (!inTauri()) return;
  const plugin = await import("@tauri-apps/plugin-notification");
  let granted = await plugin.isPermissionGranted();
  if (!granted) granted = (await plugin.requestPermission()) === "granted";
  if (granted) plugin.sendNotification({ title, body });
}

/**
 * What the app does when you aren't looking at it: keep the menu-bar count
 * honest, and say something once — exactly once — when a check-in day arrives.
 *
 * The key includes the check-in day, so chasing (which re-arms the date) makes
 * an item eligible to speak again, while merely leaving it alone does not.
 */
export function useHotWatch(snapshot: Snapshot): void {
  const clock = useClock();
  const { reload, act, loading } = useStore();
  const announced = useRef<Set<string> | null>(null);
  // A minute hand for the reminders below — an item due "today at 15:00"
  // should speak at 15:00-ish, not whenever the next reload happens by.
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => void reload(), RECHECK_MS);
    const hand = window.setInterval(() => setMinute((m) => m + 1), 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(hand);
    };
  }, [reload]);

  useEffect(() => {
    // Not while the snapshot is still empty — the badge would blink to zero
    // every time the app starts.
    if (loading) return;
    const hot =
      criticalTodos(snapshot, clock).length +
      dueTodayTodos(snapshot, clock).length +
      chaseDue(snapshot, clock).length;
    void setBadge(hot);
  }, [snapshot, clock, loading]);

  useEffect(() => {
    if (!inTauri() || loading || snapshot.items.length === 0) return;
    void announceCheckins(snapshot, clock, announced, act);
    void announceDeadlineTimes(snapshot, clock, announced, act);
  }, [snapshot, clock, act, loading, minute]);
}

/** The persisted set of things already said, loaded once per app run. */
async function loadAnnounced(
  announced: { current: Set<string> | null },
  act: ReturnType<typeof useStore>["act"],
): Promise<Set<string>> {
  if (announced.current === null) {
    announced.current = new Set();
    await act(async (db) => {
      const stored = await meta.get(db, NOTIFIED_KEY);
      if (stored) for (const key of JSON.parse(stored) as string[]) announced.current!.add(key);
    });
  }
  return announced.current;
}

async function persistAnnounced(
  announced: Set<string>,
  act: ReturnType<typeof useStore>["act"],
): Promise<void> {
  await act((db) => meta.set(db, NOTIFIED_KEY, JSON.stringify([...announced].slice(-200))));
}

/**
 * A todo due today with a time on it gets one reminder at that time. Todos
 * without a time keep their current silence — the badge and the dashboard
 * already carry the day-level story.
 */
async function announceDeadlineTimes(
  snapshot: Snapshot,
  clock: Clock,
  announced: { current: Set<string> | null },
  act: ReturnType<typeof useStore>["act"],
): Promise<void> {
  const day = today(clock);
  const now = localTime(clock);
  const due = snapshot.items.filter(
    (item) =>
      item.status === "open" &&
      item.kind === "todo" &&
      item.deadline === day &&
      item.deadlineTime !== null &&
      item.deadlineTime <= now,
  );
  if (due.length === 0) return;

  const seen = await loadAnnounced(announced, act);
  const key = (id: number, time: string | null) => `due:${id}:${day}T${time}`;
  const fresh = due.filter((item) => !seen.has(key(item.id, item.deadlineTime)));
  if (fresh.length === 0) return;

  for (const item of fresh) {
    seen.add(key(item.id, item.deadlineTime));
    const client = snapshot.clients.find((c) => c.id === item.clientId);
    await notify(`Due at ${item.deadlineTime}: ${item.title}`, client?.name ?? "");
  }
  await persistAnnounced(seen, act);
}

async function announceCheckins(
  snapshot: Snapshot,
  clock: Clock,
  announced: { current: Set<string> | null },
  act: ReturnType<typeof useStore>["act"],
): Promise<void> {
  // chaseDue already waits for a timed check-in's moment, so notifying on what
  // it returns keeps the notification and the amber rows in step.
  const due = chaseDue(snapshot, clock);
  if (due.length === 0) return;

  const seen = await loadAnnounced(announced, act);
  const key = (id: number, checkinOn: string | null) => `${id}:${checkinOn ?? "?"}`;
  const fresh = due.filter((r) => !seen.has(key(r.item.id, r.item.checkinOn)));
  if (fresh.length === 0) return;

  for (const row of fresh) {
    seen.add(key(row.item.id, row.item.checkinOn));
    await notify(`Time to chase: ${row.item.title}`, `${row.where} · ${row.fact.text}`);
  }

  await persistAnnounced(seen, act);
}
