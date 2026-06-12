import { Stack } from 'expo-router';

/**
 * Onboarding stack — 8 screens, only 6 of which carry a step badge.
 *
 *   welcome           (no step badge — landing)
 *   why-asc           (2)
 *   get-key           (3)
 *   paste             (4)
 *   verify            (transition screen, no badge)
 *   revenuecat        (6) ← optional RC connect list (skippable)
 *     ↳ revenuecat-paste  (modal-style sub-route per app, reuses step=6)
 *   notifications     (7)
 *   trial             (8)
 *
 * Each screen is a standalone route so users can back-stack naturally.
 * Headers hidden because each screen draws its own back-arrow + spacing.
 *
 * NOTE on step numbering: welcome + verify don't show a step counter, so
 * the rendered badges read "2 of 8" through "8 of 8" — matching the
 * actual position in the flow. If you add/remove a screen, update every
 * `step={n}` + `totalSteps={n}` prop in lockstep.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: 'slide_from_right',
      }}
    />
  );
}
