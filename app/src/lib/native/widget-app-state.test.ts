import { HERO_PRIORITY, buildSharedState } from './widget-app-state';
import { WIDGET_APPS_CAP } from './shared-app-state';
import type { AggregatedAppRow } from '@/lib/api/asc-queries';
import type { LatestStateSnapshot } from '@/lib/domain/version-events';
import type { SemanticState } from '@/constants/state-tokens';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = 10_000_000_000_000;

function app(id: string, name: string): AggregatedAppRow {
  return {
    ascId: id,
    name,
    bundleId: `com.example.${id}`,
    issuerId: 'iss',
    // The aggregator includes extra fields we don't care about in this
    // test; cast through unknown to keep the type checker happy without
    // dragging in real ASC test fixtures.
  } as unknown as AggregatedAppRow;
}

function snapshot(state: SemanticState, version = '1.0.0'): LatestStateSnapshot {
  return {
    state,
    versionString: version,
    buildNumber: '1',
    isEmpty: false,
  } as unknown as LatestStateSnapshot;
}

function snapshots(...entries: [string, LatestStateSnapshot][]): Map<string, LatestStateSnapshot> {
  return new Map(entries);
}

// ===========================================================================
// Schema invariants
// ===========================================================================

ok('cap: pro is generous',  WIDGET_APPS_CAP.pro >= 6);
ok('cap: free = 1',         WIDGET_APPS_CAP.free === 1);
ok('cap: lapsed = 1',       WIDGET_APPS_CAP.lapsed === 1);

// ===========================================================================
// Pro user — all apps, no headline
// ===========================================================================

{
  const apps = [app('a', 'Alpha'), app('b', 'Beta'), app('c', 'Charlie')];
  const snaps = snapshots(
    ['a', snapshot('in_review')],
    ['b', snapshot('live')],
    ['c', snapshot('approved_waiting')],
  );
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'pro' });
  ok('pro: schema version v1 (additive policy — no bump)', out.v === 1);
  ok('pro: all 3 apps rendered', out.apps.length === 3);
  ok('pro: no headline', out.headline === null);
  ok('pro: proStatus marked pro', out.proStatus === 'pro');
  ok('pro: lastUpdatedMs stamped', out.lastUpdatedMs === NOW);
}

// ===========================================================================
// Free user — 1 app, conditional headline
// ===========================================================================

{
  // 1-app free user → no nag, just the one app (nothing to upgrade for)
  const apps = [app('a', 'Solo App')];
  const snaps = snapshots(['a', snapshot('live')]);
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'free' });
  ok('free 1 app: 1 app rendered', out.apps.length === 1);
  ok('free 1 app: NO headline (nothing to upgrade for)', out.headline === null);
  ok('free 1 app: proStatus marked free', out.proStatus === 'free');
}

{
  // 3-app free user → capped to 1, soft nag headline
  const apps = [app('a', 'Alpha'), app('b', 'Beta'), app('c', 'Charlie')];
  const snaps = snapshots(
    ['a', snapshot('in_review')],
    ['b', snapshot('live')],
    ['c', snapshot('approved_waiting')],
  );
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'free' });
  ok('free 3 apps: capped to 1', out.apps.length === 1);
  ok('free 3 apps: headline nags upgrade', out.headline === 'Upgrade to track all apps');
}

// ===========================================================================
// Lapsed user — always nag
// ===========================================================================

{
  // Even with 1 app, lapsed user gets the renewal nag
  const apps = [app('a', 'Solo App')];
  const snaps = snapshots(['a', snapshot('live')]);
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'lapsed' });
  ok('lapsed 1 app: 1 app rendered',   out.apps.length === 1);
  ok('lapsed 1 app: renewal headline', out.headline === 'Renew Pro to see all apps');
  ok('lapsed 1 app: proStatus lapsed', out.proStatus === 'lapsed');
}

