import { useEffect, useState } from "react";
import { useClock } from "../lib/ClockContext";
import { type Instant, daysAgo, today } from "../lib/time";
import type { Clock } from "../lib/clock";
import { type SyncPhase, useCalendar } from "../state/calendarSync";
import type { GithubConnection } from "../state/githubSync";
import { useProductive } from "../state/productiveSync";
import type { UpdateState } from "../state/updater";
import { CalendarSettingsSheet, ConnectSheet } from "./calendar/ConnectGoogle";
import { ConnectProductiveSheet, ProductiveSettingsSheet } from "./calendar/ConnectProductive";
import { useEscape } from "./calendar/MeetingDetail";
import { ConnectGithubSheet, GithubSettingsSheet } from "./ConnectGithub";

/* Settings: the one place every connection is made, looked at and let go of,
   and where an update can be asked for by hand. Each connection keeps its own
   sheet for the details; this is the list that leads to them. */

type Service = "github" | "google" | "productive";

function agoLabel(instant: Instant, clock: Clock): string {
  const minutes = Math.max(
    0,
    Math.round((clock.now().getTime() - new Date(instant).getTime()) / 60_000),
  );
  if (minutes < 1) return "synced just now";
  if (minutes < 60) return `synced ${minutes} min ago`;
  const days = daysAgo(instant, clock);
  if (days === 0) return `synced ${Math.round(minutes / 60)} h ago`;
  return days === 1 ? "synced yesterday" : `synced ${days} days ago`;
}

/** "fabiantax87 · synced 4 min ago" — who, and how fresh. */
function statusLine(
  who: string | null,
  phase: SyncPhase,
  lastSync: Instant | null,
  clock: Clock,
): { text: string; trouble: boolean } {
  if (phase === "error") return { text: "couldn't be reached just now", trouble: true };
  const fresh = phase === "syncing" ? "syncing…" : lastSync ? agoLabel(lastSync, clock) : null;
  return { text: [who ?? "connected", fresh].filter(Boolean).join(" · "), trouble: false };
}

function ServiceRow({
  name,
  what,
  available,
  connected,
  status,
  onOpen,
}: {
  name: string;
  /** What connecting it buys, shown while it isn't. */
  what: string;
  available: boolean;
  connected: boolean;
  status: { text: string; trouble: boolean };
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center gap-4 border-t border-hairline py-3.5">
      <span
        className={`h-1.5 w-1.5 flex-none rounded-full ${
          connected ? (status.trouble ? "bg-amber" : "bg-green") : "bg-quiet-dot"
        }`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] text-text">{name}</span>
        <span
          className={`fact truncate text-[11px] ${
            connected && status.trouble ? "text-amber" : "text-faint"
          }`}
        >
          {!available ? "demo data at localhost" : connected ? status.text : what}
        </span>
      </div>
      {available && (
        <button
          type="button"
          onClick={onOpen}
          className={
            connected
              ? "rounded-[7px] border border-outline px-[13px] py-1.5 text-[13px] text-soft transition-colors hover:border-outline-hover hover:text-text"
              : "rounded-[7px] bg-green px-[13px] py-1.5 text-[13px] text-ink transition-colors hover:bg-green-hover"
          }
        >
          {connected ? "Manage" : "Connect…"}
        </button>
      )}
    </div>
  );
}

const UPDATE_WORDS: Record<UpdateState["phase"], string> = {
  idle: "checks by itself every few hours",
  checking: "checking…",
  current: "up to date",
  failed: "couldn't reach the update server",
  downloading: "downloading",
  ready: "is ready",
};

