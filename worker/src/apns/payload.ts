/**
 * Build the JSON body for an APNs push.
 *
 * We support two payload shapes:
 *   1. `alert` — visible push, shown as a banner. Used for state changes.
 *   2. `silent` (content-available) — wakes the app so it can refresh
 *      local data without showing UI. We use this when a state change
 *      doesn't warrant a banner (e.g. silently pre-fetching a build).
 *
 * Apple's spec: https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/generating_a_remote_notification
 */

import type { SemanticState } from '../lib/semantic-state';
import { stateHeadline } from './headlines';

export type PushKind = 'alert' | 'silent';

export type ReleasePushInput = {
  appName: string;
  versionString: string;
  buildNumber: string | null;
  previousState: SemanticState | null;
  newState: SemanticState;
  ascAppId: string;
  bundleId: string;
};

export type ApnsPayload = {
  aps: Record<string, unknown>;
  // Custom keys — our notification-service-extension + LA bridge reads these
  app_id: string;
  bundle_id: string;
  new_state: string;
  previous_state: string | null;
  version: string;
  build: string | null;
  kind: PushKind;
};

export function buildReleasePayload(args: {
  kind: PushKind;
  input: ReleasePushInput;
}): ApnsPayload {
  const { kind, input } = args;

  const aps: Record<string, unknown> = {};
  if (kind === 'alert') {
    aps.alert = {
      title: input.appName,
      body: stateHeadline(input.newState, input.versionString),
    };
    aps.sound = 'default';
    // Force the iOS NSE to fire even if the user has notifications muted.
    // This is how we keep the Live Activity in lock-step.
    aps['mutable-content'] = 1;
    // Time-sensitive interruption level surfaces state pings even when
    // the user is in Focus mode. Indie devs *want* "Apple approved you"
    // to break through.
    aps['interruption-level'] = 'time-sensitive';
  } else {
    aps['content-available'] = 1;
    // No alert/sound/badge for silent pushes
  }

  return {
    aps,
    app_id: input.ascAppId,
    bundle_id: input.bundleId,
    new_state: input.newState,
    previous_state: input.previousState,
    version: input.versionString,
    build: input.buildNumber,
    kind,
  };
}

/**
 * APNs HTTP/2 request headers for a release-state push.
 *
 * Per Apple's docs:
 *  - apns-topic         = bundle id  (NOT the team id)
 *  - apns-push-type     = "alert" or "background"
 *  - apns-priority      = 10 (immediate) for alert, 5 (deferred) for silent
 *  - apns-expiration    = 0 (= deliver-or-drop now) for state pushes; we'll
 *                         catch missed ones at the next 15-min cron tick
 *  - apns-collapse-id   = "rp.state.<appId>" — lets a newer push for the
 *                         same app SUPERSEDE an older undelivered one,
 *                         so users don't see stale "In Review" banners
 *                         after the app went Live.
 */
export function buildApnsHeaders(args: {
  jwt: string;
  bundleId: string;
  kind: PushKind;
  appId: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `bearer ${args.jwt}`,
    'apns-topic': args.bundleId,
    'apns-push-type': args.kind === 'alert' ? 'alert' : 'background',
    'apns-expiration': '0',
    'apns-collapse-id': `rp.state.${args.appId}`,
  };
  if (args.kind === 'alert') {
    headers['apns-priority'] = '10';
  } else {
    headers['apns-priority'] = '5';
  }
  return headers;
}
