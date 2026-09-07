import type { SqlDriver } from "./driver";
import type { Clock } from "../lib/clock";
import { type Day, addDays, daysBetween, nowInstant, toDay, today } from "../lib/time";
import type { IdeasOfDay, Snapshot } from "../domain/snapshot";
import type { Client, Contact, Item, ItemKind, Project, ProjectStatus } from "../domain/types";

/* Rows come back snake_case; the app speaks camelCase. The mapping is dull and
   lives here so nothing else has to know about it. */

/** A row as SQLite hands it back, before the mapping below tidies it up. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function client(r: Row): Client {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
  };
}

function project(r: Row): Project {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    status: r.status,
    createdAt: r.created_at,
  };
}

function contact(r: Row): Contact {
  return {
    id: r.id,
    clientId: r.client_id,
    projectId: r.project_id,
    name: r.name,
    role: r.role,
    createdAt: r.created_at,
  };
}

function item(r: Row): Item {
  return {
    id: r.id,
    clientId: r.client_id,
    projectId: r.project_id,
    contactId: r.contact_id,
    kind: r.kind,
    title: r.title,
    deadline: r.deadline,
    deadlineTime: r.deadline_time,
    ideaSince: r.idea_since,
    startedOn: r.started_on,
    sentOn: r.sent_on,
    checkinOn: r.checkin_on,
    checkinTime: r.checkin_time,
    lastChasedOn: r.last_chased_on,
    chaseCount: r.chase_count,
    status: r.status,
    outcome: r.outcome,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at,
  };
}

const IDEAS_OF_DAY_KEY = "ideas_of_day";

export async function loadSnapshot(db: SqlDriver): Promise<Snapshot> {
  const [clients, projects, contacts, items, ideasRaw] = await Promise.all([
    db.select<Row>("SELECT * FROM clients ORDER BY name COLLATE NOCASE"),
    db.select<Row>("SELECT * FROM projects ORDER BY name COLLATE NOCASE"),
    db.select<Row>("SELECT * FROM contacts ORDER BY name COLLATE NOCASE"),
    db.select<Row>("SELECT * FROM items ORDER BY created_at, id"),
    meta.get(db, IDEAS_OF_DAY_KEY),
  ]);
  return {
    clients: clients.map(client),
    projects: projects.map(project),
    contacts: contacts.map(contact),
    items: items.map(item),
    ideasOfDay: ideasRaw ? (JSON.parse(ideasRaw) as IdeasOfDay) : null,
  };
}

async function readItem(db: SqlDriver, id: number): Promise<Item> {
  const rows = await db.select<Row>("SELECT * FROM items WHERE id = ?", [id]);
  if (rows.length === 0) throw new Error(`no item ${id}`);
  return item(rows[0]);
}

export const clients = {
  async create(db: SqlDriver, clock: Clock, name: string, notes?: string): Promise<number> {
    const at = nowInstant(clock);
    const { lastInsertId } = await db.execute(
      "INSERT INTO clients (name, notes, created_at) VALUES (?, ?, ?)",
      [name.trim(), notes ?? null, at],
    );
    return lastInsertId;
  },

  /**
   * The new-client sheet saves a name, its projects, and its contacts in one
   * go. A contact's project is named, not id'd — the sheet only knows names.
   */
  async createFull(
    db: SqlDriver,
    clock: Clock,
    input: {
      name: string;
      projects: string[];
      contacts: { name: string; role?: string | null; projectName?: string | null }[];
    },
  ): Promise<number> {
    const clientId = await clients.create(db, clock, input.name);
    const byName = new Map<string, number>();
    for (const name of input.projects) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const id = await projects.create(db, clock, clientId, trimmed);
      byName.set(trimmed.toLowerCase(), id);
    }
    for (const person of input.contacts) {
      if (!person.name.trim()) continue;
      await contacts.create(db, clock, {
        clientId,
        projectId: person.projectName
          ? (byName.get(person.projectName.trim().toLowerCase()) ?? null)
          : null,
        name: person.name,
        role: person.role ?? undefined,
      });
    }
    return clientId;
  },

  async rename(db: SqlDriver, id: number, name: string): Promise<void> {
    await db.execute("UPDATE clients SET name = ? WHERE id = ?", [name.trim(), id]);
  },

  async archive(db: SqlDriver, clock: Clock, id: number): Promise<void> {
    await db.execute("UPDATE clients SET archived_at = ? WHERE id = ?", [
      nowInstant(clock),
      id,
    ]);
  },
};

