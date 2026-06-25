import { useEffect } from 'react';
import { useQueries } from '@tanstack/react-query';

import { RevenueCatClient } from './revenuecat-client';
import type {
  RevenueCatCustomerMomentum,
  RevenueCatOverview,
  RevenueCatSubscriptionMomentum,
} from './revenuecat-types';
import { toRevenueCatError } from './revenuecat-errors';
import { loadRevenueCatSecret } from '@/lib/auth/revenuecat-credentials';
import {
  useAppRevenueCatStore,
  type AppRevenueCatMeta,
} from '@/lib/state/app-revenuecat';

/**
 * RevenueCat React Query layer.
 *
 * Mirrors the ASC query patterns from `asc-queries.ts`:
 *   - One pure-data fetcher per logical concept
 *   - `useQueries` for fan-out across multiple connected apps
 *   - Stale-time tuned so the Briefing tab is responsive without
 *     burning RC's 25 req/min Charts & Metrics budget
 *
 * No SQLite cache here (yet): the briefing reruns on tab focus + pull-
 * to-refresh, and TanStack's in-memory cache + 5min stale-time covers
 * the dominant access pattern (open Briefing, glance, leave).
 */

export const rcKeys = {
  all: ['rc'] as const,
  overview: (ascAppId: string) => ['rc', 'overview', ascAppId] as const,
  customersNew14d: (ascAppId: string) => ['rc', 'customers-new-14d', ascAppId] as const,
  subscriptionMomentum14d: (ascAppId: string) => ['rc', 'subscription-momentum-14d', ascAppId] as const,
};

const STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes
const GC_TIME_MS = 30 * 60 * 1000; // 30 minutes

async function fetchOverview(meta: AppRevenueCatMeta): Promise<RevenueCatOverview> {
  const secret = await loadRevenueCatSecret(meta.ascAppId);
  if (!secret) {
    throw new Error(
      `No RevenueCat secret in keychain for app ${meta.ascAppId}. Did the user disconnect?`,
    );
  }
  const client = RevenueCatClient.create({
    projectId: meta.projectId,
    secretKey: secret,
  });

  // We hit two endpoints in parallel and merge:
  //  - `/metrics/overview`  → MRR, active subs/trials, new_customers,
  //                            active_users (5 metrics in one call,
  //                            integer-truncated revenue)
  //  - `/metrics/revenue`   → precise decimal revenue matching the
  //                            dashboard exactly (the overview's
  //                            integer revenue is RC-side rounded down
  //                            to whole dollars, so $1.50 → "1").
  //
  // The revenue endpoint is best-effort: if it fails (older RC,
  // permission scope, transient outage) we fall back to the
  // overview's integer value so the briefing still renders something.
  const [overview, preciseRevenue] = await Promise.all([
    client.getOverview(),
    client.getRevenueLast28Days().catch(() => null),
  ]);

  return preciseRevenue !== null
    ? { ...overview, revenueLast28Days: preciseRevenue }
    : overview;
}

async function fetchCustomerMomentum(meta: AppRevenueCatMeta): Promise<RevenueCatCustomerMomentum> {
  const secret = await loadRevenueCatSecret(meta.ascAppId);
  if (!secret) {
    throw new Error(
      `No RevenueCat secret in keychain for app ${meta.ascAppId}. Did the user disconnect?`,
    );
  }
  const client = RevenueCatClient.create({
    projectId: meta.projectId,
    secretKey: secret,
  });
  return client.getNewCustomersLast14Days();
}

async function fetchSubscriptionMomentum(meta: AppRevenueCatMeta): Promise<RevenueCatSubscriptionMomentum> {
  const secret = await loadRevenueCatSecret(meta.ascAppId);
  if (!secret) {
    throw new Error(
      `No RevenueCat secret in keychain for app ${meta.ascAppId}. Did the user disconnect?`,
    );
  }
  const client = RevenueCatClient.create({
    projectId: meta.projectId,
    secretKey: secret,
  });
  return client.getSubscriptionMomentumLast14Days();
}

/**
 * Fetch the latest `/metrics/overview` for every RC-connected app.
 *
 * Returns a Map keyed by `ascAppId`. Apps without a connected RC
 * project are NOT in the map — callers should treat absence as
 * "no revenue data, render the Connect CTA".
 *
 * Per-app failures (network, revoked key, etc.) are surfaced via
 * `errors` so the UI can show a per-card error without hiding the
 * other apps' data.
 */
