import { useCallback, useEffect, useRef, useState } from "react";
import { meta, productiveBookings } from "../db/repo";
import type { Booking } from "../domain/calendar";
import { useClock } from "../lib/ClockContext";
import { type Day, type Instant, addDays } from "../lib/time";
import {
  Disconnected,
  META_LAST_SYNC,
  META_ORG_NAME,
  connect as productiveConnect,
  disconnect as productiveDisconnect,
  isConnected,
} from "../productive/auth";
import { syncWindow } from "../productive/sync";
import type { SyncPhase } from "./calendarSync";
import { useStore } from "./store";

/**
 * Bookings, the same way meetings are held: a cache that renders at once and
 * a background sync that keeps it honest. The one difference is what a lost
 * connection means — bookings drop out of every view rather than going
 * stale, so an unsynced day never reads as an unbooked one.
 */

export interface ProductiveConnection {
  /** Empty while disconnected, whatever the cache still holds. */
  bookings: Booking[];
  phase: SyncPhase;
  lastSync: Instant | null;
  orgName: string | null;
  /** False at localhost, where there is no keychain. */
  available: boolean;
  /** The token was rejected or removed after a successful sync once. */
  wasConnected: boolean;
  connect: (token: string, orgId: string, email: string | null) => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const WINDOW_DAYS = 56;
const EDGE_DAYS = 14;
const RESYNC_MS = 5 * 60 * 1000;

const inTauri = () => "__TAURI_INTERNALS__" in window;

export function useProductive(anchor: Day): ProductiveConnection {
  const { db } = useStore();
  const clock = useClock();
  const [cached, setCached] = useState<Booking[]>([]);
  const [phase, setPhase] = useState<SyncPhase>("disconnected");
  const [lastSync, setLastSync] = useState<Instant | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const busy = useRef(false);
  const synced = useRef<{ min: Day; max: Day } | null>(null);

  const readCache = useCallback(async (): Promise<void> => {
    setCached(
      await productiveBookings.listBetween(
        db,
        addDays(anchor, -WINDOW_DAYS),
        addDays(anchor, WINDOW_DAYS),
      ),
    );
    setLastSync((await meta.get(db, META_LAST_SYNC)) || null);
    setOrgName((await meta.get(db, META_ORG_NAME)) || null);
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
        await syncWindow(db, clock, addDays(anchor, -WINDOW_DAYS), addDays(anchor, WINDOW_DAYS));
        synced.current = {
          min: addDays(anchor, -WINDOW_DAYS),
          max: addDays(anchor, WINDOW_DAYS),
        };
        await readCache();
        setPhase("synced");
      } catch (error) {
        setPhase(error instanceof Disconnected ? "disconnected" : "error");
      } finally {
        busy.current = false;
      }
    },
    [db, clock, anchor, readCache],
  );

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
      synced.current = null;
      void sync(false);
    }, RESYNC_MS);
    return () => window.clearInterval(timer);
  }, [sync]);

  const connect = useCallback(
    async (token: string, orgId: string, email: string | null) => {
      setPhase("syncing");
      try {
        await productiveConnect(db, token, orgId, email);
        synced.current = null;
        await sync(true);
      } catch (error) {
        setPhase("disconnected");
        throw error;
      }
    },
    [db, sync],
  );

  const disconnect = useCallback(async () => {
    await productiveDisconnect(db);
    synced.current = null;
    setPhase("disconnected");
    await readCache();
  }, [db, readCache]);

  const syncNow = useCallback(async () => {
    synced.current = null;
    await sync(true);
  }, [sync]);

  // The browser build has no keychain, so its seeded bookings count as synced.
  const live = !inTauri() || phase !== "disconnected";
  return {
    bookings: live ? cached : [],
    phase,
    lastSync,
    orgName,
    available: inTauri(),
    wasConnected: lastSync !== null,
    connect,
    disconnect,
    syncNow,
  };
}
