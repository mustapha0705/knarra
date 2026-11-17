import "dotenv/config";
import { createPgDatabase } from "./db.js";
import { loadMigrations, runMigrations } from "./migrate.js";

// `npm run migrate`: applies pending migrations to the database named by
// DATABASE_URL. The server also does this when it starts.

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to backend/.env, for example:");
  console.error("  DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/knarra");
  process.exit(1);
}

const database = createPgDatabase(url);
try {
  const applied = await runMigrations(database, await loadMigrations());
  console.log(applied.length > 0 ? `Applied: ${applied.join(", ")}` : "The database is up to date.");
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await database.close();
}
