import { beforeEach, describe, expect, it } from "vitest";
import type { SqlDriver } from "./driver";
import { createTestDb } from "../test/sqlite";
import { fixedClock } from "../lib/clock";
import { contacts, items, projects } from "./repo";

let db: SqlDriver;

beforeEach(async () => {
  db = await createTestDb();
});

async function client(name = "Ravel"): Promise<number> {
  const { lastInsertId } = await db.execute(
    "INSERT INTO clients (name, created_at) VALUES (?, ?)",
    [name, "2026-08-01T09:00:00.000Z"],
  );
  return lastInsertId;
}

async function insertItem(fields: Record<string, unknown>): Promise<number> {
  const full: Record<string, unknown> = {
    kind: "todo",
    title: "Send the estimate",
    deadline: "2026-09-05",
    created_at: "2026-08-01T09:00:00.000Z",
    updated_at: "2026-08-01T09:00:00.000Z",
    ...fields,
  };
  const keys = Object.keys(full);
  const { lastInsertId } = await db.execute(
    `INSERT INTO items (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
    keys.map((k) => full[k]),
  );
  return lastInsertId;
}

describe("migrations", () => {
  it("ends at the item schema — the loop era is gone", async () => {
    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["app_meta", "clients", "contacts", "items", "projects"]),
    );
    for (const gone of ["loops", "loop_events", "touchpoints", "pulse_entries", "flags"]) {
      expect(names).not.toContain(gone);
    }
  });

  it("is idempotent — a second run applies nothing", async () => {
    const { applyMigrations } = await import("./migrations");
    await expect(applyMigrations(db)).resolves.toEqual([]);
  });
});

describe("clients", () => {
  it("rejects a second client whose name differs only in case", async () => {
    await client("Ravel");
    await expect(client("ravel")).rejects.toThrow();
  });
});

describe("items", () => {
  it("accepts the three kinds, each in its lawful shape", async () => {
    const c = await client();
    // A todo with its deadline.
    await insertItem({ client_id: c });
    // A promoted todo: no deadline, but a started day.
    await insertItem({ client_id: c, deadline: null, started_on: "2026-08-01" });
    // An idea: no dates at all.
    await insertItem({ client_id: c, kind: "idea", deadline: null, idea_since: "2026-06-14" });
    // A waiting-on: knows when the ball left, check-in optional.
    await insertItem({
      client_id: c,
      kind: "waiting",
      deadline: null,
      sent_on: "2026-08-01",
      checkin_on: "2026-08-08",
    });
    await insertItem({ client_id: c, kind: "waiting", deadline: null, sent_on: "2026-08-01" });

    const rows = await db.select<{ n: number }>("SELECT count(*) AS n FROM items");
    expect(rows[0].n).toBe(5);
  });

  it("refuses a todo with no deadline that was never picked up", async () => {
    const c = await client();
    await expect(insertItem({ client_id: c, deadline: null })).rejects.toThrow();
  });

  it("refuses an idea carrying a date", async () => {
    const c = await client();
    await expect(
      insertItem({ client_id: c, kind: "idea", deadline: "2026-09-05" }),
    ).rejects.toThrow();
    await expect(
      insertItem({ client_id: c, kind: "idea", deadline: null, checkin_on: "2026-09-05" }),
    ).rejects.toThrow();
  });

  it("refuses a waiting-on that doesn't know when the ball left", async () => {
    const c = await client();
    await expect(insertItem({ client_id: c, kind: "waiting", deadline: null })).rejects.toThrow();
  });

  it("requires a closed item to record when and how it ended", async () => {
    const c = await client();
    await expect(insertItem({ client_id: c, status: "closed" })).rejects.toThrow();
    await expect(
      insertItem({
        client_id: c,
        status: "closed",
        outcome: "done",
        closed_at: "2026-08-27T16:00:00.000Z",
      }),
    ).resolves.toBeGreaterThan(0);
  });

  it("rejects a kind the UI has no language for", async () => {
    const c = await client();
    await expect(insertItem({ client_id: c, kind: "someday" })).rejects.toThrow();
  });

  it("requires a client", async () => {
    await expect(insertItem({ client_id: 999 })).rejects.toThrow();
  });

  it("survives its project being deleted", async () => {
    const c = await client();
    const { lastInsertId: p } = await db.execute(
      "INSERT INTO projects (client_id, name, created_at) VALUES (?, ?, ?)",
      [c, "Website", "2026-08-01T09:00:00.000Z"],
    );
    const i = await insertItem({ client_id: c, project_id: p });
    await db.execute("DELETE FROM projects WHERE id = ?", [p]);
    const [row] = await db.select<{ project_id: number | null }>(
      "SELECT project_id FROM items WHERE id = ?",
      [i],
    );
    expect(row.project_id).toBeNull();
  });

  it("goes with its client", async () => {
    const c = await client();
    await insertItem({ client_id: c });
    await db.execute("DELETE FROM clients WHERE id = ?", [c]);
    const rows = await db.select<{ n: number }>("SELECT count(*) AS n FROM items");
    expect(rows[0].n).toBe(0);
  });
});

describe("moving an item", () => {
  const clock = fixedClock("2026-09-14T10:30:00.000Z");

  it("changes client and project, and leaves the contact behind", async () => {
    const from = await client("Ravel");
    const to = await client("Eurotransplant");
    const project = await projects.create(db, clock, to, "Portal");
    const person = await contacts.create(db, clock, {
      clientId: from,
      name: "John",
      email: "john@ravel.nl",
    });
    const id = await insertItem({ client_id: from, contact_id: person });

    await items.move(db, clock, id, { clientId: to, projectId: project, contactId: null });

    const [row] = await db.select<{ client_id: number; project_id: number; contact_id: null }>(
      "SELECT client_id, project_id, contact_id FROM items WHERE id = ?",
      [id],
    );
    expect(row).toEqual({ client_id: to, project_id: project, contact_id: null });
  });

  it("keeps the contact when only the project changes", async () => {
    const c = await client();
    const project = await projects.create(db, clock, c, "Portal");
    const person = await contacts.create(db, clock, { clientId: c, name: "John" });
    const id = await insertItem({ client_id: c, contact_id: person });

    await items.move(db, clock, id, { clientId: c, projectId: project, contactId: person });

    const [row] = await db.select<{ project_id: number; contact_id: number }>(
      "SELECT project_id, contact_id FROM items WHERE id = ?",
      [id],
    );
    expect(row).toEqual({ project_id: project, contact_id: person });
  });
});

describe("contacts", () => {
  const clock = fixedClock("2026-09-14T10:30:00.000Z");

  it("carry an email of their own, which edit can clear again", async () => {
    const c = await client();
    const id = await contacts.create(db, clock, { clientId: c, name: "John", email: " john@ravel.nl " });
    const read = async () =>
      (await db.select<{ email: string | null }>("SELECT email FROM contacts WHERE id = ?", [id]))[0].email;
    expect(await read()).toBe("john@ravel.nl");
    await contacts.edit(db, id, { email: "" });
    expect(await read()).toBeNull();
  });
});
