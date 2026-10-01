import { useState } from "react";
import type { ProductiveConnection } from "../../state/productiveSync";
import { openExternal } from "../notes";
import { useEscape } from "./MeetingDetail";

/* Connecting Productive: a personal API token and the organization id, both
   copied from Productive's own settings. The token goes to the keychain; the
   rest is just facts. */

const FIELD =
  "w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-3 font-mono text-[13px] text-text outline-none placeholder:text-faint focus:border-outline-hover";

export function ConnectProductiveSheet({
  connection,
  onClose,
}: {
  connection: ProductiveConnection;
  onClose: () => void;
}) {
  const [token, setToken] = useState("");
  const [orgId, setOrgId] = useState("");
  const [email, setEmail] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const ready = token.trim() !== "" && orgId.trim() !== "";

  const connect = async () => {
    if (!ready || connecting) return;
    setConnecting(true);
    setFailure(null);
    try {
      await connection.connect(token, orgId, email.trim() || null);
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
        <span className="label text-faint">Connect Productive</span>
        <p className="m-0 text-[13px] leading-[1.6] text-soft">
          Loops reads your bookings straight from Productive, so it needs a personal
          API token. In{" "}
          <button
            type="button"
            onClick={() => openExternal("https://app.productive.io/")}
            className="text-green underline decoration-[#2c5546] underline-offset-[3px] hover:text-green-hover"
          >
            Productive → Settings → API integrations
          </button>
          , generate a token and paste it here with the organization id shown on the
          same page. The token is stored in the keychain; bookings are read-only to Loops.
        </p>
        <input
          autoFocus
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Personal API token"
          className={FIELD}
        />
        <input
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          placeholder="Organization id"
          className={FIELD}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email in Productive — only if Loops can't work out who you are"
          className={FIELD}
        />
        {failure && <span className="fact text-[11px] text-red">{failure}</span>}
        <div className="flex items-center gap-4 pt-1">
          <button
            type="button"
            onClick={() => void connect()}
            disabled={!ready || connecting}
            className="rounded-lg bg-green px-[18px] py-2.5 text-sm text-ink transition-colors hover:bg-green-hover disabled:cursor-default disabled:opacity-40"
          >
            {connecting ? "Connecting…" : "Connect"}
          </button>
          <span className="fact text-[11px] text-faint">esc dismiss</span>
        </div>
      </div>
    </div>
  );
}

export function ProductiveSettingsSheet({
  connection,
  onClose,
}: {
  connection: ProductiveConnection;
  onClose: () => void;
}) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[16vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[440px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline gap-3">
          <span className="label flex-1 text-faint">Productive</span>
          {connection.orgName && (
            <span className="fact text-[11px] text-muted">{connection.orgName}</span>
          )}
        </div>
        <p className="m-0 text-[13px] leading-[1.6] text-soft">
          Your bookings are read from Productive every few minutes and shown as booked
          time in the capacity strip. Nothing is written back.
        </p>
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
