/**
 * Bindings + secrets exposed to the Worker.
 *
 * These are populated by Cloudflare at runtime — typed here so we can
 * reference them safely.
 *
 * Secrets are set via `wrangler secret put` and NEVER committed.
 * Public vars are committed in `wrangler.toml`.
 */
export interface Env {
  // Bindings (wrangler.toml)
  DB: D1Database;

  // Secrets (wrangler secret put)
  APNS_TEAM_ID: string;
  APNS_KEY_ID: string;
  APNS_KEY_P8: string;
  APNS_BUNDLE_ID: string;
  /** 32 random bytes, base64-encoded. */
  CREDS_MASTER_KEY_B64: string;

  // Public vars (wrangler.toml [vars])
  APNS_HOST: string;
  POLL_CONCURRENCY: string;
  POLL_BATCH_SIZE: string;
}
