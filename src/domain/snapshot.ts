import type { Day } from "../lib/time";
import type { Client, Contact, Item, Project, ProjectRepo, Pull } from "./types";

/**
 * The ideas surfaced on a quiet day are chosen once, in the morning, and stay
 * chosen — picking one up doesn't hide the others. This is that choice,
 * persisted in `app_meta` so a restart doesn't reshuffle the day.
 */
export interface IdeasOfDay {
  day: Day;
  ids: number[];
}

/**
 * Everything in the database, in memory.
 *
 * One person's client work does not run to thousands of rows, so Loops loads
 * the lot and derives every screen from it with plain functions. That is what
 * keeps the interesting logic — what's critical, who to chase, which ideas
 * surface today — testable without a database or a browser.
 */
export interface Snapshot {
  clients: Client[];
  projects: Project[];
  contacts: Contact[];
  items: Item[];
  /** Which repositories belong to which project. */
  repos: ProjectRepo[];
  /** Open pull requests that are yours to move — the GitHub cache. */
  pulls: Pull[];
  ideasOfDay: IdeasOfDay | null;
}

export const emptySnapshot: Snapshot = {
  clients: [],
  projects: [],
  contacts: [],
  items: [],
  repos: [],
  pulls: [],
  ideasOfDay: null,
};

export function clientById(snapshot: Snapshot, id: number): Client | undefined {
  return snapshot.clients.find((c) => c.id === id);
}

export function projectById(snapshot: Snapshot, id: number | null): Project | undefined {
  return id === null ? undefined : snapshot.projects.find((p) => p.id === id);
}

export function contactById(snapshot: Snapshot, id: number | null): Contact | undefined {
  return id === null ? undefined : snapshot.contacts.find((c) => c.id === id);
}

export function projectsOf(snapshot: Snapshot, clientId: number): Project[] {
  return snapshot.projects.filter((p) => p.clientId === clientId);
}

export function contactsOf(snapshot: Snapshot, clientId: number): Contact[] {
  return snapshot.contacts.filter((c) => c.clientId === clientId);
}

export function reposOf(snapshot: Snapshot, projectId: number): string[] {
  return snapshot.repos.filter((r) => r.projectId === projectId).map((r) => r.repo);
}

/** The project a repository answers to, if any has claimed it. */
export function projectOfRepo(snapshot: Snapshot, repo: string): Project | undefined {
  const wanted = repo.toLowerCase();
  const link = snapshot.repos.find((r) => r.repo.toLowerCase() === wanted);
  return link ? projectById(snapshot, link.projectId) : undefined;
}

export function openItems(snapshot: Snapshot): Item[] {
  return snapshot.items.filter((i) => i.status === "open");
}

/** "Eurotransplant · ETRL · Sanne de Vries" — the context line every row carries. */
export function attribution(
  snapshot: Snapshot,
  item: Item,
  options: { client?: boolean } = {},
): string {
  const parts: string[] = [];
  if (options.client !== false) {
    parts.push(clientById(snapshot, item.clientId)?.name ?? "—");
  }
  const project = projectById(snapshot, item.projectId);
  if (project) parts.push(project.name);
  const contact = contactById(snapshot, item.contactId);
  if (contact) parts.push(contact.name);
  return parts.join(" · ");
}
