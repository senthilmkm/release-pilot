import { useEffect, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { ASCClient } from './asc-client';
import type { ASCApp } from './asc-types';
import { toASCError } from './asc-errors';
import { loadP8 } from '@/lib/auth/credentials';
import {
  getCachedApps,
  getCachedVersions,
  setCachedApps,
  setCachedVersions,
} from '@/lib/db/cache';
import {
  dequeueReply,
  enqueueReply,
  getCachedReviews,
  getQueuedRepliesMap,
  markReplyError,
  setCachedReviews,
} from '@/lib/db/reviews-cache';
import {
  deriveLatestSnapshot,
  deriveVersionTimeline,
  type LatestStateSnapshot,
  type VersionSummary,
} from '@/lib/domain/version-events';
import {
  projectReview,
  type ReviewSummary,
} from '@/lib/domain/review-feed';
import {
  runChecklist,
  type ChecklistContext,
  type RuleResult,
} from '@/lib/domain/checklist-rules';
import { useAccountsStore } from '@/lib/state/accounts';

// ---------------------- Query keys (typed catalog) -------------------------

export const ascKeys = {
  all:        ['asc'] as const,
  apps:       (issuerId: string) => ['asc', 'apps', issuerId] as const,
  app:        (issuerId: string, appId: string) =>
                ['asc', 'apps', issuerId, appId] as const,
  versions:   (appId: string) => ['asc', 'versions', appId] as const,
  reviews:    (appId: string) => ['asc', 'reviews', appId] as const,
  reviewsAll: () => ['asc', 'reviews', 'all'] as const,
  replyQueue: () => ['asc', 'reply-queue'] as const,
  checklist:  (appId: string) => ['asc', 'checklist', appId] as const,
};

// ----------------------- credentials loader factory ------------------------

function makeCredentialsLoader(issuerId: string, keyId: string) {
  return async () => {
    const p8PEM = await loadP8(issuerId);
    if (!p8PEM) {
      throw new Error(`No .p8 in keychain for issuer ${issuerId}`);
    }
    return { issuerId, keyId, p8PEM };
  };
}

function makeClient(issuerId: string, keyId: string): ASCClient {
  return ASCClient.lazy({
    issuerId,
    loadCredentials: makeCredentialsLoader(issuerId, keyId),
  });
}

// --------------------------- useAppsQuery ----------------------------------

export function useAppsQuery(issuerId: string | null | undefined) {
  return useQuery({
    queryKey: issuerId ? ascKeys.apps(issuerId) : ['asc', 'apps', '_disabled_'],
    enabled: !!issuerId,
    queryFn: async (): Promise<ASCApp[]> => {
      if (!issuerId) throw new Error('issuerId required');
      const account = useAccountsStore.getState().accounts.find((a) => a.issuerId === issuerId);
      if (!account) throw new Error(`no account for ${issuerId}`);
      const client = makeClient(issuerId, account.keyId);
      return client.listApps();
    },
  });
}

// ----------------------- useAllAppsQuery (aggregated) ----------------------

export type AggregatedAppRow = {
  ascId: string;
  name: string;
  bundleId: string;
  issuerId: string;
  teamName: string;
};

/** A per-account fetch failure — surfaced as a degradation banner so a
 *  single bad key never hides ALL of the user's other apps. */
export type AccountFetchFailure = {
  issuerId: string;
  teamName: string;
  errorKind: ReturnType<typeof toASCError>['kind'];
  errorMessage: string;
};

export type AllAppsResult = {
  apps: AggregatedAppRow[];
  failures: AccountFetchFailure[];
};

/**
 * Lists apps across ALL connected Issuer IDs. SQLite-backed and
 * tolerates per-account failures: one revoked key should NEVER blank the
 * entire Releases tab. We use `Promise.allSettled` and surface the failed
 * accounts in `failures[]` for a degradation banner.
 *
 *  - Cold start hydrates `initialData` from cache → no spinner
 *  - Fresh network result overwrites both the in-memory query cache AND
 *    the on-disk cache, account by account
 */
export function useAllAppsQuery() {
  const accounts = useAccountsStore((s) => s.accounts);
  const queryClient = useQueryClient();
  const [initialData, setInitialData] = useState<AllAppsResult | undefined>(undefined);

  // Lazy-load the persistent cache once on mount. We can't use it
  // synchronously because expo-sqlite is async; we set as initial data
  // for the next query render cycle.
  useEffect(() => {
    void (async () => {
      if (accounts.length === 0) return;
      const cached = await Promise.all(accounts.map((a) => getCachedApps(a.issuerId)));
      const all = cached.flatMap((c) => c?.apps ?? []);
      if (all.length > 0) setInitialData({ apps: all, failures: [] });
    })();
  }, [accounts]);

  return useQuery({
    queryKey: ['asc', 'apps', 'all', accounts.map((a) => a.issuerId).sort().join(',')],
    enabled: accounts.length > 0,
    placeholderData: initialData,
    queryFn: async (): Promise<AllAppsResult> => {
      const settled = await Promise.allSettled(
        accounts.map(async (acct) => {
          const cached = queryClient.getQueryData<ASCApp[]>(ascKeys.apps(acct.issuerId));
          const apps = cached
            ? cached
            : await makeClient(acct.issuerId, acct.keyId).listApps();
          if (!cached) queryClient.setQueryData(ascKeys.apps(acct.issuerId), apps);

          const rows: AggregatedAppRow[] = apps.map((app) => ({
            ascId: app.id,
            name: app.attributes.name?.trim() || '(Unnamed app)',
            bundleId: app.attributes.bundleId?.trim() || '—',
            issuerId: acct.issuerId,
            teamName: acct.teamName,
          }));
          void setCachedApps(acct.issuerId, rows);
          return { rows, acct };
        }),
      );

      const apps: AggregatedAppRow[] = [];
      const failures: AccountFetchFailure[] = [];
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i]!;
        if (r.status === 'fulfilled') {
          apps.push(...r.value.rows);
        } else {
          const acct = accounts[i]!;
          const err = toASCError(r.reason);
          failures.push({
            issuerId: acct.issuerId,
            teamName: acct.teamName,
            errorKind: err.kind,
            errorMessage: err.detail ?? err.message,
          });
        }
      }

      // Surface only when EVERY account failed; otherwise we have apps
      // to render and the failures show as a banner.
      if (apps.length === 0 && failures.length > 0) {
        // Throw the first failure so the query goes into error state and
        // the Releases tab can render its standard ErrorBanner + Retry.
        const first = settled.find((r) => r.status === 'rejected') as
          | PromiseRejectedResult
          | undefined;
        if (first) throw first.reason;
      }

      return { apps, failures };
    },
    select: (d) => d,
  });
}

