-- =============================================================
-- VoiceMap — Migration 002
-- Add image_url column to reports for Cloudinary photo support
-- Target: Neon (PostgreSQL 16)
-- =============================================================

BEGIN;

ALTER TABLE reports
  ADD COLUMN image_url TEXT;

ALTER TABLE users
  ALTER COLUMN home_lat  TYPE DOUBLE PRECISION USING home_lat::double precision,
  ALTER COLUMN home_long TYPE DOUBLE PRECISION USING home_long::double precision,
  ADD COLUMN home_radius  DOUBLE PRECISION;

COMMIT;
