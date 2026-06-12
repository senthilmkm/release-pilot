import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';

import { ASCClient } from '@/lib/api/asc-client';
import { ascKeys } from '@/lib/api/asc-queries';
import { toASCError } from '@/lib/api/asc-errors';
import { loadP8 } from '@/lib/auth/credentials';
import {
  dequeueReply,
  listQueuedReplies,
  markReplyError,
} from '@/lib/db/reviews-cache';
import { useAccountsStore } from '@/lib/state/accounts';

/**
 * Watches for two recovery moments and drains the offline reply queue
 * whenever they fire:
 *
 *  1. **Network reconnected** — `NetInfo` transitioned offline → online
 *  2. **App foregrounded**     — user came back from another app
 *
 * Without this hook, queued replies would wait forever for the user to
 * re-open the specific review. With it, the inbox quietly catches up
 * in the background and the user sees their pending replies flip from
 * "Sending…" to "Replied" without lifting a finger.
 *
 * We invalidate the relevant review queries after each drain so the UI
 * re-renders with the updated reply state.
 *
 * Safe to mount in the root layout — single global instance.
 */
export function useReplyQueueDrainer(): void {
  const queryClient = useQueryClient();
  const drainingRef = useRef(false);
  const prevOnlineRef = useRef<boolean | null>(null);

  useEffect(() => {
    const drain = async () => {
      if (drainingRef.current) return;
      drainingRef.current = true;
      try {
        const queued = await listQueuedReplies();
        if (queued.length === 0) return;

        const accounts = useAccountsStore.getState().accounts;
        const accountByIssuer = new Map(accounts.map((a) => [a.issuerId, a]));

        for (const q of queued) {
          const acct = accountByIssuer.get(q.issuerId);
          if (!acct) {
            // Account was disconnected after the reply was queued —
            // there's no key to sign with anymore. Drop it.
            await dequeueReply(q.reviewId);
            continue;
          }
          try {
            const p8PEM = await loadP8(acct.issuerId);
            if (!p8PEM) {
              await dequeueReply(q.reviewId);
              continue;
            }
            const client = ASCClient.lazy({
              issuerId: acct.issuerId,
              loadCredentials: async () => ({
                issuerId: acct.issuerId,
                keyId: acct.keyId,
                p8PEM,
              }),
            });
            await client.submitReviewResponse({ reviewId: q.reviewId, body: q.body });
            await dequeueReply(q.reviewId);
            // Nudge the affected review query so the UI flips from
            // "Sending…" to "Replied".
            void queryClient.invalidateQueries({ queryKey: ascKeys.reviews(q.appId) });
          } catch (err) {
            const asc = toASCError(err);
            // Auth failures will never recover — drop & let the user
            // re-send manually so they see the error.
            if (asc.kind === 'unauthorized' || asc.kind === 'forbidden') {
              await dequeueReply(q.reviewId);
              continue;
            }
            await markReplyError(q.reviewId, asc.kind);
            // Stop draining on transient errors — we'll retry next
            // reconnect / foreground.
            break;
          }
        }
      } finally {
        drainingRef.current = false;
      }
    };

    // Network reconnect listener.
    const apply = (state: NetInfoState) => {
      const online =
        (state.isConnected ?? false) && state.isInternetReachable !== false;
      const prev = prevOnlineRef.current;
      prevOnlineRef.current = online;
      // Drain only on the offline → online transition; ignore the
      // initial "online" observation at mount (prev === null).
      if (prev === false && online) void drain();
    };
    void NetInfo.fetch().then(apply);
    const unsubNet = NetInfo.addEventListener(apply);

    // Foreground listener — second chance if the user re-opens the app
    // while online (e.g. after killing it mid-send).
    const onAppState = (s: AppStateStatus) => {
      if (s === 'active') void drain();
    };
    const subApp = AppState.addEventListener('change', onAppState);

    return () => {
      unsubNet();
      subApp.remove();
    };
  }, [queryClient]);
}
