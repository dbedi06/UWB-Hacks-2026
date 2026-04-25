-- ─────────────────────────────────────────────────────────────────────
-- VoiceMap initial schema (reports + subscriptions + clusters)
--
-- Not applied automatically by the backend. This file is committed as
-- the single source of truth for the Supabase Postgres schema so that
-- when the JSON file store is swapped out, the column names already
-- match what `services/db.py` writes.
--
-- To apply: paste this into the Supabase SQL editor and run, or
-- `psql "$SUPABASE_DB_URL" -f migrations/001_initial.sql`.
--
-- Ownership:
--   reports        — Leo writes from the voice pipeline
--   subscriptions  — Abenezer owns (notifications subsystem)
--   clusters       — Abenezer owns (clustering job)
-- ─────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── reports ──────────────────────────────────────────────────────────
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Location
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    extracted_location_text TEXT,
    location_resolved BOOLEAN DEFAULT FALSE,

    -- Raw input
    transcript TEXT NOT NULL,

    -- Structured extraction
    category TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'emergency')),
    duration TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    impact_summary TEXT NOT NULL,
    confidence REAL CHECK (confidence BETWEEN 0 AND 1),

    -- Status (resolve/close workflow — stretch goal)
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'flagged')),

    -- Clustering (Abenezer populates; Leo writes NULL on insert)
    cluster_id UUID,

    -- Metadata
    mock BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_reports_location ON reports (lat, lng);
CREATE INDEX idx_reports_category ON reports (category);
CREATE INDEX idx_reports_created  ON reports (created_at DESC);
CREATE INDEX idx_reports_cluster  ON reports (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_reports_status   ON reports (status);

-- ─── subscriptions (Abenezer owns) ────────────────────────────────────
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contact_type TEXT NOT NULL CHECK (contact_type IN ('sms', 'email')),
    contact_value TEXT NOT NULL,
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── clusters (Abenezer owns; optional for MVP) ───────────────────────
CREATE TABLE clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category TEXT NOT NULL,
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    max_severity TEXT NOT NULL,
    report_count INTEGER NOT NULL DEFAULT 1
);
