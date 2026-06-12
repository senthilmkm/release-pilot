/**
 * Pure reducer tests for the per-app RevenueCat store.
 *
 * We test the `reducers` object (pure functions) rather than the zustand
 * store itself, because importing the store transitively loads MMKV →
 * react-native, which crashes in a node script. Same reason `accounts.ts`
 * has no test today.
 *
 * The zustand wrapper is a 3-line `set((s) => ({ byAscAppId: reducers.X(...) }))`
 * call — covered by manual smoke + e2e dev-build flows.
 */

import type { AppRevenueCatMeta } from './app-revenuecat-reducers';
import { reducers } from './app-revenuecat-reducers';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

function meta(overrides: Partial<AppRevenueCatMeta> & { ascAppId: string }): AppRevenueCatMeta {
  return {
    projectId: 'proj_default',
    verified: false,
    lastVerifiedAtMs: null,
    currency: 'USD',
    connectedAtMs: 1000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// upsert
// ---------------------------------------------------------------------------

{
  const initial: Record<string, AppRevenueCatMeta> = {};
  const next = reducers.upsert(initial, meta({ ascAppId: 'app-1', projectId: 'proj_1' }));
  ok('upsert: adds a new app',                next['app-1']?.projectId === 'proj_1');
  ok('upsert: returns a new object',          next !== initial);
  ok('upsert: does not mutate input',         Object.keys(initial).length === 0);
}

// Replace on conflict (rotate-key flow)
{
  const start = reducers.upsert({}, meta({ ascAppId: 'app-1', projectId: 'proj_1', connectedAtMs: 1000 }));
  const after = reducers.upsert(start, meta({ ascAppId: 'app-1', projectId: 'proj_1_new', connectedAtMs: 2000 }));
  ok('upsert: re-upserting replaces projectId',  after['app-1']?.projectId === 'proj_1_new');
  ok('upsert: still single entry',               Object.keys(after).length === 1);
}

// Multiple apps coexist
{
  let state: Record<string, AppRevenueCatMeta> = {};
  state = reducers.upsert(state, meta({ ascAppId: 'app-1', projectId: 'proj_1', currency: 'USD' }));
  state = reducers.upsert(state, meta({ ascAppId: 'app-2', projectId: 'proj_2', currency: 'EUR' }));
  ok('upsert: second app coexists',             Object.keys(state).length === 2);
  ok('upsert: each app keyed independently',
    state['app-1']?.currency === 'USD' && state['app-2']?.currency === 'EUR');
}

// ---------------------------------------------------------------------------
// markVerified
// ---------------------------------------------------------------------------

{
  let state: Record<string, AppRevenueCatMeta> = {};
  state = reducers.upsert(state, meta({ ascAppId: 'app-1', projectId: 'proj_1', connectedAtMs: 1000 }));
  state = reducers.markVerified(state, 'app-1', 5000, 'GBP');

  const m = state['app-1'];
  ok('markVerified: flips verified to true',    m?.verified === true);
  ok('markVerified: writes lastVerifiedAtMs',   m?.lastVerifiedAtMs === 5000);
  ok('markVerified: updates currency',          m?.currency === 'GBP');
  ok('markVerified: preserves projectId',       m?.projectId === 'proj_1');
  ok('markVerified: preserves connectedAtMs',   m?.connectedAtMs === 1000);
}

// Unknown app → returns same reference (no-op)
{
  const before = reducers.upsert({}, meta({ ascAppId: 'app-1' }));
  const after = reducers.markVerified(before, 'does-not-exist', 9000, 'USD');
  ok('markVerified: unknown app returns same reference (no-op)', after === before);
}

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

{
  let state: Record<string, AppRevenueCatMeta> = {};
  state = reducers.upsert(state, meta({ ascAppId: 'app-1', verified: true, lastVerifiedAtMs: 5000 }));
  state = reducers.upsert(state, meta({ ascAppId: 'app-2', projectId: 'proj_2' }));
  state = reducers.remove(state, 'app-1');

  ok('remove: erases the entry',                state['app-1'] === undefined);
  ok('remove: leaves other apps intact',        state['app-2']?.projectId === 'proj_2');
}

// Removing unknown is no-op (same reference)
{
  const before = reducers.upsert({}, meta({ ascAppId: 'app-1' }));
  const after = reducers.remove(before, 'does-not-exist');
  ok('remove: unknown app returns same reference (no-op)', after === before);
}

// Removing last entry empties the map cleanly
{
  let state: Record<string, AppRevenueCatMeta> = reducers.upsert({}, meta({ ascAppId: 'app-1' }));
  state = reducers.remove(state, 'app-1');
  ok('remove: removing last entry empties the map', Object.keys(state).length === 0);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\napp-revenuecat: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
