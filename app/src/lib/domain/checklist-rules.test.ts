import {
  analyzeKeywords,
  pickPrimaryLocalization,
  runChecklist,
  RULE_COUNT,
  singularize,
  summarizeChecklist,
  type ChecklistContext,
} from './checklist-rules';
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

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVersion(state = 'PREPARE_FOR_SUBMISSION', versionString = '1.2.3'): ASCAppStoreVersion {
  return {
    type: 'appStoreVersions',
    id: 'v1',
    attributes: { versionString, appStoreState: state },
  };
}

function makeBuild(version: string, processingState: string | undefined = 'VALID'): ASCBuild {
  return {
    type: 'builds',
    id: 'b1',
    attributes: { version, processingState },
  };
}

function makeLoc(args: Partial<ASCAppStoreVersionLocalization['attributes']> & { id?: string; locale?: string }): ASCAppStoreVersionLocalization {
  return {
    type: 'appStoreVersionLocalizations',
    id: args.id ?? 'loc1',
    attributes: {
      locale: args.locale ?? 'en-US',
      description: args.description,
      keywords: args.keywords,
      marketingUrl: args.marketingUrl,
      promotionalText: args.promotionalText,
      supportUrl: args.supportUrl,
      whatsNew: args.whatsNew,
    },
  };
}

function makeScreenshotSet(displayType: string): ASCAppScreenshotSet {
  return {
    type: 'appScreenshotSets',
    id: 'ss-' + displayType,
    attributes: { screenshotDisplayType: displayType },
  };
}

// App-level fixtures (all-good defaults so app-level rules pass unless
// individual tests override them).

function makeApp(over: Partial<ASCApp['attributes']> = {}): ASCApp {
  return {
    type: 'apps',
    id: 'app1',
    attributes: {
      name: 'Release Pilot',
      bundleId: 'app.releasepilot',
      sku: 'release-pilot',
      primaryLocale: 'en-US',
      contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT',
      ...over,
    },
  };
}

function makeAppInfo(over: { state?: string; primaryCategoryId?: string | null; localizationIds?: string[] } = {}): ASCAppInfo {
  const primaryCategoryId = over.primaryCategoryId === undefined ? 'PRODUCTIVITY' : over.primaryCategoryId;
  const localizationIds = over.localizationIds ?? ['ailoc-1'];
  return {
    type: 'appInfos',
    id: 'ai-1',
    attributes: { state: over.state ?? 'PREPARE_FOR_SUBMISSION' },
    relationships: {
      primaryCategory: primaryCategoryId
        ? { data: { type: 'appCategories', id: primaryCategoryId } }
        : { data: null },
      appInfoLocalizations: {
        data: localizationIds.map((id) => ({ type: 'appInfoLocalizations' as const, id })),
      },
    },
  };
}

function makeCategory(id = 'PRODUCTIVITY'): ASCAppCategory {
  return { type: 'appCategories', id };
}

function makeAppInfoLoc(over: Partial<ASCAppInfoLocalization['attributes']> & { id?: string } = {}): ASCAppInfoLocalization {
  // We use `'k' in over` rather than `??` so callers can explicitly pass
  // `privacyPolicyUrl: undefined` to clear the default — otherwise `??`
  // silently restores the default and masks the "missing field" test.
  return {
    type: 'appInfoLocalizations',
    id: over.id ?? 'ailoc-1',
    attributes: {
      locale: 'locale' in over ? over.locale : 'en-US',
      name: 'name' in over ? over.name : 'Release Pilot',
      subtitle: 'subtitle' in over ? over.subtitle : 'Indie iOS dev companion',
      privacyPolicyUrl: 'privacyPolicyUrl' in over ? over.privacyPolicyUrl : 'https://example.com/privacy',
    },
  };
}

function makeSub(productId: string, state = 'READY_TO_SUBMIT'): ASCSubscription {
  return {
    type: 'subscriptions',
    id: 'sub-' + productId,
    attributes: { productId, name: productId.replace(/_/g, ' '), state },
  };
}

function makeCtx(over: Partial<ChecklistContext> = {}): ChecklistContext {
  return {
    appId: 'app1',
    version: over.version === undefined ? makeVersion() : over.version,
    build: over.build === undefined ? makeBuild('29') : over.build,
    localizations: over.localizations ?? [
      // Clean keyword field for the default fixture so the 4 keyword-linter
      // rules (added v1.0.1) pass on a "happy path" ctx:
      //  - no spaces between commas (saves chars)
      //  - no token overlapping with default name "Release Pilot" or
      //    subtitle "Indie iOS dev companion"
      //  - all singular forms (Apple stems plurals automatically)
      // Tests that exercise the linter override `localizations` to flip
      // each property in isolation.
      makeLoc({
        locale: 'en-US',
        description: 'A high-quality app that does great things and helps users every day.',
        keywords: 'memory,journal,recall,note,reminder,location,search,offline,backup,sync',
        supportUrl: 'https://example.com/support',
        marketingUrl: 'https://example.com',
        whatsNew: 'Fixed bugs',
        promotionalText: 'Try our new dark mode!',
      }),
    ],
    screenshotSetsByLocalization:
      over.screenshotSetsByLocalization ??
      new Map([['loc1', [makeScreenshotSet('APP_IPHONE_67')]]]),
    isFirstVersion: over.isFirstVersion ?? false,
    app: over.app === undefined ? makeApp() : over.app,
    appInfo: over.appInfo === undefined ? makeAppInfo() : over.appInfo,
    primaryCategory: over.primaryCategory === undefined ? makeCategory('PRODUCTIVITY') : over.primaryCategory,
    appInfoLocalization: over.appInfoLocalization === undefined ? makeAppInfoLoc() : over.appInfoLocalization,
    subscriptionProducts:
      over.subscriptionProducts === undefined
        ? [
            makeSub('release_pilot_pro_monthly', 'READY_TO_SUBMIT'),
            makeSub('release_pilot_pro_yearly', 'READY_TO_SUBMIT'),
          ]
        : over.subscriptionProducts,
    // Pricing + availability default to "configured": 1 price tier set,
    // available in 175 territories (the typical full-rollout setup).
    // Tests override to exercise missing-config and API-failure paths.
    priceSchedule: over.priceSchedule === undefined ? { priceCount: 1 } : over.priceSchedule,
    availability:
      over.availability === undefined
        ? { territoryCount: 175, truncated: false }
        : over.availability,
  };
}

