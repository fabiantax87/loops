import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SqlDriver } from "./db/driver";
import { openDb } from "./db/tauri";
import { systemClock } from "./lib/clock";
import { StoreProvider, useSnapshot, useStore } from "./state/store";
import { useUpdater } from "./state/updater";
import { useHotWatch } from "./state/watch";
import { Capture, type CapturePreset } from "./ui/Capture";
import { CaptureWindow } from "./ui/CaptureWindow";
import { TitleBar } from "./ui/Chrome";
import { NewClientSheet } from "./ui/NewClientSheet";
import { Rail } from "./ui/Rail";
import { ArchiveScreen } from "./ui/ArchiveScreen";
import { CalendarScreen } from "./ui/calendar/CalendarScreen";
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
  const { update, restart } = useUpdater();

  // ⌘⇧L in the packaged app is a global shortcut that opens the capture
  // popup window; this DOM fallback keeps the chord working at localhost,
  // where there is no OS registration and no second window.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "l" && event.metaKey && event.shiftKey) {
        event.preventDefault();
        setCapturing({});
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Items saved from the capture popup land in the database behind this
  // window's back; the popup announces them and this window re-reads.
  const { reload } = useStore();
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen("items-changed", () => void reload()).then((un) => {
        stop = un;
      }),
    );
    return () => stop?.();
  }, [reload]);

  return (
    <div className="flex h-full flex-col bg-panel">
      <TitleBar>
        {(update.phase === "checking" ||
          update.phase === "current" ||
          update.phase === "failed" ||
          update.phase === "downloading") && (
          <span className="fact px-[9px] py-[3px] text-[11px] text-muted">
            {update.phase === "checking"
              ? "checking for updates…"
              : update.phase === "current"
                ? "up to date"
                : update.phase === "failed"
                  ? "couldn't reach the update server"
                  : `downloading ${update.version}…`}
          </span>
        )}
        {update.phase === "ready" && (
          <button
            type="button"
            onClick={restart}
            className="fact rounded-[5px] border border-[#244f3f] px-[9px] py-[3px] text-[11px] text-green transition-colors hover:bg-green hover:text-ink"
          >
            {update.version} is ready — restart
          </button>
        )}
      </TitleBar>
      <div className="flex min-h-0 flex-1">
        <Rail screen={screen} go={setScreen} onNewClient={() => setNaming(true)} />
        {/* items-start matters: as a stretched flex item the reading column
            would be pinned to the viewport height and its content would
            overflow past its own bottom padding. */}
        <main className="flex min-w-0 flex-1 items-start justify-center overflow-y-auto px-10">
          {loading ? null : screen.name === "today" ? (
            <TodayScreen go={setScreen} onNewClient={() => setNaming(true)} />
          ) : screen.name === "calendar" ? (
            <CalendarScreen />
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

/**
 * One frontend, two windows: "main" is the app, "capture" is the popup the
 * global shortcut summons. The label is stamped on the webview before any
 * script runs, so it's readable synchronously.
 */
function isCaptureWindow(): boolean {
  if (!("__TAURI_INTERNALS__" in window)) return false;
  return getCurrentWindow().label === "capture";
}

export default function App() {
  const [db, setDb] = useState<SqlDriver | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [capture] = useState(isCaptureWindow);

  // The popup window is transparent; only the card paints.
  useEffect(() => {
    document.body.classList.toggle("capture-window", capture);
  }, [capture]);

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
  if (!db) return capture ? null : <div className="h-full bg-panel" />;

  return (
    <StoreProvider db={db} clock={systemClock}>
      {capture ? <CaptureWindow /> : <Workspace />}
    </StoreProvider>
  );
}
