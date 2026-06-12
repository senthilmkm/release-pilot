import { signEs256Jwt } from '../apns/ec-sign';
import { toSemanticState, type SemanticState } from '../lib/semantic-state';

/**
 * Poll the App Store Connect API for a single Issuer's apps and their
 * latest in-flight/live version state.
 *
 * Returns one row per app — the same shape the iOS app derives from
 * `useLatestStatesQuery`. The cron handler diffs this against
 * `known_states` to decide who needs a push.
 *
 * NOTE: keeps the logic minimal because it runs INSIDE a Workers cron
 * with a strict CPU budget. Pagination is limited to a single page
 * (apps are ≤20 for the typical indie; first version per app is the
 * one we care about).
 */

export type PolledAppState = {
  ascAppId: string;
  appName: string;
  bundleId: string;
  semanticState: SemanticState;
  rawState: string | null;
  versionString: string;
  buildNumber: string | null;
};

const ASC_HOST = 'https://api.appstoreconnect.apple.com';

export async function pollIssuerApps(args: {
  issuerId: string;
  keyId: string;
  p8PEM: string;
  /** Optional clock for tests. */
  nowMs?: () => number;
}): Promise<PolledAppState[]> {
  const jwt = await signAscJwt(args);

  // 1. List the team's apps (limit 50 — way more than any indie has)
  const appsResp = await ascGet<AscAppsResp>(
    '/v1/apps?limit=50&fields[apps]=name,bundleId',
    jwt,
  );

  // 2. For each app, fetch the most-recent appStoreVersion + its build
  //    (limit=1 — we only care about the in-flight or live one)
  const out: PolledAppState[] = [];
  for (const app of appsResp.data) {
    try {
      const versResp = await ascGet<AscVersionsResp>(
        `/v1/apps/${encodeURIComponent(app.id)}/appStoreVersions` +
          `?limit=1&include=build` +
          `&fields[appStoreVersions]=versionString,appStoreState,build` +
          `&fields[builds]=version`,
        jwt,
      );
      const v = versResp.data[0];
      if (!v) continue;

      const buildId = v.relationships?.build?.data?.id;
      const build = buildId
        ? (versResp.included ?? []).find((r) => r.type === 'builds' && r.id === buildId)
        : undefined;

      out.push({
        ascAppId: app.id,
        appName: app.attributes.name,
        bundleId: app.attributes.bundleId,
        semanticState: toSemanticState(v.attributes.appStoreState ?? ''),
        rawState: v.attributes.appStoreState ?? null,
        versionString: v.attributes.versionString,
        buildNumber: build?.attributes?.version ?? null,
      });
    } catch {
      // Skip apps that error individually — the rest of the team should
      // still get polled. Diagnostics live in `push_log` so this is
      // visible via the diagnostics endpoint.
      continue;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function signAscJwt(args: {
  issuerId: string;
  keyId: string;
  p8PEM: string;
  nowMs?: () => number;
}): Promise<string> {
  const now = Math.floor(((args.nowMs ?? Date.now)()) / 1000);
  return signEs256Jwt({
    header: { alg: 'ES256', kid: args.keyId, typ: 'JWT' },
    payload: {
      iss: args.issuerId,
      iat: now,
      exp: now + 18 * 60,
      aud: 'appstoreconnect-v1',
    },
    p8PEM: args.p8PEM,
  });
}

async function ascGet<T>(path: string, jwt: string): Promise<T> {
  const response = await fetch(`${ASC_HOST}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`ASC ${path} ${response.status}`);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Minimal ASC response shapes (just the fields we read)
// ---------------------------------------------------------------------------

type AscAppsResp = {
  data: Array<{
    id: string;
    attributes: { name: string; bundleId: string };
  }>;
};

type AscVersionsResp = {
  data: Array<{
    id: string;
    attributes: { versionString: string; appStoreState: string | null };
    relationships?: { build?: { data?: { id: string } | null } };
  }>;
  included?: Array<{
    type: string;
    id: string;
    attributes?: { version?: string };
  }>;
};
