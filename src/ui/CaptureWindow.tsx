import { useEffect, useState } from "react";
import type { ItemKind } from "../domain/types";
import { useStore } from "../state/store";
import { CapturePanel } from "./Capture";

/**
 * The standalone capture popup — its own small always-on-top Tauri window,
 * shown by ⌘⇧L or the tray while the main window stays wherever it was.
 * The window lives hidden between captures; each show gets a fresh panel
 * (keyed) over a freshly reloaded snapshot, and closing just hides the
 * window so focus falls back to whatever you were doing.
 */
export function CaptureWindow() {
  const { reload } = useStore();
  const [session, setSession] = useState<{ id: number; kind: ItemKind } | null>(
    null,
  );

  useEffect(() => {
    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<{ kind?: ItemKind } | null>("capture", (event) => {
        // Clients and contacts drive the parsing; pick up anything added
        // in the main window since the last capture.
        void reload();
        setSession((current) => ({
          id: (current?.id ?? 0) + 1,
          kind: event.payload?.kind ?? "todo",
        }));
      }).then((un) => {
        stop = un;
      }),
    );
    return () => stop?.();
  }, [reload]);

  const close = () => {
    setSession(null);
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      // The main window, if open, re-reads the database; saves made here
      // would otherwise sit invisible until a restart.
      const { emit } = await import("@tauri-apps/api/event");
      await getCurrentWindow().hide();
      await emit("items-changed");
    });
  };

  return (
    <div
      className="flex h-full items-start justify-center pt-4"
      onMouseDown={close}
    >
      {session && (
        <CapturePanel
          key={session.id}
          preset={{ kind: session.kind }}
          onClose={close}
        />
      )}
    </div>
  );
}
