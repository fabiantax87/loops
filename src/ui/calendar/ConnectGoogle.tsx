import { useState } from "react";
import type { CalendarConnection } from "../../state/calendarSync";
import { useEscape } from "./MeetingDetail";
import { openExternal } from "../notes";

/* Getting Google connected, and staying honest about its state. The one-time
   setup asks for the OAuth client the user creates in their own Google Cloud
   project — this app has no server to hold one for them. */

export function ConnectSheet({
  connection,
  onClose,
}: {
  connection: CalendarConnection;
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const ready = clientId.trim() !== "" && clientSecret.trim() !== "";

  const connect = async () => {
    if (!ready || connecting) return;
    setConnecting(true);
    setFailure(null);
    try {
      await connection.saveClient(clientId, clientSecret);
      await connection.connect();
      onClose();
    } catch (error) {
      setFailure(String(error instanceof Error ? error.message : error));
    } finally {
      setConnecting(false);
    }
  };

  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[16vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[560px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="label text-faint">Connect Google Calendar</span>
        <p className="m-0 text-[13px] leading-[1.6] text-soft">
          Loops talks to Google directly — no server in between — so it needs an
          OAuth client of your own. In{" "}
          <button
            type="button"
            onClick={() => openExternal("https://console.cloud.google.com/apis/credentials")}
            className="text-green underline decoration-[#2c5546] underline-offset-[3px] hover:text-green-hover"
          >
            Google Cloud → Credentials
          </button>
          , create an OAuth client of type <span className="text-text">Desktop app</span>{" "}
          (and enable the Google Calendar API), then paste its id and secret here.
          They are stored locally; the calendar is read-only to Loops.
        </p>
        <input
          autoFocus
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Client ID — ….apps.googleusercontent.com"
          className="w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-3 font-mono text-[13px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
        />
        <input
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="Client secret"
          className="w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-3 font-mono text-[13px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
        />
        {failure && <span className="fact text-[11px] text-red">{failure}</span>}
        <div className="flex items-center gap-4 pt-1">
          <button
            type="button"
            onClick={() => void connect()}
            disabled={!ready || connecting}
            className="rounded-lg bg-green px-4 py-2 text-sm text-ink transition-colors hover:bg-green-hover disabled:opacity-40"
          >
            {connecting ? "Waiting for Google…" : "Connect"}
          </button>
          <span className="fact text-[11px] text-faint">
            the consent screen opens in your browser
          </span>
        </div>
      </div>
    </div>
  );
}

/** Account, calendars, sync — the small panel behind the footer's word. */
export function CalendarSettingsSheet({
  connection,
  onClose,
}: {
  connection: CalendarConnection;
  onClose: () => void;
}) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[18vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[440px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline gap-3">
          <span className="label flex-1 text-faint">Google Calendar</span>
          {connection.email && (
            <span className="fact text-[11px] text-muted">{connection.email}</span>
          )}
        </div>

        {connection.calendars.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="label pb-1 text-[10px] tracking-[.12em] text-faint">
              Calendars
            </span>
            {connection.calendars.map((calendar) => (
              <button
                key={calendar.id}
                type="button"
                onClick={() =>
                  void connection.setCalendarEnabled(calendar.id, !calendar.enabled)
                }
                className="flex w-full items-center gap-3 rounded-[7px] px-2.5 py-2 text-left transition-colors hover:bg-[#212624]"
              >
                <span
                  className={`flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border text-[10px] ${
                    calendar.enabled
                      ? "border-green text-green"
                      : "border-outline text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span
                  className={`flex-1 truncate text-[14px] ${
                    calendar.enabled ? "text-text" : "text-faint"
                  }`}
                >
                  {calendar.summary}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={() => void connection.syncNow()}
            className="rounded-[7px] border border-outline px-[13px] py-1.5 text-[13px] text-soft transition-colors hover:border-outline-hover hover:text-text"
          >
            Sync now
          </button>
          <button
            type="button"
            onClick={() => {
              void connection.disconnect().then(onClose);
            }}
            className="ml-auto rounded-[7px] px-[11px] py-1.5 text-[13px] text-sleeping transition-colors hover:bg-[#212624] hover:text-red"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
