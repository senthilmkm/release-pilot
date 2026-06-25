import { Stack } from 'expo-router';

export default function BriefingDetailStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
