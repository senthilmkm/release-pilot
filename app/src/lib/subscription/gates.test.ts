import {
  FREE_TIER_LIMITS,
  MONTH_MS,
  WEEK_MS,
  countRecentChecklistRuns,
  countRecentReviewReplies,
  gateAddAccount,
  gateAddApp,
  gateChecklistRun,
  gateConnectRevenueCat,
  gateEnablePushNotifications,
  gateLiveActivity,
  gateLockScreenWidget,
  gateReplyToReview,
  paywallCopyFor,
} from './gates';
import {
  deriveEntitlement,
  describeEntitlement,
  inferTierFromProductId,
  type CustomerInfoLike,
} from './entitlements';
import {
  normalizeOffering,
  type OfferingLike,
} from './offerings';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ===========================================================================
// Constants
// ===========================================================================

const NOW = 10_000_000_000_000;

ok('week-ms constant is 7 days',   WEEK_MS === 7 * 24 * 60 * 60 * 1000);
ok('month-ms constant is 30 days', MONTH_MS === 30 * 24 * 60 * 60 * 1000);
ok('free tier limit: 1 account',   FREE_TIER_LIMITS.accounts === 1);
ok('free tier limit: 1 app',       FREE_TIER_LIMITS.apps === 1);
ok('free tier limit: 3 checks/wk', FREE_TIER_LIMITS.checklistRunsPerWeek === 3);
ok('free tier limit: 2 replies/mo', FREE_TIER_LIMITS.reviewRepliesPerMonth === 2);

// ===========================================================================
// gateAddAccount (kept for consultancies / agencies, no longer the
// load-bearing revenue gate)
// ===========================================================================

ok('account: pro can add unlimited',
  gateAddAccount({ isPro: true, currentAccountCount: 99 }).allowed === true);

ok('account: free can add the 1st',
  gateAddAccount({ isPro: false, currentAccountCount: 0 }).allowed === true);

{
  const r = gateAddAccount({ isPro: false, currentAccountCount: 1 });
  ok('account: free cannot add the 2nd',
    r.allowed === false && (r as any).reason === 'add-account-limit');
}

// ===========================================================================
// gateAddApp — the PRIMARY revenue gate. Free tracks 1 app, Pro
// unlimited. AppIndex is 0-based so app #0 is always free.
// ===========================================================================

ok('app: pro can access any app',
  gateAddApp({ isPro: true, appIndex: 99 }).allowed === true);

ok('app: free can access app at index 0 (the 1st app)',
  gateAddApp({ isPro: false, appIndex: 0 }).allowed === true);

{
  const r = gateAddApp({ isPro: false, appIndex: 1 });
  ok('app: free cannot access app at index 1 (the 2nd app)',
    r.allowed === false && (r as any).reason === 'add-app-limit');
}

{
  // Solo dev with 5 apps in ASC: index 0 free, 1..4 paywall
  ok('app: free indie with 5 apps — 1st free, 2nd-5th blocked',
    gateAddApp({ isPro: false, appIndex: 0 }).allowed === true
    && gateAddApp({ isPro: false, appIndex: 1 }).allowed === false
    && gateAddApp({ isPro: false, appIndex: 4 }).allowed === false);
}

// ===========================================================================
// gateReplyToReview — 2/month rolling, then Pro
// ===========================================================================

ok('reply: pro can reply unlimited',
  gateReplyToReview({ isPro: true, replyTimestampsMs: Array(99).fill(NOW), nowMs: NOW }).allowed === true);

ok('reply: free with 0 prior → allow 1st',
  gateReplyToReview({ isPro: false, replyTimestampsMs: [], nowMs: NOW }).allowed === true);

ok('reply: free with 1 prior → allow 2nd',
  gateReplyToReview({ isPro: false, replyTimestampsMs: [NOW - 1], nowMs: NOW }).allowed === true);

{
  const r = gateReplyToReview({
    isPro: false,
    replyTimestampsMs: [NOW - 1, NOW - 2],
    nowMs: NOW,
  });
  ok('reply: free with 2 prior → block 3rd',
    r.allowed === false && (r as any).reason === 'reply-to-review-limit');
}

