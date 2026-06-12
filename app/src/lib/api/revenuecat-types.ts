/**
 * TypeScript shapes for the RevenueCat REST API v2.
 *
 * We only model the endpoints we actually use — currently:
 *   - GET /v2/projects/{project_id}/metrics/overview
 *
 * RevenueCat documents these in https://www.revenuecat.com/docs/api-v2.
 *
 * Field-level notes:
 *  - The endpoint returns `{ object, metrics: [...], currency }` — NOT a
 *    flat snake_case object. Each item in `metrics` carries an `id`
 *    naming the metric (e.g. "mrr", "active_subscriptions") and a
 *    numeric `value`.
 *  - **Monetary values are returned in WHOLE units of the reporting
 *    currency** (dollars for USD). RC truncates fractional amounts
 *    at the API layer while the dashboard rounds for display, so a
 *    sub-unit discrepancy is expected for small revenue figures
 *    (e.g. dashboard `$2`, API `1`). Don't divide by 100 — that was
 *    an older third-party assumption that no longer holds.
 *  - `unit` is `"$"` (or whatever symbol fits the project's currency)
 *    for monetary metrics, and `"#"` for count metrics.
 *  - All counts are 0 (not null) for an empty/new project.
 *  - 28-day rolling windows are RC's default reporting period and match
 *    what the dashboard shows on the Overview tab. The metric ids for
 *    those windows are `revenue`, `new_customers`, `active_users`.
 */

export type RevenueCatOverview = {
  /** Currently active free trials across the project. */
  activeTrials: number;
  /** Paid + trial subscribers currently in good standing. */
  activeSubscriptions: number;
  /** Monthly Recurring Revenue, in reporting currency (decimal). */
  mrr: number;
  /** Total realized revenue in the last 28 days (decimal). */
  revenueLast28Days: number;
  /** First-time customers added in the last 28 days. */
  newCustomersLast28Days: number;
  /** Customers who interacted with the app in the last 28 days. */
  activeUsersLast28Days: number;
  /** Reporting currency (e.g. "USD"). Defaults to "USD" if RC omits it. */
  currency: string;
  /** When we fetched this snapshot (epoch ms). Drives staleness UI. */
  fetchedAtMs: number;
};

/**
 * Raw envelope returned by `/v2/projects/{id}/metrics/overview`.
 *
 * Example response (per https://www.revenuecat.com/docs/api-v2):
 * ```
 * {
 *   "object": "overview_metrics",
 *   "currency": "USD",
 *   "metrics": [
 *     { "object": "overview_metric", "id": "mrr",                  "value": 4545, "unit": "$" },
 *     { "object": "overview_metric", "id": "active_subscriptions", "value": 2524, "unit": "#" },
 *     { "object": "overview_metric", "id": "active_trials",        "value": 66,   "unit": "#" },
 *     { "object": "overview_metric", "id": "revenue",              "value": 5084, "unit": "$" },
 *     { "object": "overview_metric", "id": "new_customers",        "value": 10,   "unit": "#" },
 *     { "object": "overview_metric", "id": "active_users",         "value": 40,   "unit": "#" }
 *   ]
 * }
 * ```
 */
export type RawRevenueCatOverviewResponse = {
  object?: string;
  currency?: string;
  metrics?: RawRevenueCatOverviewMetric[];
};

export type RawRevenueCatOverviewMetric = {
  object?: string;
  /**
   * Identifier for the metric. Stable across RC versions; we key off
   * this rather than the human-readable `name`.
   *
   * Known values: "mrr", "active_subscriptions", "active_trials",
   * "revenue", "new_customers", "active_users".
   */
  id?: string;
  name?: string;
  description?: string;
  /** "$" (or another currency symbol) for monetary, "#" for counts. */
  unit?: string;
  period?: string;
  value?: number | string;
  last_updated_at?: number;
  last_updated_at_iso8601?: string;
};

/**
 * Response from `/v2/projects/{id}/metrics/revenue`.
 *
 * Unlike `/metrics/overview` (which returns truncated integers via a
 * cached snapshot), this endpoint is backed by the same realtime
 * revenue chart that powers the RevenueCat dashboard, so `value` is a
 * precise decimal (e.g. `1.99`) and matches what the dashboard
 * displays exactly.
 */
export type RawRevenueCatRevenueResponse = {
  object?: string;
  start_date?: string;
  end_date?: string;
  currency?: string;
  value?: number | string;
  revenue_type?: 'revenue' | 'revenue_net_of_taxes' | 'proceeds';
};

/** Choice of revenue definition for the `/metrics/revenue` endpoint. */
export type RevenueCatRevenueType =
  | 'revenue'              // gross (default — what the dashboard shows)
  | 'revenue_net_of_taxes'
  | 'proceeds';            // what the dev actually keeps
