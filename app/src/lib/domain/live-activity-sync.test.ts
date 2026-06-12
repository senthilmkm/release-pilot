import { decideActivityAction } from './live-activity-sync';
import type { SemanticState } from '@/constants/state-tokens';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

const IN_FLIGHT_STATES: SemanticState[] = ['submitted', 'in_review', 'approved_waiting', 'approved_scheduled'];
const TERMINAL_STATES: SemanticState[] = ['live', 'rejected'];
const NON_IN_FLIGHT: SemanticState[] = ['drafting', ...TERMINAL_STATES];

// ---------------------------------------------------------------------------
// First observation (previous = null)
// ---------------------------------------------------------------------------

for (const s of IN_FLIGHT_STATES) {
  const result = decideActivityAction({ previous: null, current: s, hasActiveActivity: false });
  ok(`first observation: in-flight ${s} → start`, result.kind === 'start');
}

for (const s of NON_IN_FLIGHT) {
  const result = decideActivityAction({ previous: null, current: s, hasActiveActivity: false });
  ok(`first observation: non-in-flight ${s} → noop`, result.kind === 'noop');
}

// First observation, hasActiveActivity already true (stale state):
// don't double-start
{
  const result = decideActivityAction({ previous: null, current: 'in_review', hasActiveActivity: true });
  ok('first observation + already active → noop', result.kind === 'noop');
}

// ---------------------------------------------------------------------------
// No-change cases
// ---------------------------------------------------------------------------

{
  const result = decideActivityAction({ previous: 'in_review', current: 'in_review', hasActiveActivity: true });
  ok('no change + active LA → noop', result.kind === 'noop');
}
{
  // Self-heal: state hasn't changed but we lost our LA → re-start
  const result = decideActivityAction({ previous: 'in_review', current: 'in_review', hasActiveActivity: false });
  ok('no change + no LA but in-flight → start (self-heal)', result.kind === 'start');
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

// drafting → submitted should start
{
  const result = decideActivityAction({ previous: 'drafting', current: 'submitted', hasActiveActivity: false });
  ok('drafting → submitted → start', result.kind === 'start');
}

// submitted → in_review should update
{
  const result = decideActivityAction({ previous: 'submitted', current: 'in_review', hasActiveActivity: true });
  ok('submitted → in_review (active) → update', result.kind === 'update');
}

// in_review → live should end
{
  const result = decideActivityAction({ previous: 'in_review', current: 'live', hasActiveActivity: true });
  ok('in_review → live → end', result.kind === 'end');
  if (result.kind === 'end') ok('end action carries finalState', result.finalState === 'live');
}

// in_review → rejected should end
{
  const result = decideActivityAction({ previous: 'in_review', current: 'rejected', hasActiveActivity: true });
  ok('in_review → rejected → end', result.kind === 'end');
}

// approved_waiting → approved_scheduled (rare but possible) → update
{
  const result = decideActivityAction({ previous: 'approved_waiting', current: 'approved_scheduled', hasActiveActivity: true });
  ok('approved_waiting → approved_scheduled → update', result.kind === 'update');
}

// drafting → drafting (no change) — but no LA → noop
{
  const result = decideActivityAction({ previous: 'drafting', current: 'drafting', hasActiveActivity: false });
  ok('drafting → drafting → noop', result.kind === 'noop');
}

// live → drafting (developer started a new draft) → noop (LA was already
// ended when state became live earlier, no active LA to deal with)
{
  const result = decideActivityAction({ previous: 'live', current: 'drafting', hasActiveActivity: false });
  ok('live → drafting → noop', result.kind === 'noop');
}

// drafting → in_review with an orphaned active LA (shouldn't happen in
// practice, but the deriver should be robust) → update
{
  const result = decideActivityAction({ previous: 'drafting', current: 'in_review', hasActiveActivity: true });
  ok('drafting → in_review + active LA → update (use existing)', result.kind === 'update');
}

// End-state moved to another end-state (live → rejected — impossible per
// Apple, but cover the path): noop because no active LA
{
  const result = decideActivityAction({ previous: 'live', current: 'rejected', hasActiveActivity: false });
  ok('live → rejected (no LA) → noop', result.kind === 'noop');
}

// rejected → in_review (developer resubmitted): start a fresh LA
{
  const result = decideActivityAction({ previous: 'rejected', current: 'in_review', hasActiveActivity: false });
  ok('rejected → in_review → start', result.kind === 'start');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nlive-activity-sync: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