function ruleById(results: ReturnType<typeof runChecklist>, id: string) {
  return results.find((r) => r.id === id);
}

// ---------------------------------------------------------------------------
// RULE_COUNT / runChecklist baseline
// ---------------------------------------------------------------------------

ok('exposes 22 rules',           RULE_COUNT === 22);
ok('runChecklist returns 22',    runChecklist(makeCtx()).length === 22);

// Happy path: a clean draft + complete app metadata + all-ready subs +
// configured price + selected territories + clean keyword field (4
// keyword-linter rules added v1.0.1) should produce:
//   - 19 pass (was 18 pre-subtitle rule)
//   - 2 unknown (encryption + app-privacy-details — always dashboard-only)
//   - 1 na (keyword-locale-coverage — happy ctx has only 1 locale)
// No warns, no fails.
{
  const results = runChecklist(makeCtx());
  const summary = summarizeChecklist(results);
  ok('happy path: 19 pass + 2 unknown + 1 na',
    summary.pass === 19 && summary.unknown === 2 && summary.na === 1);
  ok('happy path: overallSeverity = unknown (no warn/fail)', summary.overallSeverity === 'unknown');
}


// ---------------------------------------------------------------------------
// pickPrimaryLocalization
// ---------------------------------------------------------------------------

{
  const locs = [makeLoc({ id: 'l1', locale: 'fr-FR' }), makeLoc({ id: 'l2', locale: 'en-US' })];
  ok('pickPrimary: prefers en-US', pickPrimaryLocalization(locs)?.id === 'l2');
}
{
  const locs = [makeLoc({ id: 'l1', locale: 'fr-FR' })];
  ok('pickPrimary: falls back to first locale', pickPrimaryLocalization(locs)?.id === 'l1');
}
ok('pickPrimary: empty → null', pickPrimaryLocalization([]) === null);

// ---------------------------------------------------------------------------
// ruleDraftExists
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ version: null, build: null, localizations: [] })), 'draft-exists');
  // Apps without a draft are not "broken" — they just have nothing to
  // pre-check. We surface this as NA + a friendly CTA at the screen
  // level, NOT as a red "blocker" that scares the user.
  ok('draft-exists: no version → na (not fail)', r?.severity === 'na');
  ok('draft-exists: no version → carries an ASC deep-link for the CTA',
    typeof r?.ascDeepLink === 'string' && r.ascDeepLink.includes('appstoreconnect.apple.com'));
}
{
  const r = ruleById(runChecklist(makeCtx()), 'draft-exists');
  ok('draft-exists: with version → pass', r?.severity === 'pass');
}

// When no draft exists, the WHOLE checklist degrades to NA across the
// board. The summary card uses this signature to render the neutral
// "Nothing to check yet" empty state instead of red blocker copy.
{
  // When no draft exists, per-version rules degrade to NA. App-level
  // rules (content rights, category, privacy URL) are independent of the
  // version — they still surface their status. App-Privacy-Details and
  // subscription-products also degrade to NA when version is null /
  // subs are empty respectively. We assert no fails or warns appear.
  const ctx = makeCtx({
    version: null,
    build: null,
    localizations: [],
    subscriptionProducts: [],
  });
  const results = runChecklist(ctx);
  const summary = summarizeChecklist(results, ctx);
  ok('no-draft: per-version rules are NA', results.find((r) => r.id === 'description')?.severity === 'na');
  ok('no-draft: no fails surface',         summary.fail === 0);
  ok('no-draft: app-level rules still pass',
    results.find((r) => r.id === 'content-rights')?.severity === 'pass' &&
    results.find((r) => r.id === 'category')?.severity === 'pass');
  ok('no-draft: summary.hasDraft is false',  summary.hasDraft === false);
  // Without ctx, hasDraft is inferred from the draft-exists rule's NA
  // severity — should match the ctx-derived value.
  ok('no-draft: hasDraft inferable without ctx',
    summarizeChecklist(results).hasDraft === false);
}

