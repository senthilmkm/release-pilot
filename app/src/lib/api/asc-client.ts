import { ASCError, toASCError } from './asc-errors';
import type {
  ASCApp,
  ASCAppCategory,
  ASCAppInfo,
  ASCAppInfoLocalization,
  ASCAppScreenshotSet,
  ASCAppStoreVersion,
  ASCAppStoreVersionLocalization,
  ASCBuild,
  ASCCustomerReview,
  ASCCustomerReviewResponse,
  ASCResource,
  ASCSubscription,
  ASCSubscriptionGroup,
  ListAppInfosResponse,
  ListAppsResponse,
  ListAppStoreVersionsResponse,
  ListCustomerReviewsResponse,
  ListScreenshotSetsResponse,
  ListSubscriptionGroupsResponse,
  ListVersionLocalizationsResponse,
} from './asc-types';
import { getJwtLazy, mintJwt, type JwtCredentials } from '@/lib/auth/jwt-cache';

const ASC_BASE = 'https://api.appstoreconnect.apple.com';
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Lean, typed wrapper around the App Store Connect REST API.
 *
 * Two construction modes:
 *
 *   1. `ASCClient.withFreshCredentials({issuerId, keyId, p8PEM})`
 *      Used during the verify flow — credentials are right in memory from
 *      the paste form, no Keychain read needed.
 *
 *   2. `ASCClient.lazy({issuerId, loadCredentials})`
 *      Used on the hot path — credentials only loaded (with Face ID prompt)
 *      on JWT cache miss.
 */

type ClientStrategy =
  | { mode: 'fresh'; credentials: JwtCredentials }
  | {
      mode: 'lazy';
      issuerId: string;
      loadCredentials: () => Promise<JwtCredentials>;
    };

export class ASCClient {
  private constructor(private readonly strategy: ClientStrategy) {}

  static withFreshCredentials(credentials: JwtCredentials): ASCClient {
    return new ASCClient({ mode: 'fresh', credentials });
  }

  static lazy(args: {
    issuerId: string;
    loadCredentials: () => Promise<JwtCredentials>;
  }): ASCClient {
    return new ASCClient({ mode: 'lazy', ...args });
  }

  /**
   * GET /v1/apps — list all apps the team has in ASC.
   */
  async listApps(opts?: { limit?: number }): Promise<ASCApp[]> {
    const limit = opts?.limit ?? 200;
    const data = await this.fetch<ListAppsResponse>(
      `/v1/apps?limit=${limit}&fields[apps]=name,bundleId,sku,primaryLocale`,
    );
    return data.data;
  }

  /**
   * Same as `listApps` but tolerates auth failure by returning a typed
   * error rather than throwing. Useful in the onboarding "verify" path
   * where we want to render a friendly error screen.
   */
  async listAppsSafe(): Promise<{ ok: true; apps: ASCApp[] } | { ok: false; error: ASCError }> {
    try {
      const apps = await this.listApps();
      return { ok: true, apps };
    } catch (e) {
      return { ok: false, error: toASCError(e) };
    }
  }

  /**
   * GET /v1/apps/{id}/appStoreVersions
   *
   * Returns versions newest-first (per ASC default). We include the
   * `build` relationship inline so the caller doesn't need a 2nd
   * round-trip per version to learn the build number.
   *
   * Limit defaults to 20 — enough for the entire history of most apps
   * without paying for unnecessary data.
   */
  async listAppStoreVersions(
    appId: string,
    opts?: { limit?: number },
  ): Promise<{ versions: ASCAppStoreVersion[]; builds: Map<string, ASCBuild> }> {
    const limit = opts?.limit ?? 20;
    const path =
      `/v1/apps/${encodeURIComponent(appId)}/appStoreVersions` +
      `?limit=${limit}` +
      `&include=build` +
      `&fields[appStoreVersions]=versionString,appStoreState,platform,releaseType,earliestReleaseDate,createdDate,build` +
      `&fields[builds]=version,uploadedDate,processingState`;

    const data = await this.fetch<ListAppStoreVersionsResponse>(path);
    const builds = collectIncluded<ASCBuild>(data.included ?? [], 'builds');
    return { versions: data.data, builds };
  }

