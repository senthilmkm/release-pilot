/**
 * Pure helpers for the offline cache layer.
 *
 * Kept separate from `cache.ts` (which imports `expo-sqlite`) so these
 * can be unit-tested in plain Node/tsx.
 *
 * The split mirrors how `credentials-format.ts` is split from
 * `credentials.ts` — pure logic stays test-friendly.
 */

import type { VersionSummary } from '@/lib/domain/version-events';

/** Default TTL: 5 min. Mirrors TanStack Query's default `staleTime`. */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Cache row is "fresh" if `fetchedAt` is within `ttlMs` of `now`.
 * Caller chooses the policy (fresh = render & skip refetch; stale =
 * render as placeholder AND trigger refetch).
 */
export function isFresh(args: {
  fetchedAt: number;
  now: number;
  ttlMs?: number;
}): boolean {
  const ttl = args.ttlMs ?? DEFAULT_TTL_MS;
  return args.now - args.fetchedAt < ttl;
}

/**
 * Serialize a list of `VersionSummary` rows to a single JSON blob that
 * SQLite stores as TEXT. We use a versioned envelope so future schema
 * changes can migrate transparently.
 */
export function serializeSummaries(summaries: VersionSummary[]): string {
  return JSON.stringify({ v: 1, rows: summaries });
}

/**
 * Inverse of `serializeSummaries`. Returns `null` for unparseable or
 * unknown-version blobs — caller should treat this as a cache miss and
 * trigger a fresh network fetch.
 */
export function deserializeSummaries(blob: string): VersionSummary[] | null {
  try {
    const parsed = JSON.parse(blob);
    if (parsed && typeof parsed === 'object' && parsed.v === 1 && Array.isArray(parsed.rows)) {
      return parsed.rows as VersionSummary[];
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Cache-key composition. Keys are the SQLite primary keys, so they must
 * uniquely identify the row across all teams + apps.
 *
 *   apps cache key:     "apps:<issuerId>"
 *   versions cache key: "versions:<appId>"
 *
 * Issuer ID is included for apps so multi-team users get one row per team.
 * App ID alone is enough for versions because it's globally unique.
 */
export function appsCacheKey(issuerId: string): string {
  return `apps:${issuerId}`;
}

export function versionsCacheKey(appId: string): string {
  return `versions:${appId}`;
}

export function reviewsCacheKey(appId: string): string {
  return `reviews:${appId}`;
}

/**
 * Serialize an arbitrary list with the same versioned envelope as
 * `serializeSummaries`. Generic so we can use it for reviews, builds, etc.
 */
export function serializeList<T>(rows: T[]): string {
  return JSON.stringify({ v: 1, rows });
}

export function deserializeList<T>(blob: string): T[] | null {
  try {
    const parsed = JSON.parse(blob);
    if (parsed && typeof parsed === 'object' && parsed.v === 1 && Array.isArray(parsed.rows)) {
      return parsed.rows as T[];
    }
  } catch {
    // fall through
  }
  return null;
}
