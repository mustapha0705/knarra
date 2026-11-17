import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./db.js";

export interface Migration {
  /** The file name, e.g. `0001_initial.sql`. Its order is its sort order. */
  name: string;
  sql: string;
}

const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/** Reads the migration files from a directory, in order. */
export async function loadMigrations(directory: string = MIGRATIONS_DIR): Promise<Migration[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of names) {
    if (!MIGRATION_NAME.test(name)) {
      throw new Error(`Migration file "${name}" must be named like 0001_description.sql`);
    }
  }
  return Promise.all(
    names.map(async (name) => ({ name, sql: await readFile(join(directory, name), "utf8") })),
  );
}

/**
 * Applies every migration that has not been applied yet, in order, each in its
 * own transaction together with the record that it ran. Returns the names of
 * the migrations applied by this call.
 *
 * A migration that has run is never run again and must never be edited:
 * changing the schema means adding a new file.
 */
export async function runMigrations(database: Database, migrations: readonly Migration[]): Promise<string[]> {
  await database.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name        text PRIMARY KEY,
       applied_at  timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const { rows } = await database.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.name));

  const known = new Set(migrations.map((migration) => migration.name));
  for (const name of applied) {
    if (!known.has(name)) {
      throw new Error(
        `The database has migration "${name}", which this version of the code does not know. Refusing to continue.`,
      );
    }
  }

  const ran: string[] = [];
  for (const migration of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    if (applied.has(migration.name)) continue;
    await database.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
    });
    ran.push(migration.name);
  }
  return ran;
}
