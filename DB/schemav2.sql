-- =============================================================
-- VoiceMap — Database Schema
-- Target: Neon (PostgreSQL 16)
-- =============================================================
BEGIN;
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- ENUMS
-- =============================================================

CREATE TYPE severity_level AS ENUM (
  'low',
  'moderate',
  'high',
  'emergency'
);

CREATE TYPE report_status AS ENUM (
  'pending',     -- submitted, AI hasn't assessed severity yet
  'active',      -- visible on map
  'resolved',    -- issue has been addressed
  'dismissed'    -- duplicate or invalid
);

CREATE TYPE contact_preference AS ENUM (
  'email',
  'sms',
  'both'
);

CREATE TYPE notification_channel AS ENUM (
  'email',
  'sms'
);

CREATE TYPE notification_status AS ENUM (
  'pending',
  'sent',
  'failed'
);

-- =============================================================
-- USERS
-- Optional — reports can exist without a user (anonymous path)
-- =============================================================

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) UNIQUE,
  phone               VARCHAR(30)  UNIQUE,
  display_name        VARCHAR(100),
  contact_preference  contact_preference NOT NULL DEFAULT 'email',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_contact_required CHECK (
    email IS NOT NULL OR phone IS NOT NULL
  )
);

-- =============================================================
-- REPORTS
-- Core table. user_id nullable = anonymous report.
-- severity is set by the AI asynchronously after submission —
-- it will be NULL while the report is in 'pending' status.
-- =============================================================

CREATE TABLE reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (one of these will be null)
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  session_token  UUID,                   -- anonymous device fingerprint

  -- Location (captured server-side from browser geolocation)
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,

  -- User-submitted content
  category       VARCHAR(100) NOT NULL,
  description    TEXT NOT NULL,

  -- Set by the AI after processing — null until then
  severity       severity_level,

  status         report_status NOT NULL DEFAULT 'pending',
  reported_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- AI-extracted richness
  tags           TEXT[]  NOT NULL DEFAULT '{}',
  confidence     REAL    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  duration       TEXT,

  -- Self-referential cluster head. NULL = this row is its own cluster head.
  -- Effective cluster id is COALESCE(cluster_id, id).
  cluster_id     UUID REFERENCES reports(id) ON DELETE SET NULL,

  CONSTRAINT reports_identity_required CHECK (
    user_id IS NOT NULL OR session_token IS NOT NULL
  )
);

-- =============================================================
-- SUBSCRIPTIONS
-- No account required — contact_override lets anonymous users
-- receive alerts by supplying an email/phone directly.
-- min_severity filters out noise (e.g. only notify for 'high'+).
-- =============================================================

CREATE TABLE subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Used when subscribing without an account
  contact_override   VARCHAR(255),
  contact_preference contact_preference NOT NULL DEFAULT 'email',

  -- Geographic watch area
  center_lat         DOUBLE PRECISION NOT NULL,
  center_lng         DOUBLE PRECISION NOT NULL,
  radius_meters      INT NOT NULL DEFAULT 1000,

  -- Optional filters
  category_filter    VARCHAR(100)[],    -- null = all categories
  min_severity       severity_level,    -- null = all severities

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT subscriptions_contact_required CHECK (
    user_id IS NOT NULL OR contact_override IS NOT NULL
  )
);

-- =============================================================
-- NOTIFICATIONS
-- Log of every message sent.
-- =============================================================

CREATE TABLE notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  report_id        UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  channel          notification_channel NOT NULL,
  status           notification_status NOT NULL DEFAULT 'pending',
  sent_at          TIMESTAMPTZ
);

-- =============================================================
-- INDEXES
-- =============================================================

-- Geo queries for map rendering and subscription radius checks
CREATE INDEX idx_reports_location       ON reports       USING BTREE (lat, lng);
CREATE INDEX idx_subscriptions_location ON subscriptions USING BTREE (center_lat, center_lng);

-- Common filter patterns
CREATE INDEX idx_reports_status      ON reports (status);
CREATE INDEX idx_reports_reported_at ON reports (reported_at DESC);
CREATE INDEX idx_reports_session     ON reports (session_token);

-- AI processing queue — find reports still awaiting severity assessment
CREATE INDEX idx_reports_pending_ai ON reports (reported_at ASC)
  WHERE severity IS NULL AND status = 'pending';

-- Notification delivery queue
CREATE INDEX idx_notifications_pending ON notifications (status)
  WHERE status = 'pending';

-- Tag filter — fast lookups like WHERE tags @> ARRAY['near_school']
CREATE INDEX reports_tags_gin_idx ON reports USING GIN (tags);

