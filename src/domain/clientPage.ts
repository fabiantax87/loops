import type { Clock } from "../lib/clock";
import { daysBetween, today } from "../lib/time";
import {
  contactById,
  contactsOf,
  projectById,
  projectsOf,
  type Snapshot,
} from "./snapshot";
import { chaseDue, noteDay, type TimeFact, type Tone, niceDay } from "./today";
import type { Contact, Item, Project } from "./types";
import { countOf, sentences, spell, spellCapitalised } from "./words";

export interface ProjectLine {
  project: Project;
  open: number;
  /** Red if anything in it is late, amber if someone there needs chasing. */
  tone: Tone;
}

export interface ClientItemRow {
  item: Item;
  /** Context without the client's own name — the page already says it. */
  where: string;
  fact: TimeFact | null;
  /** A todo past its deadline renders as the critical card. */
  critical: boolean;
  chaseDue: boolean;
}

export interface ClientPageModel {
  name: string;
  /** The paragraph under the name: what is late, who is quiet, what is fine. */
  summary: string;
  projects: ProjectLine[];
  contacts: Contact[];
  todos: ClientItemRow[];
  waiting: ClientItemRow[];
  ideas: ClientItemRow[];
  /** "Nine resolved items this quarter · in the archive" */
  archiveLine: string | null;
}

export function buildClientPage(
  snapshot: Snapshot,
  clock: Clock,
  clientId: number,
): ClientPageModel {
  const now = today(clock);
  const client = snapshot.clients.find((c) => c.id === clientId);
  const open = snapshot.items.filter(
    (i) => i.clientId === clientId && i.status === "open",
  );
  const chases = new Set(chaseDue(snapshot, clock).map((r) => r.item.id));

  const late = open.filter(
    (i) => i.kind === "todo" && i.deadline !== null && i.deadline < now,
  );

  const projects: ProjectLine[] = projectsOf(snapshot, clientId).map((project) => {
    const inProject = open.filter((i) => i.projectId === project.id);
    const tone: Tone = inProject.some(
      (i) => i.kind === "todo" && i.deadline !== null && i.deadline < now,
    )
      ? "red"
      : inProject.some((i) => chases.has(i.id))
        ? "amber"
        : "grey";
    return { project, open: inProject.length, tone };
  });

  const row = (item: Item): ClientItemRow => {
    const critical = item.kind === "todo" && item.deadline !== null && item.deadline < now;
    const due = chases.has(item.id);
    let fact: TimeFact | null = null;
    if (item.kind === "todo") {
      fact =
        item.deadline === null
          ? { text: "picked up", tone: "grey" }
          : critical
            ? { text: `${countOf(daysBetween(item.deadline, now), "day")} past`, tone: "red" }
            : item.deadline === now
              ? { text: "today", tone: "grey" }
              : { text: niceDay(item.deadline), tone: "grey" };
    } else if (item.kind === "waiting") {
      fact = due
        ? { text: "check-in passed", tone: "amber" }
        : item.checkinOn
          ? {
              text:
                item.checkinOn === now
                  ? `check in today${item.checkinTime ? ` · ${item.checkinTime}` : ""}`
                  : `check in ${niceDay(item.checkinOn)}`,
              tone: "grey",
            }
          : { text: "no check-in", tone: "grey" };
    } else if (item.ideaSince) {
      fact = { text: `noted ${noteDay(item.ideaSince)}`, tone: "grey" };
    }
    const notes: string[] = [];
    if (item.kind === "waiting") {
      const asked = item.sentOn ? `asked ${noteDay(item.sentOn)}` : null;
      if (asked) notes.push(asked);
      if (item.chaseCount === 1) notes.push("chased once");
      if (item.chaseCount >= 2) notes.push(`chased ${spell(item.chaseCount)} times`);
    }
    // The page already says whose these are, so the project sheds the client's
    // name too: "Eurotransplant ETRL" reads as "ETRL" here.
    const project = projectById(snapshot, item.projectId);
    return {
      item,
      where: [
        project ? shortProjectName(project, snapshot) : null,
        contactById(snapshot, item.contactId)?.name,
        ...notes,
      ]
        .filter(Boolean)
        .join(" · "),
      fact,
      critical,
      chaseDue: due,
    };
  };

  const todos = open
    .filter((i) => i.kind === "todo")
    .map(row)
    .sort(
      (a, b) =>
        Number(b.critical) - Number(a.critical) ||
        (a.item.deadline ?? "").localeCompare(b.item.deadline ?? ""),
    );
  const waiting = open
    .filter((i) => i.kind === "waiting")
    .map(row)
    .sort((a, b) => Number(b.chaseDue) - Number(a.chaseDue));
  const ideas = open
    .filter((i) => i.kind === "idea")
    .map(row)
    .sort((a, b) =>
      (a.item.ideaSince ?? a.item.createdAt).localeCompare(
        b.item.ideaSince ?? b.item.createdAt,
      ),
    );

  const closed = snapshot.items.filter(
    (i) => i.clientId === clientId && i.status === "closed",
  ).length;

  return {
    name: client?.name ?? "—",
    summary: summarise(snapshot, clock, clientId, { late, open, chases }),
    projects,
    contacts: contactsOf(snapshot, clientId),
    todos,
    waiting,
    ideas,
    archiveLine:
      closed > 0
        ? `${spellCapitalised(closed)} resolved ${closed === 1 ? "item" : "items"} · in the archive`
        : null,
  };
}

