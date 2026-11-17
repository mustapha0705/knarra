import "dotenv/config";
import express from "express";
import cors from "cors";
const PORT = 3001;
import { renderMinimalDemo } from "../ffmpeg-practice/render.js";
import { createExportsRouter } from "./api/exports.js";
import { createAssetsRouter } from "./api/assets.js";
import { createProjectsRouter } from "./api/projects.js";
import { AssetService } from "./assets/service.js";
import { AssetRepository } from "./persistence/assetRepository.js";
import { LocalStorage } from "./storage/localStorage.js";
import { resolve } from "node:path";
import { createPgDatabase } from "./persistence/db.js";
import { loadMigrations, runMigrations } from "./persistence/migrate.js";
import { ProjectRepository } from "./persistence/projectRepository.js";
import { ProjectService } from "./projects/service.js";

/**
 * Connects to PostgreSQL and brings the schema up to date. Returns null when
 * DATABASE_URL is not set or the database cannot be reached; the project and
 * asset routes then answer 503 and the rest of the server still works.
 */
async function connectServices() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("DATABASE_URL is not set: project save and reopen are disabled.");
    return null;
  }
  try {
    const database = createPgDatabase(url);
    const applied = await runMigrations(database, await loadMigrations());
    if (applied.length > 0) console.log(`Applied migrations: ${applied.join(", ")}`);
    // Uploaded media lives here (ARCHITECTURE.md, Storage Layout). Never commit it.
    const storage = new LocalStorage(resolve(process.env.KNARRA_STORAGE_DIR ?? "storage"));
    return {
      projects: new ProjectService(new ProjectRepository(database)),
      assets: new AssetService(new AssetRepository(database), storage),
    };
  } catch (error) {
    // The message can name the host and database; never log the URL, which holds the password.
    console.error("Could not connect to PostgreSQL: project save and reopen are disabled.", error.message);
    return null;
  }
}

const app = express();

app.use(cors());

// API routers come before the general body parsers because they parse their
// own bodies: exports stream uploads to disk, and both set their own size limits.
app.use("/api/exports", createExportsRouter());
const services = await connectServices();
// The asset routes come first: they stream uploads and must not meet the
// projects router's JSON parser.
app.use("/api/projects/:projectId/assets", createAssetsRouter(services?.assets ?? null));
app.use(
  "/api/projects",
  createProjectsRouter(services?.projects ?? null, {
    prepareDelete: services ? (id) => services.assets.prepareProjectDelete(id) : undefined,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res
    .status(200)
    .json({ msg: "API working", timestamp: new Date().toISOString() });
});

// Every render writes the same output file, so only one may run (and be
// streamed back) at a time.
let rendering = false;

app.post("/api/demo-render", async (req, res) => {
  if (rendering) {
    res.status(409).json({ error: "A render is already in progress" });
    return;
  }

  rendering = true;

  let outputPath;
  try {
    outputPath = await renderMinimalDemo();
  } catch (error) {
    rendering = false;
    console.error(error);
    res.status(500).json({ error: "The demo render failed" });
    return;
  }

  res.download(outputPath, "knarra-demo.mp4", (error) => {
    rendering = false;
    if (!error) return;

    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Could not send the rendered file" });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Knarra backend running on http://localhost:${PORT}`);
});
