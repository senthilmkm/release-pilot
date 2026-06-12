-- 002-add-is-pro.sql
--
-- Adds `is_pro` to the devices table so the cron poller can skip free-
-- tier devices. Push notifications are a Pro-only feature per the app's
-- paywall — until this migration, all registered devices were polled
-- regardless of subscription status, which leaked the feature for free.
--
-- Run via:
--   wrangler d1 execute release-pilot --local  --file=src/storage/d1-migrations/002-add-is-pro.sql   (dev)
--   wrangler d1 execute release-pilot --remote --file=src/storage/d1-migrations/002-add-is-pro.sql   (prod)
--
-- Idempotent enough for D1: ALTER TABLE ADD COLUMN errors if column
-- already exists, which is fine — we only run this once per env.
--
-- Default value 0 (free) for existing rows means the next cron cycle
-- after this migration stops sending pushes to anyone until they
-- re-register via the app (which will pass isPro=true for actual Pro
-- users). The lifecycle watcher in the app re-registers on app launch
-- AND on isPro change, so this is a one-cycle blackout at worst.

ALTER TABLE devices ADD COLUMN is_pro INTEGER NOT NULL DEFAULT 0;

-- Speeds up the cron's "list devices to poll" query, which now filters
-- by is_pro = 1.
CREATE INDEX IF NOT EXISTS idx_devices_pro_polled ON devices (is_pro, last_polled_at);
