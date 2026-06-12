/**
 * Tests for the free-tier "1 app with full features" helpers.
 *
 * Critical because this logic decides which app a free user can use
 * without the paywall. Bugs here silently leak Pro-only access OR
 * unfairly lock the user out of their own data.
 *
 * Same lightweight test style as `gates.test.ts` (no node:test runner
 * dependency) so the tsconfig stays clean and `npx tsx <file>` just
 * runs the tests.
 */

import {
  getAppIndex,
  getFreeAppAscId,
  isAppLockedForFree,
  sortAppsAlphabetically,
} from './free-app';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

const apps = [
  { ascId: 'r', name: 'Recall' },
  { ascId: 'rp', name: 'Release Pilot' },
  { ascId: 'pdf', name: 'PDF Studio' },
  { ascId: 's', name: 'Shotday' },
  { ascId: 'ff', name: 'Format Flex' },
];

const sortedNames = ['Format Flex', 'PDF Studio', 'Recall', 'Release Pilot', 'Shotday'];

// ===========================================================================
// sortAppsAlphabetically
// ===========================================================================

{
  const result = sortAppsAlphabetically(apps);
  ok('sort: produces correct alphabetical order',
    JSON.stringify(result.map((a) => a.name)) === JSON.stringify(sortedNames));
  ok('sort: returns a NEW array (no mutation)',
    result !== apps);
}

{
  const mixed = [
    { ascId: '1', name: 'banana' },
    { ascId: '2', name: 'Apple' },
    { ascId: '3', name: 'cherry' },
  ];
  const result = sortAppsAlphabetically(mixed);
  ok('sort: case-insensitive (Apple before banana)',
    result[0]!.name === 'Apple' && result[1]!.name === 'banana' && result[2]!.name === 'cherry');
}

ok('sort: empty input → empty output',
  sortAppsAlphabetically([]).length === 0);

// ===========================================================================
// getFreeAppAscId
// ===========================================================================

ok('freeApp: returns alphabetically-first ascId',
  getFreeAppAscId(apps) === 'ff');

ok('freeApp: 1 app → that app is free',
  getFreeAppAscId([{ ascId: 'x', name: 'Only App' }]) === 'x');

ok('freeApp: 0 apps → null',
  getFreeAppAscId([]) === null);

// ===========================================================================
// getAppIndex
// ===========================================================================

ok('appIndex: Format Flex is 0', getAppIndex(apps, 'ff') === 0);
ok('appIndex: PDF Studio is 1',  getAppIndex(apps, 'pdf') === 1);
ok('appIndex: Recall is 2',      getAppIndex(apps, 'r') === 2);
ok('appIndex: Release Pilot 3',  getAppIndex(apps, 'rp') === 3);
ok('appIndex: Shotday is 4',     getAppIndex(apps, 's') === 4);
ok('appIndex: unknown id → -1',  getAppIndex(apps, 'nope') === -1);

// ===========================================================================
// isAppLockedForFree
// ===========================================================================

{
  let allOpen = true;
  for (const a of apps) {
    if (isAppLockedForFree({ apps, ascId: a.ascId, isPro: true }) !== false) {
      allOpen = false;
    }
  }
  ok('locked: Pro user is never locked from any app', allOpen);
}

ok('locked: alphabetically-first app is unlocked for free',
  isAppLockedForFree({ apps, ascId: 'ff', isPro: false }) === false);

{
  let allBlocked = true;
  for (const a of apps.filter((x) => x.ascId !== 'ff')) {
    if (isAppLockedForFree({ apps, ascId: a.ascId, isPro: false }) !== true) {
      allBlocked = false;
    }
  }
  ok('locked: every non-first app is blocked for free', allBlocked);
}

ok('locked: free user with 0 apps → not locked (nothing to gate)',
  isAppLockedForFree({ apps: [], ascId: 'anything', isPro: false }) === false);

ok('locked: free user with 1 app → that app is unlocked',
  isAppLockedForFree({
    apps: [{ ascId: 'solo', name: 'Solo' }],
    ascId: 'solo',
    isPro: false,
  }) === false);

// ===========================================================================
// Regression: stability under input shuffling and account add/remove
// ===========================================================================

{
  const a = sortAppsAlphabetically(apps);
  const b = sortAppsAlphabetically([...apps].reverse());
  ok('regression: sort is stable across input permutations',
    JSON.stringify(a.map((x) => x.ascId)) === JSON.stringify(b.map((x) => x.ascId)));
}

{
  // Simulates the bug we want to PREVENT: removing an account and
  // re-adding it should NOT change which app is free. "First added"
  // would break here; alphabetical is stable.
  const withoutOne = apps.filter((a) => a.ascId !== 'r');
  const reAdded = [...withoutOne, { ascId: 'r', name: 'Recall' }];
  ok('regression: removing+re-adding an account does not change the free app',
    getFreeAppAscId(apps) === 'ff'
      && getFreeAppAscId(withoutOne) === 'ff'
      && getFreeAppAscId(reAdded) === 'ff');
}

// ===========================================================================
// Report
// ===========================================================================

const failed = tests.filter((t) => !t.pass);
for (const t of tests) {
  console.log((t.pass ? 'ok' : 'FAIL') + ' - ' + t.name);
}
if (failed.length > 0) {
  console.error(`\n${failed.length} of ${tests.length} tests FAILED`);
  process.exit(1);
}
console.log(`\n${tests.length} tests passed`);
