import { useEffect, useRef, useState } from "react";

/**
 * Updates stay out of the way: checked once at startup (and every few hours
 * for a window that never closes), downloaded in the background, and then the
 * title bar offers one word — restart. Nothing interrupts the morning read.
 */
export interface UpdateState {
  phase: "idle" | "downloading" | "ready";
  version: string | null;
}

const RECHECK_MS = 4 * 60 * 60 * 1000;

export function useUpdater(): { update: UpdateState; restart: () => void } {
  const [update, setUpdate] = useState<UpdateState>({ phase: "idle", version: null });
  const busy = useRef(false);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;

    const look = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const found = await check();
        if (!found) return;
        setUpdate({ phase: "downloading", version: found.version });
        await found.downloadAndInstall();
        setUpdate({ phase: "ready", version: found.version });
      } catch {
        // Offline, or the release page is unreachable — next check will say.
        setUpdate((current) =>
          current.phase === "ready" ? current : { phase: "idle", version: null },
        );
      } finally {
        busy.current = false;
      }
    };

    void look();
    const timer = window.setInterval(() => void look(), RECHECK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const restart = () => {
    void import("@tauri-apps/plugin-process").then(({ relaunch }) => relaunch());
  };

  return { update, restart };
}
