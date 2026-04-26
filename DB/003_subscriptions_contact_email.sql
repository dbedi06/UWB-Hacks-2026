-- =============================================================
-- VoiceMap — Migration 003
-- Optional contact_email for "both" (SMS on contact_override, email for SES)
-- and updated get_pending_notifications to resolve the correct address.
-- Target: Neon (PostgreSQL 16)
-- =============================================================

BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

-- Email destination for channel=email: both uses contact_email; email-only
-- uses contact_override as the address.
CREATE OR REPLACE FUNCTION get_pending_notifications(
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  notification_id  UUID,
  channel          notification_channel,
  contact          VARCHAR(255),
  report_id        UUID,
  category         VARCHAR(100),
  severity         severity_level,
  description      TEXT,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION
) AS $$
  SELECT
    n.id,
    n.channel,
    COALESCE(
      NULLIF(TRIM(s.contact_email), ''),
      u.email,
      CASE WHEN s.contact_preference = 'email' THEN NULLIF(TRIM(s.contact_override), '') ELSE NULL END
    ) AS contact,
    r.id,
    r.category,
    r.severity,
    r.description,
    r.lat,
    r.lng
  FROM notifications n
  JOIN subscriptions s ON s.id = n.subscription_id
  JOIN reports       r ON r.id = n.report_id
  LEFT JOIN users    u ON u.id = s.user_id
  WHERE n.status = 'pending'
  ORDER BY n.id
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

COMMIT;
