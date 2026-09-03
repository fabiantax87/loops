import { useState } from "react";
import { contacts as contactRepo } from "../db/repo";
import { buildClientPage, shortProjectName } from "../domain/clientPage";
import { projectById, projectsOf } from "../domain/snapshot";
import type { ItemKind } from "../domain/types";
import { useClock } from "../lib/ClockContext";
import { useSnapshot, useStore } from "../state/store";
import { BandLabel } from "./primitives";
import { CriticalRow, IdeaRow, TodoRow, WaitingRow } from "./rows";

const DOT: Record<string, string> = {
  red: "bg-red",
  amber: "bg-amber",
  muted: "bg-quiet-dot",
  grey: "bg-quiet-dot",
};

/**
 * One client: its projects, its people, and everything open — grouped by kind,
 * with the critical card on top where it can't be missed.
 */
export function ClientScreen({
  clientId,
  onCapture,
}: {
  clientId: number;
  /** Opens the capture bar pre-routed to this client, with a type preselected. */
  onCapture: (kind: ItemKind) => void;
}) {
  const snapshot = useSnapshot();
  const clock = useClock();
  const { act } = useStore();
  const model = buildClientPage(snapshot, clock, clientId);
  const [addingContact, setAddingContact] = useState(false);

  return (
    <div className="flex w-[720px] flex-col gap-[52px] pt-14 pb-[72px]">
      <header className="flex flex-col gap-3">
        <h1 className="m-0 text-[30px] font-semibold tracking-[-.015em] text-text">
          {model.name}
        </h1>
        <p className="m-0 max-w-[600px] text-[17px] leading-relaxed text-pretty text-muted">
          {model.summary}
        </p>
      </header>

      <div className="flex gap-14">
        <div className="flex flex-1 flex-col gap-3.5">
          <BandLabel>Projects</BandLabel>
          <div className="flex flex-col gap-3">
            {model.projects.length === 0 && (
              <span className="text-[15px] text-sleeping">No projects yet.</span>
            )}
            {model.projects.map(({ project, open, tone }) => (
              <div key={project.id} className="flex items-center gap-2.5">
                <span className={`h-1.5 w-1.5 flex-none rounded-full ${DOT[tone]}`} />
                <span
                  className={`flex-1 truncate text-base ${tone === "grey" ? "text-soft" : "text-text"}`}
                >
                  {project.name}
                </span>
                <span className="fact text-[11px] text-faint">
                  {open} open
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3.5">
          <BandLabel>Contacts</BandLabel>
          <div className="flex flex-col gap-3">
            {model.contacts.length === 0 && (
              <span className="text-[15px] text-sleeping">Nobody written down yet.</span>
            )}
            {model.contacts.map((person) => {
              const project = projectById(snapshot, person.projectId);
              const detail = [
                project ? shortProjectName(project, snapshot) : null,
                person.role,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={person.id} className="group flex items-baseline gap-2.5">
                  <span className="flex-1 truncate text-base text-text">{person.name}</span>
                  {detail && <span className="fact text-[11px] text-faint">{detail}</span>}
                  <button
                    type="button"
                    onClick={() => act((db) => contactRepo.remove(db, person.id))}
                    className="fact text-[11px] text-transparent transition-colors group-hover:text-faint hover:!text-soft"
                  >
                    remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-[22px] border-b border-hairline pb-0.5">
        {(
          [
            ["New todo", "todo"],
            ["New idea", "idea"],
            ["New waiting-on", "waiting"],
          ] as [string, ItemKind][]
        ).map(([label, kind]) => (
          <button
            key={kind}
            type="button"
            onClick={() => onCapture(kind)}
            className="pb-3.5 text-sm text-soft transition-colors hover:text-text"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAddingContact(true)}
          className="pb-3.5 text-sm text-soft transition-colors hover:text-text"
        >
          Add contact
        </button>
      </div>

      <section className="flex flex-col gap-1.5">
        {model.todos.length > 0 && <BandLabel>Todos</BandLabel>}
        {model.todos.map((row, index) =>
          row.critical ? (
            <CriticalRow
              key={row.item.id}
              item={row.item}
              where={row.where}
              fact={row.fact ?? { text: "", tone: "red" }}
            />
          ) : (
            <TodoRow
              key={row.item.id}
              item={row.item}
              where={row.where}
              fact={row.fact}
              promoted={row.item.deadline === null}
              last={index === model.todos.length - 1}
            />
          ),
        )}

        {model.waiting.length > 0 && (
          <span className="label pt-[26px] pb-2 text-muted">Waiting on them</span>
        )}
        {model.waiting.map((row, index) => (
          <WaitingRow
            key={row.item.id}
            item={row.item}
            where={row.where}
            fact={row.fact}
            last={index === model.waiting.length - 1}
          />
        ))}

        {model.ideas.length > 0 && (
          <span className="label pt-[26px] pb-2 text-muted">Ideas</span>
        )}
        {model.ideas.map((row, index) => (
          <IdeaRow
            key={row.item.id}
            item={row.item}
            where={row.where}
            wasInProgress={row.item.startedOn !== null}
            last={index === model.ideas.length - 1}
          />
        ))}

        {model.todos.length + model.waiting.length + model.ideas.length === 0 && (
          <span className="text-[15px] leading-relaxed text-sleeping">
            Nothing open with them. ⌘⇧L when there is.
          </span>
        )}

        {model.archiveLine && (
          <span className="fact pt-3.5 text-[11px] leading-[1.7] text-faint">
            {model.archiveLine}
          </span>
        )}
      </section>

      {addingContact && (
        <NewContactSheet
          clientId={clientId}
          onClose={() => setAddingContact(false)}
        />
      )}
    </div>
  );
}

/** Name, and one line saying which project and what they do. */
function NewContactSheet({
  clientId,
  onClose,
}: {
  clientId: number;
  onClose: () => void;
}) {
  const snapshot = useSnapshot();
  const { act } = useStore();
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const projects = projectsOf(snapshot, clientId);
  const [projectId, setProjectId] = useState<number | null>(null);

  const save = () => {
    if (!name.trim()) return;
    void act((db, c) =>
      contactRepo.create(db, c, {
        clientId,
        projectId,
        name,
        role: detail.trim() || undefined,
      }),
    ).then(onClose);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[22vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[520px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onClose();
        }}
      >
        <span className="label text-faint">New contact</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-3 text-[17px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
        />
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="What they do — “lead”, “legal” (optional)"
          className="w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-2.5 text-[15px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
        />
        {projects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() =>
                  setProjectId(projectId === project.id ? null : project.id)
                }
                className={`rounded-md border px-[11px] py-1.5 text-[13px] transition-colors ${
                  projectId === project.id
                    ? "border-[#2f3532] bg-[#212624] text-text"
                    : "border-outline text-sleeping hover:text-text"
                }`}
              >
                {project.name}
              </button>
            ))}
            <span className="fact text-[11px] text-faint">their project, if only one</span>
          </div>
        )}
        <div className="flex items-center gap-4 pt-1">
          <button
            type="button"
            onClick={save}
            className="rounded-lg bg-green px-4 py-2 text-sm text-ink transition-colors hover:bg-green-hover"
          >
            Add contact
          </button>
          <span className="fact text-[11px] text-faint">⏎ add · esc dismiss</span>
        </div>
      </div>
    </div>
  );
}
