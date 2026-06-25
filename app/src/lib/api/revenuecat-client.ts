import { RevenueCatError, toRevenueCatError } from './revenuecat-errors';
import type {
  RawRevenueCatChartResponse,
  RawRevenueCatOverviewMetric,
  RawRevenueCatOverviewResponse,
  RawRevenueCatRevenueResponse,
  RevenueCatChartName,
  RevenueCatCustomerMomentum,
  RevenueCatDailySeries,
  RevenueCatDailyPoint,
  RevenueCatOverview,
  RevenueCatRevenueType,
  RevenueCatSubscriptionMomentum,
} from './revenuecat-types';

const RC_BASE = 'https://api.revenuecat.com';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CURRENCY = 'USD';

/**
 * Thin wrapper around RevenueCat REST API v2.
 *
 * Currently models a single endpoint — `/v2/projects/{id}/metrics/overview`
 * — which is all the daily briefing needs. Easy to extend with charts +
 * customer endpoints later by following the same `request<T>(...)` shape.
 *
 * Auth model: V2 secret API key (`sk_...`) sent as `Bearer` in the
 * Authorization header. Both the secret AND the project_id are sensitive
 * (key is the password, project_id is the door it opens). Store both in
 * Keychain via `expo-secure-store`; never in MMKV or git.
 *
 * Rate limits: 25 req/min on the Charts & Metrics domain. We pair this
 * client with a 5-minute on-disk cache + 60s soft TTL so a refresh of the
 * Briefing tab doesn't burn the budget.
 *
 * Why native fetch (no axios): RN's fetch handles HTTP/2 + iOS URLSession
 * underneath, which is faster + battery-friendly. We don't need axios's
 * extras here.
 */
export class RevenueCatClient {
  private constructor(
    private readonly projectId: string,
    private readonly secretKey: string,
  ) {}

  static create(args: { projectId: string; secretKey: string }): RevenueCatClient {
    if (!args.projectId.trim()) {
      throw new RevenueCatError('project_not_found', { detail: 'projectId is empty' });
    }
    if (!args.secretKey.trim().startsWith('sk_')) {
      throw new RevenueCatError('unauthorized', {
        detail: 'secretKey must start with "sk_" — make sure you pasted a V2 secret key, not a public/SDK key',
      });
    }
    return new RevenueCatClient(args.projectId.trim(), args.secretKey.trim());
  }

  /**
   * GET /v2/projects/{project_id}/metrics/overview
   *
   * Returns the same snapshot the RevenueCat dashboard shows on its
   * "Overview" page: MRR, active subscribers, active trials, plus
   * 28-day rolling revenue / new-customers / active-users.
   */
  async getOverview(): Promise<RevenueCatOverview> {
    const raw = await this.request<RawRevenueCatOverviewResponse>(
      `/v2/projects/${encodeURIComponent(this.projectId)}/metrics/overview`,
    );
    return projectOverview(raw);
  }

  /**
   * GET /v2/projects/{project_id}/metrics/revenue?start_date=...&end_date=...
   *
   * Returns precise decimal revenue for the given inclusive date range.
   * Per RC's docs this is backed by the same realtime revenue chart
   * that powers the dashboard, so the value matches the dashboard
   * exactly (whereas `/metrics/overview` truncates to integer units).
   *
   * Defaults to **gross revenue** (`revenue_type=revenue`) — the same
   * definition the dashboard's "Revenue" tile uses.
   *
   * @param opts.startDate Inclusive start (YYYY-MM-DD, RC time).
   * @param opts.endDate Inclusive end (YYYY-MM-DD, RC time).
   * @param opts.revenueType Defaults to `'revenue'` (gross) to match
   *   the dashboard. Use `'proceeds'` for what you'd actually keep
   *   after Apple's commission and taxes.
   */
  async getRevenue(opts: {
    startDate: string;
    endDate: string;
    revenueType?: RevenueCatRevenueType;
  }): Promise<number> {
    const params = new URLSearchParams({
      start_date: opts.startDate,
      end_date: opts.endDate,
    });
    if (opts.revenueType) {
      params.set('revenue_type', opts.revenueType);
    }
    const raw = await this.request<RawRevenueCatRevenueResponse>(
      `/v2/projects/${encodeURIComponent(this.projectId)}/metrics/revenue?${params.toString()}`,
    );
    return numericField(raw.value);
  }

