import pg from "pg";

/**
 * The small part of a PostgreSQL client the persistence layer uses. Keeping it
 * this narrow lets the same repository code run on a `pg` pool in production
 * and on an embedded PostgreSQL in tests.
 */
export interface Queryable {
  /** Runs one statement with positional parameters (`$1`, `$2`, ...). */
  query<Row = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<{ rows: Row[] }>;
  /** Runs one or more statements with no parameters. Used for migrations. */
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  /** Runs `work` in a transaction: committed if it resolves, rolled back if it throws. */
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** PostgreSQL error codes the application reacts to. */
export const PG_UNIQUE_VIOLATION = "23505";

export function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/**
 * A Database backed by a `pg` connection pool. Values are always sent as
 * parameters, never built into the SQL text.
 */
export function createPgDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 10 });
  // An idle client can fail (for example when the server restarts). Without a
  // listener that would crash the process.
  pool.on("error", (error) => console.error("PostgreSQL pool error", error.message));

  const wrap = (client: pg.Pool | pg.PoolClient): Queryable => ({
    async query<Row>(text: string, params: readonly unknown[] = []) {
      const result = await client.query(text, [...params]);
      return { rows: result.rows as Row[] };
    },
    async exec(sql: string) {
      await client.query(sql);
    },
  });

  return {
    ...wrap(pool),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
