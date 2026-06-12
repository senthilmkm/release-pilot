import { projectOverview, RevenueCatClient } from './revenuecat-client';
import { RevenueCatError } from './revenuecat-errors';
import type { RawRevenueCatOverviewMetric } from './revenuecat-types';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ---------------------------------------------------------------------------
// projectOverview — raw RC fields → typed snapshot
// ---------------------------------------------------------------------------

/** Helper — build a `{metrics: [...]}` envelope with one entry per metric. */
function envelope(
  metrics: Pick<RawRevenueCatOverviewMetric, 'id' | 'value' | 'unit'>[],
  currency = 'USD',
) {
  return {
    object: 'overview_metrics',
    currency,
    metrics: metrics.map((m) => ({
      object: 'overview_metric',
      name: m.id ?? '',
      ...m,
    })),
  };
}

{
  const before = Date.now();
  // Verified against a real RC v2 response (project 0ac8cc48). Monetary
  // values come back in WHOLE units of the reporting currency — not
  // cents, not micros. RC truncates fractional amounts at the API
  // layer; the dashboard rounds for display.
  const snap = projectOverview(envelope([
    { id: 'active_trials',        value: 1247,   unit: '#' },
    { id: 'active_subscriptions', value: 8934,   unit: '#' },
    { id: 'mrr',                  value: 24650,  unit: '$' },
    { id: 'revenue',              value: 31200,  unit: '$' },
    { id: 'new_customers',        value: 4521,   unit: '#' },
    { id: 'active_users',         value: 15600,  unit: '#' },
  ]));
  const after = Date.now();

  ok('project: maps active_trials',           snap.activeTrials === 1247);
  ok('project: maps active_subscriptions',    snap.activeSubscriptions === 8934);
  ok('project: maps mrr (whole dollars)',     snap.mrr === 24650);
  ok('project: maps revenue (whole dollars)', snap.revenueLast28Days === 31200);
  ok('project: maps new_customers',           snap.newCustomersLast28Days === 4521);
  ok('project: maps active_users',            snap.activeUsersLast28Days === 15600);
  ok('project: preserves currency',           snap.currency === 'USD');
  ok('project: stamps fetchedAtMs',           snap.fetchedAtMs >= before && snap.fetchedAtMs <= after);
}

// Regression test: reproduces the exact response we captured live
// from project 0ac8cc48 (Recall) on Jun 12 2026. Dashboard showed
// "$2 revenue, 10 new customers, 40 active customers" while the API
// returned revenue=1 / new_customers=13 / active_users=16. The 1-vs-2
// dollar gap is RC's API truncation vs dashboard rounding; the
// new_customers gap is RC freshness lag; "active_customers" simply
// isn't in the overview payload (we expose active_users instead).
{
  const snap = projectOverview(envelope([
    { id: 'active_trials',        value: 0,  unit: '#' },
    { id: 'active_subscriptions', value: 0,  unit: '#' },
    { id: 'mrr',                  value: 0,  unit: '$' },
    { id: 'revenue',              value: 1,  unit: '$' },
    { id: 'new_customers',        value: 13, unit: '#' },
    { id: 'active_users',         value: 16, unit: '#' },
  ]));
  ok('project: live recall — revenue $1',          snap.revenueLast28Days === 1);
  ok('project: live recall — new customers 13',    snap.newCustomersLast28Days === 13);
  ok('project: live recall — active users 16',     snap.activeUsersLast28Days === 16);
}

// String numbers (RC has been inconsistent across betas)
{
  const snap = projectOverview(envelope([
    { id: 'active_trials', value: '12' as unknown as number, unit: '#' },
    { id: 'mrr',           value: '999' as unknown as number, unit: '$' },
  ]));
  ok('project: coerces string counts',       snap.activeTrials === 12);
  ok('project: coerces string money',        snap.mrr === 999);
}

// Missing metrics array → all zero, currency defaults to USD
{
  const snap = projectOverview({});
  ok('project: missing metrics → 0s',         snap.activeTrials === 0 && snap.activeSubscriptions === 0 && snap.mrr === 0);
  ok('project: missing currency → USD',       snap.currency === 'USD');
}

// Empty metrics array → all zero
{
  const snap = projectOverview({ metrics: [], currency: 'USD' });
  ok('project: empty metrics → 0s',           snap.revenueLast28Days === 0 && snap.newCustomersLast28Days === 0);
}

// Garbage values → defensive zeroing
{
  const snap = projectOverview(envelope([
    { id: 'active_trials', value: 'abc' as unknown as number, unit: '#' },
    { id: 'mrr',           value: NaN, unit: '$' },
    { id: 'revenue',       value: Infinity, unit: '$' },
  ]));
  ok('project: garbage strings → 0',          snap.activeTrials === 0);
  ok('project: NaN → 0',                      snap.mrr === 0);
  ok('project: Infinity → 0',                 snap.revenueLast28Days === 0);
}

