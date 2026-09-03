import { DatabaseSync } from "node:sqlite";
import type { ExecuteResult, SqlDriver } from "../db/driver";
import { applyMigrations } from "../db/migrations";

/**
 * An in-memory `SqlDriver` backed by Node's built-in SQLite. Same schema, same
 * queries, no Tauri — so domain logic can be tested at speed.
 */
class NodeSqliteDriver implements SqlDriver {
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

/** A migrated, empty database. */
export async function createTestDb(): Promise<SqlDriver> {
  const driver = emptyTestDb();
  await applyMigrations(driver);
  return driver;
}

/**
 * A database with no schema at all, for tests that step through the migrations
 * by hand to check what happens to data already in there.
 */
export function emptyTestDb(): SqlDriver {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return new NodeSqliteDriver(db);
}