// --------------------------- useVersionsQuery ------------------------------

/**
 * Per-app version timeline. SQLite-backed with the same stale-while-revalidate
 * pattern as `useAllAppsQuery`.
 */
export function useVersionsQuery(args: {
  appId: string;
  issuerId: string;
  keyId: string;
}) {
  const [initialData, setInitialData] = useState<VersionSummary[] | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const cached = await getCachedVersions(args.appId);
      if (cached) setInitialData(cached.summaries);
    })();
  }, [args.appId]);

  return useQuery({
    queryKey: ascKeys.versions(args.appId),
    placeholderData: initialData,
    queryFn: async (): Promise<VersionSummary[]> => {
      const client = makeClient(args.issuerId, args.keyId);
      const { versions, builds } = await client.listAppStoreVersions(args.appId);
      const summaries = deriveVersionTimeline({ versions, builds });
      void setCachedVersions(args.appId, summaries);
      return summaries;
    },
  });
}

// ------------- useLatestStatesQuery (Releases tab: badge per row) ----------

/**
 * One snapshot per app, computed from each app's version timeline.
 * Uses `useQueries` to parallelize across apps and TanStack's cache to
 * dedupe with the per-app `useVersionsQuery`.
 *
 * Returns a Map keyed by ASC app id, so the Releases tab can look up
 * a state without re-rendering when an unrelated app's data updates.
 */
