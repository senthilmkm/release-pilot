import { Stack } from 'expo-router';

/**
 * Releases tab Stack — inner drill-down navigation.
 *
 *  index   → app list (Releases tab home)
 *  [id]    → app detail (versions timeline)
 *
 * Tab bar stays visible during drill-down because this Stack lives
 * INSIDE the (tabs) layout. headerShown is false everywhere — each
 * screen draws its own custom header.
 */
export default function ReleasesStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
