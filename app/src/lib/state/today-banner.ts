import { storage } from './storage';

/**
 * One-shot dismissal flag for the "Connect RevenueCat" banner on the
 * Today tab.
 *
 * UX intent:
 *  - Show the banner whenever the user has at least one ASC app but
 *    ZERO RevenueCat keys connected — the Today tab's revenue layer
 *    is the killer feature and most users won't discover it from the
 *    per-card "Connect" CTAs alone.
 *  - Dismiss is permanent (until full wipe via Erase All Data). The
 *    `paywall.last-connect-rc-banner-dismiss-ms` value isn't read,
 *    only its presence — kept as ms for future cooldown tweaks.
 *  - Connecting an RC key never auto-dismisses; once you connect even
 *    one app, the banner naturally hides because the predicate
 *    flips to "at least 1 RC connected", and stays hidden if you
 *    later disconnect (because the dismiss flag is set the moment
 *    they engage or dismiss).
 */

const KEY = 'today.connect-rc-banner-dismissed-ms.v1';
const REJECTED_ALERT_PREFIX = 'today.rejected-alert-dismissed-ms.v1';

/** Returns true if the user has explicitly dismissed the banner. */
export function isRcBannerDismissed(): boolean {
  return storage.getNumber(KEY) != null;
}

/** Mark the banner as dismissed. Idempotent. */
export function dismissRcBanner(nowMs: number = Date.now()): void {
  storage.set(KEY, nowMs);
}

/** Test / "Erase all data" helper. Restores the banner so the next
 *  Today-tab render decides whether to show it again. */
export function resetRcBannerDismiss(): void {
  storage.remove(KEY);
}

export function rejectedAlertDismissKey(args: {
  ascAppId: string;
  versionLabel: string | null;
}): string {
  return `${args.ascAppId}:${args.versionLabel ?? 'unknown-version'}`;
}

export function isRejectedAlertDismissed(key: string): boolean {
  return storage.getNumber(`${REJECTED_ALERT_PREFIX}.${key}`) != null;
}

export function dismissRejectedAlert(key: string, nowMs: number = Date.now()): void {
  storage.set(`${REJECTED_ALERT_PREFIX}.${key}`, nowMs);
}
