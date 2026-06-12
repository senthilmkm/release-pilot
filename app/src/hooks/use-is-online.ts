import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * Returns `true` when the device thinks it has internet, `false` when
 * offline. Defaults to `true` on the first render so we don't flash
 * "offline" while NetInfo is still initializing.
 *
 * "Has internet" = `isConnected && (isInternetReachable !== false)`.
 * NetInfo returns `null` for `isInternetReachable` on iOS during the
 * first probe — we treat null as "not yet known, assume online".
 */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const apply = (state: NetInfoState) => {
      const reachable = state.isInternetReachable;
      const connected = state.isConnected ?? false;
      setOnline(connected && reachable !== false);
    };
    NetInfo.fetch().then(apply);
    const unsubscribe = NetInfo.addEventListener(apply);
    return () => unsubscribe();
  }, []);

  return online;
}