  /**
   * Convenience: fetches the precise revenue for the trailing 28-day
   * window, matching the time window of `/metrics/overview`'s `revenue`
   * field but with full decimal precision.
   *
   * The end date is "today" in UTC (RC interprets these as calendar
   * dates), and the start date is 27 days earlier so the inclusive
   * range covers exactly 28 days — same window the dashboard's
   * "Last 28 days" tile uses.
   */
  async getRevenueLast28Days(opts?: {
    revenueType?: RevenueCatRevenueType;
  }): Promise<number> {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 27);
    return this.getRevenue({
      startDate: toIsoDate(start),
      endDate: toIsoDate(end),
      revenueType: opts?.revenueType,
    });
  }

  /**
   * GET /v2/projects/{project_id}/charts/customers_new
   *
   * Returns daily newly-seen customers for the inclusive date range.
   * This requires the RevenueCat V2 secret key to include
   * `charts_metrics:charts:read`; callers should treat 403 as a soft
   * "enable charts permission" state rather than a broken app.
   */
  async getDailyChart(opts: {
    chartName: RevenueCatChartName;
    startDate: string;
    endDate: string;
  }): Promise<RevenueCatDailySeries> {
    const params = new URLSearchParams({
      resolution: 'day',
      start_date: opts.startDate,
      end_date: opts.endDate,
    });
    const raw = await this.request<RawRevenueCatChartResponse>(
      `/v2/projects/${encodeURIComponent(this.projectId)}/charts/${opts.chartName}?${params.toString()}`,
    );
    return projectDailySeries(raw, {
      startDate: opts.startDate,
      endDate: opts.endDate,
      fetchedAtMs: Date.now(),
    });
  }

  async getNewCustomersDaily(opts: {
    startDate: string;
    endDate: string;
  }): Promise<RevenueCatCustomerMomentum> {
    return {
      customers: await this.getDailyChart({
        chartName: 'customers_new',
        startDate: opts.startDate,
        endDate: opts.endDate,
      }),
    };
  }

  /**
   * Convenience: trailing 14 calendar days, inclusive of today.
   *
   * Fourteen bars are readable on iPhone while the Today card keeps the
   * longer 28-day aggregate for broader context.
   */
  async getNewCustomersLast14Days(): Promise<RevenueCatCustomerMomentum> {
    return {
      customers: await this.getDailyChartLast14DaysWithTrend('customers_new'),
    };
  }

  async getSubscriptionMomentumLast14Days(): Promise<RevenueCatSubscriptionMomentum> {
    const [newPaidSubscriptions, newTrials, revenue] = await Promise.all([
      this.getDailyChartLast14DaysWithTrend('actives_new'),
      this.getDailyChartLast14DaysWithTrend('trials_new'),
      this.getDailyChartLast14DaysWithTrend('revenue'),
    ]);
    return { newPaidSubscriptions, newTrials, revenue };
  }

  async getDailyChartLast14DaysWithTrend(
    chartName: RevenueCatChartName,
  ): Promise<RevenueCatDailySeries> {
    const current = trailingRange(14, 0);
    const previous = trailingRange(14, 14);
    const [currentSeries, previousSeries] = await Promise.all([
      this.getDailyChart({
        chartName,
        startDate: current.startDate,
        endDate: current.endDate,
      }),
      this.getDailyChart({
        chartName,
        startDate: previous.startDate,
        endDate: previous.endDate,
      }),
    ]);
    return withTrend(currentSeries, previousSeries.total);
  }

  async getRevenueLast14DaysTrend(): Promise<RevenueCatDailySeries> {
    return this.getDailyChartLast14DaysWithTrend('revenue');
  }

  async getNewPaidSubscriptionsLast14DaysTrend(): Promise<RevenueCatDailySeries> {
    return this.getDailyChartLast14DaysWithTrend('actives_new');
  }

  async getNewTrialsLast14DaysTrend(): Promise<RevenueCatDailySeries> {
    return this.getDailyChartLast14DaysWithTrend('trials_new');
  }

  /**
   * Calls the overview endpoint just to confirm the credentials work.
   * Used by the onboarding "verify" step and by the More-tab rotate flow.
   *
   * Returns a discriminated result instead of throwing so callers can
   * render a friendly inline error without try/catch boilerplate.
   */
  async verify(): Promise<
    | { ok: true; overview: RevenueCatOverview }
    | { ok: false; error: RevenueCatError }
  > {
    try {
      const overview = await this.getOverview();
      return { ok: true, overview };
    } catch (e) {
      return { ok: false, error: toRevenueCatError(e) };
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(`${RC_BASE}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!res.ok) throw await classifyHttpError(res);
      const body = (await res.json()) as T;
      return body;
    } catch (e) {
      if (e instanceof RevenueCatError) throw e;
      throw toRevenueCatError(e);
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ---------------------------------------------------------------------------
// Response projection — raw RC fields → typed snapshot
// ---------------------------------------------------------------------------

/**
 * Coerces the raw RC payload into our `RevenueCatOverview` shape.
 *
 * The v2 endpoint returns `{ metrics: [{id, value, unit, period}, ...] }`,
 * not a flat object. We index the metrics by `id` and pluck the values
 * we care about. Unknown / missing metrics default to 0.
 *
 * **Value scaling (verified against the dashboard):**
 *   - Monetary fields (`mrr`, `revenue`) come back in **whole units of
 *     the reporting currency** (e.g. dollars for USD), NOT cents and
 *     NOT micros. RC truncates fractional amounts at the API layer,
 *     while the dashboard rounds for display — so a sub-dollar
 *     discrepancy between our cards and the dashboard is expected for
 *     small revenue figures (e.g. dashboard `$2`, API `1`).
 *   - Count fields (`active_subscriptions`, `active_trials`,
 *     `new_customers`, `active_users`) are integers as-is.
 *
 * **Metric coverage caveat:** the dashboard's "Active Customers" tile
 * has no equivalent in the `/metrics/overview` payload — we expose RC's
 * `active_users` instead (a related but distinct cohort). The Today tab
 * labels it accordingly.
 *
 * Exported for unit tests — keeping the projection pure means we can
 * unit-test edge cases (string numbers, missing fields, alternate
 * currency symbols) without spinning up a fetch mock.
 */
export function projectOverview(raw: RawRevenueCatOverviewResponse): RevenueCatOverview {
  const byId = new Map<string, RawRevenueCatOverviewMetric>();
  if (Array.isArray(raw.metrics)) {
    for (const m of raw.metrics) {
      if (m && typeof m.id === 'string' && m.id.length > 0) {
        byId.set(m.id, m);
      }
    }
  }

  return {
    activeTrials:           valueOf(byId.get('active_trials')),
    activeSubscriptions:    valueOf(byId.get('active_subscriptions')),
    mrr:                    valueOf(byId.get('mrr')),
    revenueLast28Days:      valueOf(byId.get('revenue')),
    newCustomersLast28Days: valueOf(byId.get('new_customers')),
    activeUsersLast28Days:  valueOf(byId.get('active_users')),
    currency: typeof raw.currency === 'string' && raw.currency.length > 0
      ? raw.currency
      : DEFAULT_CURRENCY,
    fetchedAtMs: Date.now(),
  };
}

export function projectCustomerMomentum(
  raw: RawRevenueCatChartResponse,
  opts: { startDate: string; endDate: string; fetchedAtMs: number },
): RevenueCatCustomerMomentum {
  return {
    customers: projectDailySeries(raw, opts),
  };
}

export function projectDailySeries(
  raw: RawRevenueCatChartResponse,
  opts: { startDate: string; endDate: string; fetchedAtMs: number },
): RevenueCatDailySeries {
  const dates = enumerateIsoDates(opts.startDate, opts.endDate);
  const byDate = new Map<string, number>();

  const values = Array.isArray(raw.values) ? raw.values : [];
  for (let i = 0; i < values.length; i++) {
    const point = coerceChartPoint(values[i], dates[i]);
    if (!point) continue;
    if (!dates.includes(point.date)) continue;
    byDate.set(point.date, (byDate.get(point.date) ?? 0) + point.value);
  }

  const days = dates.map((date): RevenueCatDailyPoint => ({
    date,
    value: byDate.get(date) ?? 0,
  }));
  const total = days.reduce((sum, day) => sum + day.value, 0);
  const bestDay =
    total > 0
      ? days.reduce((best, day) => (day.value > best.value ? day : best), days[0]!)
      : null;

  return {
    days,
    total,
    averagePerDay: days.length > 0 ? total / days.length : 0,
    bestDay,
    fetchedAtMs: opts.fetchedAtMs,
    trend: null,
  };
}

/** Pull a metric's value with defensive coercion. */
function valueOf(metric: RawRevenueCatOverviewMetric | undefined): number {
  return numericField(metric?.value);
}

/** RC has shipped both number and string values for monetary fields. */
function numericField(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function coerceChartPoint(item: unknown, fallbackDate?: string): RevenueCatDailyPoint | null {
  if (Array.isArray(item)) {
    if (item.length < 1) return null;
    if (item.length === 1) {
      return fallbackDate ? { date: fallbackDate, value: numericField(item[0]) } : null;
    }
    const date = isoDateFromUnknown(item[0]);
    if (date) {
      return { date, value: numericField(item[item.length - 1]) };
    }
    return fallbackDate ? { date: fallbackDate, value: numericField(item[0]) } : null;
  }

  if (typeof item === 'number' || typeof item === 'string') {
    return fallbackDate ? { date: fallbackDate, value: numericField(item) } : null;
  }

  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    const date = isoDateFromUnknown(
      record.date ??
        record.start_date ??
        record.period_start ??
        record.timestamp ??
        record.cohort,
    );
    const value = numericField(
      record.value ??
        record.count ??
        (Array.isArray(record.values) ? record.values[0] : undefined),
    );
    if (date) return { date, value };
    return fallbackDate ? { date: fallbackDate, value } : null;
  }

  return null;
}

function withTrend(series: RevenueCatDailySeries, previousTotal: number): RevenueCatDailySeries {
  const delta = series.total - previousTotal;
  return {
    ...series,
    trend: {
      previousTotal,
      delta,
      deltaPercent: previousTotal > 0 ? delta / previousTotal : null,
    },
  };
}

function trailingRange(days: number, offsetDays: number): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - offsetDays);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  };
}

function isoDateFromUnknown(v: unknown): string | null {
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const ms = Date.parse(v);
    if (Number.isFinite(ms)) return toIsoDate(new Date(ms));
    return null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // RevenueCat docs examples use Unix timestamps. Accept both seconds
    // and milliseconds defensively.
    const ms = v > 10_000_000_000 ? v : v * 1000;
    return toIsoDate(new Date(ms));
  }
  return null;
}

function enumerateIsoDates(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  if (start.getTime() > end.getTime()) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Format a `Date` as a `YYYY-MM-DD` ISO calendar date in UTC. */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// HTTP → typed error classification
// ---------------------------------------------------------------------------

async function classifyHttpError(res: Response): Promise<RevenueCatError> {
  let body = '';
  try {
    body = await res.text();
  } catch {
    // ignore — body might be unreadable; status is enough
  }
  const detail = body.length > 0 ? body.slice(0, 280) : `HTTP ${res.status}`;

  if (res.status === 401) {
    return new RevenueCatError('unauthorized', { status: 401, detail });
  }
  if (res.status === 403) {
    // 403 usually means "key valid but missing scope". Surface that
    // specifically so the UI can tell the user which permission to add.
    return new RevenueCatError('forbidden_missing_scope', { status: 403, detail });
  }
  if (res.status === 404) {
    return new RevenueCatError('project_not_found', { status: 404, detail });
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    const retryAfterMs = retryAfter ? Math.max(1000, Number(retryAfter) * 1000) : 60_000;
    return new RevenueCatError('rate_limited', { status: 429, retryAfterMs, detail });
  }
  if (res.status >= 500) {
    return new RevenueCatError('server_error', { status: res.status, detail });
  }
  return new RevenueCatError('malformed_response', { status: res.status, detail });
}
