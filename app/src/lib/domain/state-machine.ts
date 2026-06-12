import type { SemanticState } from '@/constants/theme';

/**
 * The 20+ raw App Store Connect version-state strings, collapsed to 7
 * user-friendly semantic states.
 *
 * Why this exists:
 *  - ASC vocab is confusing ("Ready for Sale" = LIVE, not "ready to sell")
 *  - We use semantic states everywhere in UI; raw states only at the API edge
 *  - Adding a new ASC state (Apple sometimes does this) = one line here +
 *    one unit test, nothing else changes
 *
 * Reference (Apple ASC API docs):
 *   https://developer.apple.com/documentation/appstoreconnectapi/appstoreversionstate
 */

export type ASCRawState =
  | 'PREPARE_FOR_SUBMISSION'
  | 'DEVELOPER_REMOVED_FROM_SALE'
  | 'DEVELOPER_REJECTED'
  | 'IN_REVIEW'
  | 'INVALID_BINARY'
  | 'METADATA_REJECTED'
  | 'PENDING_APPLE_RELEASE'
  | 'PENDING_CONTRACT'
  | 'PENDING_DEVELOPER_RELEASE'
  | 'PROCESSING_FOR_APP_STORE'
  | 'READY_FOR_REVIEW'
  | 'READY_FOR_SALE'
  | 'REJECTED'
  | 'REMOVED_FROM_SALE'
  | 'REPLACED_WITH_NEW_VERSION'
  | 'WAITING_FOR_EXPORT_COMPLIANCE'
  | 'WAITING_FOR_REVIEW';

const MAP: Record<ASCRawState, SemanticState> = {
  PREPARE_FOR_SUBMISSION:        'drafting',
  DEVELOPER_REJECTED:            'drafting',
  DEVELOPER_REMOVED_FROM_SALE:   'drafting',
  READY_FOR_REVIEW:              'submitted',
  WAITING_FOR_REVIEW:            'submitted',
  WAITING_FOR_EXPORT_COMPLIANCE: 'submitted',
  PROCESSING_FOR_APP_STORE:      'submitted',
  PENDING_CONTRACT:              'submitted',
  IN_REVIEW:                     'in_review',
  PENDING_DEVELOPER_RELEASE:     'approved_waiting',
  PENDING_APPLE_RELEASE:         'approved_scheduled',
  READY_FOR_SALE:                'live',
  REPLACED_WITH_NEW_VERSION:     'live',
  REMOVED_FROM_SALE:             'live',
  REJECTED:                      'rejected',
  METADATA_REJECTED:             'rejected',
  INVALID_BINARY:                'rejected',
};

export function toSemanticState(raw: string): SemanticState {
  return MAP[raw as ASCRawState] ?? 'drafting';
}

/** True when the version is in a state where Live Activity should be live. */
export function isLiveActivityState(state: SemanticState): boolean {
  return (
    state === 'submitted' ||
    state === 'in_review' ||
    state === 'approved_waiting' ||
    state === 'approved_scheduled'
  );
}

/** True when the version reached a terminal state and notifications can quiet. */
export function isTerminalState(state: SemanticState): boolean {
  return state === 'live' || state === 'rejected';
}