ok('reply: free with 2 OLD (>30d) replies → allow (rolling window)',
  gateReplyToReview({
    isPro: false,
    replyTimestampsMs: Array(2).fill(NOW - 31 * 24 * 60 * 60 * 1000),
    nowMs: NOW,
  }).allowed === true);

ok('count replies: only entries within last 30d',
  countRecentReviewReplies({
    replyTimestampsMs: [
      NOW - 1 * 60_000,                       // 1 min ago — in
      NOW - 29 * 24 * 60 * 60 * 1000,         // 29 days ago — in
      NOW - 31 * 24 * 60 * 60 * 1000,         // 31 days ago — out
    ],
    nowMs: NOW,
  }) === 2);

// ===========================================================================
// gateChecklistRun / countRecentChecklistRuns (unchanged)
// ===========================================================================

ok('count runs: empty timeline',
  countRecentChecklistRuns({ runTimestampsMs: [], nowMs: NOW }) === 0);

{
  const inWindow  = [NOW - 1 * 60_000, NOW - 6 * 24 * 60 * 60 * 1000];
  const outWindow = [NOW - 8 * 24 * 60 * 60 * 1000, NOW - 99 * 24 * 60 * 60 * 1000];
  ok('count runs: only entries within last 7d',
    countRecentChecklistRuns({
      runTimestampsMs: [...inWindow, ...outWindow],
      nowMs: NOW,
    }) === 2);
}

ok('checklist: pro unlimited runs',
  gateChecklistRun({ isPro: true, runTimestampsMs: Array(99).fill(NOW), nowMs: NOW }).allowed === true);

ok('checklist: free 0 prior → allow 1st',
  gateChecklistRun({ isPro: false, runTimestampsMs: [], nowMs: NOW }).allowed === true);

ok('checklist: free 2 prior → allow 3rd',
  gateChecklistRun({ isPro: false, runTimestampsMs: [NOW - 1, NOW - 2], nowMs: NOW }).allowed === true);

{
  const r = gateChecklistRun({
    isPro: false,
    runTimestampsMs: [NOW, NOW, NOW],
    nowMs: NOW,
  });
  ok('checklist: free 3 prior → block 4th',
    r.allowed === false && (r as any).reason === 'checklist-weekly-limit');
}

ok('checklist: 4 OLD (>7d) runs → allow (rolling window)',
  gateChecklistRun({
    isPro: false,
    runTimestampsMs: Array(4).fill(NOW - 8 * 24 * 60 * 60 * 1000),
    nowMs: NOW,
  }).allowed === true);

// ===========================================================================
// Pro-only feature gates (no free quota)
// ===========================================================================

for (const [name, gate, reason] of [
  ['connect-revenuecat', gateConnectRevenueCat,        'connect-revenuecat-pro'],
  ['push-notifications', gateEnablePushNotifications,  'push-notifications-pro'],
  ['lock-screen-widget', gateLockScreenWidget,         'lock-screen-widget-pro'],
  ['live-activity',      gateLiveActivity,             'live-activity-pro'],
] as const) {
  ok(`${name}: pro allowed`,  gate({ isPro: true }).allowed === true);
  const r = gate({ isPro: false });
  ok(`${name}: free blocked with correct reason`,
    r.allowed === false && (r as any).reason === reason);
}

// ===========================================================================
// paywallCopyFor — every GateBlockReason must have copy
// ===========================================================================

for (const reason of [
  'add-account-limit',
  'add-app-limit',
  'reply-to-review-limit',
  'checklist-weekly-limit',
  'connect-revenuecat-pro',
  'push-notifications-pro',
  'lock-screen-widget-pro',
  'live-activity-pro',
] as const) {
  const copy = paywallCopyFor(reason);
  ok(`copy: ${reason} has non-empty title`, copy.title.length > 0);
  ok(`copy: ${reason} has non-empty body`,  copy.body.length > 0);
}

// ===========================================================================
// deriveEntitlement
// ===========================================================================

ok('null customer info → free', deriveEntitlement(null, 'pro').isPro === false);

ok('empty entitlements → free',
  deriveEntitlement({ entitlements: { active: {} } }, 'pro').isPro === false);

