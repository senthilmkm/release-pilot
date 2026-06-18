import type {
  ASCApp,
  ASCAppCategory,
  ASCAppInfo,
  ASCAppInfoLocalization,
  ASCAppScreenshotSet,
  ASCAppStoreVersion,
  ASCAppStoreVersionLocalization,
  ASCAgeRatingDeclaration,
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
   * Age Rating answers attached to `appInfo`. `ageRatingDeclarationChecked`
   * separates "successfully fetched but missing" from "couldn't read it".
   */
  ageRatingDeclaration: ASCAgeRatingDeclaration | null;
  ageRatingDeclarationChecked: boolean;
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

const AGE_RATING_ENUM_FIELDS = [
  'alcoholTobaccoOrDrugUseOrReferences',
  'contests',
  'gamblingSimulated',
  'medicalOrTreatmentInformation',
  'profanityOrCrudeHumor',
  'sexualContentGraphicAndNudity',
  'sexualContentOrNudity',
  'horrorOrFearThemes',
  'matureOrSuggestiveThemes',
  'violenceCartoonOrFantasy',
  'violenceRealisticProlongedGraphicOrSadistic',
  'violenceRealistic',
] as const;

const AGE_RATING_BOOLEAN_FIELDS = [
  'gambling',
  'unrestrictedWebAccess',
] as const;

const AGE_RATING_LABELS: Record<
  (typeof AGE_RATING_ENUM_FIELDS)[number] | (typeof AGE_RATING_BOOLEAN_FIELDS)[number],
  string
> = {
  alcoholTobaccoOrDrugUseOrReferences: 'alcohol/tobacco/drug references',
  contests: 'contests',
  gamblingSimulated: 'simulated gambling',
  medicalOrTreatmentInformation: 'medical/treatment information',
  profanityOrCrudeHumor: 'profanity/crude humor',
  sexualContentGraphicAndNudity: 'graphic sexual content',
  sexualContentOrNudity: 'sexual content/nudity',
  horrorOrFearThemes: 'horror/fear themes',
  matureOrSuggestiveThemes: 'mature/suggestive themes',
  violenceCartoonOrFantasy: 'cartoon/fantasy violence',
  violenceRealisticProlongedGraphicOrSadistic: 'graphic realistic violence',
  violenceRealistic: 'realistic violence',
  gambling: 'gambling',
  unrestrictedWebAccess: 'unrestricted web access',
};

// ---------------------------------------------------------------------------
// Keyword linter (v1.0.1) — pure ASO-quality checks
// ---------------------------------------------------------------------------
//
// Apple's iOS search ranks results using three text fields you control:
// app name (30c, heaviest), subtitle (30c), keyword field (100c, hidden).
// The DESCRIPTION text is ignored by search (Google Play differs). The
// linter rules below flag the four most common waste/loss patterns
// without needing any external traffic-data API:
//
//   1. spaces after commas — Apple counts every char incl. spaces
//   2. duplicates with name/subtitle — Apple already ranks for those
//   3. plurals — Apple stems automatically, "note" indexes "notes"
//   4. locale coverage — easy SEO win on non-English storefronts
//
// All four rules read ONLY from data the checklist context already has
// (`localizations` for keywords; `appInfoLocalization` for name+subtitle).
// No new ASC API calls, no new context fields. Strictly additive.

/** Common false-positives for the "ends in s = plural" heuristic. */
const PLURAL_SAFELIST = new Set([
  // platforms / acronyms
  'ios', 'macos', 'tvos', 'watchos', 'ipados', 'visionos',
  'css', 'js', 'ts', 'os', 'sms', 'rss', 'gps', 'pos', 'aws', 'cms',
  // single nouns that happen to end in s
  'news', 'lens', 'focus', 'business', 'address', 'campus', 'virus',
  'bonus', 'minus', 'plus', 'thus', 'this',
  'class', 'glass', 'bass', 'pass', 'mass', 'boss', 'loss',
  'fitness', 'wellness', 'mindfulness', 'happiness', 'illness',
  'access', 'process', 'progress', 'success', 'stress', 'press',
  'bus', 'gas',
]);

export type KeywordAnalysis = {
  /** Raw character count of the field as stored (including spaces). */
  totalChars: number;
  /** Comma-joined token length with no spaces — the "effective" cost. */
  effectiveChars: number;
  /** Each non-empty comma-separated token, trimmed, original casing. */
  tokens: string[];
  /** Chars Apple charges you for that don't carry information. */
  wastedSpaceChars: number;
  /** Keyword tokens (lowercased) that also appear in the app name. */
  duplicatesWithName: string[];
  /** Keyword tokens (lowercased) that also appear in the subtitle. */
  duplicatesWithSubtitle: string[];
  /** Keyword tokens (lowercased) that look like plurals Apple would stem. */
  likelyPlurals: string[];
};

/**
 * Pure analyzer. Feeds the 4 keyword rules + the rule-detail UI's "what
 * the linter sees" section. No I/O, no React. Trivially unit-tested.
 *
 * `name` / `subtitle` are optional — when null/undefined the duplicate
 * lists are empty (the rule then degrades to `unknown` upstream).
 */
export function analyzeKeywords(args: {
  keywords: string;
  name?: string | null;
  subtitle?: string | null;
}): KeywordAnalysis {
  const raw = args.keywords ?? '';
  const tokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // Apple counts every character against the 100-char cap including
  // whitespace. The "wasted" delta = raw length minus the same tokens
  // joined back with NO spaces. Equivalent to counting spaces around
  // commas plus any double-comma artifacts.
  const compactLength = tokens.join(',').length;
  const wastedSpaceChars = Math.max(0, raw.length - compactLength);

  const lowerTokens = tokens.map((t) => t.toLowerCase());
  const nameWords = wordSet(args.name ?? '');
  const subtitleWords = wordSet(args.subtitle ?? '');

  const duplicatesWithName = uniq(lowerTokens.filter((t) => nameWords.has(t)));
  const duplicatesWithSubtitle = uniq(
    lowerTokens.filter((t) => subtitleWords.has(t)),
  );
  const likelyPlurals = uniq(lowerTokens.filter(isLikelyPlural));

  return {
    totalChars: raw.length,
    effectiveChars: compactLength,
    tokens,
    wastedSpaceChars,
    duplicatesWithName,
    duplicatesWithSubtitle,
    likelyPlurals,
  };
}

/** Lowercased word set from a free-text field, split on whitespace +
 *  common separators. Filters tokens shorter than 2 chars (which would
 *  otherwise produce noisy matches against single-letter keywords). */
function wordSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[\s,.\-_:;/()[\]{}!?"']+/)
      .filter((t) => t.length > 1),
  );
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** Conservative plural detector — only flags tokens that end in `s`,
 *  are at least 4 chars long, are pure alphabetic, AND aren't in the
 *  safelist of common false-positives (iOS, news, business, etc).
 *  False negatives are preferred over false positives — a warning that
 *  hits a genuine singular ("press") is more annoying than a missed
 *  plural the user can spot later. */
function isLikelyPlural(token: string): boolean {
  const t = token.toLowerCase();
  if (t.length < 4) return false;
  if (!t.endsWith('s')) return false;
  if (!/^[a-z]+$/.test(t)) return false;
  if (PLURAL_SAFELIST.has(t)) return false;
  // "-ss" endings (boss, miss, pass) are usually singular even when not
  // in the safelist; the safelist covers the common ones explicitly but
  // we add a belt-and-suspenders heuristic for misses.
  if (t.endsWith('ss')) return false;
  return true;
}

/** Stems a plural for the remediation message ("notes" → "note"). Best
 *  effort — Apple's actual stemmer is opaque, but the common cases
 *  predictable enough to display in the rule detail:
 *    - "stories" → "story"      (consonant + -ies → -y)
 *    - "boxes"   → "box"        (x + -es → drop -es)
 *    - "watches" → "watch"      (ch + -es → drop -es)
 *    - "buses"   → "bus"        (s + -es → drop -es)
 *    - "notes"   → "note"       (most -s plurals → drop -s only)
 */
export function singularize(t: string): string {
  if (t.endsWith('ies') && t.length > 3) return t.slice(0, -3) + 'y';
  if (t.endsWith('es') && t.length > 3) {
    const stem = t.slice(0, -2);
    // Only "true" -es plurals (where adding plain -s would be unspeakable)
    // drop the entire "es". Stems ending in s/x/z/o or the digraphs ch/sh
    // match — that's the standard English rule. Everything else (notes,
    // bytes, codes) just drops the trailing -s.
    if (/(s|x|z|o|ch|sh)$/.test(stem)) return stem;
  }
  if (t.endsWith('s')) return t.slice(0, -1);
  return t;
}

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

function missingAgeRatingFields(
  declaration: ASCAgeRatingDeclaration,
): string[] {
  const missing: string[] = [];
  for (const field of AGE_RATING_ENUM_FIELDS) {
    if (!isNonEmpty(declaration.attributes[field])) {
      missing.push(AGE_RATING_LABELS[field]);
    }
  }
  for (const field of AGE_RATING_BOOLEAN_FIELDS) {
    if (typeof declaration.attributes[field] !== 'boolean') {
      missing.push(AGE_RATING_LABELS[field]);
    }
  }
  return missing;
}

function activeAgeRatingSignals(
  declaration: ASCAgeRatingDeclaration,
): string[] {
  const active: string[] = [];
  for (const field of AGE_RATING_ENUM_FIELDS) {
    const value = declaration.attributes[field];
    if (isNonEmpty(value) && value !== 'NONE') {
      active.push(`${AGE_RATING_LABELS[field]}: ${value.toLowerCase().replace(/_/g, ' ')}`);
    }
  }
  for (const field of AGE_RATING_BOOLEAN_FIELDS) {
    if (declaration.attributes[field] === true) {
      active.push(AGE_RATING_LABELS[field]);
    }
  }
  return active;
}

// ---------------------------------------------------------------------------
// The rules (10 per-version + keyword-linter + app-level + IAP +
// 2 pricing/availability)
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

// ---------------------------------------------------------------------------
// Keyword linter rules (v1.0.1) — 4 ASO-quality checks layered on top of
// the basic 100-char length rule. All four read the SAME data the
// `keywords` rule already inspects + name/subtitle from `appInfoLocalization`.
// No new ASC API calls, no new context fields.
// ---------------------------------------------------------------------------

const ruleKeywordSpaces = (ctx: ChecklistContext): RuleResult => {
  const loc = pickPrimaryLocalization(ctx.localizations);
  if (!ctx.version || !loc) {
    return {
      id: 'keyword-spaces',
      title: 'Keywords use no wasted spaces',
      severity: 'na',
      message: 'No primary locale to check.',
    };
  }
  const k = loc.attributes.keywords ?? '';
  if (k.trim().length === 0) {
    // The base `keywords` rule already warns about blank keywords;
    // surfacing a second warning here would be noise.
    return {
      id: 'keyword-spaces',
      title: 'Keywords use no wasted spaces',
      severity: 'na',
      message: 'Keywords field is blank — nothing to lint.',
    };
  }
  const analysis = analyzeKeywords({ keywords: k });
  if (analysis.wastedSpaceChars > 0) {
    const remaining = KEYWORDS_MAX_CHARS - analysis.totalChars;
    return {
      id: 'keyword-spaces',
      title: 'Keywords use no wasted spaces',
      severity: 'warn',
      message:
        `Wasting ${analysis.wastedSpaceChars} character${analysis.wastedSpaceChars === 1 ? '' : 's'} on spaces after commas. ` +
        `Apple counts them against your 100-char cap (you have ${remaining} left).`,
      remediation:
        'Drop the spaces between commas (use "memory,journal,recall" not "memory, journal, recall") to free up room for more search terms.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  return {
    id: 'keyword-spaces',
    title: 'Keywords use no wasted spaces',
    severity: 'pass',
    message:
      `${analysis.tokens.length} comma-separated keyword${analysis.tokens.length === 1 ? '' : 's'}, ` +
      `${analysis.effectiveChars}/${KEYWORDS_MAX_CHARS} chars — no wasted spaces.`,
  };
};

const ruleKeywordDuplicates = (ctx: ChecklistContext): RuleResult => {
  const loc = pickPrimaryLocalization(ctx.localizations);
  if (!ctx.version || !loc) {
    return {
      id: 'keyword-duplicates',
      title: 'Keywords don\'t duplicate words from the app name or subtitle',
      severity: 'na',
      message: 'No primary locale to check.',
    };
  }
  const k = loc.attributes.keywords ?? '';
  if (k.trim().length === 0) {
    return {
      id: 'keyword-duplicates',
      title: 'Keywords don\'t duplicate words from the app name or subtitle',
      severity: 'na',
      message: 'Keywords field is blank — nothing to lint.',
    };
  }
  // The duplicate check needs the live name + subtitle to compare
  // against. Without `appInfoLocalization` we can't compute it — degrade
  // to unknown (NOT fail) so the user knows to verify manually.
  if (!ctx.appInfoLocalization) {
    return {
      id: 'keyword-duplicates',
      title: 'Keywords don\'t duplicate words from the app name or subtitle',
      severity: 'unknown',
      message: "We couldn't read your app name + subtitle to compare against keywords.",
      remediation:
        "Apple already ranks you for every word in your app name + subtitle. Open ASC → App Information and check that none of those words also appear in your keyword field.",
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  const analysis = analyzeKeywords({
    keywords: k,
    name: ctx.appInfoLocalization.attributes.name,
    subtitle: ctx.appInfoLocalization.attributes.subtitle,
  });
  const dupes = uniq([
    ...analysis.duplicatesWithName,
    ...analysis.duplicatesWithSubtitle,
  ]);
  if (dupes.length > 0) {
    const sample = dupes.slice(0, 3).map((t) => `"${t}"`).join(', ');
    const more = dupes.length > 3 ? `, +${dupes.length - 3} more` : '';
    return {
      id: 'keyword-duplicates',
      title: 'Keywords don\'t duplicate words from the app name or subtitle',
      severity: 'warn',
      message:
        dupes.length === 1
          ? `"${dupes[0]}" appears in BOTH your keyword field AND your app name/subtitle — wasted slot.`
          : `${dupes.length} keywords (${sample}${more}) duplicate words from your name or subtitle.`,
      remediation:
        "Apple already ranks you for every word in your name + subtitle. Drop the duplicates from the keyword field and use those characters for new search terms.",
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  return {
    id: 'keyword-duplicates',
    title: 'Keywords don\'t duplicate words from the app name or subtitle',
    severity: 'pass',
    message: 'No overlap with name or subtitle — every keyword slot is unique.',
  };
};

const ruleKeywordPlurals = (ctx: ChecklistContext): RuleResult => {
  const loc = pickPrimaryLocalization(ctx.localizations);
  if (!ctx.version || !loc) {
    return {
      id: 'keyword-plurals',
      title: 'Keywords use singular forms (Apple stems plurals)',
      severity: 'na',
      message: 'No primary locale to check.',
    };
  }
  const k = loc.attributes.keywords ?? '';
  if (k.trim().length === 0) {
    return {
      id: 'keyword-plurals',
      title: 'Keywords use singular forms (Apple stems plurals)',
      severity: 'na',
      message: 'Keywords field is blank — nothing to lint.',
    };
  }
  const analysis = analyzeKeywords({ keywords: k });
  if (analysis.likelyPlurals.length > 0) {
    const examples = analysis.likelyPlurals
      .slice(0, 3)
      .map((t) => `"${t}" → "${singularize(t)}"`)
      .join(', ');
    const more = analysis.likelyPlurals.length > 3
      ? `, +${analysis.likelyPlurals.length - 3} more`
      : '';
    return {
      id: 'keyword-plurals',
      title: 'Keywords use singular forms (Apple stems plurals)',
      severity: 'warn',
      message:
        analysis.likelyPlurals.length === 1
          ? `"${analysis.likelyPlurals[0]}" looks like a plural — Apple stems "${singularize(analysis.likelyPlurals[0]!)}" automatically.`
          : `${analysis.likelyPlurals.length} keywords look like plurals (${examples}${more}). Apple stems them automatically.`,
      remediation:
        'Drop the trailing "s" / "es" / "ies" — Apple indexes the plural form for free when you ship the singular. Frees up characters for more search terms.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
    };
  }
  return {
    id: 'keyword-plurals',
    title: 'Keywords use singular forms (Apple stems plurals)',
    severity: 'pass',
    message: 'No obvious plurals detected — Apple stemming will index variants for free.',
  };
};

const ruleKeywordLocaleCoverage = (ctx: ChecklistContext): RuleResult => {
  if (!ctx.version) {
    return {
      id: 'keyword-locale-coverage',
      title: 'Every active storefront locale has a keyword field filled',
      severity: 'na',
      message: 'No draft to check.',
    };
  }
  if (ctx.localizations.length <= 1) {
    // Single-locale apps can't have a coverage gap. Most indie apps live
    // here; we don't want to nag with a row that never has anything to
    // say. The detailed message helps the user understand why they don't
    // see a warn even when their keywords are aggressively localized.
    return {
      id: 'keyword-locale-coverage',
      title: 'Every active storefront locale has a keyword field filled',
      severity: 'na',
      message: 'Only one storefront locale — no coverage gap is possible.',
    };
  }

  // A locale "counts" as active if it has a description (the user
  // clearly intends to ship to that storefront). Locales with no
  // description are likely placeholders / auto-created — we don't ding
  // the user for not filling keywords on a locale they're not really
  // localizing.
  const missing: string[] = [];
  for (const l of ctx.localizations) {
    const hasDesc = (l.attributes.description ?? '').trim().length > 0;
    const hasKeywords = (l.attributes.keywords ?? '').trim().length > 0;
    if (hasDesc && !hasKeywords) {
      missing.push(l.attributes.locale ?? '(unknown)');
    }
  }
  if (missing.length === 0) {
    const filled = ctx.localizations.filter(
      (l) => (l.attributes.keywords ?? '').trim().length > 0,
    ).length;
    return {
      id: 'keyword-locale-coverage',
      title: 'Every active storefront locale has a keyword field filled',
      severity: 'pass',
      message: `Keywords filled in ${filled} of ${ctx.localizations.length} locales.`,
    };
  }
  const sample = missing.slice(0, 3).join(', ');
  const more = missing.length > 3 ? `, +${missing.length - 3} more` : '';
  return {
    id: 'keyword-locale-coverage',
    title: 'Every active storefront locale has a keyword field filled',
    severity: 'warn',
    message:
      missing.length === 1
        ? `${missing[0]} has a description but no keywords — discoverability gap on that storefront.`
        : `${missing.length} locales (${sample}${more}) have descriptions but no keywords — discoverability gap on those storefronts.`,
    remediation:
      'Translate your primary-locale keywords for each active storefront. Even 5–10 localized keywords noticeably lift discoverability in non-English markets.',
    ascDeepLink: ascAppLink(ctx.appId, 'appstore'),
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
// App-level rules — these check fields that survive across versions.
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

const ruleSubtitle = (ctx: ChecklistContext): RuleResult => {
  if (!ctx.appInfo) {
    return {
      id: 'subtitle',
      title: 'Subtitle is filled and safe',
      severity: 'unknown',
      message: "We couldn't read your App Info from the API.",
      remediation: 'App Store Connect → App Information → set a descriptive subtitle (≤30 chars).',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  const loc = ctx.appInfoLocalization;
  if (!loc) {
    return {
      id: 'subtitle',
      title: 'Subtitle is filled and safe',
      severity: 'fail',
      message: 'No App Info localization found — Apple needs one for the primary locale.',
      remediation:
        'App Store Connect → App Information → fill in name and subtitle for your primary locale.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  const s = loc.attributes.subtitle ?? '';
  if (!isNonEmpty(s)) {
    return {
      id: 'subtitle',
      title: 'Subtitle is filled and safe',
      severity: 'warn',
      message: 'Subtitle field is blank — discoverability and branding will suffer.',
      remediation:
        'Add a short, descriptive subtitle under 30 characters (e.g. "Track apps, reviews & MRR").',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  if (s.length > 30) {
    return {
      id: 'subtitle',
      title: 'Subtitle is filled and safe',
      severity: 'fail',
      message: `Subtitle is ${s.length} characters — Apple's hard cap is 30.`,
      remediation: 'Trim your subtitle to be 30 characters or fewer.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }

  // Trademark check
  const forbiddenPatterns = [
    { name: 'App Store Connect', pattern: /\bapp\s+store\s+connect\b/i },
    { name: 'App Store', pattern: /\bapp\s+store\b/i },
    { name: 'Apple Store', pattern: /\bapple\s+store\b/i },
    { name: 'TestFlight', pattern: /\btestflight\b/i },
    { name: 'iTunes', pattern: /\bitunes\b/i },
    { name: 'Apple', pattern: /\bapple\b/i },
  ];

  const matched = forbiddenPatterns.find((p) => p.pattern.test(s));
  if (matched) {
    return {
      id: 'subtitle',
      title: 'Subtitle is filled and safe',
      severity: 'fail',
      message: `Subtitle contains Apple trademark term "${matched.name}".`,
      remediation:
        'Remove trademarked Apple terms (like "App Store" or "Apple") from your subtitle to prevent Guideline 5.2.5 rejections.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }

  return {
    id: 'subtitle',
    title: 'Subtitle is filled and safe',
    severity: 'pass',
    message: `"${s}" (${s.length} chars).`,
  };
};

const ruleAgeRatingDeclaration = (ctx: ChecklistContext): RuleResult => {
  if (!ctx.version) {
    return {
      id: 'age-rating',
      title: 'Age Rating details completed',
      severity: 'na',
      message: 'No editable draft — Age Rating can only be changed while preparing a new version.',
    };
  }
  if (!ctx.appInfo) {
    return {
      id: 'age-rating',
      title: 'Age Rating details completed',
      severity: 'unknown',
      message: "We couldn't read your App Info from the API.",
      remediation: 'App Store Connect → App Information → Age Rating → complete the questionnaire.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  if (!ctx.ageRatingDeclarationChecked) {
    return {
      id: 'age-rating',
      title: 'Age Rating details completed',
      severity: 'unknown',
      message: "We couldn't read the Age Rating declaration from the API.",
      remediation:
        'App Store Connect → App Information → Age Rating → verify every answer manually.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }
  if (!ctx.ageRatingDeclaration) {
    return {
      id: 'age-rating',
      title: 'Age Rating details completed',
      severity: 'fail',
      message: 'No Age Rating declaration found for this App Info.',
      remediation:
        'App Store Connect → App Information → Age Rating → complete and save the questionnaire before submitting.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }

  const missing = missingAgeRatingFields(ctx.ageRatingDeclaration);
  if (missing.length > 0) {
    const shown = missing.slice(0, 3).join(', ');
    return {
      id: 'age-rating',
      title: 'Age Rating details completed',
      severity: 'fail',
      message:
        missing.length === 1
          ? `Age Rating is missing: ${shown}.`
          : `Age Rating is missing ${missing.length} answers, including ${shown}.`,
      remediation:
        'App Store Connect → App Information → Age Rating → answer every content category and save.',
      ascDeepLink: ascAppLink(ctx.appId, 'appstore/info'),
    };
  }

  const active = activeAgeRatingSignals(ctx.ageRatingDeclaration);
  return {
    id: 'age-rating',
    title: 'Age Rating details completed',
    severity: 'pass',
    message:
      active.length === 0
        ? 'Age Rating questionnaire is complete; all tracked content categories are declared None/No.'
        : `Age Rating questionnaire is complete; ${active.slice(0, 3).join(', ')}${active.length > 3 ? `, +${active.length - 3} more` : ''}.`,
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
  // Keyword linter (4 ASO-quality rules layered onto the base keywords
  // rule) — grouped here so the UI surfaces them next to their parent.
  ruleKeywordSpaces,
  ruleKeywordDuplicates,
  ruleKeywordPlurals,
  ruleKeywordLocaleCoverage,
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
  ruleSubtitle,
  ruleAgeRatingDeclaration,
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
