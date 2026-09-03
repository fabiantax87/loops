import type { SqlDriver } from "../db/driver";
import type { Clock } from "../lib/clock";
import { type Day, addDays, dayStart, today } from "../lib/time";
import type { ItemKind, ItemOutcome } from "../domain/types";

/**
 * A believable spread of work: one deadline missed, two landing today, someone
 * to chase, waiting-ons still inside their window, ideas of every age, and a
 * few weeks of archive. Times are relative to the clock so the demo never
 * goes stale.
 */

interface SeedItem {
  client: string;
  project?: string;
  contact?: string;
  kind: ItemKind;
  title: string;
  /** All days are offsets from today: -3 is three days ago. */
  deadline?: number;
  ideaSince?: number;
  startedOn?: number;
  sentOn?: number;
  checkinOn?: number;
  lastChasedOn?: number;
  chases?: number;
  /** Present means archived, closed that many days ago. */
  closed?: { outcome: ItemOutcome; daysAgo: number };
  createdDaysAgo?: number;
}

const CLIENTS: {
  name: string;
  projects: string[];
  contacts: { name: string; project?: string; role?: string }[];
}[] = [
  {
    name: "Eurotransplant",
    projects: ["Eurotransplant Corporate", "Eurotransplant ETRL"],
    contacts: [
      { name: "Sanne de Vries", project: "Eurotransplant ETRL", role: "lead" },
      { name: "Joost Bakker", project: "Eurotransplant Corporate" },
      { name: "Wende Prins", role: "legal" },
    ],
  },
  {
    name: "Klokgroep",
    projects: ["Klokgroep Projects", "Klokgroep Frontend"],
    contacts: [
      { name: "Bram Hendriks", project: "Klokgroep Frontend", role: "dev" },
      { name: "Marieke Jansen", project: "Klokgroep Projects", role: "pm" },
      { name: "John Verhoeven", project: "Klokgroep Projects" },
    ],
  },
  {
    name: "Meridian Health",
    projects: ["Portal rebuild"],
    contacts: [{ name: "Marco Ricci", project: "Portal rebuild", role: "lead" }],
  },
  {
    name: "Studio Ravel",
    projects: ["Ravel Rebrand"],
    contacts: [{ name: "John Aalders", project: "Ravel Rebrand" }],
  },
  {
    name: "Northlight",
    projects: [],
    contacts: [{ name: "Ida Sørensen" }],
  },
];

const ITEMS: SeedItem[] = [
  // One deadline went past.
  {
    client: "Eurotransplant",
    project: "Eurotransplant ETRL",
    contact: "Sanne de Vries",
    kind: "todo",
    title: "Send the ETRL data-sharing agreement to Sanne",
    deadline: -3,
    createdDaysAgo: 9,
  },
  // Two more land today.
  {
    client: "Eurotransplant",
    project: "Eurotransplant Corporate",
    kind: "todo",
    title: "Ship the corporate site redirect map",
    deadline: 0,
    createdDaysAgo: 6,
  },
  {
    client: "Klokgroep",
    project: "Klokgroep Frontend",
    contact: "Bram Hendriks",
    kind: "todo",
    title: "Review Bram's component PR before standup",
    deadline: 0,
    createdDaysAgo: 2,
  },
  // Still in the future.
  {
    client: "Eurotransplant",
    project: "Eurotransplant ETRL",
    kind: "todo",
    title: "Draft the ETRL migration cut-over plan",
    deadline: 9,
    createdDaysAgo: 4,
  },
  {
    client: "Meridian Health",
    project: "Portal rebuild",
    kind: "todo",
    title: "Prepare the Q4 estimate for the portal",
    deadline: 5,
    createdDaysAgo: 3,
  },
  // Someone to chase.
  {
    client: "Eurotransplant",
    project: "Eurotransplant ETRL",
    contact: "Sanne de Vries",
    kind: "waiting",
    title: "Sanne on the staging approval",
    sentOn: -8,
    checkinOn: -1,
    lastChasedOn: -5,
    chases: 1,
    createdDaysAgo: 8,
  },
  {
    client: "Klokgroep",
    project: "Klokgroep Projects",
    kind: "waiting",
    title: "Klokgroep legal on the processing addendum",
    sentOn: -12,
    checkinOn: 0,
    lastChasedOn: -4,
    chases: 2,
    createdDaysAgo: 12,
  },
  // Waiting, still inside the window.
  {
    client: "Eurotransplant",
    contact: "Wende Prins",
    kind: "waiting",
    title: "Wende on the subprocessor list",
    sentOn: -2,
    checkinOn: 12,
    createdDaysAgo: 2,
  },
  {
    client: "Meridian Health",
    project: "Portal rebuild",
    contact: "Marco Ricci",
    kind: "waiting",
    title: "Marco on the content freeze date",
    sentOn: -1,
    checkinOn: 6,
    createdDaysAgo: 1,
  },
  {
    client: "Northlight",
    contact: "Ida Sørensen",
    kind: "waiting",
    title: "Ida on the retainer renewal",
    sentOn: -3,
    createdDaysAgo: 3,
  },
  // Ideas, of every age. The Klokgroep one was once picked up and put down.
  {
    client: "Klokgroep",
    project: "Klokgroep Frontend",
    kind: "idea",
    title: "Retire the old icon set from the Klokgroep repo",
    ideaSince: -81,
    startedOn: -6,
    createdDaysAgo: 81,
  },
  {
    client: "Eurotransplant",
    kind: "idea",
    title: "Improve how Eurotransplant hears from me — right now only when something breaks",
    ideaSince: -63,
    createdDaysAgo: 63,
  },
  {
    client: "Studio Ravel",
    project: "Ravel Rebrand",
    kind: "idea",
    title: "Ask Studio Ravel how the handover landed",
    ideaSince: -44,
    createdDaysAgo: 44,
  },
  {
    client: "Meridian Health",
    project: "Portal rebuild",
    kind: "idea",
    title: "Write up the deploy runbook for the portal",
    ideaSince: -30,
    createdDaysAgo: 30,
  },
  {
    client: "Eurotransplant",
    contact: "Joost Bakker",
    kind: "idea",
    title: "Suggest a quarterly architecture review with Joost",
    ideaSince: -15,
    createdDaysAgo: 15,
  },
  {
    client: "Northlight",
    kind: "idea",
    title: "Pitch Northlight the monitoring add-on",
    ideaSince: -7,
    createdDaysAgo: 7,
  },
  // The archive: finished, answered, decided against.
  {
    client: "Eurotransplant",
    project: "Eurotransplant Corporate",
    kind: "todo",
    title: "Fix the cookie banner on the corporate site",
    deadline: -2,
    closed: { outcome: "done", daysAgo: 2 },
    createdDaysAgo: 8,
  },
  {
    client: "Klokgroep",
    project: "Klokgroep Projects",
    kind: "todo",
    title: "Migration dry-run signed off",
    deadline: -13,
    closed: { outcome: "done", daysAgo: 13 },
    createdDaysAgo: 20,
  },
  {
    client: "Northlight",
    kind: "todo",
    title: "Send the August invoice",
    deadline: -9,
    closed: { outcome: "done", daysAgo: 9 },
    createdDaysAgo: 14,
  },
  {
    client: "Studio Ravel",
    project: "Ravel Rebrand",
    contact: "John Aalders",
    kind: "waiting",
    title: "Ravel on the handover checklist",
    sentOn: -30,
    checkinOn: -23,
    closed: { outcome: "replied", daysAgo: 22 },
    createdDaysAgo: 30,
  },
  {
    client: "Klokgroep",
    project: "Klokgroep Frontend",
    contact: "Bram Hendriks",
    kind: "idea",
    title: "Try the token pipeline Bram keeps mentioning",
    ideaSince: -40,
    closed: { outcome: "dropped", daysAgo: 16 },
    createdDaysAgo: 40,
  },
];

