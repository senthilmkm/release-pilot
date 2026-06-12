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
    useSubscriptionStore.setState({ status: 'ready' });
  } catch (err) {
    if (__DEV__) console.warn('[release-pilot] RevenueCat init failed:', err);
    useSubscriptionStore.setState({ status: 'error' });
  }
}

/** Hard refresh from RC — used after a purchase or a restore. */
export async function refreshSubscriptionState(): Promise<void> {
  if (!configured) return;
  try {
    const [info, offerings] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getOfferings(),
    ]);
    applyCustomerInfo(info);
    applyOffering(offerings.current ?? null);
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
