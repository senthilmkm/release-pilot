import type { SemanticState } from '@/constants/state-tokens';
import { isLiveActivityState, isTerminalState } from './state-machine';

/**
 * Pure decision logic for ActivityKit lifecycle.
 *
 * Given the previous state and the new state for an app's release,
 * decide what to do with its Live Activity (the Lock-Screen / Dynamic-
 * Island banner).
 *
 * Rules:
 *  1. Transition INTO an in-flight state (no LA was running) → START a new LA
 *  2. Transition WITHIN in-flight states (an LA exists)      → UPDATE it
 *  3. Transition OUT of in-flight (live or rejected)         → END the LA
 *  4. No state change                                        → NOOP
 *  5. Both states are non-in-flight                          → NOOP
 *
 * All-pure, no side effects. The caller (`use-live-activity-sync` hook
 * in Phase 5h) translates these decisions into actual native module calls.
 */

export type ActivityAction =
  | { kind: 'start';  newState: SemanticState }
  | { kind: 'update'; newState: SemanticState }
  | { kind: 'end';    finalState: SemanticState }
  | { kind: 'noop' };

export function decideActivityAction(args: {
  /** Last semantic state we observed (null = first observation ever). */
  previous: SemanticState | null;
  /** Current semantic state from the latest ASC fetch. */
  current: SemanticState;
  /** Whether the JS-side bookkeeping says we have an active LA right now. */
  hasActiveActivity: boolean;
}): ActivityAction {
  const { previous, current, hasActiveActivity } = args;

  // First observation — if we're already in flight, start an LA. Otherwise
  // wait until a transition happens.
  if (previous === null) {
    if (isLiveActivityState(current) && !hasActiveActivity) {
      return { kind: 'start', newState: current };
    }
    return { kind: 'noop' };
  }

  // No change to semantic state → nothing to do (except start an LA if we
  // somehow lost track of one, e.g. the user force-quit and reopened).
  if (previous === current) {
    if (isLiveActivityState(current) && !hasActiveActivity) {
      return { kind: 'start', newState: current };
    }
    return { kind: 'noop' };
  }

  // The state changed. Three sub-cases:

  // (a) Now in a terminal state and there's an LA running → end it
  if (isTerminalState(current) && hasActiveActivity) {
    return { kind: 'end', finalState: current };
  }

  // (b) Now in an in-flight state — either start fresh or update
  if (isLiveActivityState(current)) {
    return hasActiveActivity
      ? { kind: 'update', newState: current }
      : { kind: 'start',  newState: current };
  }

  // (c) Moved from one non-in-flight to another (e.g. drafting → drafting)
  return { kind: 'noop' };
}
