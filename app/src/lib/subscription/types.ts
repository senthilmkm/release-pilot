/**
 * Subscription domain types — used app-wide, no RevenueCat dependency.
 *
 * The RC-typed types live in `react-native-purchases` and are wrapped
 * via `offerings.ts` + `entitlements.ts` so the rest of the app never
 * has to know about RevenueCat internals.
 */

export type SubscriptionTier =
  | 'free'
  | 'pro_monthly'
  | 'pro_yearly'
  | 'pro_lifetime';

/** Current entitlement status for the signed-in (anonymous) user. */
export type EntitlementStatus = {
  /** True iff any pro entitlement is active (paid OR trial). */
  isPro: boolean;
  /** True iff we're in the introductory free trial period. */
  isInTrial: boolean;
  /** Which product they own — `free` if `isPro === false`. */
  tier: SubscriptionTier;
  /** The ASC product identifier currently active (e.g.
   *  "release_pilot_pro_monthly"). `null` when free. Used to detect
   *  "you're trying to buy your own plan again" and to drive the
   *  "current plan" badge on the paywall. */
  activeProductId: string | null;
  /** Unix ms when the entitlement expires, null for lifetime. */
  expiresAtMs: number | null;
  /** True if they're in a billing grace period (failed renewal, retrying). */
  isInGracePeriod: boolean;
  /** Pulled from RevenueCat's `originalApplicationVersion` — useful for
   *  grandfathering (e.g. "free for v1 users"). */
  originalAppVersion: string | null;
};

/** One purchasable plan, normalized from a RevenueCat `Package`. */
export type PaywallPlan = {
  /** The RC package identifier (e.g. "$rc_monthly", "$rc_annual"). */
  packageId: string;
  /** The product identifier configured in ASC (e.g. "release_pilot_pro_yearly"). */
  productId: string;
  /** Coarse type. We use this to pick layout + sort order. */
  kind: 'monthly' | 'annual' | 'lifetime' | 'unknown';
  /** Apple-localized price string ("$4.99", "€4,99") — render as-is. */
  priceString: string;
  /** Raw price as a Decimal-friendly number, in the user's currency. */
  priceAmount: number;
  currencyCode: string;
  /** Per-month price string for annual plans, computed locally for
   *  the "$3.33/mo billed annually" subtitle. */
  perMonthString: string | null;
  /** Length of the intro trial (days), 0 if no trial offered. */
  trialDays: number;
  /** Free-form title from RC ("Pro Yearly"). */
  title: string;
  description: string;
};

/** The fully-loaded offering — the data the paywall renders from. */
export type PaywallOffering = {
  identifier: string;
  /** Sorted: annual first (best perceived value), then monthly, then lifetime. */
  plans: PaywallPlan[];
  /** True when ANY plan offers an intro trial — controls the
   *  "14-day free trial" header copy. */
  hasTrial: boolean;
};

/** What `usePaywallGate` returns. */
export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: GateBlockReason };

/**
 * Every distinct paywall trigger. Each maps 1:1 to a copy block in
 * `paywallCopyFor()` and to a gate function in `gates.ts`.
 *
 * Naming convention: `<feature>-<limit-kind>`.
 *  - `*-limit`        → a metered quota was exhausted
 *  - `*-pro-only`     → feature exists, but it's Pro-only with no free quota
 *
 * Why we meter the things we do (and not others):
 *  - Solo indie devs have ~1 Apple Developer account but 1-20+ apps.
 *    Metering on ACCOUNTS would let 99% of the target audience use the
 *    product for free forever. So we meter on the dimensions that grow
 *    with the dev's portfolio + the dev's engagement with this app
 *    specifically (apps, replies, checklist runs).
 *  - The killer features that differentiate this app from Apple's free
 *    ASC iOS app (push, widget, Live Activities, RC integration) are
 *    Pro-only — that's how we make money realistically.
 */
export type GateBlockReason =
  | 'add-account-limit'         // Trying to connect 2nd+ ASC account
  | 'add-app-limit'             // Trying to access app #2+ (free tracks 1)
  | 'reply-to-review-limit'     // Used all 2 free replies this month
  | 'checklist-weekly-limit'    // 4th+ checklist run this week
  | 'connect-revenuecat-pro'    // RevenueCat integration is Pro-only
  | 'push-notifications-pro'    // Push for state changes is Pro-only
  | 'lock-screen-widget-pro'    // Lock-screen / Home widget is Pro-only
  | 'live-activity-pro';        // Live Activities during review is Pro-only
