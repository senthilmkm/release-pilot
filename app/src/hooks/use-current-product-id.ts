import { useSubscriptionStore } from '@/lib/state/subscription';

/**
 * The ASC product id the user is currently subscribed to, or `null` for
 * free users. Used by the paywall to:
 *   - Decorate the active plan card with a "Your current plan" badge
 *   - Short-circuit the purchase flow when the user taps their own plan
 *   - Drive the "Switch to Pro Yearly" CTA copy for cross-grades
 */
export function useCurrentProductId(): string | null {
  return useSubscriptionStore((s) => s.entitlement.activeProductId);
}
