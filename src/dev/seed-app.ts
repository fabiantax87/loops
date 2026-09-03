import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExecuteResult, SqlDriver } from "../db/driver.ts";
import { systemClock } from "../lib/clock.ts";
import { seed } from "./seed.ts";

/**
 * Fills the real app database with the demo history, so the packaged app can be
 * walked through with something believable in it. Run with `pnpm seed`.
 *
 * It refuses to touch a database that already has clients in it, unless you
 * pass --reset, which empties every table first. That flag throws away real
 * data, so it has to be asked for by name.
 */
const DB_PATHS: Record<string, string> = {
  darwin: join(homedir(), "Library", "Application Support", "com.fabiantax.loops", "loops.db"),
  linux: join(homedir(), ".config", "com.fabiantax.loops", "loops.db"),
  win32: join(homedir(), "AppData", "Roaming", "com.fabiantax.loops", "loops.db"),
};

class NodeDriver implements SqlDriver {
  constructor(private readonly db: DatabaseSync) {}
  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const result = this.db.prepare(sql).run(...(params as never[]));
    return {
      rowsAffected: Number(result.changes),
      lastInsertId: Number(result.lastInsertRowid),
    };
  }
  async executeScript(sql: string): Promise<void> {
    this.db.exec(sql);
  }
  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }
  async close(): Promise<void> {
    this.db.close();
  }
}

const path = DB_PATHS[process.platform];
if (!path) {
  console.error(`No idea where Loops keeps its database on ${process.platform}.`);
  process.exit(1);
}

let db: DatabaseSync;
try {
  db = new DatabaseSync(path);
} catch {
  console.error(
    `Couldn't open ${path}.\nRun the app once (\`pnpm tauri dev\`) so it creates the database, then try again.`,
  );
  process.exit(1);
}

db.exec("PRAGMA foreign_keys = ON");
const driver = new NodeDriver(db);

const reset = process.argv.includes("--reset");
const [{ n }] = await driver.select<{ n: number }>("SELECT count(*) AS n FROM clients");
if (n > 0 && !reset) {
  console.error(
    `${path} already has ${n} clients in it — leaving it alone.\n` +
      "Pass --reset to throw that away and seed it fresh.",
  );
  process.exit(1);
}

if (reset && n > 0) {
  // Everything hangs off clients, so removing them takes the rest with it.
  // Deleting the history tables directly would be refused — they are
  // append-only, and only a cascade from a departing parent may clear them.
  await driver.execute("DELETE FROM clients");
  await driver.execute("DELETE FROM app_meta");
  console.log(`Cleared ${n} clients and everything hanging off them.`);
}

await seed(driver, systemClock);
const [{ items }] = await driver.select<{ items: number }>(
  "SELECT count(*) AS items FROM items",
);
await driver.close();
console.log(`Seeded ${path}: 5 clients, ${items} items.`);