// ---------------------------------------------------------------------------
// ruleBuildAttached
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ build: null })), 'build-attached');
  ok('build-attached: no build → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ build: makeBuild('29', 'INVALID') })), 'build-attached');
  ok('build-attached: invalid build → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ build: makeBuild('29', 'PROCESSING') })), 'build-attached');
  ok('build-attached: processing → warn', r?.severity === 'warn');
}
{
  const r = ruleById(runChecklist(makeCtx()), 'build-attached');
  ok('build-attached: valid build → pass', r?.severity === 'pass');
}
{
  const r = ruleById(runChecklist(makeCtx({ version: null, build: null })), 'build-attached');
  ok('build-attached: no version → na', r?.severity === 'na');
}

// ---------------------------------------------------------------------------
// ruleDescription
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ description: '' })] })), 'description');
  ok('description: blank → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ description: 'short' })] })), 'description');
  ok('description: too short → warn', r?.severity === 'warn');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ description: 'x'.repeat(4001) })] })), 'description');
  ok('description: too long → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx()), 'description');
  ok('description: normal → pass', r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// ruleKeywords
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ keywords: '' })] })), 'keywords');
  ok('keywords: blank → warn', r?.severity === 'warn');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ keywords: 'a'.repeat(101) })] })), 'keywords');
  ok('keywords: over 100 → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ keywords: 'a'.repeat(100) })] })), 'keywords');
  ok('keywords: exactly 100 → pass', r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// analyzeKeywords (pure helper backing all 4 keyword-linter rules)
// ---------------------------------------------------------------------------

{
  const a = analyzeKeywords({ keywords: '' });
  ok('analyze: blank → no tokens, no waste',
    a.tokens.length === 0 && a.wastedSpaceChars === 0 && a.totalChars === 0);
}
{
  const a = analyzeKeywords({ keywords: 'memory,journal,recall' });
  ok('analyze: clean comma-separated → no waste, 3 tokens',
    a.tokens.length === 3 && a.wastedSpaceChars === 0);
  ok('analyze: clean → effectiveChars === totalChars',
    a.effectiveChars === a.totalChars);
}
{
  // "memory, journal, recall" — 2 wasted chars on the spaces after commas
  const a = analyzeKeywords({ keywords: 'memory, journal, recall' });
  ok('analyze: spaces after commas → wastedSpaceChars counted',
    a.wastedSpaceChars === 2);
  ok('analyze: token trimming strips leading whitespace',
    a.tokens.includes('journal') && a.tokens.includes('recall'));
}
{
  const a = analyzeKeywords({
    keywords: 'release,pilot,memory,journal,asc',
    name: 'Release Pilot',
    subtitle: 'Indie iOS dev companion',
  });
  ok('analyze: duplicate-with-name detected (case-insensitive)',
    a.duplicatesWithName.includes('release') && a.duplicatesWithName.includes('pilot'));
  ok('analyze: clean token unrelated to name passes through',
    !a.duplicatesWithName.includes('memory'));
}
{
  const a = analyzeKeywords({
    keywords: 'companion,dev,asc,memory',
    name: 'Release Pilot',
    subtitle: 'Indie iOS dev companion',
  });
  ok('analyze: duplicate-with-subtitle detected',
    a.duplicatesWithSubtitle.includes('companion') && a.duplicatesWithSubtitle.includes('dev'));
}
{
  const a = analyzeKeywords({ keywords: 'notes,tasks,reminders,ios,news,business,note' });
  ok('analyze: plurals detected (notes/tasks/reminders)',
    a.likelyPlurals.includes('notes') &&
    a.likelyPlurals.includes('tasks') &&
    a.likelyPlurals.includes('reminders'));
  ok('analyze: safelist protects ios / news / business',
    !a.likelyPlurals.includes('ios') &&
    !a.likelyPlurals.includes('news') &&
    !a.likelyPlurals.includes('business'));
  ok('analyze: singular tokens not flagged',
    !a.likelyPlurals.includes('note'));
}
{
  // -ss endings (pass / boss / class) shouldn't trigger plurals even
  // outside the explicit safelist.
  const a = analyzeKeywords({ keywords: 'sass,brass,toss' });
  ok('analyze: -ss endings ignored (not plurals)',
    a.likelyPlurals.length === 0);
}
{
  const a = analyzeKeywords({ keywords: 'app,journal,bus,ts' });
  ok('analyze: tokens shorter than 4 chars not flagged as plurals',
    !a.likelyPlurals.includes('bus') && !a.likelyPlurals.includes('ts'));
}

// singularize (used in remediation copy)
ok('singularize: notes → note',     singularize('notes') === 'note');
ok('singularize: stories → story',  singularize('stories') === 'story');
ok('singularize: matches → match',  singularize('matches') === 'match');
ok('singularize: idempotent on singular', singularize('note') === 'note');

// ---------------------------------------------------------------------------
// ruleKeywordSpaces (v1.0.1)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ keywords: 'memory, journal, recall' })] })), 'keyword-spaces');
  ok('keyword-spaces: spaces after commas → warn', r?.severity === 'warn');
  ok('keyword-spaces: warn message names the count',
    typeof r?.message === 'string' && r.message.includes('2 character'));
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ keywords: 'memory,journal,recall' })] })), 'keyword-spaces');
  ok('keyword-spaces: no spaces → pass', r?.severity === 'pass');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ keywords: '' })] })), 'keyword-spaces');
  // Blank keywords are flagged by the base `keywords` rule; this rule
  // stays silent (na) so the UI doesn't double-up the same advice.
  ok('keyword-spaces: blank keywords → na (base rule already covers it)',
    r?.severity === 'na');
}
{
  const r = ruleById(runChecklist(makeCtx({ version: null, build: null, localizations: [] })), 'keyword-spaces');
  ok('keyword-spaces: no draft → na', r?.severity === 'na');
}

// ---------------------------------------------------------------------------
// ruleKeywordDuplicates (v1.0.1)
// ---------------------------------------------------------------------------

