/**
 * Release Pilot Design System
 *
 * Tokens:
 *  - Colors (light + dark)
 *  - Semantic state colors (the 7 release states)
 *  - Spacing (8-pt grid)
 *  - Typography (iOS Dynamic Type compatible)
 *
 * Industry standard: matches iOS HIG. We use semantic naming everywhere so
 * dark mode + Dynamic Type "just work" without per-screen overrides.
 */

import { Platform } from 'react-native';

// -------------------------- BRAND + SURFACE COLORS --------------------------

export const Colors = {
  light: {
    // Surfaces
    background: '#FFFFFF',
    backgroundElevated: '#F2F2F7', // iOS systemGroupedBackground
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E5E5EA',

    // Text
    text: '#000000',
    textSecondary: '#3C3C43', // iOS secondaryLabel
    textTertiary: '#3C3C4399', // 60% opacity
    textInverse: '#FFFFFF',

    // Borders
    border: '#C6C6C8', // iOS separator
    borderEmphasis: '#8E8E93',

    // Accent (used sparingly — the "Release Pilot blue")
    accent: '#007AFF', // iOS systemBlue
    accentMuted: '#007AFF20',

    // Destructive
    destructive: '#FF3B30',
    destructiveMuted: '#FF3B3020',

    // Semantic state pairs (for in-line badges that aren't release-state)
    successFg: '#1F7A1F',
    successBg: '#C8F0CC',
    warningFg: '#7A5C00',
    warningBg: '#FFF4C2',
    infoFg:    '#0040DD',
    infoBg:    '#D6E4FF',
  },
  dark: {
    // Surfaces
    background: '#000000',
    backgroundElevated: '#1C1C1E',
    backgroundElement: '#2C2C2E',
    backgroundSelected: '#3A3A3C',

    // Text
    text: '#FFFFFF',
    textSecondary: '#EBEBF5',
    textTertiary: '#EBEBF599',
    textInverse: '#000000',

    // Borders
    border: '#38383A',
    borderEmphasis: '#48484A',

    // Accent
    accent: '#0A84FF', // iOS systemBlue (dark variant)
    accentMuted: '#0A84FF30',

    // Destructive
    destructive: '#FF453A',
    destructiveMuted: '#FF453A30',

    // Semantic state pairs
    successFg: '#85E592',
    successBg: '#0A3A12',
    warningFg: '#FFD970',
    warningBg: '#3D2F00',
    infoFg:    '#7FB3FF',
    infoBg:    '#0A2A6B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// ----------------------- SEMANTIC RELEASE-STATE COLORS ----------------------
//
// The 7 semantic states we display. Mapped from ASC's 20+ raw enums.
// Every UI element that shows a state pulls color + label + icon from here.
// Dark and light variants verified for WCAG AA contrast against
// `Colors.{light,dark}.background` and `backgroundElevated`.
//
// The pure tokens (`SemanticState`, `StateLabels`, `StateShortLabels`,
// `StateIcons`, `StateHelp`) live in `state-tokens.ts` so Node-side tools
// can import them without pulling react-native. The colors stay here
// because they're only ever consumed by UI code.

export {
  type SemanticState,
  StateColors,
  StateLabels,
  StateShortLabels,
  StateIcons,
  StateHelp,
} from './state-tokens';

// --------------------------------- TYPOGRAPHY -------------------------------

export const Fonts = Platform.select({
  ios: {
    sans:    'system-ui',
    serif:   'ui-serif',
    rounded: 'ui-rounded',
    mono:    'ui-monospace',
  },
  default: {
    sans:    'normal',
    serif:   'serif',
    rounded: 'normal',
    mono:    'monospace',
  },
  web: {
    sans:    'var(--font-display)',
    serif:   'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono:    'var(--font-mono)',
  },
});

// iOS Dynamic Type sizes (default category). Scale via system automatically.
export const TypeScale = {
  displayLarge:  { fontSize: 34, lineHeight: 41, fontWeight: '700' as const },
  title1:        { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  title2:        { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  title3:        { fontSize: 20, lineHeight: 25, fontWeight: '600' as const },
  headline:      { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body:          { fontSize: 17, lineHeight: 22, fontWeight: '400' as const },
  bodyEmph:      { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  callout:       { fontSize: 16, lineHeight: 21, fontWeight: '400' as const },
  subhead:       { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  footnote:      { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption:       { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  captionEmph:   { fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
} as const;

// --------------------------------- SPACING ----------------------------------

export const Spacing = {
  half:  2,
  one:   4,
  two:   8,
  three: 12,
  four:  16,
  five:  24,
  six:   32,
  seven: 48,
  eight: 64,
} as const;

export const Radii = {
  xs:    4,
  sm:    8,
  md:    12,
  lg:    16,
  xl:    20,
  pill:  999,
} as const;

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

// --------------------------------- LAYOUT -----------------------------------

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
