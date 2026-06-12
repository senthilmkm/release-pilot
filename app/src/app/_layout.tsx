import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import * as Linking from 'expo-linking';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { setUpNotifications } from '@/lib/push/setup-notifications';
import { registerBackgroundPoll, defineBackgroundPollTask } from '@/lib/push/background-poll';
import { ascKeys } from '@/lib/api/asc-queries';
import { initRevenueCat } from '@/lib/subscription/init';
import { OfflineBanner } from '@/components/offline-banner';
import { GracePeriodBanner } from '@/components/grace-period-banner';
import { useSubscriptionLifecycleWatcher } from '@/hooks/use-subscription-lifecycle-watcher';
import { useReplyQueueDrainer } from '@/hooks/use-reply-queue-drainer';
import {
  parseWidgetDeepLink,
  routeForWidgetDeepLink,
} from '@/lib/native/widget-deeplink';

// Define the background-fetch task body at module load. iOS requires
// `TaskManager.defineTask()` to be called BEFORE the JS environment
// finishes loading — moving this to a useEffect causes the task to be
// dropped on cold-start runs.
defineBackgroundPollTask();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

/// App-wide edge-case watchers. MUST be rendered INSIDE
/// `QueryClientProvider` because `useReplyQueueDrainer` calls
/// `useQueryClient()` and would otherwise throw
/// "No QueryClient set, use QueryClientProvider to set one".
function GlobalWatchers() {
  useSubscriptionLifecycleWatcher();
  useReplyQueueDrainer();
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();

  useEffect(() => {
    // Boot RevenueCat early — paywall + entitlement gates need it ready.
    // Safe to await in parallel with push setup; both are independent.
    void initRevenueCat();

    let cleanup: (() => void) | undefined;
    void (async () => {
      cleanup = await setUpNotifications({
        // On any push received, invalidate the cached version queries
        // so the Releases tab shows fresh data without a manual pull-to-refresh.
        // The worker has already updated D1 + sent the banner — we just
        // need to re-fetch the per-app state from ASC for the in-app UI.
        onPushReceived: ({ appId }) => {
          if (appId) {
            void queryClient.invalidateQueries({ queryKey: ascKeys.versions(appId) });
          } else {
            void queryClient.invalidateQueries({ queryKey: ['asc'] });
          }
        },
      });
      void registerBackgroundPoll();
    })();
    return () => cleanup?.();
  }, []);

  // Deep-link handler for the widget. Two entry paths:
  //   - cold start (app was killed)     → Linking.getInitialURL()
  //   - foreground / background re-open → 'url' event listener
  // We route via expo-router's imperative API so the Stack stays in sync.
  useEffect(() => {
    const navigate = (url: string | null) => {
      const link = parseWidgetDeepLink(url);
      const path = routeForWidgetDeepLink(link);
      if (path) router.push(path as never);
    };

    void Linking.getInitialURL().then(navigate);
    const sub = Linking.addEventListener('url', ({ url }) => navigate(url));
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <GlobalWatchers />
          <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="paywall"
                options={{ presentation: 'modal', headerShown: false }}
              />
              <Stack.Screen
                name="diagnostics"
                options={{ presentation: 'card', headerShown: false }}
              />
              <Stack.Screen
                name="widget-instructions"
                options={{ presentation: 'card', headerShown: false }}
              />
              <Stack.Screen
                name="erase-data"
                options={{ presentation: 'card', headerShown: false }}
              />
            </Stack>
            {/* Floating offline indicator. Absolutely positioned so it
                never disturbs underlying screen layout when toggling. */}
            <OfflineBanner />
            {/* Floating billing-grace-period banner. Stacks below the
                offline banner if both happen to be visible simultaneously. */}
            <GracePeriodBanner />
            <StatusBar style="auto" />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
