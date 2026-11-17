import { randomUUID } from "node:crypto";
import type { AssetRef } from "../domain/composition/index.js";
import type { Database, Queryable } from "./db.js";

/** An asset as stored: the kernel's catalog entry plus display and trust data. */
export interface StoredAsset extends AssetRef {
  /** Display only. Never a path. */
  name: string;
  /** True once the server has read this metadata from the stored file (M5). */
  verified: boolean;
}

export interface ProjectSummary {
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord extends ProjectSummary {
  schemaVersion: number;
  /** Stored Composition JSON. Callers parse it with parseComposition. */
  composition: unknown;
  editorState: Record<string, unknown>;
  assets: StoredAsset[];
}

export interface VersionSummary {
  id: string;
  projectId: string;
  versionNumber: number;
  projectRevision: number;
  label: string | null;
  createdAt: string;
}

export interface VersionRecord extends VersionSummary {
  schemaVersion: number;
  composition: unknown;
  editorState: Record<string, unknown>;
  assets: StoredAsset[];
}

export interface NewProject {
  id: string;
  title: string;
  schemaVersion: number;
  composition: unknown;
}

export interface ProjectUpdate {
  /** The revision the caller's copy was based on. */
  expectedRevision: number;
  title: string;
  schemaVersion: number;
  composition: unknown;
  editorState: Record<string, unknown>;
  assets: readonly StoredAsset[];
}

export type SaveResult =
  | { status: "saved"; project: ProjectRecord }
  | { status: "not-found" }
  | { status: "stale"; currentRevision: number };

export type CreateVersionResult =
  | { status: "created"; version: VersionRecord }
  | { status: "not-found" }
  | { status: "stale"; currentRevision: number };

interface ProjectRow {
  id: string;
  title: string;
  revision: number;
  schema_version: number;
  composition: unknown;
  editor_state: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface AssetRow {
  id: string;
  kind: AssetRef["kind"];
  name: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  has_audio: boolean;
  verified: boolean;
}

interface VersionRow {
  id: string;
  project_id: string;
  version_number: number;
  project_revision: number;
  label: string | null;
  schema_version: number;
  composition: unknown;
  editor_state: Record<string, unknown>;
  assets: StoredAsset[];
  created_at: Date;
}

const PROJECT_COLUMNS = "id, title, revision, schema_version, composition, editor_state, created_at, updated_at";
const VERSION_COLUMNS =
  "id, project_id, version_number, project_revision, label, schema_version, composition, editor_state, assets, created_at";

const toSummary = (row: Pick<ProjectRow, "id" | "title" | "revision" | "created_at" | "updated_at">): ProjectSummary => ({
  id: row.id,
  title: row.title,
  revision: row.revision,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const toAsset = (row: AssetRow): StoredAsset => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  durationMs: row.duration_ms,
  width: row.width,
  height: row.height,
  hasAudio: row.has_audio,
  verified: row.verified,
});

const toVersionSummary = (row: VersionRow): VersionSummary => ({
  id: row.id,
  projectId: row.project_id,
  versionNumber: row.version_number,
  projectRevision: row.project_revision,
  label: row.label,
  createdAt: row.created_at.toISOString(),
});

const toVersion = (row: VersionRow): VersionRecord => ({
  ...toVersionSummary(row),
  schemaVersion: row.schema_version,
  composition: row.composition,
  editorState: row.editor_state,
  assets: row.assets,
});

/**
 * All SQL for projects and their versions. Values always travel as query
 * parameters. This layer stores and returns data; deciding whether data is
 * valid belongs to the service that calls it.
 */
export class ProjectRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async create(project: NewProject): Promise<ProjectRecord> {
    const { rows } = await this.database.query<ProjectRow>(
      `INSERT INTO projects (id, title, schema_version, composition)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING ${PROJECT_COLUMNS}`,
      [project.id, project.title, project.schemaVersion, JSON.stringify(project.composition)],
    );
    return this.toRecord(rows[0]!, []);
  }

  async list(): Promise<ProjectSummary[]> {
    const { rows } = await this.database.query<ProjectRow>(
      "SELECT id, title, revision, created_at, updated_at FROM projects ORDER BY updated_at DESC, id",
    );
    return rows.map(toSummary);
  }

  async get(id: string): Promise<ProjectRecord | null> {
    return this.read(this.database, id);
  }

