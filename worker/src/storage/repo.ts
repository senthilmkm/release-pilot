import type { SemanticState } from '../lib/semantic-state';
import type { EncryptedCreds } from '../crypto/creds';

/**
 * Typed wrapper around D1.
 *
 * D1's API is fluent SQL — we keep one tiny module that knows the
 * column names so the rest of the worker can pass DTOs.
 */

// ---------- devices ----------

export type DeviceRow = {
  deviceToken: string;
  issuerId: string;
  keyId: string;
  p8: EncryptedCreds;
  createdAt: number;
  lastPolledAt: number | null;
  consecutiveErrors: number;
};

export async function upsertDevice(args: {
  db: D1Database;
  deviceToken: string;
  issuerId: string;
  keyId: string;
  p8: EncryptedCreds;
  nowSec: number;
}): Promise<void> {
  await args.db
    .prepare(
      `INSERT INTO devices (device_token, issuer_id, key_id, p8_ciphertext_b64, p8_iv_b64, p8_salt_b64, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_token, issuer_id) DO UPDATE SET
         key_id = excluded.key_id,
         p8_ciphertext_b64 = excluded.p8_ciphertext_b64,
         p8_iv_b64 = excluded.p8_iv_b64,
         p8_salt_b64 = excluded.p8_salt_b64,
         consecutive_errors = 0,
         last_polled_ok = 1`,
    )
    .bind(
      args.deviceToken,
      args.issuerId,
      args.keyId,
      args.p8.ciphertextB64,
      args.p8.ivB64,
      args.p8.saltB64,
      args.nowSec,
    )
    .run();
}

export async function deleteDevice(args: {
  db: D1Database;
  deviceToken: string;
  issuerId?: string;
}): Promise<number> {
  const stmt = args.issuerId
    ? args.db
        .prepare('DELETE FROM devices WHERE device_token = ? AND issuer_id = ?')
        .bind(args.deviceToken, args.issuerId)
    : args.db
        .prepare('DELETE FROM devices WHERE device_token = ?')
        .bind(args.deviceToken);
  const result = await stmt.run();
  return result.meta.changes;
}

export async function listDevicesBatch(args: {
  db: D1Database;
  limit: number;
}): Promise<DeviceRow[]> {
  // Oldest-polled first so all devices get a fair turn even when the
  // batch limit is binding.
  const result = await args.db
    .prepare(
      `SELECT device_token, issuer_id, key_id,
              p8_ciphertext_b64, p8_iv_b64, p8_salt_b64,
              created_at, last_polled_at, consecutive_errors
         FROM devices
        WHERE consecutive_errors < 5
        ORDER BY COALESCE(last_polled_at, 0) ASC
        LIMIT ?`,
    )
    .bind(args.limit)
    .all<{
      device_token: string;
      issuer_id: string;
      key_id: string;
      p8_ciphertext_b64: string;
      p8_iv_b64: string;
      p8_salt_b64: string;
      created_at: number;
      last_polled_at: number | null;
      consecutive_errors: number;
    }>();

  return (result.results ?? []).map((row) => ({
    deviceToken: row.device_token,
    issuerId: row.issuer_id,
    keyId: row.key_id,
    p8: {
      ciphertextB64: row.p8_ciphertext_b64,
      ivB64: row.p8_iv_b64,
      saltB64: row.p8_salt_b64,
    },
    createdAt: row.created_at,
    lastPolledAt: row.last_polled_at,
    consecutiveErrors: row.consecutive_errors,
  }));
}

export async function markDevicePolled(args: {
  db: D1Database;
  deviceToken: string;
  issuerId: string;
  nowSec: number;
  ok: boolean;
}): Promise<void> {
  if (args.ok) {
    await args.db
      .prepare(
        `UPDATE devices
            SET last_polled_at = ?, last_polled_ok = 1, consecutive_errors = 0
          WHERE device_token = ? AND issuer_id = ?`,
      )
      .bind(args.nowSec, args.deviceToken, args.issuerId)
      .run();
  } else {
    await args.db
      .prepare(
        `UPDATE devices
            SET last_polled_at = ?, last_polled_ok = 0,
                consecutive_errors = consecutive_errors + 1
          WHERE device_token = ? AND issuer_id = ?`,
      )
      .bind(args.nowSec, args.deviceToken, args.issuerId)
      .run();
  }
}

