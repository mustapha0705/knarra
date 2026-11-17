-- 0002: uploaded assets and their derived artifacts (M5).
--
-- An uploaded asset is a row in `assets` with verified = true: its metadata was
-- read from the stored file by the server. These columns describe the stored
-- original. They stay NULL for assets that are only reported by a browser.

ALTER TABLE assets
  ADD COLUMN byte_size bigint CHECK (byte_size > 0),
  ADD COLUMN sha256    text   CHECK (sha256 ~ '^[0-9a-f]{64}$');

-- One row per artifact kind per asset. The primary key is what makes
-- regeneration idempotent: generating a proxy again updates this row, and can
-- never create a second asset or a second proxy record.
CREATE TABLE asset_derivatives (
  project_id  text NOT NULL,
  asset_id    text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('thumbnail', 'proxy')),
  status      text NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  -- A short machine-readable reason when status is 'failed'. Never a path or stderr.
  error_code  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, asset_id, kind),
  FOREIGN KEY (project_id, asset_id) REFERENCES assets (project_id, id) ON DELETE CASCADE
);
