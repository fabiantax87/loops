import { useEffect, useState } from "react";
import type { SqlDriver } from "./db/driver";
import { openDb } from "./db/tauri";
import { systemClock } from "./lib/clock";
import { StoreProvider, useSnapshot, useStore } from "./state/store";
import { useHotWatch } from "./state/watch";
import { Capture, type CapturePreset } from "./ui/Capture";
import { TitleBar } from "./ui/Chrome";
import { NewClientSheet } from "./ui/NewClientSheet";
import { Rail } from "./ui/Rail";
import { ArchiveScreen } from "./ui/ArchiveScreen";
import { ClientScreen } from "./ui/ClientScreen";
import { TodayScreen } from "./ui/TodayScreen";
import { clientById, projectsOf } from "./domain/snapshot";
import type { Screen } from "./ui/navigation";
import "./styles.css";

function Workspace() {
  const [screen, setScreen] = useState<Screen>({ name: "today" });
  const [naming, setNaming] = useState(false);
  const [capturing, setCapturing] = useState<CapturePreset | null>(null);
  const snapshot = useSnapshot();
  const { loading } = useStore();
  useHotWatch(snapshot);

  // ⌘⇧L reaches the window from anywhere; inside the app the same chord works
  // without asking the OS.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "l" && event.metaKey && event.shiftKey) {
        event.preventDefault();
        setCapturing({});
      }
    };
    document.addEventListener("keydown", onKey);
    let stop: (() => void) | undefined;
    if ("__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/event").then(({ listen }) =>
        listen("capture", () => setCapturing({})).then((un) => {
          stop = un;
        }),
      );
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      stop?.();
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-panel">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Rail screen={screen} go={setScreen} onNewClient={() => setNaming(true)} />
        {/* items-start matters: as a stretched flex item the reading column
            would be pinned to the viewport height and its content would
            overflow past its own bottom padding. */}
        <main className="flex min-w-0 flex-1 items-start justify-center overflow-y-auto px-10">
          {loading ? null : screen.name === "today" ? (
            <TodayScreen go={setScreen} onNewClient={() => setNaming(true)} />
          ) : screen.name === "client" ? (
            <ClientScreen
              clientId={screen.clientId}
              onCapture={(kind) => {
                const client = clientById(snapshot, screen.clientId);
                if (!client) return;
                const projects = projectsOf(snapshot, screen.clientId);
                setCapturing({
                  kind,
                  client,
                  project: projects.length === 1 ? projects[0] : null,
                });
              }}
            />
          ) : (
            <ArchiveScreen />
          )}
        </main>
      </div>
      {capturing && (
        <Capture preset={capturing} onClose={() => setCapturing(null)} />
      )}
      {naming && (
        <NewClientSheet
          onClose={() => setNaming(false)}
          onCreated={(clientId) => {
            setNaming(false);
            setScreen({ name: "client", clientId });
          }}
        />
      )}
    </div>
  );
}

/**
 * In the app, the real database. At localhost — where the design gets checked —
 * a throwaway one in the tab, seeded with something believable.
 */
async function boot(): Promise<SqlDriver> {
  if ("__TAURI_INTERNALS__" in window) return openDb();
  const [{ createBrowserDb }, { seed }] = await Promise.all([
    import("./db/browser"),
    import("./dev/seed"),
  ]);
  const db = await createBrowserDb();
  await seed(db, systemClock);
  return db;
}

export default function App() {
  const [db, setDb] = useState<SqlDriver | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    boot().then(setDb, (error) => setFailure(String(error)));
  }, []);

  if (failure) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <p className="fact max-w-lg text-red">{failure}</p>
      </div>
    );
  }
  if (!db) return <div className="h-full bg-panel" />;

  return (
    <StoreProvider db={db} clock={systemClock}>
      <Workspace />
    </StoreProvider>
  );
}
