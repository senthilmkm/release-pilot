import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering on web, hydration must happen on the client.
 *
 * Implementation uses `useSyncExternalStore` rather than `useEffect` +
 * `setState` because the latter triggers React 19's
 * `react-hooks/set-state-in-effect` lint rule.
 *
 * Server snapshot: always 'light' (no system theme on the server).
 * Client snapshot: defers to RN's `useColorScheme`.
 */
const subscribe = () => () => {};
const getServerSnapshot = () => true as const;
const getClientSnapshot = () => false as const;

export function useColorScheme() {
  const isServer = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const colorScheme = useRNColorScheme();
  return isServer ? 'light' : colorScheme;
}
