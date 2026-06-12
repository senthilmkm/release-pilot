import { Tabs } from 'expo-router';
import {
  ArrowUpRight,
  CheckSquare,
  MoreHorizontal,
  Star,
  Sunrise,
} from 'lucide-react-native';

import { Colors } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

/**
 * Root tab navigator — 5 tabs, at the iOS HIG limit (no overflow ⋯
 * needed since More is our own catch-all).
 *
 *  Today      ☀        daily briefing (revenue + state deltas + reviews)
 *  Releases   ↑.right  per-app release status (default landing)
 *  Reviews    ★        unified inbox across all apps
 *  Checklist  ✓        pre-submit runner
 *  More       ⋯        accounts, subscription, settings
 *
 * Why Today is FIRST (leftmost) but Releases is the DEFAULT landing:
 *  - The 7am push notification deep-links straight to /(tabs)/briefing
 *  - During the day, users still land in Releases (their old habit)
 *  - Putting Today leftmost gives it visual prominence + thumb-reach
 *
 * Using expo-router `Tabs` (JS) rather than `NativeTabs` because:
 *  - JS Tabs render Lucide icons consistently across iOS/Android
 *  - Easier badge counts (V1.5+)
 *  - Same visual fidelity, native feel on iOS
 */
export default function TabsLayout() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textTertiary,
        tabBarStyle: {
          backgroundColor: palette.background,
          borderTopColor: palette.border,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="briefing"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => (
            <Sunrise color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
      <Tabs.Screen
        name="releases"
        options={{
          title: 'Releases',
          tabBarIcon: ({ color, size }) => (
            <ArrowUpRight color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
      <Tabs.Screen
        name="reviews"
        options={{
          title: 'Reviews',
          tabBarIcon: ({ color, size }) => (
            <Star color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
      <Tabs.Screen
        name="checklist"
        options={{
          title: 'Checklist',
          tabBarIcon: ({ color, size }) => (
            <CheckSquare color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <MoreHorizontal color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
    </Tabs>
  );
}