// Non-USD currency passes through
{
  const snap = projectOverview(envelope(
    [{ id: 'mrr', value: 100, unit: '€' }],
    'EUR',
  ));
  ok('project: EUR preserved',                snap.currency === 'EUR');
  ok('project: value passed through as-is',   snap.mrr === 100);
}

// Unknown metric ids are silently ignored (forward-compat)
{
  const snap = projectOverview(envelope([
    { id: 'mrr',           value: 50,  unit: '$' },
    { id: 'some_new_kpi',  value: 999, unit: '$' },
  ]));
  ok('project: unknown ids ignored',          snap.mrr === 50 && snap.revenueLast28Days === 0);
}

// ---------------------------------------------------------------------------
// RevenueCatClient.create — input validation
// ---------------------------------------------------------------------------

{
  let threw = false;
  try {
    RevenueCatClient.create({ projectId: '', secretKey: 'sk_abc123' });
  } catch (e) {
    threw = e instanceof RevenueCatError && e.kind === 'project_not_found';
  }
  ok('create: rejects empty projectId',       threw);
}

{
  let threw = false;
  try {
    RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'public_sdk_key_xxx' });
  } catch (e) {
    threw = e instanceof RevenueCatError && e.kind === 'unauthorized';
  }
  ok('create: rejects non-sk_ key',           threw);
}

{
  let threw = false;
  try {
    RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'appl_sdk_abc' });
  } catch (e) {
    threw = e instanceof RevenueCatError && e.kind === 'unauthorized';
  }
  ok('create: rejects appl_ SDK key',         threw);
}

{
  let threw = false;
  try {
    RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_validkey' });
  } catch {
    threw = true;
  }
  ok('create: accepts valid sk_ key',         !threw);
}

{
  // Trims whitespace from both fields
  const client = RevenueCatClient.create({ projectId: '  proj_abc  ', secretKey: '  sk_validkey  ' });
  ok('create: returns a client',              client instanceof RevenueCatClient);
}

// ---------------------------------------------------------------------------
// HTTP classification (uses a mock fetch)
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

