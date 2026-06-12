/**
 * Pure (no react-native imports) constants for the 7 semantic release states.
 *
 * Lives in its own file so Node-side tools (`cli-verify.ts`, future
 * server-side rendering, integration tests) can import them without
 * pulling in the React Native platform shim that `theme.ts` requires.
 *
 * The `theme.ts` barrel re-exports these so app code can keep one
 * `from '@/constants/theme'` import.
 */

export type SemanticState =
  | 'drafting'
  | 'submitted'
  | 'in_review'
  | 'approved_waiting'    // PENDING_DEVELOPER_RELEASE — you need to release it
  | 'approved_scheduled'  // PENDING_APPLE_RELEASE — Apple will release on date
  | 'live'                // READY_FOR_SALE — currently on App Store
  | 'rejected';

export const StateLabels: Record<SemanticState, string> = {
  drafting:           'Drafting',
  submitted:          'Submitted',
  in_review:          'In Review',
  approved_waiting:   'Approved · waiting for you',
  approved_scheduled: 'Approved · scheduled',
  live:               'Live on App Store',
  rejected:           'Rejected',
};

export const StateShortLabels: Record<SemanticState, string> = {
  drafting:           'Drafting',
  submitted:          'Submitted',
  in_review:          'In Review',
  approved_waiting:   'Approved',
  approved_scheduled: 'Scheduled',
  live:               'Live',
  rejected:           'Rejected',
};

export const StateIcons: Record<SemanticState, string> = {
  drafting:           'pencil',
  submitted:          'send',
  in_review:          'eye',
  approved_waiting:   'check-circle',
  approved_scheduled: 'calendar-clock',
  live:               'check-circle-2',
  rejected:           'x-octagon',
};

// Explainer copy for the "?" info icon next to each state badge.
// Power users (who know ASC vocab) see the raw ASC enum mapping here.
/** State badge colors. Moved here (from theme.ts) so Node-side code can
 *  import them without pulling react-native. theme.ts re-exports. */
export const StateColors: Record<'light' | 'dark', Record<SemanticState, { fg: string; bg: string }>> = {
  light: {
    drafting:           { fg: '#3C3C43', bg: '#E5E5EA' },
    submitted:          { fg: '#0040DD', bg: '#D6E4FF' },
    in_review:          { fg: '#7A5C00', bg: '#FFF4C2' },
    approved_waiting:   { fg: '#006B5B', bg: '#C6F2E8' },
    approved_scheduled: { fg: '#006B5B', bg: '#C6F2E8' },
    live:               { fg: '#1F7A1F', bg: '#C8F0CC' },
    rejected:           { fg: '#B00020', bg: '#FFE0E0' },
  },
  dark: {
    drafting:           { fg: '#EBEBF5', bg: '#3A3A3C' },
    submitted:          { fg: '#7FB3FF', bg: '#0A2A6B' },
    in_review:          { fg: '#FFD970', bg: '#3D2F00' },
    approved_waiting:   { fg: '#5CE6C9', bg: '#003B30' },
    approved_scheduled: { fg: '#5CE6C9', bg: '#003B30' },
    live:               { fg: '#85E592', bg: '#0A3A12' },
    rejected:           { fg: '#FF8B85', bg: '#4A0E0E' },
  },
};

export const StateHelp: Record<SemanticState, { what: string; ascRaw: string[] }> = {
  drafting: {
    what: 'You\'re editing the draft. Nothing has been submitted to Apple yet.',
    ascRaw: ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED'],
  },
  submitted: {
    what: 'Submitted to Apple. Waiting in the review queue.',
    ascRaw: ['WAITING_FOR_REVIEW'],
  },
  in_review: {
    what: 'An Apple reviewer is actively looking at your build.',
    ascRaw: ['IN_REVIEW'],
  },
  approved_waiting: {
    what: 'Apple approved your build. Tap "Release" in ASC to ship it to customers.',
    ascRaw: ['PENDING_DEVELOPER_RELEASE'],
  },
  approved_scheduled: {
    what: 'Apple approved your build. It will go live automatically on the scheduled date.',
    ascRaw: ['PENDING_APPLE_RELEASE'],
  },
  live: {
    what: 'Your version is currently live on the App Store and downloadable by customers.',
    ascRaw: ['READY_FOR_SALE'],
  },
  rejected: {
    what: 'Apple rejected your submission. Open ASC for the Resolution Center message.',
    ascRaw: ['REJECTED', 'METADATA_REJECTED'],
  },
};