{
  // Default ctx has name "Release Pilot" + subtitle "Indie iOS dev companion".
  // Pollute the keyword field with overlap.
  const r = ruleById(runChecklist(makeCtx({
    localizations: [makeLoc({ keywords: 'release,pilot,memory,journal' })],
  })), 'keyword-duplicates');
  ok('keyword-duplicates: overlap with name → warn', r?.severity === 'warn');
  ok('keyword-duplicates: warn message names a duplicate token',
    typeof r?.message === 'string' &&
    (r.message.includes('"release"') || r.message.includes('"pilot"')));
}
{
  const r = ruleById(runChecklist(makeCtx({
    localizations: [makeLoc({ keywords: 'companion,dev,memory,journal' })],
  })), 'keyword-duplicates');
  ok('keyword-duplicates: overlap with subtitle → warn', r?.severity === 'warn');
}
{
  const r = ruleById(runChecklist(makeCtx()), 'keyword-duplicates');
  ok('keyword-duplicates: clean fixture → pass', r?.severity === 'pass');
}
{
  // appInfoLocalization unavailable (403 on listAppInfos, for example)
  // → degrade to unknown, NOT fail. False fail would scare the user.
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: null })), 'keyword-duplicates');
  ok('keyword-duplicates: no appInfoLocalization → unknown',
    r?.severity === 'unknown');
  ok('keyword-duplicates: unknown carries app-info deep link',
    typeof r?.ascDeepLink === 'string' && r.ascDeepLink.includes('appstore/info'));
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ keywords: '' })] })), 'keyword-duplicates');
  ok('keyword-duplicates: blank keywords → na', r?.severity === 'na');
}

// ---------------------------------------------------------------------------
// ruleKeywordPlurals (v1.0.1)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({
    localizations: [makeLoc({ keywords: 'notes,tasks,reminders,memory' })],
  })), 'keyword-plurals');
  ok('keyword-plurals: obvious plurals → warn', r?.severity === 'warn');
  ok('keyword-plurals: warn message shows stemmed form',
    typeof r?.message === 'string' && r.message.includes('note'));
}
{
  const r = ruleById(runChecklist(makeCtx()), 'keyword-plurals');
  ok('keyword-plurals: clean singular fixture → pass', r?.severity === 'pass');
}
{
  // iOS / news / business etc. should NOT trigger plurals (safelist).
  const r = ruleById(runChecklist(makeCtx({
    localizations: [makeLoc({ keywords: 'ios,news,business,memory' })],
  })), 'keyword-plurals');
  ok('keyword-plurals: safelist tokens → pass', r?.severity === 'pass');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ keywords: '' })] })), 'keyword-plurals');
  ok('keyword-plurals: blank keywords → na', r?.severity === 'na');
}

// ---------------------------------------------------------------------------
// ruleKeywordLocaleCoverage (v1.0.1)
// ---------------------------------------------------------------------------

{
  // Default fixture has only en-US — coverage is na (no gap possible).
  const r = ruleById(runChecklist(makeCtx()), 'keyword-locale-coverage');
  ok('keyword-locale-coverage: 1 locale → na', r?.severity === 'na');
}
{
  // Three locales — fr-FR has a description but no keywords (gap).
  const r = ruleById(runChecklist(makeCtx({
    localizations: [
      makeLoc({ id: 'en', locale: 'en-US', description: 'desc', keywords: 'a,b,c' }),
      makeLoc({ id: 'fr', locale: 'fr-FR', description: 'desc', keywords: '' }),
      makeLoc({ id: 'de', locale: 'de-DE', description: 'desc', keywords: 'a,b,c' }),
    ],
  })), 'keyword-locale-coverage');
  ok('keyword-locale-coverage: gap on fr-FR → warn', r?.severity === 'warn');
  ok('keyword-locale-coverage: warn message names the locale',
    typeof r?.message === 'string' && r.message.includes('fr-FR'));
}
{
  // Locale with NO description is treated as inactive — no warning.
  const r = ruleById(runChecklist(makeCtx({
    localizations: [
      makeLoc({ id: 'en', locale: 'en-US', description: 'desc', keywords: 'a,b,c' }),
      makeLoc({ id: 'fr', locale: 'fr-FR', description: '',     keywords: '' }),
    ],
  })), 'keyword-locale-coverage');
  ok('keyword-locale-coverage: inactive locale (no desc) → pass',
    r?.severity === 'pass');
}
{
  const r = ruleById(runChecklist(makeCtx({
    localizations: [
      makeLoc({ id: 'en', locale: 'en-US', description: 'desc', keywords: 'a,b,c' }),
      makeLoc({ id: 'fr', locale: 'fr-FR', description: 'desc', keywords: 'd,e,f' }),
      makeLoc({ id: 'de', locale: 'de-DE', description: 'desc', keywords: 'g,h,i' }),
    ],
  })), 'keyword-locale-coverage');
  ok('keyword-locale-coverage: all locales filled → pass', r?.severity === 'pass');
}