{
  const info: CustomerInfoLike = {
    entitlements: {
      active: {
        pro: {
          productIdentifier: 'release_pilot_pro_yearly',
          expirationDate: '2027-01-01T00:00:00Z',
          periodType: 'NORMAL',
        },
      },
    },
    originalApplicationVersion: '1.0',
  };
  const e = deriveEntitlement(info, 'pro');
  ok('paid yearly: isPro true', e.isPro);
  ok('paid yearly: tier',       e.tier === 'pro_yearly');
  ok('paid yearly: not trial', !e.isInTrial);
  ok('paid yearly: expires',    e.expiresAtMs === Date.parse('2027-01-01T00:00:00Z'));
  ok('paid yearly: origVersion', e.originalAppVersion === '1.0');
  ok('paid yearly: activeProductId surfaced',
    e.activeProductId === 'release_pilot_pro_yearly');
}

// Free user has no active product id at all — required for the paywall's
// "your current plan" badge / re-purchase guard to default to allow.
ok('free: activeProductId is null',
  deriveEntitlement(null, 'pro').activeProductId === null);
ok('empty entitlements: activeProductId still null',
  deriveEntitlement({ entitlements: { active: {} } }, 'pro').activeProductId === null);

{
  const info: CustomerInfoLike = {
    entitlements: {
      active: {
        pro: {
          productIdentifier: 'release_pilot_pro_monthly',
          periodType: 'TRIAL',
          expirationDate: '2026-12-31T00:00:00Z',
        },
      },
    },
  };
  const e = deriveEntitlement(info, 'pro');
  ok('trial: isPro true', e.isPro);
  ok('trial: isInTrial true', e.isInTrial);
  ok('trial: tier monthly', e.tier === 'pro_monthly');
}

{
  const info: CustomerInfoLike = {
    entitlements: {
      active: {
        pro: {
          productIdentifier: 'release_pilot_pro_monthly',
          billingIssueDetectedAt: '2026-06-01T00:00:00Z',
          willRenew: true,
        },
      },
    },
  };
  const e = deriveEntitlement(info, 'pro');
  ok('grace period: isPro still true', e.isPro);
  ok('grace period: isInGracePeriod true', e.isInGracePeriod);
}

{
  // Lookup by wrong entitlement id → free
  const info: CustomerInfoLike = {
    entitlements: { active: { plus: { productIdentifier: 'rp_plus_monthly' } } },
  };
  const e = deriveEntitlement(info, 'pro');
  ok('wrong entitlement id → free', !e.isPro);
}

// ===========================================================================
// inferTierFromProductId
// ===========================================================================

ok('infer tier: yearly',  inferTierFromProductId('release_pilot_pro_yearly')  === 'pro_yearly');
ok('infer tier: annual',  inferTierFromProductId('rc_annual')                  === 'pro_yearly');
ok('infer tier: monthly', inferTierFromProductId('pro_monthly')                === 'pro_monthly');
ok('infer tier: lifetime',inferTierFromProductId('rp_lifetime_v1')             === 'pro_lifetime');
ok('infer tier: unknown defaults to monthly',
  inferTierFromProductId('mystery_product') === 'pro_monthly');

// ===========================================================================
// describeEntitlement
// ===========================================================================

ok('describe: free',
  describeEntitlement({
    isPro: false, isInTrial: false, tier: 'free', activeProductId: null,
    expiresAtMs: null, isInGracePeriod: false, originalAppVersion: null,
  }) === 'Free');

ok('describe: yearly',
  describeEntitlement({
    isPro: true, isInTrial: false, tier: 'pro_yearly',
    activeProductId: 'release_pilot_pro_yearly',
    expiresAtMs: NOW, isInGracePeriod: false, originalAppVersion: null,
  }) === 'Pro · yearly');

ok('describe: trial wins over tier',
  describeEntitlement({
    isPro: true, isInTrial: true, tier: 'pro_monthly',
    activeProductId: 'release_pilot_pro_monthly',
    expiresAtMs: NOW, isInGracePeriod: false, originalAppVersion: null,
  }) === 'Pro (free trial)');

ok('describe: grace wins over trial',
  describeEntitlement({
    isPro: true, isInTrial: true, tier: 'pro_yearly',
    activeProductId: 'release_pilot_pro_yearly',
    expiresAtMs: NOW, isInGracePeriod: true, originalAppVersion: null,
  }).startsWith('Pro (billing issue'));

