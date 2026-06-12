import Constants from 'expo-constants';

/**
 * Pulls RevenueCat configuration from `app.json` → `expo.extra.revenueCat`.
 *
 * Keys live in app.json (not env vars) so:
 *   - they survive Expo Updates / OTA without rebuilding
 *   - the RC API key is intentionally public (Apple Public Key only;
 *     no shared secret on device — that's a Worker concern)
 *
 * Throws a *helpful* error in dev if you forgot to fill in app.json so
 * the failure mode is obvious instead of a cryptic "Invalid API key".
 */

type RevenueCatConfig = {
  iosApiKey: string;
  entitlementId: string;
  currentOfferingId: string;
};

let cached: RevenueCatConfig | null = null;

export function getRevenueCatConfig(): RevenueCatConfig {
  if (cached) return cached;

  const extra = (Constants.expoConfig?.extra ?? {}) as {
    revenueCat?: Partial<RevenueCatConfig>;
  };
  const cfg = extra.revenueCat ?? {};

  const iosApiKey = cfg.iosApiKey ?? '';
  const entitlementId = cfg.entitlementId ?? 'pro';
  const currentOfferingId = cfg.currentOfferingId ?? 'default';

  if (!iosApiKey || iosApiKey.startsWith('REPLACE_')) {
    if (__DEV__) {
      console.warn(
        '[release-pilot] RevenueCat iOS API key is missing. Update ' +
          'app.json → expo.extra.revenueCat.iosApiKey with the public ' +
          'Apple key from your RevenueCat dashboard.',
      );
    }
  }

  cached = { iosApiKey, entitlementId, currentOfferingId };
  return cached;
}

/** Test helper — clears the cache so a remount with new extras takes effect. */
export function _resetRevenueCatConfigForTests(): void {
  cached = null;
}
