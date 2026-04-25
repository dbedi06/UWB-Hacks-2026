-- Voicemap: PostgreSQL schema (3NF) for Neon / @neondatabase/serverless
-- Apply via Neon SQL editor or: psql "$DATABASE_URL" -f DB/schema.sql

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
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid         NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
  severity_level_id text         ,
  description     text NOT NULL,
  issue_type_id   int         NOT NULL REFERENCES issue_type (id)
);

CREATE TABLE ISSUE_TYPE (
  id SERIAL PRIMARY KEY,
  name text NOT NULL UNIQUE
);
-- ---------------------------------------------------------------------------
-- Seed: severity_level names, then request types
-- Must match components/VoiceMap.jsx (SEVERITIES + CATEGORIES): codes are UI category keys.
-- ---------------------------------------------------------------------------
INSERT INTO severity_level (name) VALUES
  ('Low'),
  ('Medium'),
  ('High'),
  ('Emergency');

  (
    'pothole',
    'Pothole',
    'Road surface damage, potholes, holes in pavement',
    (SELECT id FROM severity_level WHERE name = 'High' LIMIT 1)
  ),
  (
    'streetlight',
    'Streetlight',
    'Burned out, broken, or missing street lighting',
    (SELECT id FROM severity_level WHERE name = 'Medium' LIMIT 1)
  ),
  (
    'crosswalk',
    'Crosswalk',
    'Faded markings, missing signals, or crossing safety issues',
    (SELECT id FROM severity_level WHERE name = 'High' LIMIT 1)
  ),
  (
    'graffiti',
    'Graffiti',
    'Vandalism, spray paint, or tagging on public property',
    (SELECT id FROM severity_level WHERE name = 'Low' LIMIT 1)
  ),
  (
    'flooding',
    'Flooding',
    'Standing water, drainage backups, or storm-related pooling',
    (SELECT id FROM severity_level WHERE name = 'High' LIMIT 1)
  ),
  (
    'debris',
    'Debris/Hazard',
    'Obstructions on paths or roads: branches, trash, abandoned items',
    (SELECT id FROM severity_level WHERE name = 'Medium' LIMIT 1)
  ),
  (
    'other',
    'Other',
    'Reports that do not fit other categories',
    (SELECT id FROM severity_level WHERE name = 'Low' LIMIT 1)
  );
