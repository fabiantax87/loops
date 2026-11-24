import { useState } from "react";
import {
  clients as clientRepo,
  contacts as contactRepo,
  githubPulls,
  projectRepos,
  projects as projectRepo,
} from "../db/repo";
import { buildClientPage, shortProjectName } from "../domain/clientPage";
import { parseRepos } from "../domain/repos";
import { clientById, projectById, projectOfRepo, projectsOf, reposOf } from "../domain/snapshot";
import type { Client, Contact, ItemKind, Project } from "../domain/types";
import type { Tone } from "../domain/today";
import { useClock } from "../lib/ClockContext";
import { useSnapshot, useStore } from "../state/store";
import { openExternal } from "./notes";
import { BandLabel, Fact, RowMenu } from "./primitives";
import { CriticalRow, IdeaRow, TodoRow, WaitingRow } from "./rows";

/** Loose on purpose: something@somewhere.tld, and nothing stricter. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the lower half of the page is showing. */
type ClientTab = ItemKind | "pulls";

/** A tab's number takes the colour of the worst thing behind it. */
const COUNT: Record<Tone, string> = {
  red: "text-red",
  amber: "text-amber",
  green: "text-green",
  muted: "text-muted",
  grey: "text-soft",
};

const EMPTY: Record<ClientTab, string> = {
  todo: "Nothing you owe them. ⌘⇧L when there is.",
  waiting: "Nobody here owes you an answer.",
  idea: "No loose thoughts for this client.",
  pulls: "No open pull requests are waiting on you here.",
};

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
  const [chosenTab, setChosenTab] = useState<ClientTab | null>(null);

  const pullCount = model.pulls.reduce((n, group) => n + group.rows.length, 0);
  const projectIds = new Set(model.projects.map((p) => p.project.id));
  const tabs: { id: ClientTab; label: string; count: number; tone: Tone }[] = [
    {
      id: "todo",
      label: "Todos",
      count: model.todos.length,
      tone: model.todos.some((r) => r.critical) ? "red" : "grey",
    },
    {
      id: "waiting",
      label: "Waiting on them",
      count: model.waiting.length,
      tone: model.waiting.some((r) => r.chaseDue) ? "amber" : "grey",
    },
    { id: "idea", label: "Ideas", count: model.ideas.length, tone: "grey" },
  ];
  // Pull requests only get a tab once this client has a repository to watch.
  if (pullCount > 0 || snapshot.repos.some((r) => projectIds.has(r.projectId))) {
    tabs.push({
      id: "pulls",
      label: "Pull requests",
      count: pullCount,
      tone: model.pulls.some((g) => g.rows.some((r) => r.fact.tone === "red")) ? "red" : "grey",
    });
  }
  // Until a tab is picked, open on the first one with something in it. The
  // pick carries across clients; one that has no such tab falls back the same way.
  const tab: ClientTab =
    chosenTab && tabs.some((t) => t.id === chosenTab)
      ? chosenTab
      : (tabs.find((t) => t.count > 0)?.id ?? "todo");

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

      <section className="flex flex-col">
        <div role="tablist" className="flex items-end gap-[26px] border-b border-hairline">
          {tabs.map(({ id, label, count, tone }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === tab}
              onClick={() => setChosenTab(id)}
              className={`-mb-px flex items-baseline gap-2 border-b pb-3.5 text-sm transition-colors ${
                id === tab
                  ? "border-text text-text"
                  : "border-transparent text-muted hover:text-text"
              }`}
            >
              {label}
              <span
                className={`fact flex h-[19px] min-w-[19px] items-center justify-center self-center rounded-full bg-[#212624] px-[5px] text-[10.5px] leading-none ${COUNT[tone]}`}
              >
                {count}
              </span>
            </button>
          ))}
          {/* The one thing to add is whatever the open tab holds. */}
          {tab !== "pulls" && (
            <button
              type="button"
              onClick={() => onCapture(tab)}
              className="ml-auto pb-3.5 text-sm text-soft transition-colors hover:text-text"
            >
              {tab === "todo" ? "New todo" : tab === "waiting" ? "New waiting-on" : "New idea"}
            </button>
          )}
        </div>

        <div role="tabpanel" className="flex flex-col gap-1.5 pt-5">
          {tab === "todo" &&
            model.todos.map((row, index) =>
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

          {tab === "waiting" &&
            model.waiting.map((row, index) => (
              <WaitingRow
                key={row.item.id}
                item={row.item}
                where={row.where}
                fact={row.fact}
                last={index === model.waiting.length - 1}
              />
            ))}

          {tab === "idea" &&
            model.ideas.map((row, index) => (
              <IdeaRow
                key={row.item.id}
                item={row.item}
                where={row.where}
                wasInProgress={row.item.startedOn !== null}
                last={index === model.ideas.length - 1}
              />
            ))}

          {tab === "pulls" &&
            model.pulls.map((group, groupIndex) => (
              <div key={group.project.id} className="flex flex-col">
                {/* One project needs no naming twice; several each get a line. */}
                {(model.pulls.length > 1 || model.projects.length > 1) && (
                  <span
                    className={`fact pb-2 text-[11px] text-faint ${groupIndex > 0 ? "pt-5" : ""}`}
                  >
                    {group.name}
                  </span>
                )}
                {group.rows.map(({ pull, where, fact }, index) => (
                  <button
                    key={pull.key}
                    type="button"
                    title="Open on GitHub"
                    onClick={() => openExternal(pull.url)}
                    className={`group flex items-center gap-4 border-t border-hairline py-[13px] text-left ${
                      index === group.rows.length - 1 ? "border-b" : ""
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[15px] leading-[1.4] text-text decoration-[#3a423e] underline-offset-[3px] group-hover:underline">
                        {pull.title}
                      </span>
                      <span className="fact truncate text-[11px] text-faint">{where}</span>
                    </div>
                    <Fact tone={fact.tone}>{fact.text}</Fact>
                  </button>
                ))}
              </div>
            ))}

          {tabs.find((t) => t.id === tab)?.count === 0 && (
            <span className="text-[15px] leading-relaxed text-sleeping">{EMPTY[tab]}</span>
          )}
        </div>

        {model.archiveLine && (
          <span className="fact pt-5 text-[11px] leading-[1.7] text-faint">
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
  const [repoText, setRepoText] = useState(
    project ? reposOf(snapshot, project.id).join(", ") : "",
  );
  const trimmed = name.trim();
  const taken = projectsOf(snapshot, clientId).some(
    (p) => p.id !== project?.id && p.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const { repos, bad } = parseRepos(repoText);
  // A repository answers to one project, so naming another project's moves it.
  const moving = repos
    .map((repo) => ({ repo, from: projectOfRepo(snapshot, repo) }))
    .filter(({ from }) => from && from.id !== project?.id);
  // Repositories with open pull requests that no project has claimed yet —
  // most likely what belongs here, so they are one click away.
  const suggestions = [
    ...new Set(
      snapshot.pulls.filter((p) => !projectOfRepo(snapshot, p.repo)).map((p) => p.repo),
    ),
  ].filter((repo) => !repos.some((r) => r.toLowerCase() === repo.toLowerCase()));
  const usable = trimmed !== "" && !taken && bad.length === 0;

  const save = () => {
    if (!usable) return;
    void act(async (db, c) => {
      const id = project
        ? (await projectRepo.rename(db, project.id, trimmed), project.id)
        : await projectRepo.create(db, c, clientId, trimmed);
      await projectRepos.setFor(db, id, repos);
      // Pull requests already cached for a newly linked repository get
      // their todos now, rather than at the next sync.
      await githubPulls.ensureTodos(db, c);
    }).then(onClose);
  };

  const hint = taken
    ? "this client already has a project by that name"
    : bad.length > 0
      ? `“${bad[0]}” doesn't read as owner/name`
      : moving.length > 0
        ? `${moving[0].repo} moves here from ${moving[0].from?.name}`
        : `⏎ ${project ? "save" : "add"} · esc dismiss`;

  return (
    <SmallSheet title={project ? "Edit project" : "New project"} onSave={save} onClose={onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-3 text-[17px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
      />
      <input
        value={repoText}
        onChange={(e) => setRepoText(e.target.value)}
        placeholder="GitHub repositories — owner/name, comma-separated (optional)"
        className="w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-2.5 font-mono text-[13px] text-text outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-faint focus:border-outline-hover"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {suggestions.map((repo) => (
            <button
              key={repo}
              type="button"
              onClick={() => setRepoText([...repos, ...bad, repo].join(", "))}
              className="rounded-md border border-outline px-[11px] py-1.5 font-mono text-[12px] text-sleeping transition-colors hover:text-text"
            >
              + {repo}
            </button>
          ))}
          <span className="fact text-[11px] text-faint">open pull requests, no project yet</span>
        </div>
      )}
      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={!usable}
          className="rounded-lg bg-green px-4 py-2 text-sm text-ink transition-colors hover:bg-green-hover disabled:opacity-40"
        >
          {project ? "Save" : "Add project"}
        </button>
        <span
          className={`fact text-[11px] ${
            taken || bad.length > 0 || moving.length > 0 ? "text-amber" : "text-faint"
          }`}
        >
          {hint}
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