// ===========================================================================
// normalizeOffering
// ===========================================================================

ok('normalize: null → null', normalizeOffering(null) === null);

{
  const o: OfferingLike = {
    identifier: 'default',
    availablePackages: [
      {
        identifier: '$rc_monthly', packageType: 'MONTHLY',
        product: {
          identifier: 'release_pilot_pro_monthly', title: 'Monthly',
          description: '1 month', priceString: '$4.99', price: 4.99,
          currencyCode: 'USD', introPrice: null,
        },
      },
      {
        identifier: '$rc_annual', packageType: 'ANNUAL',
        product: {
          identifier: 'release_pilot_pro_yearly', title: 'Yearly',
          description: '12 months', priceString: '$39.99', price: 39.99,
          currencyCode: 'USD',
          introPrice: { periodNumberOfUnits: 14, periodUnit: 'DAY', price: 0 },
        },
      },
      {
        identifier: '$rc_lifetime', packageType: 'LIFETIME',
        product: {
          identifier: 'release_pilot_pro_lifetime', title: 'Lifetime',
          description: '1 payment', priceString: '$69.99', price: 69.99,
          currencyCode: 'USD', introPrice: null,
        },
      },
    ],
  };
  const out = normalizeOffering(o)!;
  ok('normalize: sorted annual first', out.plans[0]!.kind === 'annual');
  ok('normalize: monthly second',      out.plans[1]!.kind === 'monthly');
  ok('normalize: lifetime third',      out.plans[2]!.kind === 'lifetime');
  ok('normalize: has trial flag',      out.hasTrial);
  ok('normalize: annual has perMonth', typeof out.plans[0]!.perMonthString === 'string');
  ok('normalize: annual trialDays = 14', out.plans[0]!.trialDays === 14);
  ok('normalize: monthly trialDays = 0', out.plans[1]!.trialDays === 0);
}

{
  // Missing priceString → skip
  const o: OfferingLike = {
    identifier: 'default',
    availablePackages: [
      {
        identifier: '$rc_broken', packageType: 'MONTHLY',
        product: {
          identifier: 'broken', priceString: '', price: 0, currencyCode: 'USD',
        },
      },
    ],
  };
  ok('normalize: skips packages without priceString', normalizeOffering(o)!.plans.length === 0);
}

{
  // Test ISO 8601 period parsing
  const o: OfferingLike = {
    identifier: 'x',
    availablePackages: [{
      identifier: '$rc_a', packageType: 'ANNUAL',
      product: {
        identifier: 'x', priceString: '$10', price: 10, currencyCode: 'USD',
        introPrice: { period: 'P1W', price: 0 },
      },
    }],
  };
  ok('normalize: P1W → 7 trial days', normalizeOffering(o)!.plans[0]!.trialDays === 7);
}

// ===========================================================================
// Plan switching scenarios (Free→Monthly, Free→Yearly, Monthly↔Yearly)
// ===========================================================================

/**
 * Helper: build an offering with the standard release-pilot product ids
 * so each scenario reads like a real-world transition.
 */
function buildOffering(): NonNullable<ReturnType<typeof normalizeOffering>> {
  return normalizeOffering({
    identifier: 'default',
    availablePackages: [
      {
        identifier: '$rc_monthly', packageType: 'MONTHLY',
        product: {
          identifier: 'release_pilot_pro_monthly', title: 'Monthly',
          description: '1 month', priceString: '$4.99', price: 4.99,
          currencyCode: 'USD', introPrice: null,
        },
      },
      {
        identifier: '$rc_annual', packageType: 'ANNUAL',
        product: {
          identifier: 'release_pilot_pro_yearly', title: 'Yearly',
          description: '12 months', priceString: '$39.99', price: 39.99,
          currencyCode: 'USD',
          introPrice: { periodNumberOfUnits: 14, periodUnit: 'DAY', price: 0 },
        },
      },
    ],
  })!;
}

// Mirrors the paywall's "is this plan the user's current plan?" check
// that drives the CURRENT PLAN badge and the disable-CTA guard.
function isCurrentPlan(planProductId: string, activeProductId: string | null): boolean {
  return activeProductId !== null && activeProductId === planProductId;
}