export function useLatestStatesQuery(args: {
  apps: AggregatedAppRow[];
}): {
  isLoading: boolean;
  byAppId: Map<string, LatestStateSnapshot>;
} {
  const accounts = useAccountsStore((s) => s.accounts);

  const results = useQueries({
    queries: args.apps.map((app) => {
      const acct = accounts.find((a) => a.issuerId === app.issuerId);
      return {
        queryKey: ascKeys.versions(app.ascId),
        enabled: !!acct,
        queryFn: async (): Promise<VersionSummary[]> => {
          if (!acct) throw new Error(`no account for issuer ${app.issuerId}`);
          const client = makeClient(acct.issuerId, acct.keyId);
          const { versions, builds } = await client.listAppStoreVersions(app.ascId);
          const summaries = deriveVersionTimeline({ versions, builds });
          void setCachedVersions(app.ascId, summaries);
          return summaries;
        },
      };
    }),
  });

  const byAppId = new Map<string, LatestStateSnapshot>();
  for (let i = 0; i < args.apps.length; i++) {
    const app = args.apps[i]!;
    const result = results[i];
    if (result?.data) {
      byAppId.set(app.ascId, deriveLatestSnapshot(result.data));
    }
  }

  return {
    isLoading: results.some((r) => r.isLoading),
    byAppId,
  };
}

// ---------------------------- useReviewsQuery ------------------------------

/**
 * Per-app reviews query. SQLite-cached + integrates the local reply
 * queue so a freshly-tapped Send shows as "Sending…" instantly.
 */
export function useReviewsQuery(args: {
  appId: string;
  appName: string;
  issuerId: string;
  keyId: string;
}) {
  const [initialData, setInitialData] = useState<ReviewSummary[] | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const cached = await getCachedReviews(args.appId);
      if (cached) setInitialData(cached.reviews);
    })();
  }, [args.appId]);

  return useQuery({
    queryKey: ascKeys.reviews(args.appId),
    placeholderData: initialData,
    queryFn: async (): Promise<ReviewSummary[]> => {
      const client = makeClient(args.issuerId, args.keyId);
      const { reviews, responses } = await client.listReviews(args.appId);
      const queued = await getQueuedRepliesMap();
      const summaries = reviews.map((r) =>
        projectReview({
          raw: r,
          appId: args.appId,
          appName: args.appName,
          responses,
          pendingLocal: queued.has(r.id)
            ? { body: queued.get(r.id)!.body, queuedAt: queued.get(r.id)!.queuedAt }
            : null,
        }),
      );
      void setCachedReviews(args.appId, summaries);
      return summaries;
    },
  });
}

// ------------------------ useAllReviewsQuery -------------------------------

/**
 * Aggregated inbox across all apps + accounts.
 *
 * Implementation: `useQueries` over the (already-loaded) app list, each
 * sub-query is `useReviewsQuery`. Then flatten and sort newest-first.
 */
export function useAllReviewsQuery(args: {
  apps: AggregatedAppRow[];
}): {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  errors: unknown[];
  reviews: ReviewSummary[];
  refetch: () => void;
} {
  const accounts = useAccountsStore((s) => s.accounts);

  const results = useQueries({
    queries: args.apps.map((app) => {
      const acct = accounts.find((a) => a.issuerId === app.issuerId);
      return {
        queryKey: ascKeys.reviews(app.ascId),
        enabled: !!acct,
        queryFn: async (): Promise<ReviewSummary[]> => {
          if (!acct) throw new Error(`no account for issuer ${app.issuerId}`);
          const client = makeClient(acct.issuerId, acct.keyId);
          const { reviews, responses } = await client.listReviews(app.ascId);
          const queued = await getQueuedRepliesMap();
          const summaries = reviews.map((r) =>
            projectReview({
              raw: r,
              appId: app.ascId,
              appName: app.name,
              responses,
              pendingLocal: queued.has(r.id)
                ? { body: queued.get(r.id)!.body, queuedAt: queued.get(r.id)!.queuedAt }
                : null,
            }),
          );
          void setCachedReviews(app.ascId, summaries);
          return summaries;
        },
      };
    }),
  });

  const reviews = results.flatMap((r) => r.data ?? []);
  return {
    isLoading: results.some((r) => r.isLoading),
    isFetching: results.some((r) => r.isFetching),
    isError: results.some((r) => r.isError),
    errors: results.filter((r) => r.isError).map((r) => r.error),
    reviews,
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

// --------------------- useSubmitReplyMutation ------------------------------

/**
 * Submit a review reply. On any network/auth/server failure we enqueue
 * the reply in SQLite — the worker (Phase 6) will retry later, and the
 * inbox immediately shows it as `pending_local` so the user sees their
 * action took effect.
 */
export function useSubmitReplyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      reviewId: string;
      appId: string;
      issuerId: string;
      keyId: string;
      body: string;
    }) => {
      try {
        const client = makeClient(args.issuerId, args.keyId);
        const resp = await client.submitReviewResponse({
          reviewId: args.reviewId,
          body: args.body,
        });
        await dequeueReply(args.reviewId);
        return { kind: 'sent' as const, response: resp };
      } catch (e) {
        const err = toASCError(e);
        // Hard auth errors should NOT be silently queued — surface them
        if (err.kind === 'unauthorized' || err.kind === 'forbidden') {
          throw err;
        }
        await enqueueReply({
          reviewId: args.reviewId,
          appId: args.appId,
          issuerId: args.issuerId,
          body: args.body,
        });
        await markReplyError(args.reviewId, err.kind);
        return { kind: 'queued' as const, error: err };
      }
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ascKeys.reviews(vars.appId) });
      void queryClient.invalidateQueries({ queryKey: ascKeys.replyQueue() });
    },
  });
}

