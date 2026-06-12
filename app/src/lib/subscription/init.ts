import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
} from 'react-native-purchases';

import { getRevenueCatConfig } from './config';
import { deriveEntitlement } from './entitlements';
import { normalizeOffering } from './offerings';
import { useSubscriptionStore } from '@/lib/state/subscription';

/**
 * Boot RevenueCat once at app start (called from app/_layout.tsx).
 *
 * No-op on web / Android (we ship iOS only for v1). Safe to call
 * multiple times — subsequent calls bail out cheaply.
 *
 * Flow:
 *   1. Configure SDK with public Apple key from app.json
 *   2. Pull initial CustomerInfo + current offering
 *   3. Attach a listener so any RC update (purchase / restore / billing)
 *      flows straight into the Zustand store
 *
 * CACHE NOTE (load-bearing):
 *   `Purchases.getCustomerInfo()` returns from RC's local cache (5-minute
 *   TTL) by default. That cache is a footgun whenever the user changed
 *   their plan SINCE the cache was populated — e.g. they upgraded
 *   Monthly → Yearly in our paywall, or cancelled in iOS Settings, or
 *   reactivated from the App Store account screen. The user will see
 *   stale "Pro Monthly · Renews <old date>" UI for up to 5 minutes
 *   until either: (a) RC's listener happens to fire with fresh info, or
 *   (b) the cache expires. The fix is to call
 *   `Purchases.invalidateCustomerInfoCache()` BEFORE the next
 *   `getCustomerInfo()` whenever we *know* something might have changed
 *   — after a purchase, on foreground, on manual pull-to-refresh.
 *
 *   `refreshSubscriptionState({ invalidateCache: true })` does this in
 *   one call. The cheap initial boot still uses the cache to keep
 *   cold-start fast.
 */

let configured = false;

export async function initRevenueCat(): Promise<void> {
  if (configured) return;
  if (Platform.OS !== 'ios') return;

  const cfg = getRevenueCatConfig();
  if (!cfg.iosApiKey || cfg.iosApiKey.startsWith('REPLACE_')) {
    useSubscriptionStore.setState({ status: 'unconfigured' });
    return;
  }

  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: cfg.iosApiKey });
    configured = true;

    Purchases.addCustomerInfoUpdateListener((info) => {
      applyCustomerInfo(info);
    });

    const [info, offerings] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getOfferings(),
    ]);
    applyCustomerInfo(info);
    applyOffering(offerings.current ?? null);
    useSubscriptionStore.setState({ status: 'ready', lastSyncedAtMs: Date.now() });
  } catch (err) {
    if (__DEV__) console.warn('[release-pilot] RevenueCat init failed:', err);
    useSubscriptionStore.setState({ status: 'error' });
  }
}

/**
 * Pull fresh CustomerInfo + Offerings from RC and push them into the
 * Zustand store.
 *
 * @param opts.invalidateCache  When true, calls
 *   `Purchases.invalidateCustomerInfoCache()` BEFORE the fetch. Use this
 *   whenever the customer state *might* have changed since RC's last
 *   cache fill — after a purchase, on foreground transitions, or on
 *   manual pull-to-refresh. Without this, the 5-minute TTL cache will
 *   happily return the pre-change data and clobber any fresh data the
 *   purchase listener wrote into the store.
 *
 * @param opts.syncPurchases  When true, calls `Purchases.syncPurchases()`
 *   BEFORE the fetch. This is the nuclear option — RC re-fetches the
 *   App Store receipt from Apple, re-validates it, and updates the
 *   subscriber. Use only when invalidateCache alone didn't work
 *   (e.g. the user explicitly tapped "Force re-sync with App Store").
 */
export async function refreshSubscriptionState(
  opts: { invalidateCache?: boolean; syncPurchases?: boolean } = {},
): Promise<void> {
  if (!configured) return;
  try {
    if (opts.syncPurchases) {
      // Re-validates the StoreKit receipt against Apple. Implicitly
      // invalidates RC's cache, so we don't need to call both.
      try { await Purchases.syncPurchases(); } catch (e) {
        if (__DEV__) console.warn('[release-pilot] syncPurchases failed:', e);
      }
    } else if (opts.invalidateCache) {
      // Cheaper than syncPurchases: tells RC's SDK "don't trust your
      // cache on the next read", then we trigger that read below.
      try { await Purchases.invalidateCustomerInfoCache(); } catch (e) {
        if (__DEV__) console.warn('[release-pilot] invalidateCache failed:', e);
      }
    }
    const [info, offerings] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getOfferings(),
    ]);
    applyCustomerInfo(info);
    applyOffering(offerings.current ?? null);
    useSubscriptionStore.setState({ lastSyncedAtMs: Date.now() });
  } catch (err) {
    if (__DEV__) console.warn('[release-pilot] refreshSubscriptionState failed:', err);
  }
}

function applyCustomerInfo(info: CustomerInfo): void {
  const cfg = getRevenueCatConfig();
  // RC's CustomerInfo includes class instances + methods we can't
  // serialize into Zustand; project through our pure deriver first.
  const status = deriveEntitlement(info as unknown as Parameters<typeof deriveEntitlement>[0], cfg.entitlementId);
  useSubscriptionStore.setState({ entitlement: status });
}

function applyOffering(offering: PurchasesOffering | null): void {
  const normalized = normalizeOffering(offering as Parameters<typeof normalizeOffering>[0]);
  useSubscriptionStore.setState({ offering: normalized });
}
