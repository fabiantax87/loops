import { useCallback, useEffect, useRef, useState } from "react";
import { meta } from "../db/repo";
import {
  Disconnected,
  META_LAST_SYNC,
  META_LOGIN,
  connect as githubConnect,
  disconnect as githubDisconnect,
  isConnected,
} from "../github/auth";
import { syncPulls } from "../github/sync";
import { useClock } from "../lib/ClockContext";
import type { Instant } from "../lib/time";
import type { SyncPhase } from "./calendarSync";
import { useStore } from "./store";

/**
 * Pull requests, kept honest in the background. Unlike the calendar's two
 * connections this one runs for the whole app, not one screen: a sync can
 * make a todo or close one, and those belong on Today whichever screen is up.
 * The pull requests themselves ride in the snapshot, so a sync ends by
 * reloading it.
 */

export interface GithubConnection {
  phase: SyncPhase;
  lastSync: Instant | null;
  login: string | null;
  /** False at localhost, where there is no keychain. */
  available: boolean;
  connect: (token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const RESYNC_MS = 5 * 60 * 1000;

const inTauri = () => "__TAURI_INTERNALS__" in window;

export function useGithub(): GithubConnection {
  const { db, reload } = useStore();
  const clock = useClock();
  const [phase, setPhase] = useState<SyncPhase>("disconnected");
  const [lastSync, setLastSync] = useState<Instant | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const busy = useRef(false);

  const readMeta = useCallback(async (): Promise<void> => {
    setLastSync((await meta.get(db, META_LAST_SYNC)) || null);
    setLogin((await meta.get(db, META_LOGIN)) || null);
  }, [db]);

  const sync = useCallback(async (): Promise<void> => {
    if (!inTauri() || busy.current) return;
    if (!(await isConnected())) {
      setPhase("disconnected");
      return;
    }
    busy.current = true;
    setPhase("syncing");
    try {
      await syncPulls(db, clock);
      await readMeta();
      await reload();
      setPhase("synced");
    } catch (error) {
      setPhase(error instanceof Disconnected ? "disconnected" : "error");
    } finally {
      busy.current = false;
    }
  }, [db, clock, readMeta, reload]);

  useEffect(() => {
    void readMeta().then(() => sync());
    const timer = window.setInterval(() => void sync(), RESYNC_MS);
    return () => window.clearInterval(timer);
  }, [readMeta, sync]);

  const connect = useCallback(
    async (token: string) => {
      await githubConnect(db, token);
      await readMeta();
      await sync();
    },
    [db, readMeta, sync],
  );

  const disconnect = useCallback(async () => {
    await githubDisconnect(db);
    setPhase("disconnected");
    await readMeta();
    await reload();
  }, [db, readMeta, reload]);

  return {
    phase,
    lastSync,
    login,
    available: inTauri(),
    connect,
    disconnect,
    syncNow: sync,
  };
}