export async function seed(db: SqlDriver, clock: Clock): Promise<void> {
  const now = today(clock);
  const day = (offset: number | undefined): Day | null =>
    offset === undefined ? null : addDays(now, offset);
  // A believable mid-morning instant on a given day.
  const at = (daysAgo: number): string =>
    new Date(dayStart(addDays(now, -daysAgo)).getTime() + 10 * 3600_000).toISOString();

  const clientIds = new Map<string, number>();
  const projectIds = new Map<string, number>();
  const contactIds = new Map<string, number>();

  for (const spec of CLIENTS) {
    const { lastInsertId: clientId } = await db.execute(
      "INSERT INTO clients (name, created_at) VALUES (?, ?)",
      [spec.name, at(90)],
    );
    clientIds.set(spec.name, clientId);
    for (const name of spec.projects) {
      const { lastInsertId } = await db.execute(
        "INSERT INTO projects (client_id, name, created_at) VALUES (?, ?, ?)",
        [clientId, name, at(90)],
      );
      projectIds.set(name, lastInsertId);
    }
    for (const person of spec.contacts) {
      const { lastInsertId } = await db.execute(
        "INSERT INTO contacts (client_id, project_id, name, role, created_at) VALUES (?, ?, ?, ?, ?)",
        [
          clientId,
          person.project ? (projectIds.get(person.project) ?? null) : null,
          person.name,
          person.role ?? null,
          at(90),
        ],
      );
      contactIds.set(`${spec.name}:${person.name}`, lastInsertId);
    }
  }

  for (const item of ITEMS) {
    const created = at(item.createdDaysAgo ?? 7);
    await db.execute(
      `INSERT INTO items
         (client_id, project_id, contact_id, kind, title, deadline, idea_since,
          started_on, sent_on, checkin_on, last_chased_on, chase_count,
          status, outcome, created_at, updated_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientIds.get(item.client),
        item.project ? (projectIds.get(item.project) ?? null) : null,
        item.contact ? (contactIds.get(`${item.client}:${item.contact}`) ?? null) : null,
        item.kind,
        item.title,
        day(item.deadline),
        day(item.ideaSince),
        day(item.startedOn),
        day(item.sentOn),
        day(item.checkinOn),
        day(item.lastChasedOn),
        item.chases ?? 0,
        item.closed ? "closed" : "open",
        item.closed?.outcome ?? null,
        created,
        item.closed ? at(item.closed.daysAgo) : created,
        item.closed ? at(item.closed.daysAgo) : null,
      ],
    );
  }
}
