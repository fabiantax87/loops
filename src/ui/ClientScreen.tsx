import { useState } from "react";
import {
  clients as clientRepo,
  contacts as contactRepo,
  projects as projectRepo,
} from "../db/repo";
import { buildClientPage, shortProjectName } from "../domain/clientPage";
import { clientById, projectById, projectsOf } from "../domain/snapshot";
import type { Client, Contact, ItemKind, Project } from "../domain/types";
import { useClock } from "../lib/ClockContext";
import { useSnapshot, useStore } from "../state/store";
import { openExternal } from "./notes";
import { BandLabel, RowMenu } from "./primitives";
import { CriticalRow, IdeaRow, TodoRow, WaitingRow } from "./rows";

/** Loose on purpose: something@somewhere.tld, and nothing stricter. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DOT: Record<string, string> = {
  red: "bg-red",
  amber: "bg-amber",
  green: "bg-green",
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
  onArchived,
}: {
  clientId: number;
  /** Opens the capture bar pre-routed to this client, with a type preselected. */
  onCapture: (kind: ItemKind) => void;
  /** The page has nothing left to show once its client is archived. */
  onArchived: () => void;
}) {
  const snapshot = useSnapshot();
  const clock = useClock();
  const { act } = useStore();
  const model = buildClientPage(snapshot, clock, clientId);
  const client = clientById(snapshot, clientId);
  const [addingContact, setAddingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [addingProject, setAddingProject] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingClient, setEditingClient] = useState(false);

  return (
    <div className="flex w-[720px] flex-col gap-[52px] pt-14 pb-[72px]">
      <header className="flex items-start gap-4">
        <div className="flex flex-1 flex-col gap-3">
          <h1 className="m-0 text-[30px] font-semibold tracking-[-.015em] text-text">
            {model.name}
          </h1>
          <p className="m-0 max-w-[600px] text-[17px] leading-relaxed text-pretty text-muted">
            {model.summary}
          </p>
        </div>
        {client && (
          <RowMenu
            items={[
              { label: "Edit…", onSelect: () => setEditingClient(true) },
              {
                label: client.leading ? "I'm not leading this" : "I'm leading this",
                onSelect: () =>
                  act((db) => clientRepo.setLeading(db, client.id, !client.leading)),
              },
              {
                label: "Archive client",
                terminal: true,
                onSelect: () =>
                  void act((db, c) => clientRepo.archive(db, c, client.id)).then(onArchived),
              },
            ]}
          />
        )}
      </header>

      <div className="flex gap-14">
        <div className="flex flex-1 flex-col gap-3.5">
          <AddableLabel label="Projects" add="Add project" onAdd={() => setAddingProject(true)} />
          <div className="flex flex-col gap-3">
            {model.projects.length === 0 && (
              <span className="text-[15px] text-sleeping">No projects yet.</span>
            )}
            {model.projects.map(({ project, open, tone }) => (
              <div key={project.id} className="group flex items-center gap-2.5">
                <span className={`h-1.5 w-1.5 flex-none rounded-full ${DOT[tone]}`} />
                <span
                  className={`flex-1 truncate text-base ${tone === "grey" ? "text-soft" : "text-text"}`}
                >
                  {project.name}
                </span>
                <span className="fact text-[11px] text-faint">
                  {open} open
                </span>
                <button
                  type="button"
                  onClick={() => setEditingProject(project)}
                  className="fact text-[11px] text-transparent transition-colors group-hover:text-faint hover:!text-soft"
                >
                  edit
                </button>
                <button
                  type="button"
                  onClick={() => act((db) => projectRepo.remove(db, project.id))}
                  className="fact text-[11px] text-transparent transition-colors group-hover:text-faint hover:!text-soft"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3.5">
          <AddableLabel label="Contacts" add="Add contact" onAdd={() => setAddingContact(true)} />
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
                  {person.email && (
                    <button
                      type="button"
                      onClick={() => openExternal(`mailto:${person.email}`)}
                      className="fact truncate text-[11px] text-green underline decoration-[#2c5546] underline-offset-2 transition-colors hover:text-green-hover"
                    >
                      {person.email}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingContact(person)}
                    className="fact text-[11px] text-transparent transition-colors group-hover:text-faint hover:!text-soft"
                  >
                    edit
                  </button>
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
        <ContactSheet clientId={clientId} onClose={() => setAddingContact(false)} />
      )}
      {editingContact && (
        <ContactSheet
          clientId={clientId}
          contact={editingContact}
          onClose={() => setEditingContact(null)}
        />
      )}
      {addingProject && (
        <ProjectSheet clientId={clientId} onClose={() => setAddingProject(false)} />
      )}
      {editingProject && (
        <ProjectSheet
          clientId={clientId}
          project={editingProject}
          onClose={() => setEditingProject(null)}
        />
      )}
      {editingClient && client && (
        <ClientSheet client={client} onClose={() => setEditingClient(false)} />
      )}
    </div>
  );
}

/** A band label with the one obvious thing to do next to it: add one. */
function AddableLabel({
  label,
  add,
  onAdd,
}: {
  label: string;
  add: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <BandLabel>{label}</BandLabel>
      <button
        type="button"
        aria-label={add}
        title={add}
        onClick={onAdd}
        className="-mt-2 rounded-md px-1.5 text-base leading-none text-faint transition-colors hover:bg-hover hover:text-text"
      >
        +
      </button>
    </div>
  );
}

/** The overlay every small sheet on this page shares. */
function SmallSheet({
  title,
  onSave,
  onClose,
  children,
}: {
  title: string;
  onSave: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[22vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[520px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onClose();
        }}
      >
        <span className="label text-faint">{title}</span>
        {children}
      </div>
    </div>
  );
}

/**
 * A project's name — new, or corrected. Names are unique per client (the
 * database says so, case-blind), and the sheet says it first rather than
 * letting the save fail without a word.
 */
function ProjectSheet({
  clientId,
  project,
  onClose,
}: {
  clientId: number;
  project?: Project;
  onClose: () => void;
}) {
  const snapshot = useSnapshot();
  const { act } = useStore();
  const [name, setName] = useState(project?.name ?? "");
  const trimmed = name.trim();
  const taken = projectsOf(snapshot, clientId).some(
    (p) => p.id !== project?.id && p.name.toLowerCase() === trimmed.toLowerCase(),
  );

  const save = () => {
    if (!trimmed || taken) return;
    void act((db, c) =>
      project
        ? projectRepo.rename(db, project.id, trimmed)
        : projectRepo.create(db, c, clientId, trimmed),
    ).then(onClose);
  };

  return (
    <SmallSheet title={project ? "Edit project" : "New project"} onSave={save} onClose={onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-3 text-[17px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
      />
      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={!trimmed || taken}
          className="rounded-lg bg-green px-4 py-2 text-sm text-ink transition-colors hover:bg-green-hover disabled:opacity-40"
        >
          {project ? "Save" : "Add project"}
        </button>
        <span className={`fact text-[11px] ${taken ? "text-amber" : "text-faint"}`}>
          {taken
            ? "this client already has a project by that name"
            : `⏎ ${project ? "save" : "add"} · esc dismiss`}
        </span>
      </div>
    </SmallSheet>
  );
}

/**
 * A client's name, corrected. Names are unique across clients (the database
 * says so, case-blind), and the sheet says it first rather than letting the
 * save fail without a word.
 */
function ClientSheet({ client, onClose }: { client: Client; onClose: () => void }) {
  const snapshot = useSnapshot();
  const { act } = useStore();
  const [name, setName] = useState(client.name);
  const trimmed = name.trim();
  const taken = snapshot.clients.some(
    (c) => c.id !== client.id && c.name.toLowerCase() === trimmed.toLowerCase(),
  );

  const save = () => {
    if (!trimmed || taken) return;
    void act((db) => clientRepo.rename(db, client.id, trimmed)).then(onClose);
  };

  return (
    <SmallSheet title="Edit client" onSave={save} onClose={onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Client name"
        className="w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-3 text-[17px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
      />
      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={!trimmed || taken}
          className="rounded-lg bg-green px-4 py-2 text-sm text-ink transition-colors hover:bg-green-hover disabled:opacity-40"
        >
          Save
        </button>
        <span className={`fact text-[11px] ${taken ? "text-amber" : "text-faint"}`}>
          {taken ? "there is already a client by that name" : "⏎ save · esc dismiss"}
        </span>
      </div>
    </SmallSheet>
  );
}

/**
 * Name, and one line saying which project and what they do. With a contact
 * given it edits that one in place — misspellings shouldn't be permanent.
 */
function ContactSheet({
  clientId,
  contact,
  onClose,
}: {
  clientId: number;
  contact?: Contact;
  onClose: () => void;
}) {
  const snapshot = useSnapshot();
  const { act } = useStore();
  const [name, setName] = useState(contact?.name ?? "");
  const [detail, setDetail] = useState(contact?.role ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const projects = projectsOf(snapshot, clientId);
  const [projectId, setProjectId] = useState<number | null>(contact?.projectId ?? null);
  const address = email.trim();
  const emailUsable = address === "" || EMAIL.test(address);
  const usable = name.trim() !== "" && emailUsable;

  const save = () => {
    if (!usable) return;
    void act((db, c) =>
      contact
        ? contactRepo.edit(db, contact.id, {
            name,
            role: detail.trim() || null,
            projectId,
            email: address || null,
          })
        : contactRepo.create(db, c, {
            clientId,
            projectId,
            name,
            role: detail.trim() || undefined,
            email: address || null,
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
        <span className="label text-faint">{contact ? "Edit contact" : "New contact"}</span>
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
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="someone@client.nl (optional)"
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
            disabled={!usable}
            className="rounded-lg bg-green px-4 py-2 text-sm text-ink transition-colors hover:bg-green-hover disabled:opacity-40"
          >
            {contact ? "Save" : "Add contact"}
          </button>
          <span className={`fact text-[11px] ${emailUsable ? "text-faint" : "text-amber"}`}>
            {emailUsable
              ? `⏎ ${contact ? "save" : "add"} · esc dismiss`
              : "that doesn't read as an address"}
          </span>
        </div>
      </div>
    </div>
  );
}