// Cross-rule sanity: the 4 linter rules should leave the BASE
// `keywords` rule's pass/fail behavior unchanged.
{
  const r = ruleById(runChecklist(makeCtx()), 'keywords');
  ok('regression: linter rules don\'t break base keywords rule',
    r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// ruleSupportUrl
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ supportUrl: undefined })] })), 'support-url');
  ok('support-url: missing → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ supportUrl: 'not a url' })] })), 'support-url');
  ok('support-url: bad URL → warn', r?.severity === 'warn');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ supportUrl: 'https://example.com/support' })] })), 'support-url');
  ok('support-url: valid → pass', r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// ruleMarketingUrl
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ marketingUrl: undefined })] })), 'marketing-url');
  ok('marketing-url: missing → warn (not fail)', r?.severity === 'warn');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ marketingUrl: 'https://example.com' })] })), 'marketing-url');
  ok('marketing-url: valid → pass', r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// rulePromotionalText
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ promotionalText: '' })] })), 'promo-text');
  ok('promo-text: blank → na (optional)', r?.severity === 'na');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ promotionalText: 'x'.repeat(171) })] })), 'promo-text');
  ok('promo-text: over 170 → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ localizations: [makeLoc({ promotionalText: 'Try our new dark mode!' })] })), 'promo-text');
  ok('promo-text: normal → pass', r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// ruleWhatsNew
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ isFirstVersion: true })), 'whats-new');
  ok('whats-new: first version → na', r?.severity === 'na');
}
{
  const r = ruleById(runChecklist(makeCtx({ isFirstVersion: false, localizations: [makeLoc({ whatsNew: '' })] })), 'whats-new');
  ok('whats-new: not first + blank → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ isFirstVersion: false })), 'whats-new');
  ok('whats-new: not first + filled → pass', r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// ruleScreenshots
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ screenshotSetsByLocalization: new Map() })), 'screenshots');
  ok('screenshots: empty → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({
    screenshotSetsByLocalization: new Map([['loc1', [makeScreenshotSet('APP_IPAD_PRO_3GEN_129')]]]),
  })), 'screenshots');
  ok('screenshots: only iPad → warn', r?.severity === 'warn');
}
{
  const r = ruleById(runChecklist(makeCtx({
    screenshotSetsByLocalization: new Map([['loc1', [makeScreenshotSet('APP_IPHONE_69')]]]),
  })), 'screenshots');
  ok('screenshots: 6.9" iPhone → pass', r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// rulePrivacyEncryption (always unknown)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx()), 'encryption');
  ok('encryption: always unknown', r?.severity === 'unknown');
}
{
  const r = ruleById(runChecklist(makeCtx({ version: null, build: null })), 'encryption');
  ok('encryption: no version → na', r?.severity === 'na');
}

// ---------------------------------------------------------------------------
// ruleContentRights (app-level)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ app: null })), 'content-rights');
  ok('content-rights: no app → unknown', r?.severity === 'unknown');
}
{
  const r = ruleById(runChecklist(makeCtx({ app: makeApp({ contentRightsDeclaration: undefined }) })), 'content-rights');
  ok('content-rights: unset → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ app: makeApp({ contentRightsDeclaration: '' }) })), 'content-rights');
  ok('content-rights: blank string → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ app: makeApp({ contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' }) })), 'content-rights');
  ok('content-rights: declared no → pass', r?.severity === 'pass');
}
{
  const r = ruleById(runChecklist(makeCtx({ app: makeApp({ contentRightsDeclaration: 'USES_THIRD_PARTY_CONTENT' }) })), 'content-rights');
  ok('content-rights: declared yes → pass', r?.severity === 'pass');
  ok('content-rights: message mentions third-party for "yes"',
    typeof r?.message === 'string' && r.message.toLowerCase().includes('third-party'));
}

