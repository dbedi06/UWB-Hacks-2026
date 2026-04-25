-- Voicemap: PostgreSQL schema (3NF) for Neon / @neondatabase/serverless
-- Apply via Neon SQL editor or: psql "$DATABASE_URL" -f DB/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- severity_level: lookup only (id + display name for joins / UI)
-- ---------------------------------------------------------------------------
CREATE TABLE severity_level (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text        NOT NULL UNIQUE
);

COMMENT ON TABLE severity_level IS 'Domain table: band label for lookup; ordering is an app concern.';
COMMENT ON COLUMN severity_level.name IS 'Human-readable name (unique) for list/detail queries.';

-- ---------------------------------------------------------------------------
-- request_type: domain / lookup for report categories
-- ---------------------------------------------------------------------------
CREATE TABLE request_type (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text        NOT NULL UNIQUE,
  label              text        NOT NULL,
  description        text        NULL,
  severity_level_id  uuid        NOT NULL REFERENCES severity_level (id) ON DELETE RESTRICT,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE request_type IS 'Domain table: valid categories for map reports.';
COMMENT ON COLUMN request_type.severity_level_id IS 'Default severity level for this category (alerts, map styling).';

-- ---------------------------------------------------------------------------
-- app_user: optional reporter identity (keep emails/names out of report rows)
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NULL UNIQUE,
  phone      text        NULL UNIQUE,
  display_name text      NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_user IS 'Optional user record; report.app_user_id may be null for anonymous reports.';
COMMENT ON COLUMN app_user.phone IS 'E.164 or app-specific format; unique when not null.';

-- ---------------------------------------------------------------------------
-- report: one row per map report / user request
-- ---------------------------------------------------------------------------
CREATE TABLE report (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid         NOT NULL REFERENCES request_type (id) ON DELETE RESTRICT,
  issued_at        timestamptz  NOT NULL DEFAULT now(),
  latitude         double precision NOT NULL,
  longitude        double precision NOT NULL,
  app_user_id      uuid         NULL REFERENCES app_user (id) ON DELETE SET NULL,
  body             text         NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT report_latitude_check  CHECK (latitude  >= -90  AND latitude  <= 90),
  CONSTRAINT report_longitude_check CHECK (longitude >= -180 AND longitude <= 180)
);

COMMENT ON TABLE report IS 'User-submitted report with time, type, and coordinates.';
COMMENT ON COLUMN report.issued_at IS 'When the report was issued (may differ from created_at if backfilled).';
COMMENT ON COLUMN report.app_user_id IS 'Optional link to app_user; null if anonymous.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX report_issued_at_desc_idx   ON report (issued_at DESC);
CREATE INDEX report_request_type_id_idx  ON report (request_type_id);
CREATE INDEX report_app_user_id_idx      ON report (app_user_id) WHERE app_user_id IS NOT NULL;
CREATE INDEX request_type_is_active_idx  ON request_type (is_active) WHERE is_active = true;
CREATE INDEX request_type_severity_level_id_idx ON request_type (severity_level_id);

-- ---------------------------------------------------------------------------
-- Seed: severity_level names, then request types
-- ---------------------------------------------------------------------------
INSERT INTO severity_level (name) VALUES
  ('Low'),
  ('Medium'),
  ('High'),
  ('Critical');

INSERT INTO request_type (code, label, description, severity_level_id) VALUES
  (
    'hazard',
    'Hazard',
    'Physical hazards, spills, or unsafe conditions',
    (SELECT id FROM severity_level WHERE name = 'High' LIMIT 1)
  ),
  (
    'noise',
    'Noise',
    'Excessive or disruptive noise',
    (SELECT id FROM severity_level WHERE name = 'Low' LIMIT 1)
  ),
  (
    'infrastructure',
    'Infrastructure',
    'Damage or issues with roads, paths, or utilities',
    (SELECT id FROM severity_level WHERE name = 'Medium' LIMIT 1)
  ),
  (
    'other',
    'Other',
    'Reports that do not fit other categories',
    (SELECT id FROM severity_level WHERE name = 'Low' LIMIT 1)
  );
