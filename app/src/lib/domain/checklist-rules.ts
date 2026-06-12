import type {
  ASCApp,
  ASCAppCategory,
  ASCAppInfo,
  ASCAppInfoLocalization,
  ASCAppScreenshotSet,
  ASCAppStoreVersion,
  ASCAppStoreVersionLocalization,
  ASCBuild,
  ASCSubscription,
} from '@/lib/api/asc-types';

/**
 * Compact projection of `GET /v1/apps/{id}/appPriceSchedule` — just the
 * one signal the rule needs: how many `manualPrices` entries the app
 * has. 0 = blocker. Stored as a scalar in `ChecklistContext` rather
 * than the raw schedule so the rule stays pure-data-in.
 */
export type ChecklistPriceSchedule = {
  /** Count of `manualPrices` on the schedule. 0 = no price tier set → fail. */
  priceCount: number;
};

/**
 * Compact projection of `GET /v1/apps/{id}/appAvailabilityV2`. Apple
 * blocks submissions when no territories are selected; we only need
 * the count.
 */
export type ChecklistAvailability = {
  /** Number of territories the app is offered in. 0 = blocker. */
  territoryCount: number;
  /** True when we hit Apple's pagination cap (50) — the actual count
   *  may be higher (all 175 territories is the typical full setup). */
  truncated: boolean;
};

/**
 * Pre-submit checklist rules.
 *
 * Each rule is a pure function: takes a `ChecklistContext`, returns a
 * `RuleResult`. No I/O, no side effects, no React. Trivially unit-tested.
 *
 * Design goals:
 *  - Catch the most common mechanical-rejection causes verified across
 *    indie iOS developer forums (r/iOSProgramming, IndieHackers, etc.)
 *  - When the API doesn't expose enough information for a confident
 *    pass/fail, return `unknown` rather than guessing — `unknown` shows
 *    as a neutral "you'll need to check this in ASC" item, not a false
 *    "pass" the user might trust.
 *  - Each failure should include a remediation message AND, where
 *    possible, an ASC deep-link to the exact section to fix.
 *
 * Severity ladder (most to least serious):
 *  - fail   → Apple will definitely reject (e.g. blank required field)
 *  - warn   → Common rejection but Apple sometimes accepts (e.g. missing
 *             marketing URL, low screenshot variety)
 *  - unknown→ Couldn't verify from the API alone; user must check
 *  - na     → This rule doesn't apply (e.g. "what's new" on a 1.0)
 *  - pass   → Verified OK
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuleSeverity = 'pass' | 'warn' | 'fail' | 'unknown' | 'na';

export type RuleResult = {
  id: string;
  title: string;
  severity: RuleSeverity;
  message: string;
  remediation?: string;
  ascDeepLink?: string;
};

export type ChecklistContext = {
  /** The app being checked (for deep-link URLs). */
  appId: string;
  /** The editable version (drafting / developer-rejected). null = no draft. */
  version: ASCAppStoreVersion | null;
  /** Resolved build for the version (via the version's `build` relationship). */
  build: ASCBuild | null;
  /** All locales attached to the version. */
  localizations: ASCAppStoreVersionLocalization[];
  /** Screenshot sets keyed by localization id. */
  screenshotSetsByLocalization: Map<string, ASCAppScreenshotSet[]>;
  /** True when this is the app's very first version (no prior live release). */
  isFirstVersion: boolean;

  // ---------------------------------------------------------------------
  // App-level data (set by `useChecklistQuery`). All optional — if the
  // API call fails or the user's key lacks permission, the corresponding
  // rules degrade to `unknown` instead of `fail`. We don't want a missing
  // permission to read like a broken submission.
  // ---------------------------------------------------------------------

  /** The full App entity (for `contentRightsDeclaration`). */
  app: ASCApp | null;
  /** The editable AppInfo (state=`PREPARE_FOR_SUBMISSION`), or live one. */
  appInfo: ASCAppInfo | null;
  /** Primary category resolved from `appInfo.relationships.primaryCategory`. */
  primaryCategory: ASCAppCategory | null;
  /** AppInfo localization in primary locale (for `privacyPolicyUrl`). */
  appInfoLocalization: ASCAppInfoLocalization | null;
  /**
   * Every subscription product across every group on this app. Empty
   * array = app has no IAP (rule degrades to `na`). `null` = we couldn't
   * read this endpoint (403 / network / etc) — rule degrades to `unknown`.
   */
  subscriptionProducts: ASCSubscription[] | null;
  /**
   * Pricing schedule projection. `null` = couldn't fetch (rule → `unknown`).
   * `{ priceCount: 0 }` = no price set in ASC (rule → `fail`).
   */
  priceSchedule: ChecklistPriceSchedule | null;
  /**
   * Availability (territory selection) projection. `null` = couldn't
   * fetch (rule → `unknown`). `{ territoryCount: 0 }` = no countries
   * selected (rule → `fail`).
   */
  availability: ChecklistAvailability | null;
};

