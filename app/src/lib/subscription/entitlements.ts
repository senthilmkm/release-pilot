import type { EntitlementStatus, SubscriptionTier } from './types';

/**
 * Pure projection: turn a (partial) RevenueCat `CustomerInfo` into our
 * app-side `EntitlementStatus`.
 *
 * Kept totally separate from the RC SDK so it's testable in plain Node.
 * The caller in `state/subscription.ts` does the RN-side `JSON.stringify
 * → JSON.parse` to strip class instances before passing in.
 *
 * Why: the RC SDK occasionally ships breaking changes; isolating their
 * shape behind THIS function means one-line patches at the boundary.
 */

/** Subset of CustomerInfo fields we read. Matches react-native-purchases
 *  v10's shape — only the fields we use. */
export type CustomerInfoLike = {
  entitlements?: {
    active?: Record<
      string,
      {
        identifier?: string;
        productIdentifier?: string;
        isActive?: boolean;
        willRenew?: boolean;
        billingIssueDetectedAt?: string | null;
        expirationDate?: string | null;
        periodType?: 'TRIAL' | 'INTRO' | 'NORMAL' | string;
      }
    >;
  };
  originalApplicationVersion?: string | null;
};

const FREE_STATUS: EntitlementStatus = {
  isPro: false,
  isInTrial: false,
  tier: 'free',
  activeProductId: null,
  expiresAtMs: null,
  isInGracePeriod: false,
  originalAppVersion: null,
};

export function deriveEntitlement(
  info: CustomerInfoLike | null,
  entitlementId: string,
): EntitlementStatus {
  if (!info) return FREE_STATUS;
  const active = info.entitlements?.active?.[entitlementId];
  if (!active) {
    return { ...FREE_STATUS, originalAppVersion: info.originalApplicationVersion ?? null };
  }

  const productId = active.productIdentifier ?? '';
  const tier = inferTierFromProductId(productId);
  const expiresAtMs = active.expirationDate ? Date.parse(active.expirationDate) : null;
  const isInTrial = active.periodType === 'TRIAL' || active.periodType === 'INTRO';
  const isInGracePeriod = active.billingIssueDetectedAt != null && active.willRenew !== false;

  return {
    isPro: true,
    isInTrial,
    tier,
    activeProductId: productId.length > 0 ? productId : null,
    expiresAtMs: Number.isFinite(expiresAtMs as number) ? (expiresAtMs as number) : null,
    isInGracePeriod,
    originalAppVersion: info.originalApplicationVersion ?? null,
  };
}

/** Map an ASC product id like "release_pilot_pro_yearly" → our tier enum.
 *  Case-insensitive; tolerates suffixes from RC's package conventions. */
export function inferTierFromProductId(productId: string): SubscriptionTier {
  const id = productId.toLowerCase();
  if (id.includes('lifetime')) return 'pro_lifetime';
  if (id.includes('year') || id.includes('annual')) return 'pro_yearly';
  if (id.includes('month')) return 'pro_monthly';
  return 'pro_monthly'; // safest default — they're paying SOMETHING
}

/** Human-readable label for the entitlement status (used in More tab). */
export function describeEntitlement(status: EntitlementStatus): string {
  if (!status.isPro) return 'Free';
  if (status.isInGracePeriod) return 'Pro (billing issue — retrying)';
  if (status.isInTrial) return 'Pro (free trial)';
  switch (status.tier) {
    case 'pro_monthly':  return 'Pro · monthly';
    case 'pro_yearly':   return 'Pro · yearly';
    case 'pro_lifetime': return 'Pro · lifetime';
    case 'free':         return 'Free';
  }
}
