/**
 * The 7 semantic states — duplicated from the iOS app's `state-tokens.ts`
 * because the Worker is a separate package and we don't want a build-time
 * coupling between them.
 *
 * If this list changes:
 *  - Update `app/src/constants/state-tokens.ts` (the source of truth on iOS)
 *  - Update this file
 *  - Update `apns/headlines.ts` to handle the new state
 *  - Update `lib/push-diff.ts` to classify the new state
 */

export type SemanticState =
  | 'drafting'
  | 'submitted'
  | 'in_review'
  | 'approved_waiting'
  | 'approved_scheduled'
  | 'live'
  | 'rejected';

/** Maps Apple's raw enum to our semantic state. Mirrors `state-machine.ts`
 *  exactly — same call site, same fallback. */
const RAW_MAP: Record<string, SemanticState> = {
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
  return RAW_MAP[raw] ?? 'drafting';
}

export function isTerminalState(state: SemanticState): boolean {
  return state === 'live' || state === 'rejected';
}
