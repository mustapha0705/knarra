import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  COMPOSITION_SCHEMA_VERSION,
  VERTICAL_1080P30,
  assetRefSchema,
  parseComposition,
  structuralIssues,
  validateComposition,
  type Composition,
  type Issue,
} from "../domain/composition/index.js";
import type {
  ProjectRecord,
  ProjectRepository,
  ProjectSummary,
  StoredAsset,
  VersionRecord,
  VersionSummary,
} from "../persistence/projectRepository.js";

// Application rules for projects: what may be saved, and what a version is.
// The repository stores; this decides.

export const MAX_EDITOR_STATE_BYTES = 2 * 1024 * 1024;
export const MAX_PROJECT_ASSETS = 500;

export type ServiceError =
  | { kind: "invalid"; issues: Issue[] }
  | { kind: "not-found" }
  | { kind: "stale"; currentRevision: number }
  /** Stored data could not be read back. A server problem, not a client one. */
  | { kind: "corrupt" };

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

/** A project as the API returns it: the Composition is parsed and current. */
export interface ProjectView extends ProjectSummary {
  composition: Composition;
  editorState: Record<string, unknown>;
  assets: StoredAsset[];
}

export interface VersionView extends VersionSummary {
  composition: Composition;
  editorState: Record<string, unknown>;
  assets: StoredAsset[];
}

const titleSchema = z.string().trim().min(1).max(200);

const createProjectSchema = z.strictObject({ title: titleSchema });

// The client cannot mark an asset as verified: only the server can, once it
// has read the stored file (M5).
const assetInputSchema = assetRefSchema.extend({ name: z.string().trim().min(1).max(255) });

const saveProjectSchema = z.strictObject({
  expectedRevision: z.int().min(1),
  title: titleSchema,
  composition: z.unknown(),
  editorState: z.record(z.string(), z.unknown()),
  assets: z.array(assetInputSchema).max(MAX_PROJECT_ASSETS),
});

const createVersionSchema = z.strictObject({
  expectedRevision: z.int().min(1).optional(),
  label: z.string().trim().min(1).max(200).optional(),
});

const invalid = (issues: Issue[]): { ok: false; error: ServiceError } => ({ ok: false, error: { kind: "invalid", issues } });
const failed = (error: ServiceError): { ok: false; error: ServiceError } => ({ ok: false, error });
const done = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

/** The Composition every new project starts with: valid structure, nothing on it. */
export function emptyComposition(projectId: string): Composition {
  return {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    id: projectId,
    presetId: VERTICAL_1080P30.id,
    tracks: [
      { id: "track-visual", kind: "visual", clips: [] },
      { id: "track-audio", kind: "audio", clips: [] },
    ],
  };
}

export class ProjectService {
  private readonly projects: ProjectRepository;

  constructor(projects: ProjectRepository) {
    this.projects = projects;
  }

  async create(input: unknown): Promise<Outcome<ProjectView>> {
    const parsed = createProjectSchema.safeParse(input);
    if (!parsed.success) return invalid(structuralIssues(parsed.error.issues));

    const id = randomUUID();
    const record = await this.projects.create({
      id,
      title: parsed.data.title,
      schemaVersion: COMPOSITION_SCHEMA_VERSION,
      composition: emptyComposition(id),
    });
    return this.view(record);
  }

  list(): Promise<ProjectSummary[]> {
    return this.projects.list();
  }

  async get(id: string): Promise<Outcome<ProjectView>> {
    const record = await this.projects.get(id);
    return record ? this.view(record) : failed({ kind: "not-found" });
  }

