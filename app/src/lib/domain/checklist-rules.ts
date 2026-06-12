import type {
  ASCAppScreenshotSet,
  ASCAppStoreVersion,
  ASCAppStoreVersionLocalization,
  ASCBuild,
} from '@/lib/api/asc-types';

/**
 * Pre-submit checklist rules.
 *
 * Each rule is a pure function: takes a `ChecklistContext`, returns a
 * `RuleResult`. No I/O, no side effects, no React. Trivially unit-tested.
 *
 * Design goals:
 *  - Catch the 10 most common mechanical-rejection causes verified across
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
// The 10 rules
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
// Definitions list — drives ordering in the UI and the runChecklist loop
// ---------------------------------------------------------------------------

const RULE_DEFINITIONS: readonly ((ctx: ChecklistContext) => RuleResult)[] = [
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
];

export const RULE_COUNT = RULE_DEFINITIONS.length;

// ---------------------------------------------------------------------------
// Aggregate summary (for the screen header — "8 of 10 passing")
// ---------------------------------------------------------------------------

export type ChecklistSummary = {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  unknown: number;
  na: number;
  overallSeverity: RuleSeverity;
};

export function summarizeChecklist(results: RuleResult[]): ChecklistSummary {
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
  return { ...out, overallSeverity };
}
