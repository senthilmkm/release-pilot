import {
  pickPrimaryLocalization,
  runChecklist,
  RULE_COUNT,
  summarizeChecklist,
  type ChecklistContext,
} from './checklist-rules';
import type {
  ASCAppScreenshotSet,
  ASCAppStoreVersion,
  ASCAppStoreVersionLocalization,
  ASCBuild,
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

function makeCtx(over: Partial<ChecklistContext> = {}): ChecklistContext {
  return {
    appId: 'app1',
    version: over.version === undefined ? makeVersion() : over.version,
    build: over.build === undefined ? makeBuild('29') : over.build,
    localizations: over.localizations ?? [
      makeLoc({
        locale: 'en-US',
        description: 'A high-quality app that does great things and helps users every day.',
        keywords: 'memory, journal, recall',
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
  };
}

function ruleById(results: ReturnType<typeof runChecklist>, id: string) {
  return results.find((r) => r.id === id);
}

// ---------------------------------------------------------------------------
// RULE_COUNT / runChecklist baseline
// ---------------------------------------------------------------------------

ok('exposes 10 rules',           RULE_COUNT === 10);
ok('runChecklist returns 10',    runChecklist(makeCtx()).length === 10);

// Happy path: a clean draft should be all-pass (except encryption which is unknown)
{
  const results = runChecklist(makeCtx());
  const summary = summarizeChecklist(results);
  ok('happy path: 9 pass + 1 unknown', summary.pass === 9 && summary.unknown === 1);
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
  const results = runChecklist(makeCtx({ version: null, build: null, localizations: [] }));
  const allNa = results.every((r) => r.severity === 'na');
  ok('no-draft: all 10 rules degrade to NA', allNa);
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
  ok('summarize: total = RULE_COUNT', summary.total === 10);
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
