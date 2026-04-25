-- Voicemap: PostgreSQL schema (3NF) for Neon / @neondatabase/serverless
-- Apply via Neon SQL editor or: psql "$DATABASE_URL" -f DB/schema.sql

-- gen_random_uuid() is built-in on PostgreSQL 13+ (Neon). For PG12, enable pgcrypto.
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- issue_type: lookup for report.issue_type_id (must exist before report)
-- ---------------------------------------------------------------------------
CREATE TABLE issue_type (
  id SERIAL PRIMARY KEY,
  name text NOT NULL UNIQUE
);

INSERT INTO issue_type (name) VALUES
  ('Pothole'),
  ('Streetlight'),
  ('Crosswalk'),
  ('Graffiti'),
  ('Flooding'),
  ('Debris'),
  ('Other');

-- ---------------------------------------------------------------------------
-- app_user: optional reporter identity (keep emails/names out of report rows)
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NULL UNIQUE,
  phone      text        NULL UNIQUE,
  latitude   double precision NOT NULL,
  longitude  double precision NOT NULL,
  display_name text      NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- report: one row per map report / user request
-- ---------------------------------------------------------------------------
CREATE TABLE report (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
  latitude          double precision NOT NULL,
  longitude         double precision NOT NULL,
  severity_level_id text,
  description       text NOT NULL,
  issue_type_id     int NOT NULL REFERENCES issue_type (id)
);
