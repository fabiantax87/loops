import { useEffect, useRef } from "react";
import { meta } from "../db/repo";
import { chaseDue, criticalTodos, dueTodayTodos } from "../domain/today";
import type { Snapshot } from "../domain/snapshot";
import type { Clock } from "../lib/clock";
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

  useEffect(() => {
    const timer = window.setInterval(() => void reload(), RECHECK_MS);
    return () => window.clearInterval(timer);
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
  }, [snapshot, clock, act, loading]);
}

async function announceCheckins(
  snapshot: Snapshot,
  clock: Clock,
  announced: { current: Set<string> | null },
  act: ReturnType<typeof useStore>["act"],
): Promise<void> {
  const due = chaseDue(snapshot, clock);
  if (due.length === 0) return;

  if (announced.current === null) {
    announced.current = new Set();
    await act(async (db) => {
      const stored = await meta.get(db, NOTIFIED_KEY);
      if (stored) for (const key of JSON.parse(stored) as string[]) announced.current!.add(key);
    });
  }

  const key = (id: number, checkinOn: string | null) => `${id}:${checkinOn ?? "?"}`;
  const fresh = due.filter((r) => !announced.current!.has(key(r.item.id, r.item.checkinOn)));
  if (fresh.length === 0) return;

  for (const row of fresh) {
    announced.current.add(key(row.item.id, row.item.checkinOn));
    await notify(`Time to chase: ${row.item.title}`, `${row.where} · ${row.fact.text}`);
  }

  await act((db) =>
    meta.set(db, NOTIFIED_KEY, JSON.stringify([...announced.current!].slice(-200))),
  );
}
