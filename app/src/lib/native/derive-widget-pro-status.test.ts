import {
  LAPSED_NAG_WINDOW_MS,
  deriveWidgetProStatus,
} from './derive-widget-pro-status';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

const NOW = 10_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

ok('window: exactly 60 days', LAPSED_NAG_WINDOW_MS === 60 * DAY);

// ---------------------------------------------------------------------------
// Currently Pro
// ---------------------------------------------------------------------------

ok('pro now → pro (no last-pro stamp)',
  deriveWidgetProStatus({ isPro: true,  lastProMs: null,         nowMs: NOW }) === 'pro');

ok('pro now → pro (regardless of stale stamp)',
  deriveWidgetProStatus({ isPro: true,  lastProMs: NOW - 99 * DAY, nowMs: NOW }) === 'pro');

// ---------------------------------------------------------------------------
// Never been Pro
// ---------------------------------------------------------------------------

ok('free, never pro → free',
  deriveWidgetProStatus({ isPro: false, lastProMs: null, nowMs: NOW }) === 'free');

// ---------------------------------------------------------------------------
// Recently lapsed (within nag window)
// ---------------------------------------------------------------------------

ok('free, lapsed 1 day ago → lapsed',
  deriveWidgetProStatus({ isPro: false, lastProMs: NOW - 1 * DAY, nowMs: NOW }) === 'lapsed');

ok('free, lapsed 30 days ago → lapsed',
  deriveWidgetProStatus({ isPro: false, lastProMs: NOW - 30 * DAY, nowMs: NOW }) === 'lapsed');

ok('free, lapsed exactly 60 days ago → lapsed (boundary inclusive)',
  deriveWidgetProStatus({ isPro: false, lastProMs: NOW - 60 * DAY, nowMs: NOW }) === 'lapsed');

// ---------------------------------------------------------------------------
// Long-ago lapse → de-escalate to free (stop nagging)
// ---------------------------------------------------------------------------

ok('free, lapsed 61 days ago → free (stop nagging)',
  deriveWidgetProStatus({ isPro: false, lastProMs: NOW - 61 * DAY, nowMs: NOW }) === 'free');

ok('free, lapsed years ago → free',
  deriveWidgetProStatus({ isPro: false, lastProMs: NOW - 365 * DAY, nowMs: NOW }) === 'free');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nderive-widget-pro-status: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
