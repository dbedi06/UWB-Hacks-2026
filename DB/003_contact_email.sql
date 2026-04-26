-- =============================================================
-- VoiceMap — Migration 003
-- Add contact_email to subscriptions for email-channel alerts.
-- Stripped from the email-notifications branch's full migration so we
-- only get the column + constraint update; queue/Lambda functions are
-- intentionally excluded (we dispatch inline like SMS).
-- Target: Neon (PostgreSQL 16)
-- =============================================================

BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_contact_required;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_contact_required CHECK (
  user_id IS NOT NULL
  OR (
    (contact_preference = 'email'::contact_preference AND contact_email IS NOT NULL)
    OR (contact_preference = 'sms'::contact_preference AND contact_override IS NOT NULL)
    OR (
      contact_preference = 'both'::contact_preference
      AND contact_override IS NOT NULL
      AND contact_email IS NOT NULL
    )
  )
);

COMMIT;
