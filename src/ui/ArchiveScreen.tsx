import { useState } from "react";
import { buildArchive } from "../domain/archive";
import { useClock } from "../lib/ClockContext";
import { useSnapshot } from "../state/store";

/**
 * Everything finished, closed, or decided against — grouped like a diary,
 * newest first, filterable by client. Nothing here is waiting on you.
 */
export function ArchiveScreen() {
  const snapshot = useSnapshot();
  const clock = useClock();
  const [clientId, setClientId] = useState<number | null>(null);
  const model = buildArchive(snapshot, clock, clientId);

  const clients = snapshot.clients.filter((c) => c.archivedAt === null);

  return (
    <div className="flex w-[720px] flex-col gap-12 pt-14 pb-[72px]">
      <header className="flex flex-col gap-3.5">
        <span className="label text-faint">Archive</span>
        <p className="m-0 text-[27px] leading-[1.5] tracking-[-.01em] text-pretty text-text">
          Everything you finished, closed, or decided against.{" "}
          <span className="text-muted">Nothing here is waiting on you.</span>
        </p>
        {clients.length > 1 && (
          <div className="flex flex-wrap items-center gap-3.5 pt-1.5">
            <FilterChip
              label="All clients"
              active={clientId === null}
              onClick={() => setClientId(null)}
            />
            {clients.map((client) => (
              <FilterChip
                key={client.id}
                label={client.name.split(" ")[0]}
                active={clientId === client.id}
                onClick={() => setClientId(client.id)}
              />
            ))}
          </div>
        )}
      </header>

      {model.total === 0 ? (
        <p className="m-0 text-[15px] leading-relaxed text-sleeping">
          Nothing put down yet. Finished and dropped items collect here.
        </p>
      ) : (
        <div className="flex flex-col gap-[34px]">
          {model.groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-1">
              <span className="pb-2 text-[15px] text-muted">{group.label}</span>
              {group.rows.map((row, index) => (
                <div
                  key={row.item.id}
                  className={`flex items-center gap-4 border-t border-hairline py-[15px] ${
                    index === group.rows.length - 1 ? "border-b" : ""
                  }`}
                >
                  <span className="fact w-[66px] flex-none text-[11px] text-bar">
                    {row.verb}
                  </span>
                  <span
                    className={`flex-1 truncate text-base leading-[1.4] ${
                      row.verb === "dropped" ? "text-muted" : "text-soft"
                    }`}
                  >
                    {row.item.title}
                  </span>
                  <span className="fact text-faint">{row.where}</span>
                  <span className="fact text-faint">{row.when}</span>
                </div>
              ))}
            </section>
          ))}
          {model.footer && (
            <span className="fact text-[11px] leading-[1.7] text-faint">{model.footer}</span>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
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
      className={`text-sm transition-colors ${
        active ? "text-text" : "text-sleeping hover:text-soft"
      }`}
    >
      {label}
    </button>
  );
}