/**
 * The paragraph under the client's name. It reads worst-first and ends on
 * whatever is fine, so a healthy client is one short reassuring sentence.
 */
function summarise(
  snapshot: Snapshot,
  clock: Clock,
  clientId: number,
  facts: { late: Item[]; open: Item[]; chases: Set<number> },
): string {
  const now = today(clock);
  const parts: string[] = [];

  if (facts.late.length > 0) {
    const projects = new Set(
      facts.late.map((i) => snapshot.projects.find((p) => p.id === i.projectId)?.name),
    );
    const where =
      projects.size === 1 && [...projects][0] ? ` on ${[...projects][0]}` : "";
    parts.push(
      facts.late.length === 1
        ? `One deadline slipped past${where}.`
        : `${spellCapitalised(facts.late.length)} deadlines slipped past${where}.`,
    );
  }

  const owed = facts.open.filter((i) => i.kind === "waiting" && facts.chases.has(i.id));
  for (const item of owed.slice(0, 2)) {
    const who = contactById(snapshot, item.contactId)?.name.split(" ")[0] ?? "They";
    const since = item.lastChasedOn ?? item.sentOn;
    const days = since ? daysBetween(since, now) : null;
    parts.push(
      days !== null && days > 0
        ? `${who} ${who === "They" ? "have" : "has"} had your question ${
            days >= 7 ? (days >= 14 ? `${spell(Math.round(days / 7))} weeks` : "a week") : countOf(days, "day")
          }.`
        : `${who} owes you an answer.`,
    );
  }

  if (parts.length === 0) {
    const n = facts.open.length;
    return n === 0
      ? "Nothing open. All quiet here."
      : `Nothing late, nobody to chase. ${spellCapitalised(n)} open ${
          n === 1 ? "item" : "items"
        }, all on track.`;
  }

  const fineProjects = projectsOf(snapshot, clientId).filter((p) => {
    const inProject = facts.open.filter((i) => i.projectId === p.id);
    return (
      inProject.length > 0 &&
      !inProject.some(
        (i) =>
          (i.kind === "todo" && i.deadline !== null && i.deadline < now) ||
          facts.chases.has(i.id),
      )
    );
  });
  if (fineProjects.length === 1) {
    parts.push(`${shortProjectName(fineProjects[0], snapshot)} is quiet and on track.`);
  } else if (fineProjects.length > 1) {
    parts.push("The rest is quiet and on track.");
  }

  return sentences(...parts);
}

/** "Eurotransplant Corporate" reads as "Corporate" on Eurotransplant's own page. */
function shortProjectName(project: Project, snapshot: Snapshot): string {
  const client = snapshot.clients.find((c) => c.id === project.clientId);
  if (!client) return project.name;
  const stripped = project.name.replace(new RegExp(`^${client.name}\\s+`, "i"), "");
  return stripped || project.name;
}

export { shortProjectName };
