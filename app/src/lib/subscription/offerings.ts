import type { PaywallOffering, PaywallPlan } from './types';

/**
 * Pure normalizer: turn a (partial) RevenueCat `Offerings.current` into
 * the typed shape the paywall renders from.
 *
 * Sort order: annual first (highest perceived value), then monthly,
 * then lifetime, then anything else. Within a group, cheaper first.
 *
 * Why this lives in its own pure module:
 *  - Testable in Node without booting the RC SDK
 *  - Stable API even if RC adds new fields to Package
 *  - Single place to compute "perMonthString" for annual savings copy
 */

/** Subset of RevenueCat `Offering` we consume. */
export type OfferingLike = {
  identifier: string;
  availablePackages?: PackageLike[];
};

/** Subset of RevenueCat `Package` we consume. */
export type PackageLike = {
  identifier: string;
  packageType?: 'MONTHLY' | 'ANNUAL' | 'LIFETIME' | string;
  product: ProductLike;
};

export type ProductLike = {
  identifier: string;
  title?: string;
  description?: string;
  priceString: string;
  price: number;
  currencyCode: string;
  /** Apple-provided intro period; we only care about trial offers. */
  introPrice?: {
    period?: string;        // ISO 8601 duration e.g. "P14D"
    periodNumberOfUnits?: number;
    periodUnit?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | string;
    price?: number;
  } | null;
};

/** Months in each annual unit — used to compute per-month price for the
 *  "$3.33/month billed annually" subtitle. */
const MONTHS_PER_PACKAGE: Record<string, number> = {
  ANNUAL: 12,
  SIX_MONTH: 6,
  THREE_MONTH: 3,
  TWO_MONTH: 2,
  MONTHLY: 1,
};

export function normalizeOffering(offering: OfferingLike | null): PaywallOffering | null {
  if (!offering) return null;
  const plans = (offering.availablePackages ?? [])
    .map(packageToPlan)
    .filter((p): p is PaywallPlan => p !== null)
    .sort(sortPlans);

  return {
    identifier: offering.identifier,
    plans,
    hasTrial: plans.some((p) => p.trialDays > 0),
  };
}

function packageToPlan(pkg: PackageLike): PaywallPlan | null {
  const product = pkg.product;
  if (!product || !product.priceString) return null;

  const kind = packageKind(pkg.packageType);
  const trialDays = trialDurationDays(product);
  const months = MONTHS_PER_PACKAGE[pkg.packageType ?? 'MONTHLY'];
  const perMonthString =
    kind === 'annual' && months && months > 1
      ? formatPerMonth(product.price, months, product.priceString, product.currencyCode)
      : null;

  return {
    packageId: pkg.identifier,
    productId: product.identifier,
    kind,
    priceString: product.priceString,
    priceAmount: product.price,
    currencyCode: product.currencyCode,
    perMonthString,
    trialDays,
    title: product.title ?? defaultTitleForKind(kind),
    description: product.description ?? '',
  };
}

function packageKind(t: string | undefined): PaywallPlan['kind'] {
  switch (t) {
    case 'MONTHLY':  return 'monthly';
    case 'ANNUAL':   return 'annual';
    case 'LIFETIME': return 'lifetime';
    default:         return 'unknown';
  }
}

function defaultTitleForKind(k: PaywallPlan['kind']): string {
  switch (k) {
    case 'monthly':  return 'Pro · Monthly';
    case 'annual':   return 'Pro · Yearly';
    case 'lifetime': return 'Pro · Lifetime';
    case 'unknown':  return 'Pro';
  }
}

/** Compute "$3.33/mo" given a 12-month total price + the apple-localized
 *  total. We parse the localized string just to extract the currency
 *  symbol + decimal placement; we never trust it for the math. */
function formatPerMonth(
  totalPrice: number,
  months: number,
  totalLocalized: string,
  currencyCode: string,
): string | null {
  if (!Number.isFinite(totalPrice) || totalPrice <= 0 || months <= 0) return null;
  const perMonth = totalPrice / months;
  try {
    // Intl.NumberFormat is universally available in Hermes + Web; the
    // RN runtime ships ICU. Fall back to a naïve template if it throws.
    const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode });
    return `${fmt.format(perMonth)}/mo`;
  } catch {
    // Pull the currency symbol from the price string ("€" / "$" / "£")
    const symbol = totalLocalized.replace(/[\d.,\s]/g, '').trim() || currencyCode;
    return `${symbol}${perMonth.toFixed(2)}/mo`;
  }
}

/** Convert "P14D" / "P1W" / "P1M" → days. */
function trialDurationDays(product: ProductLike): number {
  const intro = product.introPrice;
  if (!intro) return 0;
  if (typeof intro.price === 'number' && intro.price > 0) return 0;
  if (intro.periodNumberOfUnits && intro.periodUnit) {
    return unitsToDays(intro.periodNumberOfUnits, intro.periodUnit);
  }
  if (intro.period) {
    const m = intro.period.match(/^P(\d+)([DWMY])$/i);
    if (!m) return 0;
    const n = Number(m[1]);
    const u = m[2]!.toUpperCase();
    return unitsToDays(n, u);
  }
  return 0;
}

function unitsToDays(n: number, unit: string): number {
  switch (unit) {
    case 'D': case 'DAY':   return n;
    case 'W': case 'WEEK':  return n * 7;
    case 'M': case 'MONTH': return n * 30;
    case 'Y': case 'YEAR':  return n * 365;
    default:                return 0;
  }
}

/** Annual > monthly > lifetime > unknown. Cheaper-first within a kind. */
function sortPlans(a: PaywallPlan, b: PaywallPlan): number {
  const rank: Record<PaywallPlan['kind'], number> = {
    annual: 0, monthly: 1, lifetime: 2, unknown: 3,
  };
  const r = rank[a.kind] - rank[b.kind];
  if (r !== 0) return r;
  return a.priceAmount - b.priceAmount;
}