async function withMockFetch(
  responder: (input: string, init?: RequestInit) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    return responder(url, init);
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

// All async tests live inside one IIFE because tsx compiles tests to CJS
// (no top-level await). Keeps everything in one file, one run, one report.
async function runAsyncTests(): Promise<void> {
  // Happy path → returns typed overview (real RC v2 envelope shape)
  await withMockFetch(
    () => jsonResponse({
      object: 'overview_metrics',
      currency: 'USD',
      metrics: [
        { object: 'overview_metric', id: 'active_trials', value: 5,   unit: '#' },
        { object: 'overview_metric', id: 'mrr',           value: 100, unit: '$' },
      ],
    }),
    async () => {
      const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
      const overview = await client.getOverview();
      ok('fetch: 200 returns parsed overview',  overview.activeTrials === 5 && overview.mrr === 100);
    },
  );

  // 401 → unauthorized
  await withMockFetch(
    () => jsonResponse({ message: 'invalid key' }, { status: 401 }),
    async () => {
      const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
      const result = await client.verify();
      ok('fetch: 401 → unauthorized',           !result.ok && result.error.kind === 'unauthorized');
    },
  );

  // 403 → forbidden_missing_scope (so UI can name the exact scope)
  await withMockFetch(
    () => jsonResponse({ message: 'permission denied' }, { status: 403 }),
    async () => {
      const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
      const result = await client.verify();
      ok('fetch: 403 → forbidden_missing_scope', !result.ok && result.error.kind === 'forbidden_missing_scope');
    },
  );

  // 404 → project_not_found
  await withMockFetch(
    () => jsonResponse({ message: 'project not found' }, { status: 404 }),
    async () => {
      const client = RevenueCatClient.create({ projectId: 'wrong', secretKey: 'sk_test' });
      const result = await client.verify();
      ok('fetch: 404 → project_not_found',      !result.ok && result.error.kind === 'project_not_found');
    },
  );

  // 429 → rate_limited + respects Retry-After header
  await withMockFetch(
    () => new Response('{}', {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '15' },
    }),
    async () => {
      const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
      const result = await client.verify();
      ok('fetch: 429 → rate_limited',                                 !result.ok && result.error.kind === 'rate_limited');
      ok('fetch: 429 retryAfterMs derived from Retry-After header',   !result.ok && result.error.retryAfterMs === 15_000);
    },
  );

  // 5xx → server_error
  await withMockFetch(
    () => jsonResponse({}, { status: 503 }),
    async () => {
      const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
      const result = await client.verify();
      ok('fetch: 503 → server_error',           !result.ok && result.error.kind === 'server_error');
    },
  );

  // Auth header is correctly formatted
  {
    let captured: { url?: string; auth?: string; method?: string } = {};
    await withMockFetch(
      (url, init) => {
        captured = {
          url,
          method: init?.method,
          auth: (init?.headers as Record<string, string> | undefined)?.Authorization,
        };
        return jsonResponse({ object: 'overview_metrics', metrics: [], currency: 'USD' });
      },
      async () => {
        const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
        await client.getOverview();
      },
    );
    ok('fetch: targets v2 overview endpoint',
      captured.url === 'https://api.revenuecat.com/v2/projects/proj_abc/metrics/overview');
    ok('fetch: method is GET',                  captured.method === 'GET');
    ok('fetch: sends Bearer auth',              captured.auth === 'Bearer sk_test');
  }

  // Project ID gets URL-encoded (defensive — RC allows project IDs like proj_abc but we shouldn't trust)
  {
    let captured = '';
    await withMockFetch(
      (url) => {
        captured = url;
        return jsonResponse({ object: 'overview_metrics', metrics: [], currency: 'USD' });
      },
      async () => {
        const client = RevenueCatClient.create({ projectId: 'proj/with slash', secretKey: 'sk_test' });
        await client.getOverview();
      },
    );
    ok('fetch: URL-encodes project_id',         captured.includes('proj%2Fwith%20slash'));
  }

  // -------------------------------------------------------------------------
  // getRevenue + getRevenueLast28Days — precise decimal revenue endpoint
  // -------------------------------------------------------------------------

  // Happy path → returns precise decimal value
  await withMockFetch(
    () => jsonResponse({
      object: 'revenue_metric',
      start_date: '2026-05-16',
      end_date: '2026-06-12',
      currency: 'USD',
      value: 1.99,
      revenue_type: 'revenue',
    }),
    async () => {
      const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
      const value = await client.getRevenue({ startDate: '2026-05-16', endDate: '2026-06-12' });
      ok('getRevenue: returns precise decimal',  value === 1.99);
    },
  );

  // String values coerced to number
  await withMockFetch(
    () => jsonResponse({ object: 'revenue_metric', value: '12.34' }),
    async () => {
      const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
      const value = await client.getRevenue({ startDate: '2026-05-16', endDate: '2026-06-12' });
      ok('getRevenue: coerces string values',    value === 12.34);
    },
  );

  // Missing value → 0
  await withMockFetch(
    () => jsonResponse({ object: 'revenue_metric' }),
    async () => {
      const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
      const value = await client.getRevenue({ startDate: '2026-05-16', endDate: '2026-06-12' });
      ok('getRevenue: missing value → 0',        value === 0);
    },
  );

  // URL params correctly assembled
  {
    let capturedUrl = '';
    await withMockFetch(
      (url) => {
        capturedUrl = url;
        return jsonResponse({ value: 0 });
      },
      async () => {
        const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
        await client.getRevenue({
          startDate: '2026-05-16',
          endDate: '2026-06-12',
          revenueType: 'proceeds',
        });
      },
    );
    ok('getRevenue: includes start_date param', capturedUrl.includes('start_date=2026-05-16'));
    ok('getRevenue: includes end_date param',   capturedUrl.includes('end_date=2026-06-12'));
    ok('getRevenue: includes revenue_type',     capturedUrl.includes('revenue_type=proceeds'));
  }

  // Default revenue_type omitted (matches dashboard "Revenue" tile = gross)
  {
    let capturedUrl = '';
    await withMockFetch(
      (url) => {
        capturedUrl = url;
        return jsonResponse({ value: 0 });
      },
      async () => {
        const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
        await client.getRevenue({ startDate: '2026-05-16', endDate: '2026-06-12' });
      },
    );
    ok('getRevenue: revenue_type omitted by default', !capturedUrl.includes('revenue_type'));
  }

  // getRevenueLast28Days → 28-day window (start_date = today − 27 days inclusive)
  {
    let capturedUrl = '';
    await withMockFetch(
      (url) => {
        capturedUrl = url;
        return jsonResponse({ value: 1.99 });
      },
      async () => {
        const client = RevenueCatClient.create({ projectId: 'proj_abc', secretKey: 'sk_test' });
        const value = await client.getRevenueLast28Days();
        ok('getRevenueLast28Days: returns value', value === 1.99);
      },
    );

    // Spot-check the date arithmetic without coupling to current date.
    const startMatch = /start_date=(\d{4}-\d{2}-\d{2})/.exec(capturedUrl);
    const endMatch = /end_date=(\d{4}-\d{2}-\d{2})/.exec(capturedUrl);
    const startDate = startMatch ? new Date(startMatch[1] + 'T00:00:00Z') : null;
    const endDate = endMatch ? new Date(endMatch[1] + 'T00:00:00Z') : null;
    const dayDiff =
      startDate && endDate
        ? Math.round((endDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000))
        : -1;
    ok('getRevenueLast28Days: window is 27 days apart (inclusive 28-day range)', dayDiff === 27);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

void runAsyncTests().then(() => {
  const passed = tests.filter((t) => t.pass).length;
  const failed = tests.filter((t) => !t.pass);
  console.log(`\nrevenuecat-client: ${passed}/${tests.length} passing`);
  if (failed.length > 0) {
    console.log('FAILURES:');
    for (const t of failed) console.log(`  ✗ ${t.name}`);
    process.exit(1);
  }
});
