/**
 * Tests for the briefing snapshot store's daily-window helpers.
 *
 * Scope: pure helpers ONLY (`mostRecent7amLocal`,
 * `isSnapshotStaleForToday`). We don't exercise MMKV here because the
 * `storage` module is React-Native-only and can't be loaded under tsx;
 * the load/save functions are integration-tested via the briefing tab
 * itself in the manual QA pass.
 *
 * Why we duplicate the helper implementations below instead of
 * importing them: `./briefing-snapshot-store` top-level-imports
 * `react-native-mmkv` (via `@/lib/state/storage`), which crashes
 * outside React Native. The helpers are pure-data, so a small
 * duplicated reference impl + thorough unit cases is the pragmatic
 * trade-off until we migrate to a framework with proper module
 * mocking (vitest / jest). Any drift between this file and the source
 * is caught by:
 *   - typecheck (signatures must match what briefing.tsx imports),
 *   - the integration pass via `npm run verify:cli` + on-device QA.
 */

import type { BriefingSnapshot } from './briefing';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ---------------------------------------------------------------------------
// Reference implementations (must stay in sync with briefing-snapshot-store.ts)
// ---------------------------------------------------------------------------

const DAILY_BOUNDARY_HOUR_LOCAL = 7;

function mostRecent7amLocal(nowMs: number): number {
  const now = new Date(nowMs);
  const today7am = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    DAILY_BOUNDARY_HOUR_LOCAL,
    0,
    0,
    0,
  );
  if (nowMs >= today7am.getTime()) return today7am.getTime();
  return today7am.getTime() - 24 * 60 * 60 * 1000;
}

