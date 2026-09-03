import { clientSignals } from "../domain/sidebar";
import { useClock } from "../lib/ClockContext";
import { useSnapshot } from "../state/store";
import type { Screen } from "./navigation";

const DOT: Record<string, string> = {
  red: "bg-red",
  amber: "bg-amber",
  muted: "bg-quiet-dot",
  grey: "bg-quiet-dot",
};

const BADGE: Record<string, string> = {
  red: "text-red",
  amber: "text-amber",
  muted: "text-muted",
  grey: "text-faint",
};

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[7px] px-[13px] py-[9px] text-left text-[15px] transition-colors ${
        active ? "bg-hover text-text" : "text-muted hover:bg-chrome hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * The persistent client rail. It says as little as it can get away with: a
 * healthy client is a dim name and a dead dot; only a missed deadline or an
 * answer overdue earn a word.
 */
export function Rail({
  screen,
  go,
  onNewClient,
}: {
  screen: Screen;
  go: (screen: Screen) => void;
  onNewClient: () => void;
}) {
  const snapshot = useSnapshot();
  const clock = useClock();
  const signals = clientSignals(snapshot, clock);

  return (
    <nav className="flex w-[264px] flex-none flex-col gap-[26px] overflow-y-auto border-r border-edge bg-rail px-3.5 pt-[26px] pb-4">
      <div className="flex flex-col gap-0.5">
        <NavItem label="Today" active={screen.name === "today"} onClick={() => go({ name: "today" })} />
        <NavItem
          label="Archive"
          active={screen.name === "archive"}
          onClick={() => go({ name: "archive" })}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="label px-[13px] text-[10px] text-faint">Clients</span>
        <div className="flex flex-col gap-px">
          {signals.map(({ client, badge, tone, fine }) => (
            <button
              key={client.id}
              type="button"
              onClick={() => go({ name: "client", clientId: client.id })}
              className={`flex items-center gap-2.5 rounded-[7px] px-[13px] py-2.5 text-left transition-colors hover:bg-chrome ${
                screen.name === "client" && screen.clientId === client.id ? "bg-chrome" : ""
              }`}
            >
              <span className={`h-1.5 w-1.5 flex-none rounded-full ${DOT[tone]}`} />
              <span
                className={`flex-1 truncate text-[15px] ${fine ? "text-sleeping" : "text-text"}`}
              >
                {client.name}
              </span>
              {badge && <span className={`fact text-[11px] ${BADGE[tone]}`}>{badge}</span>}
            </button>
          ))}
        </div>
        {signals.length > 0 && (
          <span className="px-[13px] pt-1 font-mono text-[10px] leading-relaxed text-faint">
            Grey means fine.
          </span>
        )}
      </div>

      <div className="mt-auto">
        <button
          type="button"
          onClick={onNewClient}
          className="w-full rounded-[7px] px-[13px] py-[9px] text-left text-sm text-muted transition-colors hover:bg-chrome hover:text-text"
        >
          New client
        </button>
      </div>
    </nav>
  );
}
