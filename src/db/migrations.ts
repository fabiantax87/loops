import init0001 from "../../src-tauri/migrations/0001_init.sql?raw";
import feelTen0002 from "../../src-tauri/migrations/0002_feel_ten.sql?raw";
import contacts0003 from "../../src-tauri/migrations/0003_contacts.sql?raw";
import rapport0004 from "../../src-tauri/migrations/0004_contact_rapport.sql?raw";
import items0005 from "../../src-tauri/migrations/0005_items.sql?raw";
import timeOfDay0006 from "../../src-tauri/migrations/0006_time_of_day.sql?raw";
import type { SqlDriver } from "./driver";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * The same files the Rust side compiles in via `include_str!`. Keep this list
 * and `migrations()` in `src-tauri/src/lib.rs` in step: one schema, two
 * runners. In the packaged app the Rust plugin applies them at startup; this
 * runner exists for the test harness and any headless tooling.
 */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: "initial schema", sql: init0001 },
  { version: 2, name: "feel stamps become a 1-10 rating", sql: feelTen0002 },
  { version: 3, name: "contacts — the people at each client", sql: contacts0003 },
  { version: 4, name: "how it is with each person", sql: rapport0004 },
  { version: 5, name: "loops become items — todo, idea, waiting", sql: items0005 },
  { version: 6, name: "deadlines and check-ins learn a time of day", sql: timeOfDay0006 },
];

export async function applyMigrations(driver: SqlDriver): Promise<number[]> {
  await driver.execute(
    `CREATE TABLE IF NOT EXISTS _loops_migrations (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );
  const done = await driver.select<{ version: number }>(
    "SELECT version FROM _loops_migrations",
  );
  const already = new Set(done.map((r) => r.version));

  const applied: number[] = [];
  for (const migration of MIGRATIONS) {
    if (already.has(migration.version)) continue;
    await driver.executeScript(migration.sql);
    await driver.execute(
      "INSERT INTO _loops_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      [migration.version, migration.name, new Date().toISOString()],
    );
    applied.push(migration.version);
  }
  return applied;
}
