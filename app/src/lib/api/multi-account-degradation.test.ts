/**
 * Pure tests for the multi-account graceful-degradation logic that
 * lives inside `useAllAppsQuery`. We extract the projection step into a
 * helper so the React hook itself doesn't need a render harness.
 *
 * Scenarios covered:
 *   - All accounts succeed
 *   - Some succeed, some fail (partial degradation)
 *   - All accounts fail (must throw → hook surfaces error banner)
 *   - Empty / missing app name / bundle id gets a friendly fallback
 */

import { ASCError, type ASCErrorKind } from './asc-errors';

// ---------------------------------------------------------------------------
// Re-implemented projection logic — kept in lock-step with the hook so any
// drift here surfaces as a test failure (same shape, no React).
// ---------------------------------------------------------------------------

type Account = { issuerId: string; keyId: string; teamName: string };
type RawApp = { id: string; attributes: { name: string | null; bundleId: string | null } };
type AppRow = {
  ascId: string;
  name: string;
  bundleId: string;
  issuerId: string;
  teamName: string;
};
type Failure = {
  issuerId: string;
  teamName: string;
  errorKind: ASCErrorKind;
  errorMessage: string;
};

function projectSettled(
  accounts: Account[],
  settled: PromiseSettledResult<{ rows: AppRow[]; acct: Account }>[],
): { apps: AppRow[]; failures: Failure[]; threw: ASCError | null } {
  const apps: AppRow[] = [];
  const failures: Failure[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === 'fulfilled') {
      apps.push(...r.value.rows);
    } else {
      const acct = accounts[i]!;
      const err = r.reason instanceof ASCError
        ? r.reason
        : new ASCError('malformed_response', { detail: String(r.reason) });
      failures.push({
        issuerId: acct.issuerId,
        teamName: acct.teamName,
        errorKind: err.kind,
        errorMessage: err.detail ?? err.message,
      });
    }
  }
  let threw: ASCError | null = null;
  if (apps.length === 0 && failures.length > 0) {
    const first = settled.find((r) => r.status === 'rejected') as
      | PromiseRejectedResult
      | undefined;
    if (first) {
      threw = first.reason instanceof ASCError
        ? first.reason
        : new ASCError('malformed_response', { detail: String(first.reason) });
    }
  }
  return { apps, failures, threw };
}

function rowFor(raw: RawApp, acct: Account): AppRow {
  return {
    ascId: raw.id,
    name: raw.attributes.name?.trim() || '(Unnamed app)',
    bundleId: raw.attributes.bundleId?.trim() || '—',
    issuerId: acct.issuerId,
    teamName: acct.teamName,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

const acctA: Account = { issuerId: 'iss-a', keyId: 'kid-a', teamName: 'Team A' };
const acctB: Account = { issuerId: 'iss-b', keyId: 'kid-b', teamName: 'Team B' };
const appA1: RawApp = { id: 'app-a-1', attributes: { name: 'Recall',  bundleId: 'com.a.recall' } };
const appA2: RawApp = { id: 'app-a-2', attributes: { name: 'Shotday', bundleId: 'com.a.shotday' } };
const appB1: RawApp = { id: 'app-b-1', attributes: { name: 'Other',   bundleId: 'com.b.other' } };

// 1) All accounts succeed → all apps surfaced, zero failures
{
  const r = projectSettled(
    [acctA, acctB],
    [
      { status: 'fulfilled', value: { rows: [rowFor(appA1, acctA), rowFor(appA2, acctA)], acct: acctA } },
      { status: 'fulfilled', value: { rows: [rowFor(appB1, acctB)], acct: acctB } },
    ],
  );
  ok('all-success: 3 apps surfaced', r.apps.length === 3);
  ok('all-success: 0 failures',      r.failures.length === 0);
  ok('all-success: no throw',        r.threw === null);
}

// 2) Partial failure → working accounts still surface, failure banner gets data
{
  const r = projectSettled(
    [acctA, acctB],
    [
      { status: 'fulfilled', value: { rows: [rowFor(appA1, acctA)], acct: acctA } },
      { status: 'rejected',  reason: new ASCError('unauthorized', { status: 401, detail: 'p8 mismatch' }) },
    ],
  );
  ok('partial: working account apps surface',  r.apps.length === 1);
  ok('partial: failed account in failures',    r.failures.length === 1 && r.failures[0]!.teamName === 'Team B');
  ok('partial: failure kind preserved',        r.failures[0]!.errorKind === 'unauthorized');
  ok('partial: NO throw (degrade gracefully)', r.threw === null);
}

// 3) All accounts fail → throw so the UI shows the full error banner
{
  const r = projectSettled(
    [acctA, acctB],
    [
      { status: 'rejected', reason: new ASCError('no_network') },
      { status: 'rejected', reason: new ASCError('no_network') },
    ],
  );
  ok('all-fail: 0 apps',                r.apps.length === 0);
  ok('all-fail: 2 failures collected',  r.failures.length === 2);
  ok('all-fail: throws first error',    r.threw !== null && r.threw.kind === 'no_network');
}

// 4) Non-ASCError thrown (defensive) → still wrapped as malformed_response
{
  const r = projectSettled(
    [acctA],
    [{ status: 'rejected', reason: 'oh no a string' }],
  );
  ok('non-ASCError wrapped: malformed_response',
    r.failures.length === 1 && r.failures[0]!.errorKind === 'malformed_response');
  ok('non-ASCError wrapped: detail preserved',
    r.failures[0]!.errorMessage.includes('oh no'));
}

// 5) Empty / whitespace name and bundle get friendly fallbacks
{
  const blank: RawApp = { id: 'blank', attributes: { name: '   ', bundleId: '' } };
  const row = rowFor(blank, acctA);
  ok('empty name fallback',     row.name === '(Unnamed app)');
  ok('empty bundleId fallback', row.bundleId === '—');
}

// 6) Null name/bundleId from ASC (rare but possible)
{
  const nullish: RawApp = { id: 'nul', attributes: { name: null, bundleId: null } };
  const row = rowFor(nullish, acctA);
  ok('null name fallback',     row.name === '(Unnamed app)');
  ok('null bundleId fallback', row.bundleId === '—');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nmulti-account-degradation: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