  /**
   * Saves the current working state. A project being edited may be
   * incomplete (an empty timeline, for instance), so only the structure is
   * checked here. Whether it can be rendered is checked when a version is made.
   */
  async save(id: string, input: unknown): Promise<Outcome<ProjectView>> {
    const parsed = saveProjectSchema.safeParse(input);
    if (!parsed.success) return invalid(structuralIssues(parsed.error.issues));
    const { expectedRevision, title, editorState, assets } = parsed.data;

    const composition = parseComposition(parsed.data.composition);
    if (!composition.ok) {
      return invalid(composition.error.map((issue) => ({ ...issue, path: ["composition", ...issue.path] })));
    }
    if (composition.value.id !== id) {
      return invalid([
        {
          code: "INVALID_STRUCTURE",
          path: ["composition", "id"],
          message: `The composition belongs to "${composition.value.id}", not to this project. A project's composition must have the project's ID.`,
        },
      ]);
    }

    const seen = new Set<string>();
    for (const [index, asset] of assets.entries()) {
      if (seen.has(asset.id)) {
        return invalid([
          {
            code: "ASSET_CATALOG_DUPLICATE_ID",
            path: ["assets", index, "id"],
            message: `Asset ID "${asset.id}" appears more than once. Each asset needs a unique ID.`,
          },
        ]);
      }
      seen.add(asset.id);
    }

    if (JSON.stringify(editorState).length > MAX_EDITOR_STATE_BYTES) {
      return invalid([
        {
          code: "INVALID_STRUCTURE",
          path: ["editorState"],
          message: "The editor state is too large to save. Media must not be embedded in it.",
        },
      ]);
    }

    const result = await this.projects.save(id, {
      expectedRevision,
      title,
      schemaVersion: composition.value.schemaVersion,
      composition: composition.value,
      editorState,
      assets: assets.map((asset) => ({ ...asset, verified: false })),
    });

    if (result.status === "not-found") return failed({ kind: "not-found" });
    if (result.status === "stale") return failed({ kind: "stale", currentRevision: result.currentRevision });
    return this.view(result.project);
  }

  async delete(id: string): Promise<Outcome<null>> {
    return (await this.projects.delete(id)) ? done(null) : failed({ kind: "not-found" });
  }

  /**
   * Makes an immutable version of the saved state. Versions are what render
   * jobs bind to (invariant 10), so the Composition must be fully valid.
   */
  async createVersion(id: string, input: unknown): Promise<Outcome<VersionView>> {
    const parsed = createVersionSchema.safeParse(input ?? {});
    if (!parsed.success) return invalid(structuralIssues(parsed.error.issues));

    const current = await this.get(id);
    if (!current.ok) return current;
    const { expectedRevision, label } = parsed.data;
    if (expectedRevision !== undefined && expectedRevision !== current.value.revision) {
      return failed({ kind: "stale", currentRevision: current.value.revision });
    }

    const issues = validateComposition(current.value.composition, current.value.assets);
    if (issues.length > 0) return invalid(issues);

    // Pin the snapshot to the revision that was just validated.
    const result = await this.projects.createVersion(id, {
      expectedRevision: current.value.revision,
      ...(label === undefined ? {} : { label }),
    });
    if (result.status === "not-found") return failed({ kind: "not-found" });
    if (result.status === "stale") return failed({ kind: "stale", currentRevision: result.currentRevision });
    return this.versionView(result.version);
  }

  async listVersions(id: string): Promise<Outcome<VersionSummary[]>> {
    if (!(await this.projects.get(id))) return failed({ kind: "not-found" });
    return done(await this.projects.listVersions(id));
  }

  async getVersion(id: string, versionId: string): Promise<Outcome<VersionView>> {
    const record = await this.projects.getVersion(id, versionId);
    return record ? this.versionView(record) : failed({ kind: "not-found" });
  }

  private view(record: ProjectRecord): Outcome<ProjectView> {
    // Reading goes through parseComposition too, so data saved by an older
    // schema version is upgraded on the way out.
    const composition = parseComposition(record.composition);
    if (!composition.ok) return failed({ kind: "corrupt" });
    const { schemaVersion: _stored, composition: _raw, ...rest } = record;
    return done({ ...rest, composition: composition.value });
  }

  private versionView(record: VersionRecord): Outcome<VersionView> {
    const composition = parseComposition(record.composition);
    if (!composition.ok) return failed({ kind: "corrupt" });
    const { schemaVersion: _stored, composition: _raw, ...rest } = record;
    return done({ ...rest, composition: composition.value });
  }
}
