import type { AssetRef } from "../domain/composition/index.js";
import type { Database } from "./db.js";

export type DerivativeKind = "thumbnail" | "proxy";
export type DerivativeStatus = "pending" | "ready" | "failed";

export interface DerivativeRecord {
  kind: DerivativeKind;
  status: DerivativeStatus;
  errorCode: string | null;
}

/** An uploaded asset: metadata read from the stored original by the server. */
export interface UploadedAsset extends AssetRef {
  projectId: string;
  /** Display only. Never a path. */
  name: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
  derivatives: DerivativeRecord[];
}

export interface NewUploadedAsset extends AssetRef {
  projectId: string;
  name: string;
  byteSize: number;
  sha256: string;
}

interface AssetRow {
  project_id: string;
  id: string;
  kind: AssetRef["kind"];
  name: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  has_audio: boolean;
  byte_size: number;
  sha256: string;
  created_at: Date;
}

interface DerivativeRow {
  asset_id: string;
  kind: DerivativeKind;
  status: DerivativeStatus;
  error_code: string | null;
}

// byte_size is bigint; cast so both drivers return a JavaScript number.
const ASSET_COLUMNS =
  "project_id, id, kind, name, duration_ms, width, height, has_audio, byte_size::float8 AS byte_size, sha256, created_at";

/** SQL for uploaded (server-verified) assets and their derived artifacts. */
export class AssetRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async projectExists(projectId: string): Promise<boolean> {
    const { rows } = await this.database.query("SELECT 1 FROM projects WHERE id = $1", [projectId]);
    return rows.length > 0;
  }

  /** Records an uploaded asset. Fails if the project does not exist or the ID is taken. */
  async insert(asset: NewUploadedAsset): Promise<UploadedAsset> {
    const { rows } = await this.database.query<AssetRow>(
      `INSERT INTO assets
         (project_id, id, kind, name, duration_ms, width, height, has_audio, verified, byte_size, sha256, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10,
               (SELECT COALESCE(MAX(position), -1) + 1 FROM assets WHERE project_id = $1))
       RETURNING ${ASSET_COLUMNS}`,
      [
        asset.projectId,
        asset.id,
        asset.kind,
        asset.name,
        asset.durationMs,
        asset.width,
        asset.height,
        asset.hasAudio,
        asset.byteSize,
        asset.sha256,
      ],
    );
    return this.toAsset(rows[0]!, []);
  }

  async list(projectId: string): Promise<UploadedAsset[]> {
    const { rows } = await this.database.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets WHERE project_id = $1 AND verified ORDER BY position, id`,
      [projectId],
    );
    const derivatives = await this.database.query<DerivativeRow>(
      "SELECT asset_id, kind, status, error_code FROM asset_derivatives WHERE project_id = $1 ORDER BY kind",
      [projectId],
    );
    return rows.map((row) =>
      this.toAsset(
        row,
        derivatives.rows.filter((derivative) => derivative.asset_id === row.id),
      ),
    );
  }

  async get(projectId: string, assetId: string): Promise<UploadedAsset | null> {
    const { rows } = await this.database.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets WHERE project_id = $1 AND id = $2 AND verified`,
      [projectId, assetId],
    );
    if (!rows[0]) return null;
    const derivatives = await this.database.query<DerivativeRow>(
      "SELECT asset_id, kind, status, error_code FROM asset_derivatives WHERE project_id = $1 AND asset_id = $2 ORDER BY kind",
      [projectId, assetId],
    );
    return this.toAsset(rows[0], derivatives.rows);
  }

  async delete(projectId: string, assetId: string): Promise<boolean> {
    const { rows } = await this.database.query(
      "DELETE FROM assets WHERE project_id = $1 AND id = $2 AND verified RETURNING id",
      [projectId, assetId],
    );
    return rows.length > 0;
  }

  /**
   * Sets the state of one derived artifact. Insert-or-update on the primary
   * key, so repeating it for the same asset and kind never adds a row.
   */
  async setDerivative(
    projectId: string,
    assetId: string,
    kind: DerivativeKind,
    status: DerivativeStatus,
    errorCode: string | null = null,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO asset_derivatives (project_id, asset_id, kind, status, error_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, asset_id, kind)
       DO UPDATE SET status = EXCLUDED.status, error_code = EXCLUDED.error_code, updated_at = now()`,
      [projectId, assetId, kind, status, errorCode],
    );
  }

  private toAsset(row: AssetRow, derivatives: DerivativeRow[]): UploadedAsset {
    return {
      projectId: row.project_id,
      id: row.id,
      kind: row.kind,
      name: row.name,
      durationMs: row.duration_ms,
      width: row.width,
      height: row.height,
      hasAudio: row.has_audio,
      byteSize: Number(row.byte_size),
      sha256: row.sha256,
      createdAt: row.created_at.toISOString(),
      derivatives: derivatives.map(({ kind, status, error_code }) => ({ kind, status, errorCode: error_code })),
    };
  }
}
