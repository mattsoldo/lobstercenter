-- Migration: Replace custom auth with Clerk
-- Adds clerk_user_id to human_accounts, drops password_hash, drops session table

ALTER TABLE human_accounts
  ADD COLUMN clerk_user_id VARCHAR(255) UNIQUE;

ALTER TABLE human_accounts
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE human_accounts
  DROP COLUMN password_hash;

DROP TABLE IF EXISTS session;
