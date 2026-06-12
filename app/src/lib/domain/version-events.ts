import type { ASCAppStoreVersion, ASCBuild } from '@/lib/api/asc-types';
import { toSemanticState } from '@/lib/domain/state-machine';
import type { SemanticState } from '@/constants/theme';

/**
 * Pure transforms from raw App Store Connect version records into the
 * compact shapes the UI actually renders.
 *
 * Why a separate module:
 *  - 100% pure, deterministic, testable in plain Node
 *  - Decouples UI code from the ASC JSON:API shape (changing one field
 *    name in Apple's response = one update here, nothing else)
 *  - Drives both the Releases tab (latest state per app) AND the App
 *    detail screen (full timeline)
 */

// ---------------------------------------------------------------------------
// Shapes the UI consumes
// ---------------------------------------------------------------------------

/**
 * Compact summary of one version, ready to render in a timeline row.
 */
export type VersionSummary = {
  /** ASC `appStoreVersions` resource id (stable across API calls). */
  ascId: string;
  /** Marketing version e.g. "1.8.23". */
  versionString: string;
  /** Build number from the linked build, if any (e.g. "29"). */
  buildNumber: string | null;
  /** Our 7-state semantic mapping. */
  state: SemanticState;
  /** Raw ASC string (for the ? info modal — power-user transparency). */
  rawState: string | null;
  /** When the version draft was first opened in ASC, ISO 8601. */
  createdAt: string | null;
  /** Scheduled release date (only meaningful for `approved_scheduled`). */
  scheduledReleaseAt: string | null;
  /** "MANUAL" | "AFTER_APPROVAL" | "SCHEDULED" — useful in the detail header. */
  releaseType: string | null;
  /**
   * True for a `live` version that has been replaced by a newer release.
   *
   * ASC's `appStoreState` API stays at `READY_FOR_SALE` for every version
   * that was EVER released, so naively rendering "Live" for every older
   * version is technically true but semantically misleading to a human
   * reading the version history. Only ONE version is currently live on
   * the App Store — that's the most recent `live` row. Every earlier
   * `live` row is superseded, and the UI should label them "Released"
   * (neutral gray) rather than "Live" (green).
   *
   * `state` is left at `'live'` so power users can still read the raw
   * ASC mapping in the help modal — this flag is a render-time hint
   * only.
   */
  isSuperseded: boolean;
};

/**
 * Compact "what's happening right now" snapshot. The Releases tab uses
 * this per app; the app detail header uses it for the hero badge.
 */
export type LatestStateSnapshot = {
  state: SemanticState;
  versionString: string;
  buildNumber: string | null;
  rawState: string | null;
  scheduledReleaseAt: string | null;
  /** True when we have ZERO versions for this app yet (never submitted). */
  isEmpty: boolean;
};

// ---------------------------------------------------------------------------
// Deriver — versions + builds → ordered summaries
// ---------------------------------------------------------------------------

/**
 * Sort + project raw ASC versions into our `VersionSummary` rows.
 *
 * Sort order: newest first (by createdDate descending). Apple returns
 * versions newest-first by default but we sort defensively in case
 * pagination order ever changes.
 */
export function deriveVersionTimeline(args: {
  versions: ASCAppStoreVersion[];
  builds: Map<string, ASCBuild>;
}): VersionSummary[] {
  const summaries = args.versions.map((v) => projectVersion(v, args.builds));
  summaries.sort((a, b) => compareDescNullable(a.createdAt, b.createdAt));

  // Mark older live versions as superseded. After sorting newest-first,
  // the FIRST `live` row is the one currently on the App Store; every
  // subsequent `live` row was once-live-now-replaced.
  let seenCurrentLive = false;
  for (const s of summaries) {
    if (s.state === 'live') {
      if (seenCurrentLive) {
        s.isSuperseded = true;
      } else {
        seenCurrentLive = true;
      }
    }
  }

  return summaries;
}

/**
 * Pick the "what is happening right now" version. Apple's rules:
 *
 *  - There's AT MOST one version in a non-terminal state at a time
 *    (drafting, submitted, in_review, approved_*).
 *  - The LIVE version is whichever has state READY_FOR_SALE.
 *
 * Our priority for surfacing one snapshot:
 *  1. Any non-terminal version (the in-flight release) — that's the
 *     one users are anxious about
 *  2. Else the LIVE version (so the badge says "Live")
 *  3. Else the most recently rejected version
 *  4. Else "isEmpty: true"
 */
export function deriveLatestSnapshot(
  summaries: VersionSummary[],
): LatestStateSnapshot {
  if (summaries.length === 0) {
    return {
      state: 'drafting',
      versionString: '',
      buildNumber: null,
      rawState: null,
      scheduledReleaseAt: null,
      isEmpty: true,
    };
  }

  const inFlight = summaries.find((s) => isInFlightState(s.state));
  const live = summaries.find((s) => s.state === 'live');
  const rejected = summaries.find((s) => s.state === 'rejected');
  const pick = inFlight ?? live ?? rejected ?? summaries[0]!;

  return {
    state: pick.state,
    versionString: pick.versionString,
    buildNumber: pick.buildNumber,
    rawState: pick.rawState,
    scheduledReleaseAt: pick.scheduledReleaseAt,
    isEmpty: false,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function projectVersion(
  version: ASCAppStoreVersion,
  builds: Map<string, ASCBuild>,
): VersionSummary {
  const rawState = version.attributes.appStoreState ?? null;
  const buildId = version.relationships?.build?.data?.id;
  const build = buildId ? builds.get(buildId) : undefined;

  return {
    ascId: version.id,
    versionString: version.attributes.versionString,
    buildNumber: build?.attributes.version ?? null,
    state: toSemanticState(rawState ?? ''),
    rawState,
    createdAt: version.attributes.createdDate ?? null,
    scheduledReleaseAt: version.attributes.earliestReleaseDate ?? null,
    releaseType: version.attributes.releaseType ?? null,
    // Set by `deriveVersionTimeline` after the full list has been sorted.
    isSuperseded: false,
  };
}

function isInFlightState(s: SemanticState): boolean {
  return (
    s === 'submitted' ||
    s === 'in_review' ||
    s === 'approved_waiting' ||
    s === 'approved_scheduled'
  );
}

/**
 * Sort comparator: descending, with null/undefined sinking to the bottom.
 * Used to keep versions WITHOUT a timestamp from poisoning the order.
 */
function compareDescNullable(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  // ISO 8601 strings sort lexically the same as chronologically
  if (a > b) return -1;
  if (a < b) return 1;
  return 0;
}
