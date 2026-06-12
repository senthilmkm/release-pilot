import { toSemanticState, isTerminalState, type SemanticState } from './semantic-state';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ---------------------------------------------------------------------------
// toSemanticState — mirrors iOS state-machine.ts mapping
// ---------------------------------------------------------------------------

const cases: Array<[string, SemanticState]> = [
  ['PREPARE_FOR_SUBMISSION',        'drafting'],
  ['DEVELOPER_REJECTED',            'drafting'],
  ['DEVELOPER_REMOVED_FROM_SALE',   'drafting'],
  ['READY_FOR_REVIEW',              'submitted'],
  ['WAITING_FOR_REVIEW',            'submitted'],
  ['WAITING_FOR_EXPORT_COMPLIANCE', 'submitted'],
  ['PROCESSING_FOR_APP_STORE',      'submitted'],
  ['PENDING_CONTRACT',              'submitted'],
  ['IN_REVIEW',                     'in_review'],
  ['PENDING_DEVELOPER_RELEASE',     'approved_waiting'],
  ['PENDING_APPLE_RELEASE',         'approved_scheduled'],
  ['READY_FOR_SALE',                'live'],
  ['REPLACED_WITH_NEW_VERSION',     'live'],
  ['REMOVED_FROM_SALE',             'live'],
  ['REJECTED',                      'rejected'],
  ['METADATA_REJECTED',             'rejected'],
  ['INVALID_BINARY',                'rejected'],
];

for (const [raw, expected] of cases) {
  ok(`${raw} → ${expected}`, toSemanticState(raw) === expected);
}

ok('unknown raw → drafting (defensive default)', toSemanticState('SOMETHING_NEW') === 'drafting');
ok('empty string → drafting',                    toSemanticState('') === 'drafting');

// ---------------------------------------------------------------------------
// isTerminalState
// ---------------------------------------------------------------------------

ok('live is terminal',     isTerminalState('live'));
ok('rejected is terminal', isTerminalState('rejected'));
ok('in_review is NOT',     !isTerminalState('in_review'));
ok('drafting is NOT',      !isTerminalState('drafting'));

// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nworker/semantic-state: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
