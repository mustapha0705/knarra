-- 0001: projects, their assets, immutable versions, and render jobs.
--
-- IDs are text in the kernel ID format (letters, digits, '_' and '-'), checked
-- here as well as in the application, so an ID can never be read as a path.
-- All durations are integer milliseconds (ADR 0005).

CREATE TABLE projects (
  id              text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- Optimistic concurrency: every successful save adds 1. A save must name the
  -- revision it was based on.
  revision        integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  -- The render model. Kept apart from editor_state on purpose (ADR 0001).
  schema_version  integer NOT NULL CHECK (schema_version >= 1),
  composition     jsonb NOT NULL,
  -- Canvas and other editor-only state. Opaque to the backend; never rendered.
  editor_state    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_updated_at_idx ON projects (updated_at DESC);

CREATE TABLE assets (
  project_id   text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id           text NOT NULL CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  kind         text NOT NULL CHECK (kind IN ('image', 'video', 'audio')),
  -- Display only. Never used as a path, a filename on disk, or an FFmpeg argument.
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  duration_ms  integer CHECK (duration_ms >= 0),
  width        integer CHECK (width > 0),
  height       integer CHECK (height > 0),
  has_audio    boolean NOT NULL DEFAULT false,
  -- false: metadata reported by the browser. true: read from the stored file by
  -- the server (from M5). Only verified metadata may be trusted for rendering.
  verified     boolean NOT NULL DEFAULT false,
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);

CREATE TABLE project_versions (
  id                text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  project_id        text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  version_number    integer NOT NULL CHECK (version_number >= 1),
  -- The project revision this snapshot was taken from.
  project_revision  integer NOT NULL CHECK (project_revision >= 1),
  label             text CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 200),
  schema_version    integer NOT NULL CHECK (schema_version >= 1),
  composition       jsonb NOT NULL,
  editor_state      jsonb NOT NULL,
  -- The asset catalog as it was. References to assets, not copies of media.
  assets            jsonb NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_number)
);

-- Versions are immutable (invariants 9 and 10): a render job must be able to
-- rely on the snapshot it was bound to. Deleting a whole project still removes
-- its versions.
CREATE FUNCTION forbid_project_version_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'project versions are immutable' USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER project_versions_immutable
  BEFORE UPDATE ON project_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_project_version_update();

-- Created now so every render job is bound to a version from the first day.
-- M6 defines the job lifecycle and may add columns in a later migration.
CREATE TABLE render_jobs (
  id                  text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  project_version_id  text NOT NULL REFERENCES project_versions (id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress            real NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  error_code          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  finished_at         timestamptz
);

CREATE INDEX render_jobs_version_idx ON render_jobs (project_version_id);