// ---------------------------- useChecklistQuery ----------------------------

/**
 * Run the pre-submit checklist for one app.
 *
 * Orchestrates several sub-fetches:
 *  - app versions (find the editable draft + its build)
 *  - version localizations + screenshot sets
 *  - the App entity (for `contentRightsDeclaration`)
 *  - App Infos + categories + AppInfoLocalizations (category + privacy URL)
 *  - Age Rating declaration attached to the selected AppInfo
 *  - subscription groups + subscriptions (IAP readiness)
 *  - app price schedule (price tier set)
 *  - app availability v2 (at least one territory selected)
 *
 * App-level + IAP + pricing fetches use `Promise.allSettled` so a single
 * endpoint failure (typically 403 from a low-permission key) only
 * downgrades the affected rule to `unknown` — it never blanks the whole
 * checklist.
 *
 * Cache strategy: TanStack Query in-memory only. Checklist data is
 * cheap (≤10 round-trips) and users only run it when they're about to
 * submit — staleness is fine, freshness on tap is what matters.
 */
export function useChecklistQuery(args: {
  appId: string;
  issuerId: string;
  keyId: string;
}) {
  return useQuery({
    queryKey: ascKeys.checklist(args.appId),
    queryFn: async (): Promise<{ ctx: ChecklistContext; results: RuleResult[] }> => {
      const client = makeClient(args.issuerId, args.keyId);

      // ----- Stage 1: parallel kick-offs we can fan out immediately -----
      // versions, app entity, app infos, subscription groups, price
      // schedule, availability — all keyed by appId. Run together to
      // keep the total wall-clock low.
      const [
        versionsResult,
        appResult,
        appInfosResult,
        subscriptionsResult,
        priceScheduleResult,
        availabilityResult,
      ] = await Promise.allSettled([
        client.listAppStoreVersions(args.appId),
        client.getApp(args.appId),
        client.listAppInfos(args.appId),
        client.listSubscriptionGroupsWithSubs(args.appId),
        client.getAppPriceSchedule(args.appId),
        client.getAppAvailability(args.appId),
      ]);

      // versions is the only fetch that's truly required — if it failed,
      // re-throw so the screen renders its standard error banner. The
      // other endpoints degrade to null/unknown gracefully (handled below).
      if (versionsResult.status === 'rejected') {
        throw versionsResult.reason;
      }

      const { versions, builds } = versionsResult.value;
      const editable =
        versions.find((v) => {
          const s = v.attributes.appStoreState ?? '';
          return s === 'PREPARE_FOR_SUBMISSION' || s === 'DEVELOPER_REJECTED';
        }) ?? null;

      // First version detection: this is the FIRST attempt at any version
      // (no prior version has ever been LIVE or REPLACED).
      const isFirstVersion = !versions.some((v) => {
        const s = v.attributes.appStoreState ?? '';
        return s === 'READY_FOR_SALE' || s === 'REPLACED_WITH_NEW_VERSION';
      });

      // Resolve build, if any
      const buildId = editable?.relationships?.build?.data?.id;
      const build = buildId ? builds.get(buildId) ?? null : null;

      // ----- App-level extras (best-effort) -----
      const app = appResult.status === 'fulfilled' ? appResult.value : null;

      let appInfo: ChecklistContext['appInfo'] = null;
      let primaryCategory: ChecklistContext['primaryCategory'] = null;
      let appInfoLocalization: ChecklistContext['appInfoLocalization'] = null;
      let ageRatingDeclaration: ChecklistContext['ageRatingDeclaration'] = null;
      let ageRatingDeclarationChecked = false;
      if (appInfosResult.status === 'fulfilled') {
        const { appInfos, categories, localizations: aiLocs } = appInfosResult.value;
        // Prefer the editable (PREPARE_FOR_SUBMISSION) bundle; fall back to
        // the live one (READY_FOR_DISTRIBUTION) if no draft.
        appInfo =
          appInfos.find((i) => i.attributes.state === 'PREPARE_FOR_SUBMISSION') ??
          appInfos.find((i) => i.attributes.state === 'READY_FOR_DISTRIBUTION') ??
          appInfos[0] ??
          null;
        if (appInfo) {
          const catId = appInfo.relationships?.primaryCategory?.data?.id;
          primaryCategory = catId ? categories.get(catId) ?? null : null;

          // Pick the en-US AppInfoLocalization if available — that's where
          // Privacy Policy URL almost always lives.
          const locIds = appInfo.relationships?.appInfoLocalizations?.data ?? [];
          const locs = locIds
            .map((p) => aiLocs.get(p.id))
            .filter((x): x is NonNullable<typeof x> => x !== undefined);
          appInfoLocalization =
            locs.find((l) => l.attributes.locale === 'en-US') ?? locs[0] ?? null;
        }
      }
      if (appInfo) {
        try {
          ageRatingDeclaration = await client.getAgeRatingDeclaration(appInfo.id);
          ageRatingDeclarationChecked = true;
        } catch {
          // Permission/network/server failures should degrade only the Age
          // Rating rule to `unknown`, matching other optional app-level checks.
          ageRatingDeclaration = null;
          ageRatingDeclarationChecked = false;
        }
      }

      const subscriptionProducts: ChecklistContext['subscriptionProducts'] =
        subscriptionsResult.status === 'fulfilled'
          ? Array.from(subscriptionsResult.value.subs.values())
          : null;

      // Pricing schedule + Availability — both 404-tolerant in the client
      // (Apple returns 404 when the schedule/availability has never been
      // configured; the client translates those to `{ schedule: null,
      // prices: [] }` / `{ availability: null, territoryIds: [] }` so
      // the rule fires `fail` rather than crashing the whole checklist).
      // Other errors (403/network/500) still propagate via Promise.allSettled
      // and downgrade the rule to `unknown`.
      const priceSchedule: ChecklistContext['priceSchedule'] =
        priceScheduleResult.status === 'fulfilled'
          ? { priceCount: priceScheduleResult.value.prices.length }
          : null;
      const availability: ChecklistContext['availability'] =
        availabilityResult.status === 'fulfilled'
          ? {
              territoryCount: availabilityResult.value.availableCount,
              truncated: availabilityResult.value.truncated,
            }
          : null;

      // ----- Stage 2: per-version sub-fetches that depend on `editable` -----
      let localizations: ChecklistContext['localizations'] = [];
      const screenshotSetsByLocalization = new Map();
      if (editable) {
        localizations = await client.listVersionLocalizations(editable.id);
        const enUS = localizations.find((l) => l.attributes.locale === 'en-US') ?? localizations[0];
        if (enUS) {
          const sets = await client.listScreenshotSets(enUS.id);
          screenshotSetsByLocalization.set(enUS.id, sets);
        }
      }

      const ctx: ChecklistContext = {
        appId: args.appId,
        version: editable,
        build,
        localizations,
        screenshotSetsByLocalization,
        isFirstVersion,
        app,
        appInfo,
        primaryCategory,
        appInfoLocalization,
        ageRatingDeclaration,
        ageRatingDeclarationChecked,
        subscriptionProducts,
        priceSchedule,
        availability,
      };

      return { ctx, results: runChecklist(ctx) };
    },
  });
}