  /**
   * GET /v1/apps/{id}/customerReviews
   *
   * Returns reviews newest-first by default. We include the optional
   * `response` relationship so the inbox can show a "replied" indicator
   * without a second round-trip per review.
   *
   * Permission gotcha: this endpoint requires the API key to have at
   * least the "Customer Support" role. Keys with only the "Developer"
   * role will get 403 here. We let the caller decide how to surface that
   * (the queries layer maps it to a friendly empty state with "ask your
   * Apple team admin to upgrade this key").
   */
  async listReviews(
    appId: string,
    opts?: { limit?: number },
  ): Promise<{
    reviews: ASCCustomerReview[];
    responses: Map<string, ASCCustomerReviewResponse>;
  }> {
    const limit = opts?.limit ?? 50;
    const path =
      `/v1/apps/${encodeURIComponent(appId)}/customerReviews` +
      `?limit=${limit}` +
      `&include=response` +
      `&sort=-createdDate` +
      `&fields[customerReviews]=rating,title,body,reviewerNickname,createdDate,territory,response` +
      `&fields[customerReviewResponses]=responseBody,lastModifiedDate,state`;

    const data = await this.fetch<ListCustomerReviewsResponse>(path);
    const responses = collectIncluded<ASCCustomerReviewResponse>(
      data.included ?? [],
      'customerReviewResponses',
    );
    return { reviews: data.data, responses };
  }

  /**
   * POST /v1/customerReviewResponses
   *
   * Submit a reply to a review. ASC enforces a 5800-char limit on the
   * body; we validate at the form layer before reaching here.
   *
   * Returns the created response so the caller can update its local
   * cache without a refetch.
   */
  async submitReviewResponse(args: {
    reviewId: string;
    body: string;
  }): Promise<ASCCustomerReviewResponse> {
    const payload = {
      data: {
        type: 'customerReviewResponses',
        attributes: { responseBody: args.body },
        relationships: {
          review: { data: { type: 'customerReviews', id: args.reviewId } },
        },
      },
    };
    const result = await this.fetch<{ data: ASCCustomerReviewResponse }>(
      '/v1/customerReviewResponses',
      { method: 'POST', body: payload },
    );
    return result.data;
  }

  /**
   * GET /v1/appStoreVersions/{id}/appStoreVersionLocalizations
   *
   * Per-locale metadata (description, keywords, support URL, what's new, etc.)
   * for the given version. The checklist rules need this for almost every
   * common-rejection check.
   */
  async listVersionLocalizations(versionId: string): Promise<ASCAppStoreVersionLocalization[]> {
    const path =
      `/v1/appStoreVersions/${encodeURIComponent(versionId)}/appStoreVersionLocalizations` +
      `?limit=50` +
      `&fields[appStoreVersionLocalizations]=locale,description,keywords,marketingUrl,promotionalText,supportUrl,whatsNew`;
    const data = await this.fetch<ListVersionLocalizationsResponse>(path);
    return data.data;
  }

  /**
   * GET /v1/appStoreVersionLocalizations/{id}/appScreenshotSets
   *
   * Returns the set of screenshot containers for a given locale. We only
   * care about which device-class types exist (e.g. "APP_IPHONE_67"),
   * not the individual images.
   */
  async listScreenshotSets(localizationId: string): Promise<ASCAppScreenshotSet[]> {
    const path =
      `/v1/appStoreVersionLocalizations/${encodeURIComponent(localizationId)}/appScreenshotSets` +
      `?limit=20` +
      `&fields[appScreenshotSets]=screenshotDisplayType`;
    const data = await this.fetch<ListScreenshotSetsResponse>(path);
    return data.data;
  }

  /**
   * GET /v1/apps/{id} — fetch one app with the full attribute set we need
   * for app-level checklist rules. `listApps` deliberately requests a
   * narrow projection (no `contentRightsDeclaration`) to keep that hot-
   * path response small; this method fetches everything we need for the
   * one app the user just selected.
   */
  async getApp(appId: string): Promise<ASCApp> {
    const data = await this.fetch<{ data: ASCApp }>(
      `/v1/apps/${encodeURIComponent(appId)}` +
        `?fields[apps]=name,bundleId,sku,primaryLocale,contentRightsDeclaration,subscriptionStatusUrl`,
    );
    return data.data;
  }

