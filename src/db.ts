import pg from "pg";

export type Sql = <T = Record<string, unknown>>(query: string, params?: unknown[]) => Promise<T[]>;

/**
 * Direct access to the app's database, for a video's setup to put demo data back the way
 * it was. Only a database on this machine: a recording must never touch a shared one.
 */
export function connect(): { sql: Sql; close: () => Promise<void> } {
  const url = process.env.OUTERVIEW_DATABASE_URL;
  let pool: pg.Pool | undefined;
  const sql: Sql = async (query, params) => {
    if (!url) throw new Error("This video's setup needs OUTERVIEW_DATABASE_URL in .env");
    const host = new URL(url).hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
      throw new Error(`OUTERVIEW_DATABASE_URL points at ${host}; only a local database is allowed`);
    }
    pool ??= new pg.Pool({ connectionString: url, max: 2 });
    return (await pool.query(query, params)).rows;
  };
  return { sql, close: async () => void (await pool?.end()) };
}
