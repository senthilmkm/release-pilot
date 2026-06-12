-- Release Pilot Worker schema
--
-- Run via:
--   wrangler d1 execute release-pilot --local  --file=src/storage/d1-schema.sql   (dev)
--   wrangler d1 execute release-pilot --remote --file=src/storage/d1-schema.sql   (prod)
--
-- Designed for SQLite (D1's flavor). Booleans are stored as INTEGER 0/1.

-- ---------------------------------------------------------------------------
-- devices
-- ---------------------------------------------------------------------------
-- One row per (deviceToken, issuerId) pair. A user with two ASC accounts +
-- two iPhones = 4 rows. That's fine — push fanout is per-row.
CREATE TABLE IF NOT EXISTS devices (
  device_token        TEXT NOT NULL,             -- APNs hex token from iOS
  issuer_id           TEXT NOT NULL,             -- ASC Issuer UUID
  key_id              TEXT NOT NULL,             -- ASC key id (10 char)
  p8_ciphertext_b64   TEXT NOT NULL,             -- AES-GCM(.p8 PEM) base64
  p8_iv_b64           TEXT NOT NULL,             -- per-row IV (12 bytes)
  p8_salt_b64         TEXT NOT NULL,             -- per-row 16-byte salt mixed into the key
  created_at          INTEGER NOT NULL,          -- epoch seconds
  last_polled_at      INTEGER,                   -- epoch seconds (null = never polled)
  last_polled_ok      INTEGER NOT NULL DEFAULT 1,-- 0 once a poll fails consecutively
  consecutive_errors  INTEGER NOT NULL DEFAULT 0,-- gates the "device is dead, stop polling" logic
  PRIMARY KEY (device_token, issuer_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_last_polled ON devices (last_polled_at);

-- ---------------------------------------------------------------------------
-- known_states
-- ---------------------------------------------------------------------------
-- Most-recent semantic state we observed for each (issuer, app, version).
-- The diff between rows here and a fresh ASC poll triggers pushes.
--
-- A single row is keyed by (issuer_id, app_id) — we only track the
-- "currently in-flight or live" version per app to keep the table small.
CREATE TABLE IF NOT EXISTS known_states (
  issuer_id          TEXT NOT NULL,
  app_id             TEXT NOT NULL,             -- ASC apps resource id
  app_name           TEXT NOT NULL,             -- denormalized for push payload
  bundle_id          TEXT NOT NULL,             -- denormalized for push payload
  semantic_state     TEXT NOT NULL,             -- our 7-state enum string
  raw_state          TEXT,                      -- the raw ASC state string
  version_string     TEXT NOT NULL,             -- e.g. "1.8.23"
  build_number       TEXT,                      -- e.g. "29" (nullable)
  observed_at        INTEGER NOT NULL,          -- epoch seconds we last wrote this row
  PRIMARY KEY (issuer_id, app_id)
);

-- ---------------------------------------------------------------------------
-- push_log
-- ---------------------------------------------------------------------------
-- Append-only audit trail for the last 30 days of pushes we sent.
-- Used by `GET /v1/diagnostics?deviceToken=...` for in-app debugging,
-- and to dedupe pushes if the cron double-fires.
CREATE TABLE IF NOT EXISTS push_log (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  device_token       TEXT NOT NULL,
  issuer_id          TEXT NOT NULL,
  app_id             TEXT NOT NULL,
  previous_state     TEXT,
  new_state          TEXT NOT NULL,
  payload_json       TEXT NOT NULL,             -- the exact APNs payload we sent
  apns_status        INTEGER,                   -- HTTP status from APNs response
  apns_reason        TEXT,                      -- error reason if non-200
  sent_at            INTEGER NOT NULL           -- epoch seconds
);

CREATE INDEX IF NOT EXISTS idx_push_log_device ON push_log (device_token, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_log_dedupe ON push_log (device_token, app_id, new_state, sent_at);
