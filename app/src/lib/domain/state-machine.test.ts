/**
 * Pure-Node test for the state machine. Run with:
 *   node --import tsx scripts/test-state-machine.mjs
 *
 * Following Recall's "mirror tests" pattern (Node-runnable, no Jest).
 */

import {
  isLiveActivityState,
  isTerminalState,
  toSemanticState,
} from './state-machine';

const tests: { name: string; pass: boolean }[] = [];
function check(name: string, pass: boolean) {
  tests.push({ name, pass });
}

// Drafting
check('PREPARE_FOR_SUBMISSION → drafting', toSemanticState('PREPARE_FOR_SUBMISSION') === 'drafting');
check('DEVELOPER_REJECTED → drafting (re-edit needed)', toSemanticState('DEVELOPER_REJECTED') === 'drafting');

// Submitted
check('WAITING_FOR_REVIEW → submitted', toSemanticState('WAITING_FOR_REVIEW') === 'submitted');
check('PROCESSING_FOR_APP_STORE → submitted', toSemanticState('PROCESSING_FOR_APP_STORE') === 'submitted');

// In Review
check('IN_REVIEW → in_review', toSemanticState('IN_REVIEW') === 'in_review');

// Approved
check('PENDING_DEVELOPER_RELEASE → approved_waiting', toSemanticState('PENDING_DEVELOPER_RELEASE') === 'approved_waiting');
check('PENDING_APPLE_RELEASE → approved_scheduled', toSemanticState('PENDING_APPLE_RELEASE') === 'approved_scheduled');

// Live (the rename!)
check('READY_FOR_SALE → live (not "ready for sale" — that name was confusing)', toSemanticState('READY_FOR_SALE') === 'live');

// Rejected
check('REJECTED → rejected', toSemanticState('REJECTED') === 'rejected');
check('METADATA_REJECTED → rejected', toSemanticState('METADATA_REJECTED') === 'rejected');
check('INVALID_BINARY → rejected', toSemanticState('INVALID_BINARY') === 'rejected');

// Helpers
check('Live Activity stays on while in_review', isLiveActivityState('in_review') === true);
check('Live Activity off after live', isLiveActivityState('live') === false);
check('rejected is terminal', isTerminalState('rejected') === true);
check('live is terminal', isTerminalState('live') === true);
check('submitted is not terminal', isTerminalState('submitted') === false);

// Unknown enums degrade safely
check('Unknown raw enum → drafting (safe default)', toSemanticState('FUTURE_NEW_APPLE_STATE') === 'drafting');

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);

console.log(`\nstate-machine: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
