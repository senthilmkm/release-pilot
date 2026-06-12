import type { SemanticState } from '../lib/semantic-state';

/**
 * Plain-language push headlines for each semantic state.
 *
 * Tone choice: short, present tense, no exclamation marks except for
 * the celebratory states (live, approved). Indie devs check these
 * notifications a dozen times a day — punctuation noise burns out.
 */
export function stateHeadline(state: SemanticState, versionString: string): string {
  const v = `v${versionString}`;
  switch (state) {
    case 'drafting':           return `${v} is back in drafting`;
    case 'submitted':          return `${v} submitted — waiting for review`;
    case 'in_review':          return `${v} is now in review`;
    case 'approved_waiting':   return `${v} approved — release when ready!`;
    case 'approved_scheduled': return `${v} approved — scheduled to go live`;
    case 'live':               return `${v} is live on the App Store!`;
    case 'rejected':           return `${v} was rejected — see Resolution Center`;
  }
}
