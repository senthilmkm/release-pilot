import { Redirect } from 'expo-router';

import { useHasAnyAccount } from '@/lib/state/accounts';

/**
 * Root redirector. Decides whether the user goes to onboarding or the tabs.
 *
 * - First-ever launch (no account): → /(onboarding)/welcome
 * - Returning user (≥1 ASC account): → /(tabs)/releases
 *
 * Auth state is read synchronously from MMKV (fast, no flicker).
 */
export default function Index() {
  const hasAccount = useHasAnyAccount();
  if (hasAccount) {
    return <Redirect href="/(tabs)/releases" />;
  }
  return <Redirect href="/(onboarding)/welcome" />;
}