-- Fast lookups of all members of a cluster (partial: most reports
-- have cluster_id IS NULL since they're solo / their own head).
CREATE INDEX reports_cluster_id_idx ON reports (cluster_id) WHERE cluster_id IS NOT NULL;

-- =============================================================
-- FUNCTIONS — USERS
-- =============================================================

CREATE OR REPLACE FUNCTION create_user(
  p_email             VARCHAR(255),
  p_phone             VARCHAR(30),
  p_display_name      VARCHAR(100),
  p_contact_pref      contact_preference DEFAULT 'email'
)
RETURNS users AS $$
DECLARE
  v_user users;
BEGIN
  INSERT INTO users (email, phone, display_name, contact_preference)
  VALUES (p_email, p_phone, p_display_name, p_contact_pref)
  RETURNING * INTO v_user;

  RETURN v_user;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A user with that email or phone already exists.';
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_user(
  p_user_id UUID
)
RETURNS users AS $$
  SELECT * FROM users WHERE id = p_user_id;
$$ LANGUAGE sql STABLE;


CREATE OR REPLACE FUNCTION find_user_by_contact(
  p_email VARCHAR(255) DEFAULT NULL,
  p_phone VARCHAR(30)  DEFAULT NULL
)
RETURNS users AS $$
  SELECT * FROM users
  WHERE
    (p_email IS NOT NULL AND email = p_email) OR
    (p_phone IS NOT NULL AND phone = p_phone)
  LIMIT 1;
$$ LANGUAGE sql STABLE;


CREATE OR REPLACE FUNCTION update_user(
  p_user_id       UUID,
  p_email         VARCHAR(255)       DEFAULT NULL,
  p_phone         VARCHAR(30)        DEFAULT NULL,
  p_display_name  VARCHAR(100)       DEFAULT NULL,
  p_contact_pref  contact_preference DEFAULT NULL
)
RETURNS users AS $$
DECLARE
  v_user users;
BEGIN
  UPDATE users SET
    email              = COALESCE(p_email,        email),
    phone              = COALESCE(p_phone,        phone),
    display_name       = COALESCE(p_display_name, display_name),
    contact_preference = COALESCE(p_contact_pref, contact_preference)
  WHERE id = p_user_id
  RETURNING * INTO v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found.', p_user_id;
  END IF;

  RETURN v_user;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'That email or phone is already in use by another account.';
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION delete_user(
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  DELETE FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found.', p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- =============================================================
-- FUNCTIONS — REPORTS
-- =============================================================

CREATE OR REPLACE FUNCTION submit_report(
  p_lat            DOUBLE PRECISION,
  p_lng            DOUBLE PRECISION,
  p_category       VARCHAR(100),
  p_description    TEXT,
  p_user_id        UUID DEFAULT NULL,
  p_session_token  UUID DEFAULT NULL
)
RETURNS reports AS $$
DECLARE
  v_report reports;
BEGIN
  INSERT INTO reports (user_id, session_token, lat, lng, category, description)
  VALUES (p_user_id, p_session_token, p_lat, p_lng, p_category, p_description)
  RETURNING * INTO v_report;

  RETURN v_report;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_report(
  p_report_id UUID
)
RETURNS reports AS $$
  SELECT * FROM reports WHERE id = p_report_id;
$$ LANGUAGE sql STABLE;


CREATE OR REPLACE FUNCTION get_reports_in_bounds(
  p_lat_min    DOUBLE PRECISION,
  p_lat_max    DOUBLE PRECISION,
  p_lng_min    DOUBLE PRECISION,
  p_lng_max    DOUBLE PRECISION,
  p_category   VARCHAR(100)   DEFAULT NULL,
  p_severity   severity_level DEFAULT NULL
)
RETURNS SETOF reports AS $$
  SELECT * FROM reports
  WHERE
    status   = 'active'
    AND lat  BETWEEN p_lat_min AND p_lat_max
    AND lng  BETWEEN p_lng_min AND p_lng_max
    AND (p_category IS NULL OR category = p_category)
    AND (p_severity IS NULL OR severity = p_severity)
  ORDER BY reported_at DESC;
$$ LANGUAGE sql STABLE;


CREATE OR REPLACE FUNCTION get_pending_reports(
  p_limit INT DEFAULT 50
)
RETURNS SETOF reports AS $$
  SELECT * FROM reports
  WHERE severity IS NULL AND status = 'pending'
  ORDER BY reported_at ASC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;


CREATE OR REPLACE FUNCTION set_report_severity(
  p_report_id  UUID,
  p_severity   severity_level
)
RETURNS reports AS $$
DECLARE
  v_report reports;
BEGIN
  UPDATE reports
  SET severity = p_severity, status = 'active'
  WHERE id = p_report_id
  RETURNING * INTO v_report;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report % not found.', p_report_id;
  END IF;

  PERFORM queue_notifications_for_report(p_report_id);

  RETURN v_report;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION close_report(
  p_report_id  UUID,
  p_status     report_status
)
RETURNS reports AS $$
DECLARE
  v_report reports;
BEGIN
  IF p_status NOT IN ('resolved', 'dismissed') THEN
    RAISE EXCEPTION 'close_report only accepts resolved or dismissed, got: %', p_status;
  END IF;

  UPDATE reports
  SET status = p_status
  WHERE id = p_report_id
  RETURNING * INTO v_report;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report % not found.', p_report_id;
  END IF;

  RETURN v_report;
END;
$$ LANGUAGE plpgsql;


-- =============================================================
-- FUNCTIONS — SUBSCRIPTIONS
-- =============================================================

CREATE OR REPLACE FUNCTION create_subscription(
  p_center_lat       DOUBLE PRECISION,
  p_center_lng       DOUBLE PRECISION,
  p_radius_meters    INT                DEFAULT 1000,
  p_user_id          UUID               DEFAULT NULL,
  p_contact_override VARCHAR(255)       DEFAULT NULL,
  p_contact_pref     contact_preference DEFAULT 'email',
  p_category_filter  VARCHAR(100)[]     DEFAULT NULL,
  p_min_severity     severity_level     DEFAULT NULL
)
RETURNS subscriptions AS $$
DECLARE
  v_sub subscriptions;
BEGIN
  INSERT INTO subscriptions (
    user_id, contact_override, contact_preference,
    center_lat, center_lng, radius_meters,
    category_filter, min_severity
  )
  VALUES (
    p_user_id, p_contact_override, p_contact_pref,
    p_center_lat, p_center_lng, p_radius_meters,
    p_category_filter, p_min_severity
  )
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_user_subscriptions(
  p_user_id UUID
)
RETURNS SETOF subscriptions AS $$
  SELECT * FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC;
$$ LANGUAGE sql STABLE;


CREATE OR REPLACE FUNCTION update_subscription(
  p_sub_id           UUID,
  p_radius_meters    INT                DEFAULT NULL,
  p_category_filter  VARCHAR(100)[]     DEFAULT NULL,
  p_min_severity     severity_level     DEFAULT NULL,
  p_contact_pref     contact_preference DEFAULT NULL
)
RETURNS subscriptions AS $$
DECLARE
  v_sub subscriptions;
BEGIN
  UPDATE subscriptions SET
    radius_meters      = COALESCE(p_radius_meters,   radius_meters),
    category_filter    = COALESCE(p_category_filter, category_filter),
    min_severity       = COALESCE(p_min_severity,    min_severity),
    contact_preference = COALESCE(p_contact_pref,    contact_preference)
  WHERE id = p_sub_id
  RETURNING * INTO v_sub;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found.', p_sub_id;
  END IF;

  RETURN v_sub;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION delete_subscription(
  p_sub_id UUID
)
RETURNS VOID AS $$
BEGIN
  DELETE FROM subscriptions WHERE id = p_sub_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found.', p_sub_id;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- =============================================================
-- FUNCTIONS — NOTIFICATIONS
-- =============================================================

CREATE OR REPLACE FUNCTION queue_notifications_for_report(
  p_report_id UUID
)
RETURNS INT AS $$
DECLARE
  v_report       reports;
  v_sub          subscriptions;
  v_channel      notification_channel;
  v_queued       INT := 0;
  v_earth_radius CONSTANT FLOAT := 6371000;
BEGIN
  SELECT * INTO v_report FROM reports WHERE id = p_report_id;

  FOR v_sub IN
    SELECT * FROM subscriptions
    WHERE
      (v_earth_radius * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(v_report.lat - center_lat) / 2), 2) +
        COS(RADIANS(center_lat)) * COS(RADIANS(v_report.lat)) *
        POWER(SIN(RADIANS(v_report.lng - center_lng) / 2), 2)
      ))) <= radius_meters
      AND (category_filter IS NULL OR v_report.category = ANY(category_filter))
      AND (
        min_severity IS NULL OR
        v_report.severity::TEXT >= min_severity::TEXT
      )
  LOOP
    v_channel := CASE
      WHEN v_sub.contact_preference = 'sms' THEN 'sms'::notification_channel
      ELSE 'email'::notification_channel
    END;

    INSERT INTO notifications (subscription_id, report_id, channel)
    VALUES (v_sub.id, p_report_id, v_channel);

    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
END;
$$ LANGUAGE plpgsql;


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
    COALESCE(u.email, u.phone, s.contact_override) AS contact,
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


CREATE OR REPLACE FUNCTION mark_notification_sent(
  p_notification_id  UUID,
  p_success          BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  UPDATE notifications SET
    status  = CASE WHEN p_success THEN 'sent'::notification_status
                                  ELSE 'failed'::notification_status END,
    sent_at = CASE WHEN p_success THEN NOW() ELSE NULL END
  WHERE id = p_notification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification % not found.', p_notification_id;
  END IF;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION retry_failed_notifications()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE notifications
  SET status = 'pending'
  WHERE status = 'failed';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;