export const projects = {
  async create(
    db: SqlDriver,
    clock: Clock,
    clientId: number,
    name: string,
  ): Promise<number> {
    const { lastInsertId } = await db.execute(
      "INSERT INTO projects (client_id, name, created_at) VALUES (?, ?, ?)",
      [clientId, name.trim(), nowInstant(clock)],
    );
    return lastInsertId;
  },

  async setStatus(db: SqlDriver, id: number, status: ProjectStatus): Promise<void> {
    await db.execute("UPDATE projects SET status = ? WHERE id = ?", [status, id]);
  },

  async remove(db: SqlDriver, id: number): Promise<void> {
    await db.execute("DELETE FROM projects WHERE id = ?", [id]);
  },
};

export const contacts = {
  async create(
    db: SqlDriver,
    clock: Clock,
    input: { clientId: number; projectId?: number | null; name: string; role?: string },
  ): Promise<number> {
    const { lastInsertId } = await db.execute(
      "INSERT INTO contacts (client_id, project_id, name, role, created_at) VALUES (?, ?, ?, ?, ?)",
      [
        input.clientId,
        input.projectId ?? null,
        input.name.trim(),
        input.role?.trim() || null,
        nowInstant(clock),
      ],
    );
    return lastInsertId;
  },

  /** People leave. Their name stops mattering, so it goes. */
  async remove(db: SqlDriver, id: number): Promise<void> {
    await db.execute("DELETE FROM contacts WHERE id = ?", [id]);
  },
};

export interface NewItem {
  clientId: number;
  projectId?: number | null;
  contactId?: number | null;
  kind: ItemKind;
  title: string;
  /** Required for a todo — capture enforces it before it gets here. */
  deadline?: Day | null;
  /** Local 'HH:MM' on the deadline day, for a reminder at that moment. */
  deadlineTime?: string | null;
  /** waiting only: when to go asking. */
  checkinOn?: Day | null;
  /** Local 'HH:MM' on the check-in day; the nudge waits for it. */
  checkinTime?: string | null;
}

/** How long a chase is willing to wait when the original window is unusable. */
const DEFAULT_WAIT_DAYS = 5;

