import { useState } from "react";
import { projectOfRepo } from "../domain/snapshot";
import { countOf } from "../domain/words";
import type { GithubConnection } from "../state/githubSync";
import { useSnapshot } from "../state/store";
import { useEscape } from "./calendar/MeetingDetail";
import { openExternal } from "./notes";

/* Connecting GitHub: one personal access token, pasted once. It goes to the
   keychain; Loops only ever reads with it. */

const FIELD =
  "w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-3 font-mono text-[13px] text-text outline-none placeholder:text-faint focus:border-outline-hover";

export function ConnectGithubSheet({
  connection,
  onClose,
}: {
  connection: GithubConnection;
  onClose: () => void;
}) {
  const [token, setToken] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const ready = token.trim() !== "";

  const connect = async () => {
    if (!ready || connecting) return;
    setConnecting(true);
    setFailure(null);
    try {
      await connection.connect(token);
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
        onKeyDown={(e) => {
          if (e.key === "Enter") void connect();
        }}
      >
        <span className="label text-faint">Connect GitHub</span>
        <p className="m-0 text-[13px] leading-[1.6] text-soft">
          Loops watches the open pull requests that are yours to move — the ones you
          wrote, the ones assigned to you, and the ones waiting on your review — and
          turns each into a todo with a week on it. It needs a{" "}
          <button
            type="button"
            onClick={() => openExternal("https://github.com/settings/tokens")}
            className="text-green underline decoration-[#2c5546] underline-offset-[3px] hover:text-green-hover"
          >
            personal access token
          </button>
          : a classic one with the <span className="font-mono text-[12px]">repo</span>{" "}
          scope, or a fine-grained one that can read pull requests. The token is stored
          in the keychain; nothing is ever written to GitHub.
        </p>
        <input
          autoFocus
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Personal access token"
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
          <span className="fact text-[11px] text-faint">⏎ connect · esc dismiss</span>
        </div>
      </div>
    </div>
  );
}

export function GithubSettingsSheet({
  connection,
  onClose,
}: {
  connection: GithubConnection;
  onClose: () => void;
}) {
  const snapshot = useSnapshot();
  // Pull requests in repositories no project has claimed are watched but
  // homeless: no overview shows them and no todo gets made. Say which.
  const unclaimed = [
    ...new Set(
      snapshot.pulls.filter((p) => !projectOfRepo(snapshot, p.repo)).map((p) => p.repo),
    ),
  ];

  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[16vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[480px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline gap-3">
          <span className="label flex-1 text-faint">GitHub</span>
          {connection.login && (
            <span className="fact text-[11px] text-muted">{connection.login}</span>
          )}
        </div>
        <p className="m-0 text-[13px] leading-[1.6] text-soft">
          {snapshot.pulls.length === 0
            ? "No open pull requests are waiting on you."
            : `${countOf(snapshot.pulls.length, "open pull request")} ${
                snapshot.pulls.length === 1 ? "is" : "are"
              } yours to move.`}{" "}
          They are read every few minutes; each one in a project's repository becomes a
          todo due a week after it opened, and closes itself when the pull request
          merges or closes. Nothing is written back.
        </p>
        {unclaimed.length > 0 && (
          <p className="m-0 text-[13px] leading-[1.6] text-soft">
            <span className="text-amber">
              {unclaimed.length === 1
                ? "One repository belongs to no project yet"
                : `${unclaimed.length} repositories belong to no project yet`}
            </span>
            , so {unclaimed.length === 1 ? "its" : "their"} pull requests show nowhere:{" "}
            <span className="font-mono text-[12px] text-text">{unclaimed.join(", ")}</span>.
            Add {unclaimed.length === 1 ? "it" : "each"} to a project from the client page
            (edit the project).
          </p>
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
