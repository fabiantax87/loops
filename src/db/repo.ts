import type { SqlDriver } from "./driver";
import type { Clock } from "../lib/clock";
import { type Day, type Instant, addDays, daysBetween, nowInstant, toDay, today } from "../lib/time";
import type { IdeasOfDay, Snapshot } from "../domain/snapshot";
import type { Meeting } from "../domain/calendar";
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
    leading: !!r.leading,
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
    notes: r.notes,
    deadline: r.deadline,
    deadlineTime: r.deadline_time,
    durationMinutes: r.duration_minutes,
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

  /** Whether this is a client you lead. The rail gives those their own band. */
  async setLeading(db: SqlDriver, id: number, leading: boolean): Promise<void> {
    await db.execute("UPDATE clients SET leading = ? WHERE id = ?", [leading ? 1 : 0, id]);
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

  /** Names get misspelled and people change desks; all of it is fixable. */
  async edit(
    db: SqlDriver,
    id: number,
    fields: { name?: string; role?: string | null; projectId?: number | null },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (fields.name !== undefined) {
      sets.push("name = ?");
      params.push(fields.name.trim());
    }
    if (fields.role !== undefined) {
      sets.push("role = ?");
      params.push(fields.role?.trim() || null);
    }
    if (fields.projectId !== undefined) {
      sets.push("project_id = ?");
      params.push(fields.projectId);
    }
    if (sets.length === 0) return;
    await db.execute(`UPDATE contacts SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
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
  /** Context, links, the paragraph the title stands for. */
  notes?: string | null;
  /** Required for a todo — capture enforces it before it gets here. */
  deadline?: Day | null;
  /** Local 'HH:MM' on the deadline day, for a reminder at that moment. */
  deadlineTime?: string | null;
  /** How long it takes, in minutes. Null means the default (30). */
  durationMinutes?: number | null;
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
         (client_id, project_id, contact_id, kind, title, notes, deadline, deadline_time,
          duration_minutes, idea_since, sent_on, checkin_on, checkin_time,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.clientId,
        input.projectId ?? null,
        input.contactId ?? null,
        input.kind,
        input.title.trim(),
        input.notes?.trim() || null,
        input.kind === "todo" ? input.deadline : null,
        input.kind === "todo" ? (input.deadlineTime ?? null) : null,
        input.kind === "todo" ? (input.durationMinutes ?? null) : null,
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
    fields: {
      title?: string;
      notes?: string | null;
      projectId?: number | null;
      contactId?: number | null;
    },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (fields.title !== undefined) {
      sets.push("title = ?");
      params.push(fields.title.trim());
    }
    if (fields.notes !== undefined) {
      sets.push("notes = ?");
      params.push(fields.notes?.trim() || null);
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

  /** The calendar's editor for a waiting-on: when to chase, and for how long. */
  async setCheckinSchedule(
    db: SqlDriver,
    clock: Clock,
    id: number,
    schedule: { checkinOn: Day; checkinTime: string | null; durationMinutes: number | null },
  ): Promise<void> {
    await db.execute(
      `UPDATE items
         SET checkin_on = ?, checkin_time = ?, duration_minutes = ?, updated_at = ?
       WHERE id = ?`,
      [
        schedule.checkinOn,
        schedule.checkinTime,
        schedule.durationMinutes,
        nowInstant(clock),
        id,
      ],
    );
  },

  /** The calendar's task editor: day, moment and length in one write. */
  async setSchedule(
    db: SqlDriver,
    clock: Clock,
    id: number,
    schedule: { deadline: Day; deadlineTime: string | null; durationMinutes: number | null },
  ): Promise<void> {
    await db.execute(
      `UPDATE items
         SET deadline = ?, deadline_time = ?, duration_minutes = ?, updated_at = ?
       WHERE id = ?`,
      [
        schedule.deadline,
        schedule.deadlineTime,
        schedule.durationMinutes,
        nowInstant(clock),
        id,
      ],
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

function meeting(r: Row): Meeting {
  return {
    id: r.id,
    calendarId: r.calendar_id,
    title: r.title,
    allDay: r.start_day !== null,
    start: r.start_at,
    end: r.end_at,
    startDay: r.start_day,
    endDay: r.end_day,
    location: r.location,
    description: r.description,
    attendees: r.attendees ? JSON.parse(r.attendees) : [],
    meetUrl: r.meet_url,
    htmlLink: r.html_link,
    status: r.status,
  };
}

/**
 * The local cache of Google Calendar events. Google owns this data; the cache
 * exists so the calendar renders instantly and offline, and a sync replaces a
 * whole window at a time — cancellations simply stop being there.
 */
export const googleEvents = {
  async replaceWindow(
    db: SqlDriver,
    clock: Clock,
    calendarId: string,
    timeMin: Instant,
    timeMax: Instant,
    events: Meeting[],
  ): Promise<void> {
    // Days compare against instants here only to bound the delete; the window
    // is generous enough that an all-day event near its edge cannot be lost
    // from one window and kept out of the next.
    await db.execute(
      `DELETE FROM google_events
        WHERE calendar_id = ?
          AND ((start_at IS NOT NULL AND start_at < ? AND end_at > ?)
            OR (start_day IS NOT NULL AND start_day < ? AND end_day > ?))`,
      [calendarId, timeMax, timeMin, timeMax.slice(0, 10), timeMin.slice(0, 10)],
    );
    for (const event of events) {
      await db.execute(
        `INSERT INTO google_events
           (id, calendar_id, title, start_at, end_at, start_day, end_day,
            location, description, attendees, meet_url, html_link, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (calendar_id, id) DO UPDATE SET
           title = excluded.title, start_at = excluded.start_at,
           end_at = excluded.end_at, start_day = excluded.start_day,
           end_day = excluded.end_day, location = excluded.location,
           description = excluded.description, attendees = excluded.attendees,
           meet_url = excluded.meet_url, html_link = excluded.html_link,
           status = excluded.status, updated_at = excluded.updated_at`,
        [
          event.id,
          calendarId,
          event.title,
          event.start,
          event.end,
          event.startDay,
          event.endDay,
          event.location,
          event.description,
          JSON.stringify(event.attendees),
          event.meetUrl,
          event.htmlLink,
          event.status,
          nowInstant(clock),
        ],
      );
    }
  },

  /** Every cached event touching the window, enabled calendars only. */
  async listBetween(db: SqlDriver, timeMin: Instant, timeMax: Instant): Promise<Meeting[]> {
    const rows = await db.select<Row>(
      `SELECT e.* FROM google_events e
        JOIN google_calendars c ON c.id = e.calendar_id
       WHERE c.enabled = 1
         AND ((e.start_at IS NOT NULL AND e.start_at < ? AND e.end_at > ?)
           OR (e.start_day IS NOT NULL AND e.start_day < ? AND e.end_day > ?))
       ORDER BY coalesce(e.start_at, e.start_day)`,
      [timeMax, timeMin, timeMax.slice(0, 10), timeMin.slice(0, 10)],
    );
    return rows.map(meeting);
  },

  /** Disconnecting takes the borrowed data with it. */
  async clear(db: SqlDriver): Promise<void> {
    await db.execute("DELETE FROM google_events");
    await db.execute("DELETE FROM google_calendars");
  },
};

export interface GoogleCalendar {
  id: string;
  summary: string;
  enabled: boolean;
}

export const googleCalendars = {
  async list(db: SqlDriver): Promise<GoogleCalendar[]> {
    const rows = await db.select<Row>(
      "SELECT * FROM google_calendars ORDER BY summary COLLATE NOCASE",
    );
    return rows.map((r) => ({ id: r.id, summary: r.summary, enabled: r.enabled === 1 }));
  },

  async upsert(db: SqlDriver, id: string, summary: string): Promise<void> {
    await db.execute(
      `INSERT INTO google_calendars (id, summary) VALUES (?, ?)
       ON CONFLICT (id) DO UPDATE SET summary = excluded.summary`,
      [id, summary],
    );
  },

  async setEnabled(db: SqlDriver, id: string, enabled: boolean): Promise<void> {
    await db.execute("UPDATE google_calendars SET enabled = ? WHERE id = ?", [
      enabled ? 1 : 0,
      id,
    ]);
  },
};

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
