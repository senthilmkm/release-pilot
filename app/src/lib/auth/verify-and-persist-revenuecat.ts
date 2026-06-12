import { RevenueCatClient } from '@/lib/api/revenuecat-client';
import { RevenueCatError } from '@/lib/api/revenuecat-errors';
import { storeRevenueCatSecret } from '@/lib/auth/revenuecat-credentials';
import { useAppRevenueCatStore } from '@/lib/state/app-revenuecat';
import { useSubscriptionStore } from '@/lib/state/subscription';
import { gateConnectRevenueCat } from '@/lib/subscription/gates';

/**
 * Verify a RevenueCat secret key + project ID against the live API,
 * then persist both safely if they work.
 *
 * Mirrors `verify-and-persist.ts` (the ASC version):
 *  - Secret key goes to expo-secure-store (Keychain)
 *  - Public metadata (projectId, currency, lastVerifiedAtMs) goes to MMKV
 *  - On any failure: NOTHING is written. Atomic-ish from the user's POV.
 *
 * Idempotent: re-running with the same ascAppId replaces both stores'
 * entries. Used by the rotate-key path in the More tab.
 *
 * SECURITY / GATING: this is the ONE write point for RC credentials, so
 * we also enforce the `connect-revenuecat-pro` gate here as defense-in-
 * depth. UI screens (briefing top banner, briefing per-card button, more
 * tab row, onboarding step) ALL gate at the navigation layer too, but if
 * any of those misses, this final check prevents free users from leaking
 * past. Tests + cli-verify cover both layers.
 */

export type VerifyRevenueCatArgs = {
  ascAppId: string;
  projectId: string;
  secretKey: string;
};

export type VerifyRevenueCatResult =
  | { ok: true; mrr: number; currency: string; activeSubscriptions: number }
  | { ok: false; error: RevenueCatError };

export async function verifyAndPersistRevenueCat(
  args: VerifyRevenueCatArgs,
): Promise<VerifyRevenueCatResult> {
  // 0. Defense-in-depth: RC is Pro-only globally. We delegate to the
  //    same pure `gateConnectRevenueCat` helper that the UI uses, so if
  //    the gate logic ever changes (e.g. team plans get added) this
  //    write point updates automatically.
  const isPro = useSubscriptionStore.getState().entitlement.isPro;
  const gateDecision = gateConnectRevenueCat({ isPro });
  if (!gateDecision.allowed) {
    return {
      ok: false,
      error: new RevenueCatError('pro_required', {
        detail: 'RevenueCat integration is Pro-only.',
      }),
    };
  }

  // 1. Validate shape via RevenueCatClient.create (throws RevenueCatError)
  let client: RevenueCatClient;
  try {
    client = RevenueCatClient.create({
      projectId: args.projectId,
      secretKey: args.secretKey,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof RevenueCatError
        ? e
        : new RevenueCatError('malformed_response', { detail: String(e) }),
    };
  }

  // 2. Hit /metrics/overview as the canonical "does this key actually work?"
  //    test. If we get a 200 with parseable JSON, both credentials are good
  //    AND the key has the right scope (`charts_metrics:overview:read`).
  const result = await client.verify();
  if (!result.ok) return result;

  // 3. Persist — secret to Keychain FIRST, then metadata. If the second
  //    write fails for any reason (rare), the next launch will rediscover
  //    the orphaned secret and the More tab will show "verify needed".
  const now = Date.now();
  await storeRevenueCatSecret({
    ascAppId: args.ascAppId,
    secretKey: args.secretKey.trim(),
  });

  useAppRevenueCatStore.getState().upsert({
    ascAppId: args.ascAppId,
    projectId: args.projectId.trim(),
    verified: true,
    lastVerifiedAtMs: now,
    currency: result.overview.currency,
    connectedAtMs: now,
  });

  return {
    ok: true,
    mrr: result.overview.mrr,
    currency: result.overview.currency,
    activeSubscriptions: result.overview.activeSubscriptions,
  };
}
