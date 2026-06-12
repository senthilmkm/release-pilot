import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { Platform } from 'react-native';

import type { PaywallPlan } from './types';
import { refreshSubscriptionState } from './init';
import { getRevenueCatConfig } from './config';

/**
 * Thin wrappers around RevenueCat's purchase + restore APIs.
 *
 * Returns a normalized result so callers don't need to know about RC
 * error codes (we map "user cancelled" → `cancelled`, anything else
 * → `error` with a human message).
 *
 * SUBSCRIPTION-GROUP NOTE:
 *   For plan switching (Monthly ↔ Yearly) to work without double-billing
 *   on iOS, the monthly and yearly products MUST be in the SAME App Store
 *   Connect "subscription group". When they are, calling
 *   `Purchases.purchasePackage(yearly)` while subscribed to monthly will
 *   trigger Apple's native cross-grade UI:
 *     • Upgrade (monthly→yearly): immediate switch + prorated credit
 *     • Downgrade (yearly→monthly): defers to end of current period
 *   See: https://www.revenuecat.com/docs/subscription-groups
 */

export type PurchaseResult =
  | { kind: 'success'; isPro: boolean }
  | { kind: 'cancelled' }
  | { kind: 'already-on-plan'; productId: string }
  | { kind: 'error'; message: string };

export async function purchasePlan(
  plan: PaywallPlan,
  options: { currentProductId?: string | null } = {},
): Promise<PurchaseResult> {
  if (Platform.OS !== 'ios') {
    return { kind: 'error', message: 'Purchases are only available on iOS.' };
  }
  // Block buying the exact same product the user is already subscribed to.
  // Apple's StoreKit would otherwise show a confusing "you're already
  // subscribed" alert; better to short-circuit with our own copy.
  if (
    options.currentProductId &&
    options.currentProductId === plan.productId
  ) {
    return { kind: 'already-on-plan', productId: plan.productId };
  }
  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.current;
    const pkg = offering?.availablePackages.find((p) => p.identifier === plan.packageId);
    if (!pkg) {
      return { kind: 'error', message: 'That plan is no longer available. Pull to refresh.' };
    }
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    await refreshSubscriptionState();
    const cfg = getRevenueCatConfig();
    const isPro = customerInfo.entitlements.active[cfg.entitlementId] != null;
    return { kind: 'success', isPro };
  } catch (err) {
    const code = (err as { code?: string; userCancelled?: boolean })?.code;
    const userCancelled = (err as { userCancelled?: boolean })?.userCancelled === true;
    if (userCancelled || code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return { kind: 'cancelled' };
    }
    return {
      kind: 'error',
      message: humanizePurchaseError(code),
    };
  }
}

/**
 * Ask RevenueCat which of the supplied product IDs the user is still
 * eligible for an intro / free-trial price on.
 *
 * Apple grants the trial offer ONCE per subscription group; if the user
 * has ever used (or downgraded from) a plan in this group, they get the
 * full price on every subsequent purchase. Showing "14-day free trial"
 * in that case is misleading — the paywall calls this on mount and
 * filters the CTA copy accordingly.
 *
 * Returns a map of `productId → boolean (eligible)`. Failures resolve
 * to "assume eligible" so a transient network blip doesn't hide the
 * trial offer entirely.
 */
export async function checkTrialEligibility(
  productIds: readonly string[],
): Promise<Record<string, boolean>> {
  if (Platform.OS !== 'ios' || productIds.length === 0) {
    return Object.fromEntries(productIds.map((id) => [id, false]));
  }
  try {
    const ids = Array.from(new Set(productIds));
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(ids);
    const out: Record<string, boolean> = {};
    for (const id of ids) {
      const entry = result[id];
      // RC's enum: 0=unknown, 1=ineligible, 2=eligible, 3=no_intro_offer.
      // Treat unknown/no_intro as "eligible" so we keep showing the trial
      // copy unless we KNOW the user is ineligible.
      out[id] = entry?.status !== 1;
    }
    return out;
  } catch {
    return Object.fromEntries(productIds.map((id) => [id, true]));
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  if (Platform.OS !== 'ios') {
    return { kind: 'error', message: 'Restore is only available on iOS.' };
  }
  try {
    const customerInfo = await Purchases.restorePurchases();
    await refreshSubscriptionState();
    const cfg = getRevenueCatConfig();
    const isPro = customerInfo.entitlements.active[cfg.entitlementId] != null;
    return { kind: 'success', isPro };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    return { kind: 'error', message: humanizePurchaseError(code) };
  }
}

function humanizePurchaseError(code: string | undefined): string {
  switch (code) {
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
      return 'Network error. Check your connection and try again.';
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return 'Your payment is pending Apple\'s approval. Try again in a few minutes.';
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
      return 'The App Store is having issues right now. Try again later.';
    case PURCHASES_ERROR_CODE.INELIGIBLE_ERROR:
      return 'This offer is no longer available for your account.';
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
      return 'That subscription isn\'t available yet. Try again later.';
    case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
      return 'This receipt is already linked to a different account.';
    default:
      return 'Purchase failed. Please try again.';
  }
}