export const items = {
  async create(db: SqlDriver, clock: Clock, input: NewItem): Promise<number> {
    const at = nowInstant(clock);
    const day = today(clock);
    if (input.kind === "todo" && !input.deadline) {
      throw new Error("a todo needs a deadline");
    }
    const { lastInsertId } = await db.execute(
      `INSERT INTO items
         (client_id, project_id, contact_id, kind, title, deadline, deadline_time,
          idea_since, sent_on, checkin_on, checkin_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.clientId,
        input.projectId ?? null,
        input.contactId ?? null,
        input.kind,
        input.title.trim(),
        input.kind === "todo" ? input.deadline : null,
        input.kind === "todo" ? (input.deadlineTime ?? null) : null,
        input.kind === "idea" ? day : null,
        input.kind === "waiting" ? day : null,
        input.kind === "waiting" ? (input.checkinOn ?? null) : null,
        input.kind === "waiting" ? (input.checkinTime ?? null) : null,
        at,
        at,
      ],
    );
    return lastInsertId;
  },

  async edit(
    db: SqlDriver,
    clock: Clock,
    id: number,
    fields: { title?: string; projectId?: number | null; contactId?: number | null },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (fields.title !== undefined) {
      sets.push("title = ?");
      params.push(fields.title.trim());
    }
    if (fields.projectId !== undefined) {
      sets.push("project_id = ?");
      params.push(fields.projectId);
    }
    if (fields.contactId !== undefined) {
      sets.push("contact_id = ?");
      params.push(fields.contactId);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    params.push(nowInstant(clock), id);
    await db.execute(`UPDATE items SET ${sets.join(", ")} WHERE id = ?`, params);
  },

  async close(
    db: SqlDriver,
    clock: Clock,
    id: number,
    outcome: "done" | "replied" | "dropped",
  ): Promise<void> {
    const at = nowInstant(clock);
    await db.execute(
      `UPDATE items SET status = 'closed', outcome = ?, closed_at = ?, updated_at = ?
       WHERE id = ?`,
      [outcome, at, at, id],
    );
  },

  async reopen(db: SqlDriver, clock: Clock, id: number): Promise<void> {
    const at = nowInstant(clock);
    await db.execute(
      `UPDATE items SET status = 'open', outcome = NULL, closed_at = NULL, updated_at = ?
       WHERE id = ?`,
      [at, id],
    );
  },

  /** A new day for a todo — the way out of critical. */
  async reschedule(db: SqlDriver, clock: Clock, id: number, deadline: Day): Promise<void> {
    await db.execute(
      "UPDATE items SET deadline = ?, updated_at = ? WHERE id = ?",
      [deadline, nowInstant(clock), id],
    );
  },

  /**
   * "Do it today." The idea becomes a todo without a deadline — the one todo
   * allowed to have none. It sits with today's work and cannot go critical
   * until it is given a date.
   */
  async promote(db: SqlDriver, clock: Clock, id: number): Promise<void> {
    await db.execute(
      `UPDATE items SET kind = 'todo', started_on = ?, updated_at = ? WHERE id = ?`,
      [today(clock), nowInstant(clock), id],
    );
  },

  /**
   * Back to an idea. The date goes; the idea's age survives (a todo that was
   * never an idea inherits the day it was written). `started_on` stays put:
   * anything once picked up outranks oldest-first next time ideas surface.
   */
  async demote(db: SqlDriver, clock: Clock, id: number): Promise<void> {
    const before = await readItem(db, id);
    await db.execute(
      `UPDATE items
         SET kind = 'idea', deadline = NULL, checkin_on = NULL,
             idea_since = ?, updated_at = ?
       WHERE id = ?`,
      [before.ideaSince ?? toDay(new Date(before.createdAt)), nowInstant(clock), id],
    );
  },

  /**
   * A nudge. Chasing buys another wait rather than muting the item: the
   * check-in re-arms with the window you originally gave it.
   */
  async chase(db: SqlDriver, clock: Clock, id: number, checkinOn?: Day): Promise<void> {
    const before = await readItem(db, id);
    const day = today(clock);
    const wait =
      before.sentOn && before.checkinOn
        ? Math.min(14, Math.max(2, daysBetween(before.sentOn, before.checkinOn)))
        : DEFAULT_WAIT_DAYS;
    const next = checkinOn ?? addDays(day, wait);
    await db.execute(
      `UPDATE items
         SET last_chased_on = ?, chase_count = chase_count + 1, checkin_on = ?,
             updated_at = ?
       WHERE id = ?`,
      [day, next, nowInstant(clock), id],
    );
  },

  /** "That settles it" — the reply closed the loop. */
  async settled(db: SqlDriver, clock: Clock, id: number): Promise<void> {
    await items.close(db, clock, id, "replied");
  },

  /**
   * "Now it's my move" — they replied and the next step is mine. The waiting-on
   * becomes a real todo, deadline required.
   */
  async myMove(db: SqlDriver, clock: Clock, id: number, deadline: Day): Promise<void> {
    await db.execute(
      `UPDATE items
         SET kind = 'todo', deadline = ?, checkin_on = NULL, updated_at = ?
       WHERE id = ?`,
      [deadline, nowInstant(clock), id],
    );
  },

  async setCheckin(db: SqlDriver, clock: Clock, id: number, checkinOn: Day | null): Promise<void> {
    await db.execute(
      "UPDATE items SET checkin_on = ?, updated_at = ? WHERE id = ?",
      [checkinOn, nowInstant(clock), id],
    );
  },
};

/**
 * Settle which ideas today shows, once per day, before anything reads the
 * snapshot. The choice only happens on a day with nothing dated anywhere —
 * and once made it stays made, so picking one idea up doesn't hide the rest
 * and a deadline captured at noon doesn't erase the morning.
 */
export async function settleIdeasOfDay(db: SqlDriver, clock: Clock): Promise<void> {
  const day = today(clock);
  const stored = await meta.get(db, IDEAS_OF_DAY_KEY);
  if (stored && (JSON.parse(stored) as IdeasOfDay).day === day) return;

  const blocking = await db.select<{ n: number }>(
    `SELECT count(*) AS n FROM items
      WHERE status = 'open'
        AND ((kind = 'todo' AND (deadline IS NULL OR deadline <= ?))
          OR (kind = 'waiting' AND checkin_on IS NOT NULL AND checkin_on <= ?))`,
    [day, day],
  );
  if (blocking[0].n > 0) return;

  // Once started beats oldest; then the oldest thought wins.
  const rows = await db.select<{ id: number }>(
    `SELECT id FROM items
      WHERE status = 'open' AND kind = 'idea'
      ORDER BY (started_on IS NULL), coalesce(started_on, ''), coalesce(idea_since, created_at), id
      LIMIT 3`,
  );
  await meta.set(
    db,
    IDEAS_OF_DAY_KEY,
    JSON.stringify({ day, ids: rows.map((r) => r.id) } satisfies IdeasOfDay),
  );
}

export const meta = {
  async get(db: SqlDriver, key: string): Promise<string | null> {
    const rows = await db.select<{ value: string }>(
      "SELECT value FROM app_meta WHERE key = ?",
      [key],
    );
    return rows[0]?.value ?? null;
  },

  async set(db: SqlDriver, key: string, value: string): Promise<void> {
    await db.execute(
      "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  },
};