{
  // Lapsed + multiple apps → still capped to 1 + renewal nag
  const apps = [app('a', 'Alpha'), app('b', 'Beta')];
  const snaps = snapshots(['a', snapshot('in_review')], ['b', snapshot('live')]);
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'lapsed' });
  ok('lapsed N apps: capped to 1',     out.apps.length === 1);
  ok('lapsed N apps: renewal headline', out.headline === 'Renew Pro to see all apps');
}

// ===========================================================================
// Empty-snapshot filtering — apps without snapshots are excluded
// ===========================================================================

{
  const apps = [app('a', 'Alpha'), app('b', 'Beta')];
  // Only one snapshot; the other app has no data yet
  const snaps = snapshots(['a', snapshot('live')]);
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'pro' });
  ok('empty snapshots filtered', out.apps.length === 1);
  ok('non-empty kept', out.apps[0]!.ascId === 'a');
}

// ===========================================================================
// HERO_PRIORITY — the lock-screen "which one app" picker
// ===========================================================================

// Spec invariants: lower = higher urgency.
ok('priority: rejected is rank 1 (most urgent)', HERO_PRIORITY.rejected === 1);
ok('priority: approved_waiting beats in_review',
  HERO_PRIORITY.approved_waiting < HERO_PRIORITY.in_review);
ok('priority: in_review beats approved_scheduled',
  HERO_PRIORITY.in_review < HERO_PRIORITY.approved_scheduled);
ok('priority: submitted beats drafting',
  HERO_PRIORITY.submitted < HERO_PRIORITY.drafting);
ok('priority: drafting beats live (active work > shipped)',
  HERO_PRIORITY.drafting < HERO_PRIORITY.live);
ok('priority: live is rank 7 (least urgent — shipped, nothing to do)',
  HERO_PRIORITY.live === 7);
ok('priority: all 7 states distinct ranks',
  new Set(Object.values(HERO_PRIORITY)).size === 7);

// The exact scenario the user hit: drafting app vs live app.
{
  const apps = [app('a', 'Shipped App'), app('b', 'In Progress')];
  const snaps = snapshots(
    ['a', snapshot('live')],
    ['b', snapshot('drafting')],
  );
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'pro' });
  ok('hero: drafting beats live for the #0 slot',
    out.apps[0]!.name === 'In Progress');
}

// Hero pick: REJECTED wins over LIVE even though "live" sounds more recent.
{
  const apps = [app('a', 'Alpha'), app('b', 'Beta')];
  const snaps = snapshots(
    ['a', snapshot('live')],
    ['b', snapshot('rejected')],
  );
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'pro' });
  ok('hero: rejected beats live for the #0 slot',
    out.apps[0]!.name === 'Beta');
}

// Hero pick: APPROVED_WAITING (you need to release) beats IN_REVIEW.
{
  const apps = [app('a', 'Alpha'), app('b', 'Beta')];
  const snaps = snapshots(
    ['a', snapshot('in_review')],
    ['b', snapshot('approved_waiting')],
  );
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'pro' });
  ok('hero: approved_waiting beats in_review for the #0 slot',
    out.apps[0]!.name === 'Beta');
}

// Hero pick: alphabetical tiebreaker when two apps share a state.
{
  const apps = [app('z', 'Zebra'), app('a', 'Alpha'), app('m', 'Marlin')];
  const snaps = snapshots(
    ['z', snapshot('in_review')],
    ['a', snapshot('in_review')],
    ['m', snapshot('in_review')],
  );
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'pro' });
  ok('hero: tied state → alphabetical (Alpha first)',
    out.apps.map((a) => a.name).join(',') === 'Alpha,Marlin,Zebra');
}

