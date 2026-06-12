/**
 * Pure-function helpers for deriving a human-readable team name from the
 * limited identity hints in the App Store Connect API.
 *
 * Isolated from `verify-and-persist.ts` (which has heavy native deps) so
 * we can unit-test these heuristics in plain tsx.
 *
 * ASC API doesn't expose team names. Heuristics in priority order:
 *   1. Take the bundle ID's second segment: `com.foo.bar` → "Foo"
 *   2. Strip suffix words from the first app's name: "Recall - Memory App" → "Recall"
 *   3. Fall back to "Team {last4 of issuerId}"
 */

export function deriveTeamName(args: {
  issuerId: string;
  firstAppName?: string;
  firstAppBundleId?: string;
}): string {
  if (args.firstAppBundleId) {
    const parts = args.firstAppBundleId.split('.');
    if (parts.length >= 2 && parts[0]?.length && parts[1]?.length) {
      const candidate = parts[1];
      if (candidate && candidate.length >= 2) {
        return capitalize(candidate);
      }
    }
  }
  if (args.firstAppName) {
    const cleaned = args.firstAppName
      .split(/[-–—:|]/)[0]
      ?.trim()
      .replace(/\s+(Inc|LLC|App|Apps)\.?$/i, '');
    if (cleaned && cleaned.length > 0) return cleaned;
  }
  return `Team ${args.issuerId.slice(-4)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
