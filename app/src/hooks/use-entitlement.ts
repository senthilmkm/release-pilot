import { useSubscriptionStore } from '@/lib/state/subscription';
import type { EntitlementStatus, PaywallOffering } from '@/lib/subscription/types';

/**
 * Reactive: re-renders the moment RevenueCat tells us about a
 * purchase / restore / billing event.
 *
 * Returns the current entitlement + the available offering + the
 * lifecycle status (loading / unconfigured / ready / error).
 *
 * Don't call any RC methods directly from components — go through
 * `subscription/purchase.ts` so error normalization is consistent.
 */
export function useEntitlement(): {
  entitlement: EntitlementStatus;
  offering: PaywallOffering | null;
  status: 'loading' | 'unconfigured' | 'ready' | 'error';
  isPro: boolean;
} {
  const entitlement = useSubscriptionStore((s) => s.entitlement);
  const offering    = useSubscriptionStore((s) => s.offering);
  const status      = useSubscriptionStore((s) => s.status);
  return { entitlement, offering, status, isPro: entitlement.isPro };
}
