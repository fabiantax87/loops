import { useCallback, useEffect, useRef, useState } from "react";
import { type GoogleCalendar, googleCalendars, googleEvents, meta } from "../db/repo";
import type { Meeting } from "../domain/calendar";
import { useClock } from "../lib/ClockContext";
import {
  type Day,
  type Instant,
  addDays,
  dayStart,
  toInstant,
} from "../lib/time";
import {
  Disconnected,
  META_CLIENT_ID,
  META_CLIENT_SECRET,
  META_EMAIL,
  META_LAST_SYNC,
  connect as googleConnect,
  disconnect as googleDisconnect,
  isConnected,
} from "../google/auth";
import { syncWindow } from "../google/sync";
import { useStore } from "./store";

/**
 * Meetings live beside the snapshot, not in it: the snapshot reloads wholesale
 * on every write, and Google's data marches to its own drum. This hook owns
 * the cache reads, the background sync, and the connection's lifecycle.
 *
 * The cache half works everywhere — the browser dev build renders seeded
 * meetings — while the sync half only exists inside Tauri.
 */

export type SyncPhase = "disconnected" | "syncing" | "synced" | "error";

export interface CalendarConnection {
  meetings: Meeting[];
  phase: SyncPhase;
  /** When the cache last matched Google. */
  lastSync: Instant | null;
  email: string | null;
  calendars: GoogleCalendar[];
  /** False at localhost, where there is no keychain and no loopback. */
  available: boolean;
  /** A pasted client id and secret are on file, so Connect can be offered. */
  configured: boolean;
  saveClient: (clientId: string, clientSecret: string) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  setCalendarEnabled: (id: string, enabled: boolean) => Promise<void>;
}

/** How far the cache reaches around the day being looked at. */
const WINDOW_DAYS = 56;
/** Sync again before the anchor gets this close to the window's edge. */
const EDGE_DAYS = 14;
const RESYNC_MS = 5 * 60 * 1000;

const inTauri = () => "__TAURI_INTERNALS__" in window;

function windowFor(anchor: Day): { timeMin: Instant; timeMax: Instant } {
  return {
    timeMin: toInstant(dayStart(addDays(anchor, -WINDOW_DAYS))),
    timeMax: toInstant(dayStart(addDays(anchor, WINDOW_DAYS))),
  };
}

export function useCalendar(anchor: Day): CalendarConnection {
  const { db } = useStore();
  const clock = useClock();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [phase, setPhase] = useState<SyncPhase>("disconnected");
  const [lastSync, setLastSync] = useState<Instant | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [configured, setConfigured] = useState(false);
  const busy = useRef(false);
  const synced = useRef<{ min: Day; max: Day } | null>(null);

  const readCache = useCallback(async (): Promise<void> => {
    const { timeMin, timeMax } = windowFor(anchor);
    setMeetings(await googleEvents.listBetween(db, timeMin, timeMax));
    setCalendars(await googleCalendars.list(db));
    setLastSync((await meta.get(db, META_LAST_SYNC)) || null);
    setEmail((await meta.get(db, META_EMAIL)) || null);
    setConfigured(
      Boolean(await meta.get(db, META_CLIENT_ID)) &&
        Boolean(await meta.get(db, META_CLIENT_SECRET)),
    );
  }, [db, anchor]);

  const sync = useCallback(
    async (force: boolean): Promise<void> => {
      if (!inTauri() || busy.current) return;
      if (!(await isConnected())) {
        setPhase("disconnected");
        return;
      }
      const inside =
        synced.current !== null &&
        addDays(anchor, -EDGE_DAYS) >= synced.current.min &&
        addDays(anchor, EDGE_DAYS) <= synced.current.max;
      if (inside && !force) return;

      busy.current = true;
      setPhase("syncing");
      try {
        const { timeMin, timeMax } = windowFor(anchor);
        await syncWindow(db, clock, timeMin, timeMax);
        synced.current = {
          min: addDays(anchor, -WINDOW_DAYS),
          max: addDays(anchor, WINDOW_DAYS),
        };
        await readCache();
        setPhase("synced");
      } catch (error) {
        // A dead grant asks for a reconnect; anything else keeps the cache.
        setPhase(error instanceof Disconnected ? "disconnected" : "error");
      } finally {
        busy.current = false;
      }
    },
    [db, clock, anchor, readCache],
  );

  // The cache renders first, every time; a sync catches up behind it.
  useEffect(() => {
    void readCache().then(async () => {
      if (inTauri() && (await isConnected())) {
        setPhase((current) => (current === "disconnected" ? "synced" : current));
      }
      void sync(false);
    });
  }, [readCache, sync]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      synced.current = null; // a fresh look, even standing still
      void sync(false);
    }, RESYNC_MS);
    return () => window.clearInterval(timer);
  }, [sync]);

  const saveClient = useCallback(
    async (clientId: string, clientSecret: string) => {
      await meta.set(db, META_CLIENT_ID, clientId.trim());
      await meta.set(db, META_CLIENT_SECRET, clientSecret.trim());
      setConfigured(Boolean(clientId.trim()) && Boolean(clientSecret.trim()));
    },
    [db],
  );

  const connect = useCallback(async () => {
    setPhase("syncing");
    try {
      await googleConnect(db, clock);
      synced.current = null;
      await sync(true);
    } catch (error) {
      setPhase("error");
      throw error;
    }
  }, [db, clock, sync]);

  const disconnect = useCallback(async () => {
    await googleDisconnect(db);
    synced.current = null;
    setPhase("disconnected");
    await readCache();
  }, [db, readCache]);

  const syncNow = useCallback(async () => {
    synced.current = null;
    await sync(true);
  }, [sync]);

  const setCalendarEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      await googleCalendars.setEnabled(db, id, enabled);
      await readCache();
      if (enabled) {
        synced.current = null;
        void sync(true);
      }
    },
    [db, readCache, sync],
  );

  return {
    meetings,
    phase,
    lastSync,
    email,
    calendars,
    available: inTauri(),
    configured,
    saveClient,
    connect,
    disconnect,
    syncNow,
    setCalendarEnabled,
  };
}