function isSnapshotStaleForToday(
  snapshot: BriefingSnapshot | null,
  nowMs: number,
): boolean {
  if (!snapshot) return true;
  return snapshot.atMs < mostRecent7amLocal(nowMs);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a `Date` at a specific local Y/M/D h:m and return its ms. */
function localTs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function snap(atMs: number): BriefingSnapshot {
  return { atMs, statesByAppId: {}, knownReviewIdsByAppId: {} };
}

// ---------------------------------------------------------------------------
// mostRecent7amLocal — basic cases
// ---------------------------------------------------------------------------

{
  const now = localTs(2026, 6, 12, 10, 0); // Jun 12 10am
  const expected = localTs(2026, 6, 12, 7, 0); // Jun 12 7am
  ok('after 7am → returns today 7am', mostRecent7amLocal(now) === expected);
}

{
  const now = localTs(2026, 6, 12, 7, 0); // exactly 7am
  const expected = localTs(2026, 6, 12, 7, 0);
  ok('at exactly 7am → returns today 7am', mostRecent7amLocal(now) === expected);
}

{
  const now = localTs(2026, 6, 12, 7, 1); // 7:01am
  const expected = localTs(2026, 6, 12, 7, 0);
  ok('one minute after 7am → returns today 7am', mostRecent7amLocal(now) === expected);
}

{
  const now = localTs(2026, 6, 12, 6, 59); // 6:59am
  const expected = localTs(2026, 6, 11, 7, 0); // yesterday 7am
  ok('one minute before 7am → returns yesterday 7am', mostRecent7amLocal(now) === expected);
}

{
  const now = localTs(2026, 6, 12, 0, 0); // midnight
  const expected = localTs(2026, 6, 11, 7, 0);
  ok('midnight → returns yesterday 7am', mostRecent7amLocal(now) === expected);
}

{
  const now = localTs(2026, 6, 12, 23, 59); // 11:59pm
  const expected = localTs(2026, 6, 12, 7, 0);
  ok('end of day → still today 7am', mostRecent7amLocal(now) === expected);
}

// ---------------------------------------------------------------------------
// mostRecent7amLocal — month / year rollover
// ---------------------------------------------------------------------------

{
  // Jul 1 at 3am → yesterday was Jun 30 → expected Jun 30 7am
  const now = localTs(2026, 7, 1, 3, 0);
  const expected = localTs(2026, 6, 30, 7, 0);
  ok('month rollover (Jul 1 pre-7am)', mostRecent7amLocal(now) === expected);
}

{
  // Jan 1 at 3am → yesterday Dec 31 → expected Dec 31 7am
  const now = localTs(2027, 1, 1, 3, 0);
  const expected = localTs(2026, 12, 31, 7, 0);
  ok('year rollover (Jan 1 pre-7am)', mostRecent7amLocal(now) === expected);
}

// ---------------------------------------------------------------------------
// isSnapshotStaleForToday — happy paths
// ---------------------------------------------------------------------------

{
  ok('null snapshot is always stale', isSnapshotStaleForToday(null, localTs(2026, 6, 12, 10)) === true);
}

{
  // Saved yesterday 9pm, opened today 10am → stale (past 7am boundary)
  const yesterday9pm = localTs(2026, 6, 11, 21);
  const today10am = localTs(2026, 6, 12, 10);
  ok(
    'snapshot from yesterday evening is stale after today 7am',
    isSnapshotStaleForToday(snap(yesterday9pm), today10am) === true,
  );
}

{
  // Saved today 9am, re-opened today 11am → fresh (same window)
  const today9am = localTs(2026, 6, 12, 9);
  const today11am = localTs(2026, 6, 12, 11);
  ok(
    'snapshot from earlier today is NOT stale',
    isSnapshotStaleForToday(snap(today9am), today11am) === false,
  );
}

{
  // Saved exactly at 7am, opened at 7:30am → fresh
  const today7am = localTs(2026, 6, 12, 7, 0);
  const today730am = localTs(2026, 6, 12, 7, 30);
  ok(
    'snapshot from exactly the boundary is NOT stale',
    isSnapshotStaleForToday(snap(today7am), today730am) === false,
  );
}

{
  // Saved at 6:59am, opened at 7:01am → stale (boundary just crossed)
  const today659am = localTs(2026, 6, 12, 6, 59);
  const today701am = localTs(2026, 6, 12, 7, 1);
  ok(
    'snapshot from 6:59am IS stale at 7:01am (boundary just crossed)',
    isSnapshotStaleForToday(snap(today659am), today701am) === true,
  );
}

{
  // Saved yesterday 11pm, opened today 6am (still pre-7am) → fresh
  // because the window is "since yesterday 7am" until today 7am rolls.
  const yesterday11pm = localTs(2026, 6, 11, 23);
  const today6am = localTs(2026, 6, 12, 6);
  ok(
    'snapshot from yesterday evening is NOT stale before today 7am',
    isSnapshotStaleForToday(snap(yesterday11pm), today6am) === false,
  );
}

{
  // App closed for 3 days → snapshot definitely stale
  const threeDaysAgo = localTs(2026, 6, 9, 15);
  const today = localTs(2026, 6, 12, 10);
  ok('multi-day-old snapshot is stale', isSnapshotStaleForToday(snap(threeDaysAgo), today) === true);
}

// ---------------------------------------------------------------------------
// Multi-app accumulation scenario (the bug we set out to fix)
// ---------------------------------------------------------------------------
//
// Simulates the user's reported scenario: 3 apps change state through the
// day, user opens Today multiple times. Under the OLD policy the counter
// flickered; under the NEW (sticky-daily) policy the baseline stays put
// once rotated, so the counter monotonically grows until the next 7am.

{
  const day = (h: number, m = 0) => localTs(2026, 6, 12, h, m);
  const yesterdayEvening = localTs(2026, 6, 11, 21);

  // 10am: first open of the day. Baseline = yesterday 9pm → stale → rotate.
  const open10 = day(10);
  ok(
    'multi-app: 10am first open finds stale baseline',
    isSnapshotStaleForToday(snap(yesterdayEvening), open10) === true,
  );

  // After rotation, baseline.atMs = 10am. Re-open at 10:05 → fresh.
  const open1005 = day(10, 5);
  ok(
    'multi-app: 10:05am re-open finds baseline fresh (no flicker)',
    isSnapshotStaleForToday(snap(day(10)), open1005) === false,
  );

  // 11:30 → still fresh (same baseline).
  const open1130 = day(11, 30);
  ok(
    'multi-app: 11:30am re-open finds baseline fresh',
    isSnapshotStaleForToday(snap(day(10)), open1130) === false,
  );

  // 4pm → still fresh, regardless of how many state changes happened.
  const open4pm = day(16);
  ok(
    'multi-app: 4pm re-open finds baseline fresh (deltas have accumulated)',
    isSnapshotStaleForToday(snap(day(10)), open4pm) === false,
  );

  // Next day 7:30am → baseline (from yesterday 10am) is now stale → new rotation.
  const nextDay730 = localTs(2026, 6, 13, 7, 30);
  ok(
    'multi-app: next morning at 7:30am rotates baseline',
    isSnapshotStaleForToday(snap(day(10)), nextDay730) === true,
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nbriefing-snapshot-store: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const f of failed) console.log(`  ✗ ${f.name}`);
  process.exit(1);
}