export function SettingsSheet({
  github,
  update,
  onCheckUpdates,
  onRestart,
  onClose,
}: {
  github: GithubConnection;
  update: UpdateState;
  onCheckUpdates: () => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const clock = useClock();
  const day = today(clock);
  const google = useCalendar(day);
  const productive = useProductive(day);
  const [opened, setOpened] = useState<Service | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const inApp = "__TAURI_INTERNALS__" in window;

  useEffect(() => {
    if (!inApp) return;
    void import("@tauri-apps/api/app").then(({ getVersion }) => getVersion().then(setVersion));
  }, [inApp]);

  const githubOn = github.phase !== "disconnected";
  const googleOn = google.phase !== "disconnected";
  const productiveOn = productive.phase !== "disconnected";
  const back = () => setOpened(null);

  // One sheet at a time: a connection's own sheet takes this one's place and
  // hands back to it, so esc always closes exactly what is in front.
  if (opened === "github") {
    return githubOn ? (
      <GithubSettingsSheet connection={github} onClose={back} />
    ) : (
      <ConnectGithubSheet connection={github} onClose={back} />
    );
  }
  if (opened === "google") {
    return googleOn ? (
      <CalendarSettingsSheet connection={google} onClose={back} />
    ) : (
      <ConnectSheet connection={google} onClose={back} />
    );
  }
  if (opened === "productive") {
    return productiveOn ? (
      <ProductiveSettingsSheet connection={productive} onClose={back} />
    ) : (
      <ConnectProductiveSheet connection={productive} onClose={back} />
    );
  }

  return (
    <MainSheet onClose={onClose}>
      <span className="label text-faint">Settings</span>

      <div className="flex flex-col">
        <span className="label pb-2.5 text-[10px] tracking-[.14em] text-faint">Connections</span>
        <ServiceRow
          name="GitHub"
          what="open pull requests become todos, per project"
          available={github.available}
          connected={githubOn}
          status={statusLine(github.login, github.phase, github.lastSync, clock)}
          onOpen={() => setOpened("github")}
        />
        <ServiceRow
          name="Google Calendar"
          what="meetings on the calendar"
          available={google.available}
          connected={googleOn}
          status={statusLine(google.email, google.phase, google.lastSync, clock)}
          onOpen={() => setOpened("google")}
        />
        <ServiceRow
          name="Productive"
          what={
            productive.wasConnected
              ? "disconnected — bookings are hidden until you reconnect"
              : "bookings in the calendar's capacity strip"
          }
          available={productive.available}
          connected={productiveOn}
          status={statusLine(productive.orgName, productive.phase, productive.lastSync, clock)}
          onOpen={() => setOpened("productive")}
        />
      </div>

      <div className="flex flex-col">
        <span className="label pb-2.5 text-[10px] tracking-[.14em] text-faint">Updates</span>
        <div className="flex items-center gap-4 border-t border-hairline py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[15px] text-text">Loops{version ? ` ${version}` : ""}</span>
            <span
              className={`fact truncate text-[11px] ${
                update.phase === "failed"
                  ? "text-amber"
                  : update.phase === "ready"
                    ? "text-green"
                    : "text-faint"
              }`}
            >
              {!inApp
                ? "updates only exist in the installed app"
                : update.phase === "downloading" || update.phase === "ready"
                  ? `${update.version} ${UPDATE_WORDS[update.phase]}`
                  : UPDATE_WORDS[update.phase]}
            </span>
          </div>
          {inApp &&
            (update.phase === "ready" ? (
              <button
                type="button"
                onClick={onRestart}
                className="rounded-[7px] bg-green px-[13px] py-1.5 text-[13px] text-ink transition-colors hover:bg-green-hover"
              >
                Restart to update
              </button>
            ) : (
              <button
                type="button"
                onClick={onCheckUpdates}
                disabled={update.phase === "checking" || update.phase === "downloading"}
                className="rounded-[7px] border border-outline px-[13px] py-1.5 text-[13px] text-soft transition-colors hover:border-outline-hover hover:text-text disabled:opacity-40"
              >
                Check for updates
              </button>
            ))}
        </div>
      </div>

      <span className="fact text-[11px] text-faint">esc dismiss</span>
    </MainSheet>
  );
}

function MainSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[14vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[520px] flex-col gap-6 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
