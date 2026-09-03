import initSqlJs, { type Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { ExecuteResult, SqlDriver } from "./driver";
import { applyMigrations } from "./migrations";

/**
 * A dev-only database that lives in the browser tab.
 *
 * Loops is a Tauri app, but running the same UI at localhost against seeded
 * data makes the design loop quick — and it is the same schema and the same
 * queries, so what you see there is what the app does.
 */
class BrowserDriver implements SqlDriver {
  constructor(private readonly db: Database) {}

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    this.db.run(sql, params as never[]);
    const [row] = this.db.exec("SELECT last_insert_rowid() AS id, changes() AS n");
    return {
      lastInsertId: Number(row?.values[0][0] ?? 0),
      rowsAffected: Number(row?.values[0][1] ?? 0),
    };
  }

  async executeScript(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const statement = this.db.prepare(sql);
    statement.bind(params as never[]);
    const rows: T[] = [];
    while (statement.step()) rows.push(statement.getAsObject() as T);
    statement.free();
    return rows;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export async function createBrowserDb(): Promise<SqlDriver> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  const driver = new BrowserDriver(db);
  await applyMigrations(driver);
  return driver;
}
