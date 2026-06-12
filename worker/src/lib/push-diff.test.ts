import {
  COOLDOWN_MS,
  decidePushOnStateChange,
  isDuplicate,
  type RecentPush,
} from './push-diff';
import type { SemanticState } from './semantic-state';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ---------------------------------------------------------------------------
// decidePushOnStateChange
// ---------------------------------------------------------------------------

// First-observation → silent
{
  const states: SemanticState[] = [
    'drafting', 'submitted', 'in_review',
    'approved_waiting', 'approved_scheduled', 'live', 'rejected',
  ];
  for (const s of states) {
    const d = decidePushOnStateChange({ previous: null, current: s });
    ok(`first-observation ${s} → silent`, d.kind === 'send' && d.push === 'silent');
  }
}

// No change → skip
{
  const d = decidePushOnStateChange({ previous: 'in_review', current: 'in_review' });
  ok('no-change → skip', d.kind === 'skip');
}

// Key transitions → alert
{
  const cases: Array<[SemanticState, SemanticState]> = [
    ['drafting', 'submitted'],
    ['submitted', 'in_review'],
    ['in_review', 'approved_waiting'],
    ['approved_waiting', 'live'],
    ['in_review', 'rejected'],
    ['rejected', 'in_review'],
    ['live', 'drafting'],
    ['drafting', 'in_review'],
  ];
  for (const [prev, curr] of cases) {
    const d = decidePushOnStateChange({ previous: prev, current: curr });
    ok(`${prev} → ${curr} → alert`, d.kind === 'send' && d.push === 'alert');
  }
}

// approved_waiting → approved_scheduled (both NOTABLE) — alert
{
  const d = decidePushOnStateChange({ previous: 'approved_waiting', current: 'approved_scheduled' });
  ok('approved_waiting → approved_scheduled → alert', d.kind === 'send' && d.push === 'alert');
}

// ---------------------------------------------------------------------------
// isDuplicate
// ---------------------------------------------------------------------------

{
  const now = 10_000_000;
  const recent: RecentPush[] = [
    { appId: 'A', newState: 'in_review', sentAtMs: now - 5 * 60 * 1000 },
    { appId: 'B', newState: 'live',      sentAtMs: now - 60 * 60 * 1000 },
  ];

  ok(
    'same app+state within cooldown → dup',
    isDuplicate({ recent, candidate: { appId: 'A', newState: 'in_review' }, nowMs: now }),
  );

  ok(
    'same app, different state → not dup',
    !isDuplicate({ recent, candidate: { appId: 'A', newState: 'live' }, nowMs: now }),
  );

  ok(
    'different app, same state → not dup',
    !isDuplicate({ recent, candidate: { appId: 'C', newState: 'in_review' }, nowMs: now }),
  );

  ok(
    'beyond cooldown window → not dup',
    !isDuplicate({ recent, candidate: { appId: 'B', newState: 'live' }, nowMs: now }),
  );

  ok(
    'empty recent → not dup',
    !isDuplicate({ recent: [], candidate: { appId: 'A', newState: 'in_review' }, nowMs: now }),
  );

  ok(
    'custom cooldown respected',
    !isDuplicate({
      recent,
      candidate: { appId: 'A', newState: 'in_review' },
      nowMs: now,
      cooldownMs: 60 * 1000,
    }),
  );
}

ok('COOLDOWN_MS is 30 minutes', COOLDOWN_MS === 30 * 60 * 1000);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nworker/push-diff: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
