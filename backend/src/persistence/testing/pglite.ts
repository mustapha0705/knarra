import { PGlite } from "@electric-sql/pglite";
import type { Database, Queryable } from "../db.js";
import { loadMigrations, runMigrations } from "../migrate.js";

// Test support only. PGlite is a real PostgreSQL engine compiled to run inside
// the test process, so the same SQL and migrations run with no server, no
// credentials, and a fresh empty database for every test file.

interface PgliteLike {
  query<Row>(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
  exec(sql: string): Promise<unknown>;
}

const wrap = (client: PgliteLike): Queryable => ({
  async query<Row>(text: string, params: readonly unknown[] = []) {
    const result = await client.query<Row>(text, [...params]);
    return { rows: result.rows };
  },
  async exec(sql: string) {
    await client.exec(sql);
  },
});

/** An empty in-memory PostgreSQL database. */
export async function createTestDatabase(): Promise<Database> {
  const db = new PGlite();
  await db.waitReady;
  return {
    ...wrap(db),
    transaction: (work) => db.transaction((tx) => work(wrap(tx))),
    close: () => db.close(),
  };
}

/** An in-memory database with every migration applied. */
export async function createMigratedTestDatabase(): Promise<Database> {
  const database = await createTestDatabase();
  await runMigrations(database, await loadMigrations());
  return database;
}
