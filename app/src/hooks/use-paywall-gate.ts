import { useCallback } from 'react';
import { router } from 'expo-router';

import { useAccountsStore } from '@/lib/state/accounts';
import { useEntitlement } from './use-entitlement';
import {
  gateAddAccount,
  gateAddApp,
  gateChecklistRun,
  gateConnectRevenueCat,
  gateEnablePushNotifications,
  gateLiveActivity,
  gateLockScreenWidget,
  gateReplyToReview,
} from '@/lib/subscription/gates';
import {
  getChecklistRuns,
  getReviewReplies,
  recordChecklistRun,
  recordReviewReply,
} from '@/lib/subscription/gate-counters';
import { haptic } from '@/lib/utils/haptics';
import type { GateBlockReason, GateDecision } from '@/lib/subscription/types';

/**
 * Imperative gate evaluator + paywall opener.
 *
 * Usage in a screen:
 *   const gate = usePaywallGate();
 *   const onPress = () => {
 *     const decision = gate.check('reply-to-review-limit');
 *     if (!decision.allowed) {
 *       gate.openPaywall(decision.reason);
 *       return;
 *     }
 *     // proceed with the action
 *   };
 *
 * Most gates are evaluated stateless or from MMKV counters that the
 * hook reads internally. The exception is `add-app-limit`, which needs
 * the index of the app the user is trying to access — pass it via
 * `check('add-app-limit', { appIndex })`.
 *
 * Why imperative rather than declarative: the action is initiated by
 * user interaction (a button tap), not a render. Putting it in a
 * useEffect would create double-firing bugs.
 */
export function usePaywallGate(): {
  check: (action: GateBlockReason, context?: { appIndex?: number }) => GateDecision;
  openPaywall: (reason?: GateBlockReason) => void;
  recordChecklistRun: () => void;
  recordReviewReply: () => void;
} {
  const { isPro } = useEntitlement();
  const accountCount = useAccountsStore((s) => s.accounts.length);

  const check = useCallback(
    (action: GateBlockReason, context?: { appIndex?: number }): GateDecision => {
      switch (action) {
        case 'add-account-limit':
          return gateAddAccount({ isPro, currentAccountCount: accountCount });
        case 'add-app-limit':
          return gateAddApp({ isPro, appIndex: context?.appIndex ?? 0 });
        case 'reply-to-review-limit':
          return gateReplyToReview({
            isPro,
            replyTimestampsMs: getReviewReplies(),
            nowMs: Date.now(),
          });
        case 'checklist-weekly-limit':
          return gateChecklistRun({
            isPro,
            runTimestampsMs: getChecklistRuns(),
            nowMs: Date.now(),
          });
        case 'connect-revenuecat-pro':
          return gateConnectRevenueCat({ isPro });
        case 'push-notifications-pro':
          return gateEnablePushNotifications({ isPro });
        case 'lock-screen-widget-pro':
          return gateLockScreenWidget({ isPro });
        case 'live-activity-pro':
          return gateLiveActivity({ isPro });
      }
    },
    [isPro, accountCount],
  );

  const openPaywall = useCallback((reason?: GateBlockReason) => {
    // Soft warning haptic — tactile cue that this action was gated and
    // not just plain "ignored". User immediately understands the system
    // responded but blocked the action.
    void haptic.warning();
    router.push({
      pathname: '/paywall',
      params: reason ? { reason } : {},
    });
  }, []);

  return {
    check,
    openPaywall,
    recordChecklistRun,
    recordReviewReply,
  };
}
