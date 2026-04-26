-- =============================================================
-- VoiceMap — Migration 002
-- Add image_url column to reports for Cloudinary photo support
-- Target: Neon (PostgreSQL 16)
-- =============================================================

BEGIN;

ALTER TABLE reports
  ADD COLUMN image_url TEXT;

COMMIT;
