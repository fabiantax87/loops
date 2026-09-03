import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SqlDriver } from "../db/driver";
import { loadSnapshot, settleIdeasOfDay } from "../db/repo";
import { emptySnapshot, type Snapshot } from "../domain/snapshot";
import type { Clock } from "../lib/clock";
import { ClockProvider } from "../lib/ClockContext";

/**
 * The whole database, held in memory and replaced wholesale after every write.
 *
 * For one person's client work that is a few hundred rows, so the simple thing
 * is also the fast thing: no cache invalidation, no optimistic-update drift,
 * and every screen is a pure function of one value.
 */
interface Store {
  snapshot: Snapshot;
  /** Runs a write, then reloads. Awaiting it means the UI has caught up. */
  act: (write: (db: SqlDriver, clock: Clock) => Promise<unknown>) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({
  db,
  clock,
  children,
}: {
  db: SqlDriver;
  clock: Clock;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    // A quiet day chooses its ideas once, in the morning — settle that before
    // anything reads the snapshot, so the choice survives restarts.
    await settleIdeasOfDay(db, clock);
    setSnapshot(await loadSnapshot(db));
    setLoading(false);
  }, [db, clock]);

  const act = useCallback<Store["act"]>(
    async (write) => {
      if (busy.current) return;
      busy.current = true;
      try {
        await write(db, clock);
        await reload();
      } finally {
        busy.current = false;
      }
    },
    [db, clock, reload],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<Store>(
    () => ({ snapshot, act, reload, loading }),
    [snapshot, act, reload, loading],
  );

  return (
    <ClockProvider clock={clock}>
      <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
    </ClockProvider>
  );
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore outside StoreProvider");
  return store;
}

export function useSnapshot(): Snapshot {
  return useStore().snapshot;
}