// ---------- known_states ----------

export type KnownStateRow = {
  issuerId: string;
  appId: string;
  appName: string;
  bundleId: string;
  semanticState: SemanticState;
  versionString: string;
  buildNumber: string | null;
};

export async function getKnownStates(args: {
  db: D1Database;
  issuerId: string;
}): Promise<Map<string, KnownStateRow>> {
  const result = await args.db
    .prepare(
      `SELECT issuer_id, app_id, app_name, bundle_id, semantic_state, version_string, build_number
         FROM known_states WHERE issuer_id = ?`,
    )
    .bind(args.issuerId)
    .all<{
      issuer_id: string;
      app_id: string;
      app_name: string;
      bundle_id: string;
      semantic_state: string;
      version_string: string;
      build_number: string | null;
    }>();
  const out = new Map<string, KnownStateRow>();
  for (const row of result.results ?? []) {
    out.set(row.app_id, {
      issuerId: row.issuer_id,
      appId: row.app_id,
      appName: row.app_name,
      bundleId: row.bundle_id,
      semanticState: row.semantic_state as SemanticState,
      versionString: row.version_string,
      buildNumber: row.build_number,
    });
  }
  return out;
}

export async function upsertKnownState(args: {
  db: D1Database;
  issuerId: string;
  appId: string;
  appName: string;
  bundleId: string;
  semanticState: SemanticState;
  rawState: string | null;
  versionString: string;
  buildNumber: string | null;
  nowSec: number;
}): Promise<void> {
  await args.db
    .prepare(
      `INSERT INTO known_states
         (issuer_id, app_id, app_name, bundle_id, semantic_state, raw_state, version_string, build_number, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(issuer_id, app_id) DO UPDATE SET
         app_name        = excluded.app_name,
         bundle_id       = excluded.bundle_id,
         semantic_state  = excluded.semantic_state,
         raw_state       = excluded.raw_state,
         version_string  = excluded.version_string,
         build_number    = excluded.build_number,
         observed_at     = excluded.observed_at`,
    )
    .bind(
      args.issuerId,
      args.appId,
      args.appName,
      args.bundleId,
      args.semanticState,
      args.rawState,
      args.versionString,
      args.buildNumber,
      args.nowSec,
    )
    .run();
}

// ---------- push_log ----------

export type PushLogEntry = {
  deviceToken: string;
  issuerId: string;
  appId: string;
  previousState: SemanticState | null;
  newState: SemanticState;
  payloadJson: string;
  apnsStatus: number | null;
  apnsReason: string | null;
  sentAt: number;
};

export async function insertPushLog(args: {
  db: D1Database;
  entry: PushLogEntry;
}): Promise<void> {
  const e = args.entry;
  await args.db
    .prepare(
      `INSERT INTO push_log
         (device_token, issuer_id, app_id, previous_state, new_state,
          payload_json, apns_status, apns_reason, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      e.deviceToken,
      e.issuerId,
      e.appId,
      e.previousState,
      e.newState,
      e.payloadJson,
      e.apnsStatus,
      e.apnsReason,
      e.sentAt,
    )
    .run();
}

export async function recentPushesForDevice(args: {
  db: D1Database;
  deviceToken: string;
  sinceSec: number;
}): Promise<Array<{ appId: string; newState: SemanticState; sentAtMs: number }>> {
  const result = await args.db
    .prepare(
      `SELECT app_id, new_state, sent_at FROM push_log
         WHERE device_token = ? AND sent_at >= ?
         ORDER BY sent_at DESC LIMIT 200`,
    )
    .bind(args.deviceToken, args.sinceSec)
    .all<{ app_id: string; new_state: string; sent_at: number }>();
  return (result.results ?? []).map((r) => ({
    appId: r.app_id,
    newState: r.new_state as SemanticState,
    sentAtMs: r.sent_at * 1000,
  }));
}