// ---------------------------------------------------------------------------
// ruleCategory (app-level)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ appInfo: null })), 'category');
  ok('category: no appInfo → unknown', r?.severity === 'unknown');
}
{
  const r = ruleById(runChecklist(makeCtx({ primaryCategory: null })), 'category');
  ok('category: no primaryCategory → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ primaryCategory: makeCategory('DEVELOPER_TOOLS') })), 'category');
  ok('category: set → pass', r?.severity === 'pass');
  ok('category: humanizes enum (DEVELOPER_TOOLS → "Developer Tools")',
    typeof r?.message === 'string' && r.message.includes('Developer Tools'));
}

// ---------------------------------------------------------------------------
// rulePrivacyPolicyUrl (app-level)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ appInfo: null })), 'privacy-policy-url');
  ok('privacy-url: no appInfo → unknown', r?.severity === 'unknown');
}
{
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: null })), 'privacy-policy-url');
  ok('privacy-url: no localization → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: makeAppInfoLoc({ privacyPolicyUrl: undefined }) })), 'privacy-policy-url');
  ok('privacy-url: missing → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: makeAppInfoLoc({ privacyPolicyUrl: 'not a url' }) })), 'privacy-policy-url');
  ok('privacy-url: bad URL → warn', r?.severity === 'warn');
}
{
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: makeAppInfoLoc({ privacyPolicyUrl: 'https://releasepilot.app/privacy' }) })), 'privacy-policy-url');
  ok('privacy-url: valid → pass', r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// ruleSubtitle (app-level)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ appInfo: null })), 'subtitle');
  ok('subtitle: no appInfo → unknown', r?.severity === 'unknown');
}
{
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: null })), 'subtitle');
  ok('subtitle: no localization → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: makeAppInfoLoc({ subtitle: undefined }) })), 'subtitle');
  ok('subtitle: missing → warn', r?.severity === 'warn');
}
{
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: makeAppInfoLoc({ subtitle: 'a'.repeat(31) }) })), 'subtitle');
  ok('subtitle: over 30 chars → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: makeAppInfoLoc({ subtitle: 'App Store Connect companion' }) })), 'subtitle');
  ok('subtitle: contains "App Store Connect" → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: makeAppInfoLoc({ subtitle: 'Pineapple recipes' }) })), 'subtitle');
  ok('subtitle: contains "apple" but inside another word → pass', r?.severity === 'pass');
}
{
  const r = ruleById(runChecklist(makeCtx({ appInfoLocalization: makeAppInfoLoc({ subtitle: 'Track apps, reviews & MRR' }) })), 'subtitle');
  ok('subtitle: valid and safe → pass', r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// ruleAppPrivacyDetails (always unknown — like encryption)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx()), 'app-privacy-details');
  ok('app-privacy: always unknown when draft exists', r?.severity === 'unknown');
  ok('app-privacy: carries an ASC deep link',
    typeof r?.ascDeepLink === 'string' && r.ascDeepLink.includes('appstoreconnect.apple.com'));
}
{
  const r = ruleById(runChecklist(makeCtx({ version: null, build: null })), 'app-privacy-details');
  ok('app-privacy: no draft → na', r?.severity === 'na');
}

// ---------------------------------------------------------------------------
// rulePriceTier (Pricing & Availability sidebar — added v1.0.1 after we
// missed the "Unable to Add for Review: You must choose a price tier in
// Pricing" rejection)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ priceSchedule: null })), 'price-tier');
  ok('price-tier: API failure → unknown', r?.severity === 'unknown');
  ok('price-tier: unknown carries pricing deep link',
    typeof r?.ascDeepLink === 'string' && r.ascDeepLink.includes('pricing'));
}
{
  const r = ruleById(runChecklist(makeCtx({ priceSchedule: { priceCount: 0 } })), 'price-tier');
  ok('price-tier: no price set → fail', r?.severity === 'fail');
  ok('price-tier: fail message mentions Add for Review',
    typeof r?.message === 'string' && r.message.toLowerCase().includes('add for review'));
  ok('price-tier: fail remediation names USD 0 / Free option',
    typeof r?.remediation === 'string' && r.remediation.includes('USD 0'));
}
{
  const r = ruleById(runChecklist(makeCtx({ priceSchedule: { priceCount: 1 } })), 'price-tier');
  ok('price-tier: 1 tier set → pass', r?.severity === 'pass');
  ok('price-tier: pass message uses singular',
    typeof r?.message === 'string' && r.message.includes('1 active tier'));
}
{
  const r = ruleById(runChecklist(makeCtx({ priceSchedule: { priceCount: 3 } })), 'price-tier');
  ok('price-tier: multiple tiers (scheduled price changes) → pass',
    r?.severity === 'pass');
  ok('price-tier: pass message uses plural with count',
    typeof r?.message === 'string' && r.message.includes('3 active tiers'));
}

// ---------------------------------------------------------------------------
// ruleAvailability (Pricing & Availability sidebar)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ availability: null })), 'availability');
  ok('availability: API failure → unknown', r?.severity === 'unknown');
  ok('availability: unknown carries pricing deep link',
    typeof r?.ascDeepLink === 'string' && r.ascDeepLink.includes('pricing'));
}
{
  const r = ruleById(runChecklist(makeCtx({ availability: { territoryCount: 0, truncated: false } })), 'availability');
  ok('availability: zero countries → fail', r?.severity === 'fail');
  ok('availability: fail message mentions countries',
    typeof r?.message === 'string' && r.message.toLowerCase().includes('countries'));
}
{
  const r = ruleById(runChecklist(makeCtx({ availability: { territoryCount: 1, truncated: false } })), 'availability');
  ok('availability: 1 country → pass (singular copy)',
    r?.severity === 'pass' && typeof r?.message === 'string' && r.message.includes('1 territory'));
}
{
  const r = ruleById(runChecklist(makeCtx({ availability: { territoryCount: 175, truncated: false } })), 'availability');
  ok('availability: all 175 countries → pass',
    r?.severity === 'pass' && typeof r?.message === 'string' && r.message.includes('175'));
}
{
  // Apple caps pagination at 50 territoryAvailabilities per request, so
  // the client returns `{ count: 50, truncated: true }` for any app with
  // 50+ territories. The rule should render "50+" rather than "50",
  // since the user may actually have all 175 enabled.
  const r = ruleById(runChecklist(makeCtx({ availability: { territoryCount: 50, truncated: true } })), 'availability');
  ok('availability: pagination truncation → pass with "50+" copy',
    r?.severity === 'pass' && typeof r?.message === 'string' && r.message.includes('50+'));
}

// Pricing/availability rules survive the "no draft" state (they're app-
// level, not per-version). A live app with no editable draft should
// still surface them so users notice if a price tier gets cleared
// post-launch.
{
  const ctx = makeCtx({
    version: null,
    build: null,
    localizations: [],
    isFirstVersion: false,
    priceSchedule: { priceCount: 0 },
    availability: { territoryCount: 0, truncated: false },
  });
  const results = runChecklist(ctx);
  ok('pricing-rules: survive no-draft state',
    ruleById(results, 'price-tier')?.severity === 'fail' &&
    ruleById(results, 'availability')?.severity === 'fail');
}

// ---------------------------------------------------------------------------
// ruleSubscriptionProducts (IAP)
// ---------------------------------------------------------------------------