  /**
   * GET /v1/apps/{id}/appInfos
   *
   * Returns the app-level metadata bundles (one per state — usually
   * `READY_FOR_DISTRIBUTION` for live + `PREPARE_FOR_SUBMISSION` for the
   * editable draft). We include both categories AND the en-US-or-first
   * locale of `appInfoLocalizations` so a single round-trip covers the
   * checklist rules for Category and Privacy Policy URL.
   */
  async listAppInfos(
    appId: string,
  ): Promise<{
    appInfos: ASCAppInfo[];
    categories: Map<string, ASCAppCategory>;
    localizations: Map<string, ASCAppInfoLocalization>;
  }> {
    const path =
      `/v1/apps/${encodeURIComponent(appId)}/appInfos` +
      `?limit=10` +
      `&include=primaryCategory,secondaryCategory,appInfoLocalizations` +
      `&fields[appInfos]=state,primaryCategory,secondaryCategory,appInfoLocalizations` +
      `&fields[appCategories]=` +
      `&fields[appInfoLocalizations]=locale,name,subtitle,privacyPolicyUrl,privacyChoicesUrl,privacyPolicyText`;
    const data = await this.fetch<ListAppInfosResponse>(path);
    const categories = collectIncluded<ASCAppCategory>(data.included ?? [], 'appCategories');
    const localizations = collectIncluded<ASCAppInfoLocalization>(
      data.included ?? [],
      'appInfoLocalizations',
    );
    return { appInfos: data.data, categories, localizations };
  }

  /**
   * GET /v1/apps/{id}/subscriptionGroups
   *
   * Returns every subscription group + every product in those groups, so
   * the checklist's `subscription-products-ready` rule can verify that
   * no product is still `MISSING_METADATA`.
   *
   * If the app has no subscriptions, this returns `{ groups: [], subs: new Map() }`
   * — caller handles "no subs at all" as `na` (not a failure).
   *
   * Permissions: this endpoint requires the API key to have the "Admin"
   * or "App Manager" role. Lower-permission keys 403; we surface that
   * as a friendly `unknown` so the user can manually verify in ASC.
   */
  async listSubscriptionGroupsWithSubs(appId: string): Promise<{
    groups: ASCSubscriptionGroup[];
    subs: Map<string, ASCSubscription>;
  }> {
    const path =
      `/v1/apps/${encodeURIComponent(appId)}/subscriptionGroups` +
      `?limit=20` +
      `&include=subscriptions` +
      `&fields[subscriptionGroups]=referenceName,subscriptions` +
      `&fields[subscriptions]=name,productId,state`;
    const data = await this.fetch<ListSubscriptionGroupsResponse>(path);
    const subs = collectIncluded<ASCSubscription>(data.included ?? [], 'subscriptions');
    return { groups: data.data, subs };
  }

  // ---------------------------- internals ----------------------------------

  private async getAuthToken(): Promise<string> {
    if (this.strategy.mode === 'fresh') {
      return mintJwt(this.strategy.credentials);
    }
    return getJwtLazy({
      issuerId: this.strategy.issuerId,
      loadCredentials: this.strategy.loadCredentials,
    });
  }

  private async fetch<T>(
    path: string,
    init?: { method?: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<T> {
    const jwt = await this.getAuthToken();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${ASC_BASE}${path}`, {
        method: init?.method ?? 'GET',
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      });
    } catch (e) {
      throw toASCError(e);
    } finally {
      clearTimeout(timer);
    }

    return parseResponse<T>(response);
  }
}

/**
 * Walk JSON:API `included` and pull every resource of a given type.
 * Keyed by resource ID so callers can resolve relationship pointers.
 */
function collectIncluded<T extends ASCResource>(
  included: ASCResource[],
  type: string,
): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of included) {
    if (r.type === type) out.set(r.id, r as T);
  }
  return out;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    try {
      return (await response.json()) as T;
    } catch (e) {
      throw new ASCError('malformed_response', {
        status: response.status,
        detail: 'response is not valid JSON',
        cause: e,
      });
    }
  }

  if (response.status === 401) {
    throw new ASCError('unauthorized', { status: 401 });
  }
  if (response.status === 403) {
    throw new ASCError('forbidden', { status: 403 });
  }
  if (response.status === 404) {
    throw new ASCError('not_found', { status: 404 });
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 30_000;
    throw new ASCError('rate_limited', { status: 429, retryAfterMs });
  }
  if (response.status >= 500) {
    throw new ASCError('server_error', { status: response.status });
  }
  throw new ASCError('malformed_response', {
    status: response.status,
    detail: `unexpected status ${response.status}`,
  });
}
