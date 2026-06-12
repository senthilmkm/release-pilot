import { useEffect, useRef } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';

import { refreshSubscriptionState } from '@/lib/subscription/init';
import { useSubscriptionStore } from '@/lib/state/subscription';

/**
 * Watches the global subscription state for changes that the user needs
 * to know about, and refreshes from RevenueCat whenever the app comes
 * back to the foreground (so changes the user made in iOS Settings —
 * cancel / change payment — are reflected immediately).
 *
 * The two transitions we communicate explicitly:
 *
 *  1. **Pro → Free** (cancellation / expiry / refund)
 *     User most likely cancelled in iOS Settings, then re-opened the app
 *     expecting to see "Free". Without an alert here, they'll just
 *     suddenly find features locked again with no explanation. We show
 *     a one-shot alert with a clear path back to the paywall.
 *
 *  2. **Free → Pro** (purchase / restore from another path)
 *     Already handled by the paywall's own success alert; we only react
 *     here to ensure the gates re-evaluate.
 *
 * Mounted ONCE in the root layout. Cheap — just an AppState listener
 * and a useRef holding the previous isPro value.
 */
export function useSubscriptionLifecycleWatcher(): void {
  const previousIsProRef = useRef<boolean | null>(null);
  const transitionAnnouncedAtRef = useRef<number>(0);

  // 1. Refresh from RC on every foreground transition.
  //
  // CRITICAL: pass `invalidateCache: true` so we catch plan changes the
  // user made OUTSIDE the app (iOS Settings → Apple ID → Subscriptions,
  // App Store account screen, family sharing changes, etc.). Without
  // this, RC's 5-minute customer-info cache returns the pre-change
  // state and the More tab keeps showing "Pro Monthly · Renews
  // <old date>" until the cache naturally expires.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void refreshSubscriptionState({ invalidateCache: true });
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  // 2. React to entitlement transitions surfaced by the RC listener.
  useEffect(() => {
    const unsubscribe = useSubscriptionStore.subscribe((state, prev) => {
      const wasPro = previousIsProRef.current;
      const isPro = state.entitlement.isPro;

      // Skip the very first observation — that's just the initial mount,
      // not a real transition.
      if (wasPro === null) {
        previousIsProRef.current = isPro;
        return;
      }
      if (wasPro === isPro) return;
      previousIsProRef.current = isPro;

      // Throttle: never announce the same transition twice within 30s.
      // Guards against RC sending duplicate customer-info updates during
      // rapid sync cycles (e.g. after a foreground restore).
      const now = Date.now();
      if (now - transitionAnnouncedAtRef.current < 30_000) return;
      transitionAnnouncedAtRef.current = now;

      // Pro → Free is the user-visible one. We don't alert Free → Pro
      // because the purchase flow already shows "Welcome to Pro".
      if (wasPro && !isPro) {
        // Defer to next tick so we don't try to alert during a Zustand
        // reducer cycle (causes React warnings on some RN versions).
        setTimeout(() => {
          Alert.alert(
            'Pro is no longer active',
            "Your Release Pilot Pro subscription has ended. You can still use the free plan — 1 app tracked, 3 checklist runs/week, and 2 review replies/month. Re-subscribe anytime from the More tab to unlock push notifications, widgets, RevenueCat, and unlimited apps.",
            [{ text: 'OK' }],
          );
        }, 0);
      }
    });
    return () => unsubscribe();
  }, []);
}