{
  const r = ruleById(runChecklist(makeCtx({ subscriptionProducts: null })), 'subscription-products');
  ok('subs: null (API failure) → unknown', r?.severity === 'unknown');
}
{
  const r = ruleById(runChecklist(makeCtx({ subscriptionProducts: [] })), 'subscription-products');
  ok('subs: app has no IAP → na', r?.severity === 'na');
}
{
  const r = ruleById(runChecklist(makeCtx({
    subscriptionProducts: [
      makeSub('release_pilot_pro_monthly', 'READY_TO_SUBMIT'),
      makeSub('release_pilot_pro_yearly', 'READY_TO_SUBMIT'),
    ],
  })), 'subscription-products');
  ok('subs: all READY_TO_SUBMIT → pass', r?.severity === 'pass');
  ok('subs: passes carry ready count',
    typeof r?.message === 'string' && r.message.includes('2/2'));
}
{
  const r = ruleById(runChecklist(makeCtx({
    subscriptionProducts: [
      makeSub('release_pilot_pro_monthly', 'MISSING_METADATA'),
      makeSub('release_pilot_pro_yearly', 'READY_TO_SUBMIT'),
    ],
  })), 'subscription-products');
  ok('subs: any MISSING_METADATA → fail', r?.severity === 'fail');
  ok('subs: fail msg names the broken product',
    typeof r?.message === 'string' && r.message.includes('release_pilot_pro_monthly'.replace(/_/g, ' ')));
}
{
  const r = ruleById(runChecklist(makeCtx({
    subscriptionProducts: [
      makeSub('release_pilot_pro_monthly', 'MISSING_METADATA'),
      makeSub('release_pilot_pro_yearly', 'MISSING_METADATA'),
    ],
  })), 'subscription-products');
  ok('subs: multiple broken → fail with count',
    r?.severity === 'fail' && typeof r?.message === 'string' && r.message.includes('2 subscription products'));
}
{
  const r = ruleById(runChecklist(makeCtx({
    subscriptionProducts: [makeSub('release_pilot_pro_monthly', 'REJECTED')],
  })), 'subscription-products');
  ok('subs: REJECTED → fail', r?.severity === 'fail');
}
{
  const r = ruleById(runChecklist(makeCtx({
    subscriptionProducts: [makeSub('release_pilot_pro_monthly', 'DEVELOPER_REMOVED_FROM_SALE')],
  })), 'subscription-products');
  ok('subs: removed from sale → warn (not fail)', r?.severity === 'warn');
}
{
  const r = ruleById(runChecklist(makeCtx({
    subscriptionProducts: [
      makeSub('release_pilot_pro_monthly', 'APPROVED'),
      makeSub('release_pilot_pro_yearly', 'IN_REVIEW'),
    ],
  })), 'subscription-products');
  ok('subs: APPROVED/IN_REVIEW → pass', r?.severity === 'pass');
}

// ---------------------------------------------------------------------------
// Regression: a first-time submitter with broken IAP + missing Content
// Rights — the exact scenario the user hit on Build 1.
// ---------------------------------------------------------------------------

{
  const ctx = makeCtx({
    isFirstVersion: true,
    app: makeApp({ contentRightsDeclaration: undefined }),
    subscriptionProducts: [
      makeSub('release_pilot_pro_monthly', 'MISSING_METADATA'),
      makeSub('release_pilot_pro_yearly', 'MISSING_METADATA'),
    ],
  });
  const summary = summarizeChecklist(runChecklist(ctx));
  ok('regression: first submission + broken IAP + no Content Rights → fail',
    summary.overallSeverity === 'fail' && summary.fail >= 2);
}

// ---------------------------------------------------------------------------
// summarizeChecklist — hasDraft + isFirstVersion flags
// ---------------------------------------------------------------------------

{
  // BUG FIX (post-15-rules): an app with no draft + all app-level
  // metadata set was producing { fail: 0, warn: 0, unknown: 0, pass: 4 }
  // which made the screen render "Ready to submit". Now hasDraft comes
  // from ctx.version directly, decoupled from pass-counts.
  const ctx = makeCtx({
    version: null,
    build: null,
    localizations: [],
    subscriptionProducts: [
      makeSub('release_pilot_pro_monthly', 'READY_TO_SUBMIT'),
      makeSub('release_pilot_pro_yearly', 'READY_TO_SUBMIT'),
    ],
    // Live app with prior shipped version (not isFirstVersion)
    isFirstVersion: false,
  });
  const summary = summarizeChecklist(runChecklist(ctx), ctx);
  ok('regression: live app + passing app-level rules → hasDraft false',
    summary.hasDraft === false && summary.pass > 0);
  ok('regression: live app → isFirstVersion false',
    summary.isFirstVersion === false);
}

{
  // First-time submitter with no draft yet (e.g., they just connected
  // their key but haven't created the v1.0 version in ASC).
  const ctx = makeCtx({
    version: null,
    build: null,
    localizations: [],
    subscriptionProducts: [],
    isFirstVersion: true,
  });
  const summary = summarizeChecklist(runChecklist(ctx), ctx);
  ok('first-time, no draft: hasDraft false + isFirstVersion true',
    summary.hasDraft === false && summary.isFirstVersion === true);
}

{
  // With a real draft, hasDraft is true.
  const summary = summarizeChecklist(runChecklist(makeCtx()), makeCtx());
  ok('with draft: hasDraft is true', summary.hasDraft === true);
}

// ---------------------------------------------------------------------------
// Drift-after-launch: live app + app-level metadata gone bad
// ---------------------------------------------------------------------------
//
// Simulates the user-reported "noise" concern: the rule list should only
// surface when something genuinely needs the user's attention. These tests
// pin the data-side contract that the SummaryCard / screen relies on.
// ---------------------------------------------------------------------------

{
  // Live app + all app-level metadata is clean.
  const ctx = makeCtx({
    version: null,
    build: null,
    localizations: [],
    isFirstVersion: false,
    subscriptionProducts: [
      makeSub('release_pilot_pro_monthly', 'READY_TO_SUBMIT'),
      makeSub('release_pilot_pro_yearly', 'READY_TO_SUBMIT'),
    ],
  });
  const results = runChecklist(ctx);
  const summary = summarizeChecklist(results, ctx);
  const nonNaNonPass = results.filter((r) => r.severity !== 'na' && r.severity !== 'pass');
  ok('live + clean: zero rows to show', nonNaNonPass.length === 0);
  ok('live + clean: no fail/warn/unknown', summary.fail === 0 && summary.warn === 0 && summary.unknown === 0);
  ok('live + clean: hasDraft false + pass > 0', summary.hasDraft === false && summary.pass > 0);
}

