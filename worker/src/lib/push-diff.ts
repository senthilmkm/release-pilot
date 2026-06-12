import type { SemanticState } from './semantic-state';
import type { PushKind } from '../apns/payload';

/**
 * Pure decision: given a previous and new semantic state for an app,
 * should we send a push? If yes, what kind?
 *
 * Rules:
 *  1. No previous state observed → silent push only (first sighting,
 *     not user-actionable yet — gives the iOS app a chance to seed
 *     local caches).
 *  2. previous === new                       → no push (no change)
 *  3. previous !== new AND transition is to/from an in-flight state
 *     OR a terminal state                    → alert push
 *  4. previous !== new but both are "drafting-ish" (cosmetic
 *     drift inside the same bucket)         → silent only
 *
 * Used by the cron polling loop. Pure — no I/O.
 */

export type DiffDecision =
  | { kind: 'send'; push: PushKind; reason: string }
  | { kind: 'skip'; reason: string };

const NOTABLE: ReadonlySet<SemanticState> = new Set<SemanticState>([
  'submitted',
  'in_review',
  'approved_waiting',
  'approved_scheduled',
  'live',
  'rejected',
]);

export function decidePushOnStateChange(args: {
  previous: SemanticState | null;
  current: SemanticState;
}): DiffDecision {
  const { previous, current } = args;

  if (previous === null) {
    return { kind: 'send', push: 'silent', reason: 'first-observation' };
  }

  if (previous === current) {
    return { kind: 'skip', reason: 'no-change' };
  }

  if (NOTABLE.has(current) || NOTABLE.has(previous)) {
    return { kind: 'send', push: 'alert', reason: `${previous}→${current}` };
  }

  // Both drafting (unusual but possible — Apple shifts internal states)
  return { kind: 'send', push: 'silent', reason: 'cosmetic-change' };
}

/**
 * Anti-spam guard: skip the push if we already sent the SAME
 * (deviceToken, appId, newState) combo within the cooldown window.
 *
 * Apple sometimes flaps an app between IN_REVIEW and WAITING_FOR_REVIEW
 * during deep inspections — the cooldown stops users getting 4
 * "in review!" pings in 20 minutes.
 */
export type RecentPush = {
  appId: string;
  newState: SemanticState;
  sentAtMs: number;
};

export const COOLDOWN_MS = 30 * 60 * 1000;

export function isDuplicate(args: {
  recent: readonly RecentPush[];
  candidate: { appId: string; newState: SemanticState };
  nowMs: number;
  cooldownMs?: number;
}): boolean {
  const cd = args.cooldownMs ?? COOLDOWN_MS;
  return args.recent.some(
    (p) =>
      p.appId === args.candidate.appId &&
      p.newState === args.candidate.newState &&
      args.nowMs - p.sentAtMs < cd,
  );
}