// Full pipeline scenario: indie dev with 5 apps in different states.
// Free tier MUST pick the alphabetically-first app (the one that's
// unlocked in Releases/Reviews/Today/Checklist), NOT the most-urgent
// one. This used to pick "Reader" (approved_waiting) which was the
// widget-vs-tabs inconsistency bug — widget surfaced an app the user
// couldn't tap into.
{
  const apps = [
    app('1', 'Notes'),
    app('2', 'Tasks'),
    app('3', 'Habits'),
    app('4', 'Reader'),
    app('5', 'Wallet'),
  ];
  const snaps = snapshots(
    ['1', snapshot('live')],
    ['2', snapshot('drafting')],
    ['3', snapshot('in_review')],       // ← Apple looking right now
    ['4', snapshot('approved_waiting')], // ← Pro would show this
    ['5', snapshot('submitted')],
  );
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'free' });
  ok('free pick: surfaces alphabetically-first app (matches free-app rule)',
    out.apps.length === 1 && out.apps[0]!.name === 'Habits');
}

// Regression for the real bug: PDF Studio (live) + Release Pilot
// (drafting). HERO_PRIORITY would pick Release Pilot, but the user's
// free app is PDF Studio (alphabetically first). Widget must agree.
{
  const apps = [
    app('rp', 'Release Pilot'),
    app('ps', 'PDF Studio: Scan & Convert App'),
    app('rc', 'Recall: Personal Memory'),
    app('sd', 'Shotday'),
  ];
  const snaps = snapshots(
    ['rp', snapshot('drafting')],   // urgent state, would beat live in HERO
    ['ps', snapshot('live')],       // alphabetically first
    ['rc', snapshot('live')],
    ['sd', snapshot('live')],
  );
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'free' });
  ok('regression: free widget shows PDF Studio (free app), not Release Pilot',
    out.apps.length === 1 && out.apps[0]!.name === 'PDF Studio: Scan & Convert App');
}

// Same regression scenario but lapsed: still alphabetically first.
{
  const apps = [
    app('rp', 'Release Pilot'),
    app('ps', 'PDF Studio: Scan & Convert App'),
  ];
  const snaps = snapshots(
    ['rp', snapshot('rejected')],   // most urgent possible state
    ['ps', snapshot('live')],
  );
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'lapsed' });
  ok('regression: lapsed widget shows alphabetically-first even with rejected app available',
    out.apps[0]!.name === 'PDF Studio: Scan & Convert App');
}

// Same scenario as Pro — full ordering surfaces all 5 by urgency.
{
  const apps = [
    app('1', 'Notes'),
    app('2', 'Tasks'),
    app('3', 'Habits'),
    app('4', 'Reader'),
    app('5', 'Wallet'),
  ];
  const snaps = snapshots(
    ['1', snapshot('live')],
    ['2', snapshot('drafting')],
    ['3', snapshot('in_review')],
    ['4', snapshot('approved_waiting')],
    ['5', snapshot('submitted')],
  );
  const out = buildSharedState({ apps, snapshots: snaps, nowMs: NOW, proStatus: 'pro' });
  ok('pro full order: by urgency (approved_waiting → in_review → submitted → drafting → live)',
    out.apps.map((a) => a.name).join(',') === 'Reader,Habits,Wallet,Tasks,Notes');
}

// ===========================================================================
// Color projection — sanity check that StateColors flows through
// ===========================================================================

{
  const out = buildSharedState({
    apps: [app('a', 'X')],
    snapshots: snapshots(['a', snapshot('in_review')]),
    nowMs: NOW,
    proStatus: 'pro',
  });
  const row = out.apps[0]!;
  // The yellow "in_review" badge is a stable design token; the widget
  // relies on it for the lock-screen badge contrast.
  ok('color projection: state surfaced', row.state === 'in_review');
  ok('color projection: light fg hex',   /^#[0-9A-F]{6}$/i.test(row.stateFgLight));
  ok('color projection: dark bg hex',    /^#[0-9A-F]{6}$/i.test(row.stateBgDark));
  ok('color projection: state label',    row.stateLabel.length > 0);
  ok('color projection: short label',    row.stateShortLabel.length > 0);
}

// ===========================================================================
// Summary
// ===========================================================================

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nwidget-app-state: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