// ---------------------------------------------------------------------------
// Apple-known constants
// ---------------------------------------------------------------------------

/** Apple's hard limit on the keywords field (comma-separated, ≤100 chars). */
export const KEYWORDS_MAX_CHARS = 100;
/** Apple's hard limit on promotional text. */
export const PROMO_TEXT_MAX_CHARS = 170;
/** Apple's minimum reasonable description length to look professional. */
export const DESCRIPTION_MIN_CHARS = 10;
/** Apple's maximum description length. */
export const DESCRIPTION_MAX_CHARS = 4000;

// Display-target names that count as "covering iPhone modern screens".
// At least ONE of these must have screenshots for a passing iPhone-only app.
const IPHONE_PRIMARY_DISPLAYS = new Set([
  'APP_IPHONE_67', // 6.7" — required since iOS 16
  'APP_IPHONE_69', // 6.9" — required since iOS 18
  'APP_IPHONE_65',
  'APP_IPHONE_61',
  'APP_IPHONE_55',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all rules against the context. Returns results in stable order
 * (matches `RULE_DEFINITIONS` below — drives the UI ordering).
 */
export function runChecklist(ctx: ChecklistContext): RuleResult[] {
  return RULE_DEFINITIONS.map((rule) => rule(ctx));
}

export function pickPrimaryLocalization(
  localizations: ASCAppStoreVersionLocalization[],
): ASCAppStoreVersionLocalization | null {
  if (localizations.length === 0) return null;
  // Prefer en-US since most apps' primary locale is English. Otherwise
  // first locale wins — Apple requires at least one and our queries
  // never paginate past the first 50.
  return (
    localizations.find((l) => l.attributes.locale === 'en-US') ??
    localizations[0] ??
    null
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ascAppLink(appId: string, tail = 'distribution/ios'): string {
  return `https://appstoreconnect.apple.com/apps/${appId}/${tail}`;
}

function isNonEmpty(s: string | undefined | null): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function isLikelyUrl(s: string | undefined | null): boolean {
  if (!isNonEmpty(s)) return false;
  return /^https?:\/\/[^\s]+\.[^\s]+/.test(s.trim());
}

// ---------------------------------------------------------------------------
// The 17 rules (10 per-version + 4 app-level + 1 IAP + 2 pricing/availability)
// ---------------------------------------------------------------------------

const ruleDraftExists = (ctx: ChecklistContext): RuleResult => {
  if (ctx.version) {
    return {
      id: 'draft-exists',
      title: 'A version draft exists in App Store Connect',
      severity: 'pass',
      message: `Editing v${ctx.version.attributes.versionString}.`,
    };
  }
  // No editable draft means there is literally nothing to pre-check.
  // Returning `na` (not `fail`) is honest: the app isn't broken, you just
  // don't have a pending submission. The screen renders a neutral "Nothing
  // to check yet — create a draft in ASC" empty-state instead of red
  // "blocker" copy, with a deep link to start a new version.
  return {
    id: 'draft-exists',
    title: 'A version draft exists in App Store Connect',
    severity: 'na',
    message: 'No draft in progress — nothing to pre-check.',
    remediation: 'When you\'re ready to ship a new version, tap the "+" next to App Store in ASC to add one.',
    ascDeepLink: ascAppLink(ctx.appId),
  };
};

const ruleBuildAttached = (ctx: ChecklistContext): RuleResult => {
  if (!ctx.version) {
    return { id: 'build-attached', title: 'A build is attached', severity: 'na', message: 'No draft to check.' };
  }
  if (ctx.build) {
    const buildNum = ctx.build.attributes.version;
    const processingState = ctx.build.attributes.processingState;
    if (processingState === 'INVALID' || processingState === 'FAILED') {
      return {
        id: 'build-attached',
        title: 'A build is attached',
        severity: 'fail',
        message: `Build #${buildNum ?? '?'} is ${processingState?.toLowerCase()} — Apple won't accept it.`,
        remediation: 'Upload a fresh build via Xcode → Organizer or `fastlane pilot`, then re-attach.',
        ascDeepLink: ascAppLink(ctx.appId),
      };
    }
    if (processingState === 'PROCESSING') {
      return {
        id: 'build-attached',
        title: 'A build is attached',
        severity: 'warn',
        message: `Build #${buildNum ?? '?'} is still processing. Wait for it to finish before submitting.`,
        ascDeepLink: ascAppLink(ctx.appId),
      };
    }
    return {
      id: 'build-attached',
      title: 'A build is attached',
      severity: 'pass',
      message: `Build #${buildNum ?? '?'} attached and valid.`,
    };
  }
  return {
    id: 'build-attached',
    title: 'A build is attached',
    severity: 'fail',
    message: 'No build is attached to this draft.',
    remediation: 'Upload a build via Xcode, then attach it in App Store Connect → App Store → Build.',
    ascDeepLink: ascAppLink(ctx.appId),
  };
};

const ruleDescription = (ctx: ChecklistContext): RuleResult => {
  const loc = pickPrimaryLocalization(ctx.localizations);
  if (!ctx.version || !loc) {
    return { id: 'description', title: 'Description is filled in', severity: 'na', message: 'No primary locale to check.' };
  }
  const d = loc.attributes.description ?? '';
  if (d.trim().length === 0) {
    return {
      id: 'description',
      title: 'Description is filled in',
      severity: 'fail',
      message: `${loc.attributes.locale ?? 'Primary locale'} description is blank.`,
      remediation: 'Write a description explaining what the app does and who it\'s for (10–4000 chars).',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  if (d.length < DESCRIPTION_MIN_CHARS) {
    return {
      id: 'description',
      title: 'Description is filled in',
      severity: 'warn',
      message: `Description is only ${d.length} character(s) — Apple usually rejects "too short".`,
      remediation: `Aim for at least 100 characters of real explanation.`,
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  if (d.length > DESCRIPTION_MAX_CHARS) {
    return {
      id: 'description',
      title: 'Description is filled in',
      severity: 'fail',
      message: `Description is ${d.length} characters — Apple's hard cap is ${DESCRIPTION_MAX_CHARS}.`,
      remediation: 'Trim copy until it fits — Apple\'s validator will reject without prompting.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  return {
    id: 'description',
    title: 'Description is filled in',
    severity: 'pass',
    message: `${d.length} characters in ${loc.attributes.locale ?? 'primary locale'}.`,
  };
};

const ruleKeywords = (ctx: ChecklistContext): RuleResult => {
  const loc = pickPrimaryLocalization(ctx.localizations);
  if (!ctx.version || !loc) {
    return { id: 'keywords', title: 'Keywords fit Apple\'s 100-character limit', severity: 'na', message: 'No primary locale to check.' };
  }
  const k = loc.attributes.keywords ?? '';
  if (k.trim().length === 0) {
    return {
      id: 'keywords',
      title: 'Keywords fit Apple\'s 100-character limit',
      severity: 'warn',
      message: 'Keywords field is blank — discoverability will suffer.',
      remediation: 'Add ~5–10 comma-separated keywords (totaling ≤100 chars).',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  if (k.length > KEYWORDS_MAX_CHARS) {
    return {
      id: 'keywords',
      title: 'Keywords fit Apple\'s 100-character limit',
      severity: 'fail',
      message: `Keywords are ${k.length}/${KEYWORDS_MAX_CHARS} characters. Apple will reject.`,
      remediation: 'Drop redundant comma-separated tokens until you\'re under 100 chars.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  return {
    id: 'keywords',
    title: 'Keywords fit Apple\'s 100-character limit',
    severity: 'pass',
    message: `${k.length}/${KEYWORDS_MAX_CHARS} chars in ${loc.attributes.locale ?? 'primary locale'}.`,
  };
};

const ruleSupportUrl = (ctx: ChecklistContext): RuleResult => {
  const loc = pickPrimaryLocalization(ctx.localizations);
  if (!ctx.version || !loc) {
    return { id: 'support-url', title: 'Support URL is set and looks valid', severity: 'na', message: 'No primary locale to check.' };
  }
  const url = loc.attributes.supportUrl;
  if (!isNonEmpty(url)) {
    return {
      id: 'support-url',
      title: 'Support URL is set and looks valid',
      severity: 'fail',
      message: 'Support URL is required for every submission — yours is blank.',
      remediation: 'Add a public-facing support page or email-collection form (https://…).',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  if (!isLikelyUrl(url)) {
    return {
      id: 'support-url',
      title: 'Support URL is set and looks valid',
      severity: 'warn',
      message: `"${url}" doesn't look like a valid URL.`,
      remediation: 'Make sure it starts with https:// and points to a reachable page.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  return {
    id: 'support-url',
    title: 'Support URL is set and looks valid',
    severity: 'pass',
    message: url,
  };
};

const ruleMarketingUrl = (ctx: ChecklistContext): RuleResult => {
  const loc = pickPrimaryLocalization(ctx.localizations);
  if (!ctx.version || !loc) {
    return { id: 'marketing-url', title: 'Marketing URL is set (recommended)', severity: 'na', message: 'No primary locale to check.' };
  }
  const url = loc.attributes.marketingUrl;
  if (!isNonEmpty(url)) {
    return {
      id: 'marketing-url',
      title: 'Marketing URL is set (recommended)',
      severity: 'warn',
      message: 'Marketing URL is optional but improves the App Store listing.',
      remediation: 'Add a landing page URL — improves ranking & user trust.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  if (!isLikelyUrl(url)) {
    return {
      id: 'marketing-url',
      title: 'Marketing URL is set (recommended)',
      severity: 'warn',
      message: `"${url}" doesn't look like a valid URL.`,
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  return {
    id: 'marketing-url',
    title: 'Marketing URL is set (recommended)',
    severity: 'pass',
    message: url,
  };
};

const rulePromotionalText = (ctx: ChecklistContext): RuleResult => {
  const loc = pickPrimaryLocalization(ctx.localizations);
  if (!ctx.version || !loc) {
    return { id: 'promo-text', title: 'Promotional text fits 170-character limit', severity: 'na', message: 'No primary locale to check.' };
  }
  const t = loc.attributes.promotionalText ?? '';
  if (t.length === 0) {
    return {
      id: 'promo-text',
      title: 'Promotional text fits 170-character limit',
      severity: 'na',
      message: 'No promotional text set (optional).',
    };
  }
  if (t.length > PROMO_TEXT_MAX_CHARS) {
    return {
      id: 'promo-text',
      title: 'Promotional text fits 170-character limit',
      severity: 'fail',
      message: `Promotional text is ${t.length}/${PROMO_TEXT_MAX_CHARS} characters.`,
      remediation: 'Trim by ' + (t.length - PROMO_TEXT_MAX_CHARS) + ' character(s) to fit.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  return {
    id: 'promo-text',
    title: 'Promotional text fits 170-character limit',
    severity: 'pass',
    message: `${t.length}/${PROMO_TEXT_MAX_CHARS} chars.`,
  };
};

const ruleWhatsNew = (ctx: ChecklistContext): RuleResult => {
  if (ctx.isFirstVersion) {
    return {
      id: 'whats-new',
      title: "What's new is filled in",
      severity: 'na',
      message: 'First version — no release notes needed.',
    };
  }
  const loc = pickPrimaryLocalization(ctx.localizations);
  if (!ctx.version || !loc) {
    return { id: 'whats-new', title: "What's new is filled in", severity: 'na', message: 'No primary locale to check.' };
  }
  const w = loc.attributes.whatsNew ?? '';
  if (w.trim().length === 0) {
    return {
      id: 'whats-new',
      title: "What's new is filled in",
      severity: 'fail',
      message: 'Release notes are blank — Apple requires them on every update after 1.0.',
      remediation: 'Write 1–3 short bullets covering the user-facing changes.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  return {
    id: 'whats-new',
    title: "What's new is filled in",
    severity: 'pass',
    message: `${w.length} characters in ${loc.attributes.locale ?? 'primary locale'}.`,
  };
};

const ruleScreenshots = (ctx: ChecklistContext): RuleResult => {
  const loc = pickPrimaryLocalization(ctx.localizations);
  if (!ctx.version || !loc) {
    return { id: 'screenshots', title: 'Screenshots present for primary iPhone', severity: 'na', message: 'No primary locale to check.' };
  }
  const sets = ctx.screenshotSetsByLocalization.get(loc.id) ?? [];
  if (sets.length === 0) {
    return {
      id: 'screenshots',
      title: 'Screenshots present for primary iPhone',
      severity: 'fail',
      message: 'No screenshots uploaded yet for the primary locale.',
      remediation: 'Upload screenshots for at least one supported iPhone size (6.7" or 6.9" recommended).',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  const hasIphone = sets.some((s) =>
    IPHONE_PRIMARY_DISPLAYS.has(s.attributes.screenshotDisplayType ?? ''),
  );
  if (!hasIphone) {
    return {
      id: 'screenshots',
      title: 'Screenshots present for primary iPhone',
      severity: 'warn',
      message: 'No screenshots for a modern iPhone size — Apple usually requires at least 6.7" or 6.9".',
      remediation: 'Add a 6.7" (iPhone 14/15 Plus) or 6.9" (iPhone 16 Pro Max) set.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  return {
    id: 'screenshots',
    title: 'Screenshots present for primary iPhone',
    severity: 'pass',
    message: `${sets.length} screenshot set(s) uploaded, including modern iPhone size.`,
  };
};

const rulePrivacyEncryption = (ctx: ChecklistContext): RuleResult => {
  // The ASC API doesn't surface the encryption export-compliance answer
  // on a per-version basis through any endpoint accessible with default
  // permissions. We can't confidently mark it pass/fail without that
  // signal, so we return `unknown` with clear instructions.
  if (!ctx.version) {
    return { id: 'encryption', title: 'Encryption export compliance answered', severity: 'na', message: 'No draft to check.' };
  }
  return {
    id: 'encryption',
    title: 'Encryption export compliance answered',
    severity: 'unknown',
    message:
      "We can't read this answer from the API — please verify in App Store Connect.",
    remediation:
      "Open the version's build section → tap the build → answer the encryption questions before submitting.",
    ascDeepLink: ascAppLink(ctx.appId),
  };
};

// ---------------------------------------------------------------------------
// App-level rules (5) — these check fields that survive across versions.
// They especially matter for FIRST submissions, where every app-level
// field is also a blocker (Apple won't accept the binary without them).
// ---------------------------------------------------------------------------

const ruleContentRights = (ctx: ChecklistContext): RuleResult => {
  if (!ctx.app) {
    // We couldn't load the App entity — degrade to `unknown` so the user
    // knows to verify manually. This is NOT `fail` because absence of
    // signal isn't proof of absence of data.
    return {
      id: 'content-rights',
      title: 'Content rights declaration set',
      severity: 'unknown',
      message: "We couldn't read your app's Content Rights setting from the API.",
      remediation: 'App Store Connect → App Information → Content Rights → select Yes or No.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  const v = ctx.app.attributes.contentRightsDeclaration;
  if (!isNonEmpty(v)) {
    return {
      id: 'content-rights',
      title: 'Content rights declaration set',
      severity: 'fail',
      message: "Apple requires you to declare whether your app uses third-party content.",
      remediation:
        'App Store Connect → App Information → Content Rights → answer Yes or No (most indie apps answer "No").',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  return {
    id: 'content-rights',
    title: 'Content rights declaration set',
    severity: 'pass',
    message:
      v === 'USES_THIRD_PARTY_CONTENT'
        ? 'Declared: uses third-party content (rights confirmed).'
        : "Declared: doesn't use third-party content.",
  };
};

const ruleCategory = (ctx: ChecklistContext): RuleResult => {
  if (!ctx.appInfo) {
    return {
      id: 'category',
      title: 'Primary App Store category chosen',
      severity: 'unknown',
      message: "We couldn't read your App Info from the API.",
      remediation: 'App Store Connect → App Information → set a Primary Category.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  if (!ctx.primaryCategory) {
    return {
      id: 'category',
      title: 'Primary App Store category chosen',
      severity: 'fail',
      message: "No Primary Category selected — Apple won't accept the submission.",
      remediation:
        'App Store Connect → App Information → Primary Category → pick the best fit (e.g. Productivity, Utilities, Developer Tools).',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  // Apple's category ids are uppercase enum strings — humanize for the UI.
  const human = ctx.primaryCategory.id
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
  return {
    id: 'category',
    title: 'Primary App Store category chosen',
    severity: 'pass',
    message: `Primary Category: ${human}.`,
  };
};

const rulePrivacyPolicyUrl = (ctx: ChecklistContext): RuleResult => {
  if (!ctx.appInfo) {
    return {
      id: 'privacy-policy-url',
      title: 'Privacy Policy URL set on App Info',
      severity: 'unknown',
      message: "We couldn't read your App Info from the API.",
      remediation:
        'App Store Connect → App Information → General → set a public Privacy Policy URL (https://…).',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  const loc = ctx.appInfoLocalization;
  if (!loc) {
    return {
      id: 'privacy-policy-url',
      title: 'Privacy Policy URL set on App Info',
      severity: 'fail',
      message: 'No App Info localization found — Apple needs one for the primary locale.',
      remediation:
        'App Store Connect → App Information → fill in name, subtitle, and Privacy Policy URL for your primary locale.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  const url = loc.attributes.privacyPolicyUrl;
  if (!isNonEmpty(url)) {
    return {
      id: 'privacy-policy-url',
      title: 'Privacy Policy URL set on App Info',
      severity: 'fail',
      message: 'Privacy Policy URL is blank — Apple requires this for every app.',
      remediation:
        'App Store Connect → App Information → Privacy Policy URL → paste your public privacy policy URL (https://…).',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  if (!isLikelyUrl(url)) {
    return {
      id: 'privacy-policy-url',
      title: 'Privacy Policy URL set on App Info',
      severity: 'warn',
      message: `"${url}" doesn't look like a valid URL.`,
      remediation: 'Make sure it starts with https:// and points to a reachable page.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  return {
    id: 'privacy-policy-url',
    title: 'Privacy Policy URL set on App Info',
    severity: 'pass',
    message: url,
  };
};

const ruleAppPrivacyDetails = (ctx: ChecklistContext): RuleResult => {
  // App Privacy "Data Types" survey (Privacy Nutrition Labels). The ASC
  // API doesn't expose the survey answers — Apple intentionally requires
  // it to be set through the dashboard only. We surface as `unknown`
  // with a clear deep link so the user knows to verify manually.
  if (!ctx.version) {
    return {
      id: 'app-privacy-details',
      title: 'App Privacy "Data Types" survey filled',
      severity: 'na',
      message: 'No draft to check.',
    };
  }
  return {
    id: 'app-privacy-details',
    title: 'App Privacy "Data Types" survey filled',
    severity: 'unknown',
    message:
      "We can't read the App Privacy survey from the API — Apple only exposes it in the dashboard.",
    remediation:
      'App Store Connect → App Privacy → Data Types → fill in every data type your app collects (or declare "we don\'t collect data").',
    ascDeepLink: ascAppLink(ctx.appId, 'app-privacy'),
  };
};

const ruleSubscriptionProducts = (ctx: ChecklistContext): RuleResult => {
  if (ctx.subscriptionProducts === null) {
    // 403 / network — can't tell. Degrade gracefully.
    return {
      id: 'subscription-products',
      title: 'Subscription products are ready to submit',
      severity: 'unknown',
      message:
        "We couldn't read your subscription products from the API (the key may not have Admin / App Manager role).",
      remediation:
        'App Store Connect → Monetization → Subscriptions → verify every product shows "Ready to Submit" (not "Missing Metadata").',
      ascDeepLink: ascAppLink(ctx.appId, 'subscriptions'),
    };
  }
  if (ctx.subscriptionProducts.length === 0) {
    return {
      id: 'subscription-products',
      title: 'Subscription products are ready to submit',
      severity: 'na',
      message: 'This app has no in-app subscriptions.',
    };
  }
  // Categorize each product. MISSING_METADATA is a hard block; REJECTED
  // means Apple already pushed back — both fail. READY_TO_SUBMIT and
  // anything past it (WAITING/IN_REVIEW/APPROVED) are fine.
  const broken: ASCSubscription[] = [];
  const stale: ASCSubscription[] = [];
  let ready = 0;
  for (const s of ctx.subscriptionProducts) {
    const state = s.attributes.state ?? '';
    if (state === 'MISSING_METADATA') broken.push(s);
    else if (state === 'REJECTED') broken.push(s);
    else if (state === 'DEVELOPER_REMOVED_FROM_SALE') stale.push(s);
    else ready++;
  }
  if (broken.length > 0) {
    const first = broken[0]!;
    const name = first.attributes.name ?? first.attributes.productId ?? '(unnamed)';
    const stateLabel =
      first.attributes.state === 'MISSING_METADATA' ? 'is MISSING_METADATA' : 'was rejected by Apple';
    return {
      id: 'subscription-products',
      title: 'Subscription products are ready to submit',
      severity: 'fail',
      message:
        broken.length === 1
          ? `'${name}' ${stateLabel}. Apple won't approve the binary.`
          : `${broken.length} subscription products need attention. First one: '${name}' ${stateLabel}.`,
      remediation:
        first.attributes.state === 'MISSING_METADATA'
          ? "Open ASC → Monetization → Subscriptions → tap the product → fill in Availability + Price + Localization + Review Screenshot until status flips to 'Ready to Submit'."
          : "Open ASC → Monetization → Subscriptions → tap the product → review Apple's rejection reason and resubmit.",
      ascDeepLink: ascAppLink(ctx.appId, 'subscriptions'),
    };
  }
  if (stale.length > 0) {
    const first = stale[0]!;
    const name = first.attributes.name ?? first.attributes.productId ?? '(unnamed)';
    return {
      id: 'subscription-products',
      title: 'Subscription products are ready to submit',
      severity: 'warn',
      message: `'${name}' is removed from sale. Confirm this was intentional.`,
      ascDeepLink: ascAppLink(ctx.appId, 'subscriptions'),
    };
  }
  return {
    id: 'subscription-products',
    title: 'Subscription products are ready to submit',
    severity: 'pass',
    message: `${ready}/${ctx.subscriptionProducts.length} subscription product(s) ready.`,
  };
};

// ---------------------------------------------------------------------------
// Pricing / Availability rules (2) — these check the "Pricing and
// Availability" sidebar in ASC. Apple blocks "Add for Review" if either
// is misconfigured, with a generic "you must choose a price tier in
// Pricing" / "you must select a territory" error. We catch both before
// the user discovers them at submission time.
// ---------------------------------------------------------------------------

const rulePriceTier = (ctx: ChecklistContext): RuleResult => {
  if (!ctx.priceSchedule) {
    // Couldn't fetch (403/network/timeout) — degrade to unknown so the
    // user can verify manually rather than seeing a false fail.
    return {
      id: 'price-tier',
      title: 'Price tier is set in Pricing and Availability',
      severity: 'unknown',
      message: "We couldn't read your Pricing setting from the API.",
      remediation:
        "App Store Connect → Pricing and Availability → confirm a price tier is set (USD 0 for free apps).",
      ascDeepLink: ascAppLink(ctx.appId, 'pricing'),
    };
  }
  if (ctx.priceSchedule.priceCount === 0) {
    return {
      id: 'price-tier',
      title: 'Price tier is set in Pricing and Availability',
      severity: 'fail',
      message:
        "No price tier set — Apple blocks \"Add for Review\" until one is configured.",
      remediation:
        "App Store Connect → Pricing and Availability → Add Pricing → pick USD 0 (Free) for a free app, or your chosen tier.",
      ascDeepLink: ascAppLink(ctx.appId, 'pricing'),
    };
  }
  return {
    id: 'price-tier',
    title: 'Price tier is set in Pricing and Availability',
    severity: 'pass',
    message:
      ctx.priceSchedule.priceCount === 1
        ? 'Pricing schedule has 1 active tier.'
        : `Pricing schedule has ${ctx.priceSchedule.priceCount} active tiers.`,
  };
};

const ruleAvailability = (ctx: ChecklistContext): RuleResult => {
  if (!ctx.availability) {
    return {
      id: 'availability',
      title: 'At least one territory is selected in Availability',
      severity: 'unknown',
      message: "We couldn't read your Availability setting from the API.",
      remediation:
        'App Store Connect → Pricing and Availability → Availability → confirm at least one country is selected.',
      ascDeepLink: ascAppLink(ctx.appId, 'pricing'),
    };
  }
  if (ctx.availability.territoryCount === 0) {
    return {
      id: 'availability',
      title: 'At least one territory is selected in Availability',
      severity: 'fail',
      message: "No countries selected — Apple won't accept the submission.",
      remediation:
        'App Store Connect → Pricing and Availability → Availability → pick at least one country (typically all 175).',
      ascDeepLink: ascAppLink(ctx.appId, 'pricing'),
    };
  }
  const count = ctx.availability.territoryCount;
  const suffix = ctx.availability.truncated ? '+' : '';
  return {
    id: 'availability',
    title: 'At least one territory is selected in Availability',
    severity: 'pass',
    message:
      count === 1 && !ctx.availability.truncated
        ? 'Available in 1 territory.'
        : `Available in ${count}${suffix} territories.`,
  };
};

// ---------------------------------------------------------------------------
// Definitions list — drives ordering in the UI and the runChecklist loop
// ---------------------------------------------------------------------------

const RULE_DEFINITIONS: readonly ((ctx: ChecklistContext) => RuleResult)[] = [
  // Per-version rules (run every release)
  ruleDraftExists,
  ruleBuildAttached,
  ruleDescription,
  ruleKeywords,
  ruleSupportUrl,
  ruleMarketingUrl,
  rulePromotionalText,
  ruleWhatsNew,
  ruleScreenshots,
  rulePrivacyEncryption,

  // App-level rules (mostly matter for first submission, but still
  // surface drift if you ever clear a value later).
  ruleContentRights,
  ruleCategory,
  rulePrivacyPolicyUrl,
  ruleAppPrivacyDetails,

  // IAP rules (only apps with subscriptions)
  ruleSubscriptionProducts,

  // Pricing & Availability (block "Add for Review" if missing)
  rulePriceTier,
  ruleAvailability,
];

export const RULE_COUNT = RULE_DEFINITIONS.length;

// ---------------------------------------------------------------------------
// Aggregate summary (for the screen header — "15 of 17 passing")
// ---------------------------------------------------------------------------

export type ChecklistSummary = {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  unknown: number;
  na: number;
  overallSeverity: RuleSeverity;
  /**
   * Whether there's an editable version draft on this app. False when the
   * app has no `PREPARE_FOR_SUBMISSION` or `DEVELOPER_REJECTED` version
   * (e.g. a live app with no pending update). The summary card switches
   * to neutral "nothing to submit" copy in that case.
   */
  hasDraft: boolean;
  /**
   * Whether this is the app's very first submission attempt (no prior
   * version has ever been LIVE or REPLACED). Used to distinguish:
   *  - first-time submitter (encourage creating a draft)
   *  - returning developer between releases (celebrate the live app)
   */
  isFirstVersion: boolean;
};

export function summarizeChecklist(
  results: RuleResult[],
  ctx?: Pick<ChecklistContext, 'version' | 'isFirstVersion'>,
): ChecklistSummary {
  const out = { total: results.length, pass: 0, warn: 0, fail: 0, unknown: 0, na: 0 };
  for (const r of results) {
    if (r.severity === 'pass') out.pass++;
    else if (r.severity === 'warn') out.warn++;
    else if (r.severity === 'fail') out.fail++;
    else if (r.severity === 'unknown') out.unknown++;
    else out.na++;
  }
  const overallSeverity: RuleSeverity =
    out.fail > 0 ? 'fail'
    : out.warn > 0 ? 'warn'
    : out.unknown > 0 ? 'unknown'
    : 'pass';
  // hasDraft: prefer the explicit ctx signal; fall back to inferring from
  // the draft-exists rule for callers that only have the results array.
  const hasDraft = ctx
    ? ctx.version !== null
    : results.find((r) => r.id === 'draft-exists')?.severity !== 'na';
  const isFirstVersion = ctx?.isFirstVersion ?? false;
  return { ...out, overallSeverity, hasDraft, isFirstVersion };
}
