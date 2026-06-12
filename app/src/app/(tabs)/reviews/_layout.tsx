import { Stack } from 'expo-router';

/**
 * Reviews tab Stack — same pattern as Releases.
 *
 *  index   → unified inbox (Reviews tab home)
 *  [id]    → review detail with reply composer
 */
export default function ReviewsStack() {
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