{
  // Live app + Privacy Policy URL got cleared in ASC after launch.
  const ctx = makeCtx({
    version: null,
    build: null,
    localizations: [],
    isFirstVersion: false,
    appInfoLocalization: makeAppInfoLoc({ privacyPolicyUrl: '' }),
    subscriptionProducts: [],
  });
  const results = runChecklist(ctx);
  const summary = summarizeChecklist(results, ctx);
  const nonNaNonPass = results.filter((r) => r.severity !== 'na' && r.severity !== 'pass');
  ok('drift: surfaces exactly the broken privacy-url rule',
    nonNaNonPass.length === 1 && nonNaNonPass[0]?.id === 'privacy-policy-url');
  ok('drift: summary registers 1 fail',
    summary.fail === 1 && summary.hasDraft === false);
}

{
  // Live app + subscription product slipped into MISSING_METADATA
  // (e.g., a price tier was deprecated by Apple).
  const ctx = makeCtx({
    version: null,
    build: null,
    localizations: [],
    isFirstVersion: false,
    subscriptionProducts: [
      makeSub('release_pilot_pro_monthly', 'MISSING_METADATA'),
      makeSub('release_pilot_pro_yearly', 'READY_TO_SUBMIT'),
    ],
  });
  const results = runChecklist(ctx);
  const nonNaNonPass = results.filter((r) => r.severity !== 'na' && r.severity !== 'pass');
  ok('drift: surfaces only the broken subs rule',
    nonNaNonPass.length === 1 && nonNaNonPass[0]?.id === 'subscription-products');
  ok('drift: subs rule is fail', nonNaNonPass[0]?.severity === 'fail');
}

{
  // Partial API failure during app-level fetch (e.g., 403 on listAppInfos
  // but getApp + subscriptionGroups succeeded). The 3 appInfo-derived
  // rules degrade to unknown — we want them surfaced so the user can
  // verify manually in ASC.
  const ctx = makeCtx({
    version: null,
    build: null,
    localizations: [],
    isFirstVersion: false,
    appInfo: null,
    primaryCategory: null,
    appInfoLocalization: null,
  });
  const results = runChecklist(ctx);
  const summary = summarizeChecklist(results, ctx);
  const nonNaNonPass = results.filter((r) => r.severity !== 'na' && r.severity !== 'pass');
  ok('partial API-fail: surfaces the 3 unknown rows for manual verify',
    nonNaNonPass.length === 3 && nonNaNonPass.every((r) => r.severity === 'unknown'));
  ok('partial API-fail: summary.unknown === 3',
    summary.unknown === 3 && summary.hasDraft === false);
}

{
  // Total app-level fetch failure (all 5 endpoints 403). Every app-level
  // rule that has data dependencies degrades to unknown.
  const ctx = makeCtx({
    version: null,
    build: null,
    localizations: [],
    isFirstVersion: false,
    app: null,
    appInfo: null,
    primaryCategory: null,
    appInfoLocalization: null,
    subscriptionProducts: null,
    priceSchedule: null,
    availability: null,
  });
  const results = runChecklist(ctx);
  const summary = summarizeChecklist(results, ctx);
  const nonNaNonPass = results.filter((r) => r.severity !== 'na' && r.severity !== 'pass');
  ok('full API-fail: surfaces 7 unknowns (content + category + subtitle + privacy + subs + price + availability)',
    nonNaNonPass.length === 7 && nonNaNonPass.every((r) => r.severity === 'unknown'));
  ok('full API-fail: summary.unknown === 7',
    summary.unknown === 7);
}

// ---------------------------------------------------------------------------
// Regression: the exact scenario the user hit on v1.0 submission
// ("Unable to Add for Review: You must choose a price tier in Pricing")
// — a fully-prepared draft + perfect metadata, but pricing not configured.
// ---------------------------------------------------------------------------

{
  const ctx = makeCtx({
    priceSchedule: { priceCount: 0 },
    // Availability defaults to configured — only pricing is missing
  });
  const results = runChecklist(ctx);
  const summary = summarizeChecklist(results, ctx);
  ok('regression: missing price tier alone → overall fail',
    summary.overallSeverity === 'fail' && summary.fail === 1);
  ok('regression: missing price tier surfaces price-tier rule',
    ruleById(results, 'price-tier')?.severity === 'fail');
}

// ---------------------------------------------------------------------------
// summarizeChecklist — overall severity priority
// ---------------------------------------------------------------------------

{
  // Worst case — a draft EXISTS but every field is blank → many fails.
  // (Setting `version: null` would degrade everything to NA after the
  // no-draft fix, which is the OPPOSITE of what this test exercises.)
  const ctx = makeCtx({
    build: null,
    localizations: [],
    screenshotSetsByLocalization: new Map(),
  });
  const summary = summarizeChecklist(runChecklist(ctx));
  ok('summarize: any fail → overall fail', summary.overallSeverity === 'fail');
  ok('summarize: total = RULE_COUNT', summary.total === RULE_COUNT);
}

{
  // Warn + unknown, no fail
  const ctx = makeCtx({
    localizations: [makeLoc({
      description: 'A high-quality app that does great things.',
      keywords: '',  // warn
      supportUrl: 'https://example.com/support',
      whatsNew: 'Fixed bugs',
      // marketing missing → warn
    })],
  });
  const summary = summarizeChecklist(runChecklist(ctx));
  ok('summarize: warn + unknown → overall warn', summary.overallSeverity === 'warn');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nchecklist-rules: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
