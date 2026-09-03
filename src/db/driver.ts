/**
 * The narrow slice of a database the app actually uses. `tauri-plugin-sql`
 * satisfies it in the app; a `node:sqlite` adapter satisfies it in tests, which
 * is how repository logic gets tested without booting Tauri.
 */
export interface SqlDriver {
  execute(sql: string, params?: unknown[]): Promise<ExecuteResult>;
  /** Runs a multi-statement script (a migration). No parameters, no result. */
  executeScript(sql: string): Promise<void>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface ExecuteResult {
  rowsAffected: number;
  lastInsertId: number;
}

/** Convenience for the many queries that must return exactly one row. */
export async function selectOne<T>(
  driver: SqlDriver,
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await driver.select<T>(sql, params);
  return rows[0] ?? null;
}
