import { ASCClient } from '@/lib/api/asc-client';
import { ASCError, toASCError } from '@/lib/api/asc-errors';
import { storeP8 } from '@/lib/auth/credentials';
import { deriveTeamName } from '@/lib/auth/team-name';
import { useAccountsStore } from '@/lib/state/accounts';

export type VerifyResult =
  | { ok: true; appsCount: number; teamName: string }
  | { ok: false; error: ASCError };

/**
 * The one orchestration that takes us from "user just pasted credentials"
 * to "user is signed in and on the Releases tab."
 *
 * Steps:
 *   1. Mint a JWT (validates ES256 signing → catches malformed .p8 early)
 *   2. Call GET /v1/apps to prove the credentials work AND grab a team identity
 *   3. Derive a team name (best-effort — ASC API doesn't expose team name)
 *   4. Store .p8 in Keychain (no biometric prompt on write)
 *   5. Persist account metadata to Zustand+MMKV (issuerId, keyId, teamName)
 *
 * Any failure short-circuits — no half-saved state.
 */
export async function verifyAndPersistAccount(args: {
  issuerId: string;
  keyId: string;
  p8PEM: string;
}): Promise<VerifyResult> {
  try {
    const client = ASCClient.withFreshCredentials(args);
    const apps = await client.listApps({ limit: 20 });

    const teamName = deriveTeamName({
      issuerId: args.issuerId,
      firstAppName: apps[0]?.attributes.name,
      firstAppBundleId: apps[0]?.attributes.bundleId,
    });

    await storeP8({ issuerId: args.issuerId, p8PEM: args.p8PEM });

    useAccountsStore.getState().addAccount({
      issuerId: args.issuerId,
      keyId: args.keyId,
      teamName,
      addedAt: Date.now(),
    });

    return { ok: true, appsCount: apps.length, teamName };
  } catch (e) {
    return { ok: false, error: toASCError(e) };
  }
}