// Mirrors the paywall's "preselect the user's current plan" default.
function defaultSelection(
  offering: ReturnType<typeof buildOffering>,
  activeProductId: string | null,
): string | null {
  if (activeProductId) {
    const own = offering.plans.find((p) => p.productId === activeProductId);
    if (own) return own.packageId;
  }
  return offering.plans[0]?.packageId ?? null;
}

{
  const offering = buildOffering();

  // Free → Yearly (annual is plans[0] because of "best value" sorting)
  ok('switch: free defaults to annual',
    defaultSelection(offering, null) === '$rc_annual');
  ok('switch: free → monthly allowed',
    !isCurrentPlan('release_pilot_pro_monthly', null));
  ok('switch: free → yearly allowed',
    !isCurrentPlan('release_pilot_pro_yearly', null));

  // Pro Monthly → Yearly (upgrade)
  ok('switch: monthly user defaults to monthly card',
    defaultSelection(offering, 'release_pilot_pro_monthly') === '$rc_monthly');
  ok('switch: monthly user picking yearly → allowed cross-grade',
    !isCurrentPlan('release_pilot_pro_yearly', 'release_pilot_pro_monthly'));
  ok('switch: monthly user picking monthly → blocked (same plan)',
    isCurrentPlan('release_pilot_pro_monthly', 'release_pilot_pro_monthly'));

  // Pro Yearly → Monthly (downgrade)
  ok('switch: yearly user defaults to yearly card',
    defaultSelection(offering, 'release_pilot_pro_yearly') === '$rc_annual');
  ok('switch: yearly user picking monthly → allowed cross-grade',
    !isCurrentPlan('release_pilot_pro_monthly', 'release_pilot_pro_yearly'));
  ok('switch: yearly user picking yearly → blocked (same plan)',
    isCurrentPlan('release_pilot_pro_yearly', 'release_pilot_pro_yearly'));

  // Unknown active product (e.g. legacy SKU) — UI gracefully treats this
  // as "no current plan" so the user can still pick something.
  ok('switch: unknown active product falls back to annual default',
    defaultSelection(offering, 'release_pilot_legacy_v0') === '$rc_annual');
}

// ===========================================================================
// Trial eligibility CTA copy logic (paywall trial-active gate)
// ===========================================================================

// Mirrors the paywall's `trialActiveForSelected` computation so we can
// unit-test the four combinations without booting RN.
function trialActiveForSelected(args: {
  isSwitchFlow: boolean;
  planTrialDays: number;
  productId: string;
  eligibility: Record<string, boolean>;
}): boolean {
  if (args.isSwitchFlow) return false;
  if (args.planTrialDays <= 0) return false;
  return args.eligibility[args.productId] !== false;
}

ok('trial: new free user, plan with trial, eligible → show trial CTA',
  trialActiveForSelected({
    isSwitchFlow: false, planTrialDays: 14,
    productId: 'release_pilot_pro_yearly',
    eligibility: { release_pilot_pro_yearly: true },
  }) === true);

ok('trial: new free user, plan with trial, INELIGIBLE → hide trial CTA',
  trialActiveForSelected({
    isSwitchFlow: false, planTrialDays: 14,
    productId: 'release_pilot_pro_yearly',
    eligibility: { release_pilot_pro_yearly: false },
  }) === false);

ok('trial: monthly plan with no trial → never trial CTA',
  trialActiveForSelected({
    isSwitchFlow: false, planTrialDays: 0,
    productId: 'release_pilot_pro_monthly',
    eligibility: {},
  }) === false);

ok('trial: switch-flow user never sees trial CTA (already Pro)',
  trialActiveForSelected({
    isSwitchFlow: true, planTrialDays: 14,
    productId: 'release_pilot_pro_yearly',
    eligibility: { release_pilot_pro_yearly: true },
  }) === false);

ok('trial: unknown eligibility (network blip) treated as eligible',
  trialActiveForSelected({
    isSwitchFlow: false, planTrialDays: 14,
    productId: 'release_pilot_pro_yearly',
    eligibility: {}, // no entry → unknown → keep showing trial
  }) === true);

// ===========================================================================
// Summary
// ===========================================================================

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nsubscription: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