  /**
   * Replaces a project's state if, and only if, it is still at
   * `expectedRevision`. The check and the write are one statement, so two
   * saves based on the same revision cannot both succeed.
   */
  async save(id: string, update: ProjectUpdate): Promise<SaveResult> {
    return this.database.transaction(async (tx) => {
      const { rows } = await tx.query<ProjectRow>(
        `UPDATE projects
            SET title = $3,
                schema_version = $4,
                composition = $5::jsonb,
                editor_state = $6::jsonb,
                revision = revision + 1,
                updated_at = now()
          WHERE id = $1 AND revision = $2
          RETURNING ${PROJECT_COLUMNS}`,
        [
          id,
          update.expectedRevision,
          update.title,
          update.schemaVersion,
          JSON.stringify(update.composition),
          JSON.stringify(update.editorState),
        ],
      );

      const row = rows[0];
      if (!row) {
        const current = await tx.query<{ revision: number }>("SELECT revision FROM projects WHERE id = $1", [id]);
        const revision = current.rows[0]?.revision;
        return revision === undefined ? { status: "not-found" } : { status: "stale", currentRevision: revision };
      }

      // Only browser-reported assets are replaced. Uploaded assets (verified)
      // belong to the asset service; a saved entry with the same ID is ignored,
      // so the server's metadata always wins.
      await tx.query("DELETE FROM assets WHERE project_id = $1 AND NOT verified", [id]);
      for (const [position, asset] of update.assets.entries()) {
        await tx.query(
          `INSERT INTO assets (project_id, id, kind, name, duration_ms, width, height, has_audio, verified, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)
           ON CONFLICT (project_id, id) DO NOTHING`,
          [id, asset.id, asset.kind, asset.name, asset.durationMs, asset.width, asset.height, asset.hasAudio, position],
        );
      }

      return { status: "saved", project: this.toRecord(row, await this.readAssets(tx, id)) };
    });
  }

  /** Deletes a project with its assets, versions, and render jobs. */
  async delete(id: string): Promise<boolean> {
    const { rows } = await this.database.query<{ id: string }>("DELETE FROM projects WHERE id = $1 RETURNING id", [id]);
    return rows.length > 0;
  }

  /**
   * Takes an immutable snapshot of the project's current state. When
   * `expectedRevision` is given, the snapshot is refused if the project has
   * moved on, so a version is always of the state the caller was looking at.
   */
  async createVersion(
    projectId: string,
    options: { expectedRevision?: number; label?: string | null } = {},
  ): Promise<CreateVersionResult> {
    return this.database.transaction(async (tx) => {
      // Lock the project row: the snapshot and its number are then consistent.
      const locked = await tx.query<ProjectRow>(
        `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1 FOR UPDATE`,
        [projectId],
      );
      const project = locked.rows[0];
      if (!project) return { status: "not-found" };
      if (options.expectedRevision !== undefined && options.expectedRevision !== project.revision) {
        return { status: "stale", currentRevision: project.revision };
      }

      const assets = await this.readAssets(tx, projectId);
      const next = await tx.query<{ next: number }>(
        "SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM project_versions WHERE project_id = $1",
        [projectId],
      );
      const { rows } = await tx.query<VersionRow>(
        `INSERT INTO project_versions
           (id, project_id, version_number, project_revision, label, schema_version, composition, editor_state, assets)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
         RETURNING ${VERSION_COLUMNS}`,
        [
          randomUUID(),
          projectId,
          next.rows[0]!.next,
          project.revision,
          options.label ?? null,
          project.schema_version,
          JSON.stringify(project.composition),
          JSON.stringify(project.editor_state),
          JSON.stringify(assets),
        ],
      );
      return { status: "created", version: toVersion(rows[0]!) };
    });
  }

  async listVersions(projectId: string): Promise<VersionSummary[]> {
    const { rows } = await this.database.query<VersionRow>(
      `SELECT id, project_id, version_number, project_revision, label, created_at
         FROM project_versions WHERE project_id = $1 ORDER BY version_number DESC`,
      [projectId],
    );
    return rows.map(toVersionSummary);
  }

  async getVersion(projectId: string, versionId: string): Promise<VersionRecord | null> {
    const { rows } = await this.database.query<VersionRow>(
      `SELECT ${VERSION_COLUMNS} FROM project_versions WHERE project_id = $1 AND id = $2`,
      [projectId, versionId],
    );
    return rows[0] ? toVersion(rows[0]) : null;
  }

  private async read(db: Queryable, id: string): Promise<ProjectRecord | null> {
    const { rows } = await db.query<ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1`, [id]);
    return rows[0] ? this.toRecord(rows[0], await this.readAssets(db, id)) : null;
  }

  private async readAssets(db: Queryable, projectId: string): Promise<StoredAsset[]> {
    const { rows } = await db.query<AssetRow>(
      `SELECT id, kind, name, duration_ms, width, height, has_audio, verified
         FROM assets WHERE project_id = $1 ORDER BY position, id`,
      [projectId],
    );
    return rows.map(toAsset);
  }

  private toRecord(row: ProjectRow, assets: StoredAsset[]): ProjectRecord {
    return {
      ...toSummary(row),
      schemaVersion: row.schema_version,
      composition: row.composition,
      editorState: row.editor_state,
      assets,
    };
  }
}
