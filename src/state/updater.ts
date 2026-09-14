import { useEffect, useRef, useState } from "react";

/**
 * Updates stay out of the way: checked once at startup (and every few hours
 * for a window that never closes), downloaded in the background, and then the
 * title bar offers one word — restart. Nothing interrupts the morning read.
 *
 * "Check for Updates…" in the tray menu runs the same check by hand; only
 * then do the quiet outcomes — checking, up to date, unreachable — show,
 * and briefly.
 */
export interface UpdateState {
  phase: "idle" | "checking" | "current" | "failed" | "downloading" | "ready";
  version: string | null;
}

const RECHECK_MS = 4 * 60 * 60 * 1000;
const NOTICE_MS = 4 * 1000;

export function useUpdater(): { update: UpdateState; restart: () => void } {
  const [update, setUpdate] = useState<UpdateState>({ phase: "idle", version: null });
  const busy = useRef(false);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;

    let notice: number | undefined;
    const settle = (phase: "current" | "failed") => {
      window.clearTimeout(notice);
      setUpdate({ phase, version: null });
      notice = window.setTimeout(
        () =>
          setUpdate((current) =>
            current.phase === phase ? { phase: "idle", version: null } : current,
          ),
        NOTICE_MS,
      );
    };

    const look = async (manual: boolean) => {
      if (busy.current) return;
      busy.current = true;
      if (manual) setUpdate({ phase: "checking", version: null });
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const found = await check();
        if (!found) {
          if (manual) settle("current");
          return;
        }
        setUpdate({ phase: "downloading", version: found.version });
        await found.downloadAndInstall();
        setUpdate({ phase: "ready", version: found.version });
      } catch {
        // Offline, or the release page is unreachable — next check will say.
        if (manual) {
          settle("failed");
          return;
        }
        setUpdate((current) =>
          current.phase === "ready" ? current : { phase: "idle", version: null },
        );
      } finally {
        busy.current = false;
      }
    };

    void look(false);
    const timer = window.setInterval(() => void look(false), RECHECK_MS);

    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen("check-updates", () => void look(true)).then((un) => {
        stop = un;
      }),
    );

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(notice);
      stop?.();
    };
  }, []);

  const restart = () => {
    void import("@tauri-apps/plugin-process").then(({ relaunch }) => relaunch());
  };

  return { update, restart };
}