export function useRevenueOverviewsQuery(): {
  isLoading: boolean;
  isFetching: boolean;
  byAppId: Map<string, RevenueCatOverview>;
  errors: { ascAppId: string; kind: ReturnType<typeof toRevenueCatError>['kind'] }[];
  refetch: () => void;
} {
  const rcByAppId = useAppRevenueCatStore((s) => s.byAscAppId);
  const markVerified = useAppRevenueCatStore((s) => s.markVerified);

  const connectedApps = Object.values(rcByAppId).filter((m) => m.verified);

  const results = useQueries({
    queries: connectedApps.map((meta) => ({
      queryKey: rcKeys.overview(meta.ascAppId),
      staleTime: STALE_TIME_MS,
      gcTime: GC_TIME_MS,
      queryFn: () => fetchOverview(meta),
      // Don't retry on 401/403 — those need user action, not retry.
      retry: (failureCount: number, error: unknown) => {
        const kind = toRevenueCatError(error).kind;
        if (kind === 'unauthorized' || kind === 'forbidden_missing_scope') {
          return false;
        }
        return failureCount < 1;
      },
    })),
  });

  // Side-effect: when a fetch succeeds, refresh the stored
  // `lastVerifiedAtMs` + currency so the More tab badge stays current.
  // We do this in an effect so we don't trigger zustand updates during
  // render. Keyed by length+timestamps to avoid an infinite loop.
  useEffect(() => {
    for (let i = 0; i < connectedApps.length; i++) {
      const meta = connectedApps[i]!;
      const result = results[i];
      if (result?.isSuccess && result.data) {
        const last = rcByAppId[meta.ascAppId]?.lastVerifiedAtMs ?? 0;
        if (result.data.fetchedAtMs > last) {
          markVerified(meta.ascAppId, result.data.fetchedAtMs, result.data.currency);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.dataUpdatedAt).join(',')]);

  const byAppId = new Map<string, RevenueCatOverview>();
  for (let i = 0; i < connectedApps.length; i++) {
    const meta = connectedApps[i]!;
    const data = results[i]?.data;
    if (data) byAppId.set(meta.ascAppId, data);
  }

  const errors = results
    .map((r, i) =>
      r.isError && connectedApps[i]
        ? { ascAppId: connectedApps[i]!.ascAppId, kind: toRevenueCatError(r.error).kind }
        : null,
    )
    .filter((e): e is { ascAppId: string; kind: ReturnType<typeof toRevenueCatError>['kind'] } => e !== null);

  return {
    isLoading: results.some((r) => r.isLoading),
    isFetching: results.some((r) => r.isFetching),
    byAppId,
    errors,
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

export function useRevenueCustomerMomentumQuery(ascAppId: string | undefined): {
  isLoading: boolean;
  isFetching: boolean;
  data: RevenueCatCustomerMomentum | undefined;
  errorKind: ReturnType<typeof toRevenueCatError>['kind'] | null;
  refetch: () => void;
} {
  const rcByAppId = useAppRevenueCatStore((s) => s.byAscAppId);
  const meta = ascAppId ? rcByAppId[ascAppId] : undefined;

  const [result] = useQueries({
    queries: [
      {
        queryKey: ascAppId ? rcKeys.customersNew14d(ascAppId) : [...rcKeys.all, 'customers-new-14d', 'missing'],
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        enabled: Boolean(meta?.verified),
        queryFn: () => {
          if (!meta) {
            throw new Error('RevenueCat is not connected for this app.');
          }
          return fetchCustomerMomentum(meta);
        },
        retry: (failureCount: number, error: unknown) => {
          const kind = toRevenueCatError(error).kind;
          if (kind === 'unauthorized' || kind === 'forbidden_missing_scope') {
            return false;
          }
          return failureCount < 1;
        },
      },
    ],
  });

  return {
    isLoading: result?.isLoading ?? false,
    isFetching: result?.isFetching ?? false,
    data: result?.data,
    errorKind: result?.isError ? toRevenueCatError(result.error).kind : null,
    refetch: () => {
      if (result) void result.refetch();
    },
  };
}

export function useRevenueSubscriptionMomentumQuery(ascAppId: string | undefined): {
  isLoading: boolean;
  isFetching: boolean;
  data: RevenueCatSubscriptionMomentum | undefined;
  errorKind: ReturnType<typeof toRevenueCatError>['kind'] | null;
  refetch: () => void;
} {
  const rcByAppId = useAppRevenueCatStore((s) => s.byAscAppId);
  const meta = ascAppId ? rcByAppId[ascAppId] : undefined;

  const [result] = useQueries({
    queries: [
      {
        queryKey: ascAppId ? rcKeys.subscriptionMomentum14d(ascAppId) : [...rcKeys.all, 'subscription-momentum-14d', 'missing'],
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        enabled: Boolean(meta?.verified),
        queryFn: () => {
          if (!meta) {
            throw new Error('RevenueCat is not connected for this app.');
          }
          return fetchSubscriptionMomentum(meta);
        },
        retry: (failureCount: number, error: unknown) => {
          const kind = toRevenueCatError(error).kind;
          if (kind === 'unauthorized' || kind === 'forbidden_missing_scope') {
            return false;
          }
          return failureCount < 1;
        },
      },
    ],
  });

  return {
    isLoading: result?.isLoading ?? false,
    isFetching: result?.isFetching ?? false,
    data: result?.data,
    errorKind: result?.isError ? toRevenueCatError(result.error).kind : null,
    refetch: () => {
      if (result) void result.refetch();
    },
  };
}
