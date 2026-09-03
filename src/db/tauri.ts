import Database from "@tauri-apps/plugin-sql";
import type { ExecuteResult, SqlDriver } from "./driver";

/** Must match `DB_URL` in `src-tauri/src/lib.rs`. */
export const DB_URL = "sqlite:loops.db";

class TauriDriver implements SqlDriver {
  constructor(private readonly db: Database) {}

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const result = await this.db.execute(sql, params);
    return { rowsAffected: result.rowsAffected, lastInsertId: result.lastInsertId ?? 0 };
  }

  async executeScript(sql: string): Promise<void> {
    await this.db.execute(sql);
  }

  select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.select<T[]>(sql, params) as Promise<T[]>;
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

let pending: Promise<SqlDriver> | null = null;

/**
 * Opens the app database. The Rust plugin runs the migrations as part of
 * `Database.load`, so by the time this resolves the schema is current.
 */
export function openDb(): Promise<SqlDriver> {
  pending ??= Database.load(DB_URL).then((db) => new TauriDriver(db));
  return pending;
}
