# Checklist App Picker — Progressive Picker Plan

**Target Sunday session.** Self-contained: open this doc, work top-to-bottom, ship.

---

## TL;DR

Current `AppPicker` is a horizontal chip strip. Works great for ≤5 apps, breaks down past that (apps hide off-screen, no search, no overview). This plan replaces it with a **progressive** picker:

| App count | UI |
|---|---|
| 0 apps | `null` (unchanged) |
| 1 app | `null` (unchanged) |
| 2–5 apps | Existing chip strip (unchanged) |
| **6+ apps** | New: "Selected app" header card + tap → bottom sheet with search |

Goal: zero regression for the common case (1–5 apps), clean infinite scaling for users with portfolios.

---

## Why

**Problem reported:** users with many apps have to scroll horizontally to reach apps past ~5. No search. No grouping. Bad UX as the portfolio grows.

**Why progressive (not "always sheet")**: a chip strip is genuinely better for ≤5 apps — instant visual scan, one tap to switch. Replacing it with a sheet costs every user an extra tap to solve a problem that only affects power users. Two layouts is fine when each is the right tool for its scale.

**Why threshold at 5**: smallest iPhone we support (iPhone SE, 375 pt wide) fits ~2 full chips visible at once. `Format Flex`, `PDF`, `Recall` etc. — by chip 4–5 the user already needs to scroll. Beyond 5, the chip strip stops being "all visible at a glance" and becomes hidden state. 5 is the inflection point.

---

## Design Spec

### Layout A — ≤5 apps (unchanged)

```
┌───────────────────────────────────────────┐
│ [Format Flex] [PDF Studio] [Recall]       │
│ [Release Pilot] [Shotday]                 │
└───────────────────────────────────────────┘
```
Existing `AppPicker` component, zero changes.

### Layout B — 6+ apps (new)

**Header card** (replaces chip strip):

```
┌───────────────────────────────────────────┐
│  ┌─┐  PDF Studio: Scan & Convert          │
│  │P│  v1.2 · Live on App Store    [⇄ Switch] │
│  └─┘                                       │
└───────────────────────────────────────────┘
```

- Big enough to be the obvious tap target (whole row pressable)
- Avatar bubble (first letter) for visual anchor
- Caption line shows current state ("v1.2 · Live", "v1.0 drafting", or just "Tap to pick" if none selected)
- Trailing `Switch` button (also opens sheet) — gives sheet trigger discoverability

**Bottom sheet** (opens on tap):

```
┌───────────────────────────────────────────┐
│         ─────── (drag handle)              │
│                                            │
│  ✕  Switch app                             │
│  ─────────────────────────────────────     │
│  🔍  Search 14 apps...                     │
│  ─────────────────────────────────────     │
│  ✓  PDF Studio: Scan & Convert             │
│      com.senthil.formatflexWrapper         │
│                                            │
│     Format Flex                            │
│      com.senthil.formatflex                │
│                                            │
│  🔒 Recall: Personal Memory     (Pro)      │
│      com.senthil.recall.native             │
│                                            │
│     Release Pilot                          │
│     ...                                    │
└───────────────────────────────────────────┘
```

- Drag handle at top (iOS sheet convention)
- Search field with debounced fuzzy filter
- Each row: checkmark for currently-selected, name + bundleId, lock icon for free-tier locked apps
- Tap a row → set selection + close sheet
- Tap a locked row (free user) → close sheet + open paywall (same as chip strip)
- Tap drag handle drag-down OR X → close without changing selection

### Empty search state

```
┌───────────────────────────────────────────┐
│  🔍  zzz_no_match                          │
│  ─────────────────────────────────────     │
│                                            │
│       No apps matching "zzz_no_match"     │
│       Try a shorter query.                 │
│                                            │
└───────────────────────────────────────────┘
```

---

## Threshold logic

```typescript
const CHIP_STRIP_LIMIT = 5;

const useSheetPicker = apps.length > CHIP_STRIP_LIMIT;
```

Why 5 (not 4 or 6):
- iPhone SE (375 pt) fits 2 chips + half a 3rd → 4-5 visible
- iPhone 16 Pro Max (440 pt) fits 2 chips + most of 3rd → still ~3 fully visible
- At 5 apps, scrolling reveals the last 2-3 — acceptable
- At 6+, half your apps are hidden — unacceptable

Edge case: when user is at exactly the limit and adds their 6th app, the UI swaps from chips to header. That's fine because:
- The selected app stays selected (only the layout changes)
- The "Switch" sheet's first row will be the same app that was a chip a moment ago

---

## Files to change

| File | Action | LOC change |
|---|---|---|
| `app/src/features/checklist/app-picker.tsx` | Modify — extract `ChipStrip` sub-component, add threshold logic, render either chip strip or new sheet picker | ~+30 |
| `app/src/features/checklist/app-picker-sheet.tsx` | **NEW** — bottom sheet component with search, list, lock indicators | ~+200 |
| `app/src/features/checklist/app-picker-header.tsx` | **NEW** — the "selected app" card that triggers the sheet | ~+90 |
| `app/src/features/checklist/app-picker.test.ts` | **NEW** — unit tests for the fuzzy filter | ~+80 |
| `app/src/app/(tabs)/checklist.tsx` | Modify — no behavior change, but verify the existing `<AppPicker>` API is preserved | 0 (verify only) |
| `app/AGENTS.md` | Modify — update the Phase 4 quick-reference table | ~+5 |

**No dependency changes.** We're using React Native's built-in `Modal` (not `@gorhom/bottom-sheet`) to keep this OTA-deployable. No native rebuild required.

---

## Implementation order (Sunday session)

### Step 1 — Extract pure helpers (10 min)

Create `app/src/lib/checklist/app-search.ts` (or co-locate in `app-picker-sheet.tsx`):

```typescript
import type { AggregatedAppRow } from '@/lib/api/asc-queries';

/**
 * Case-insensitive fuzzy match: an app matches the query if every
 * char of the query appears in order somewhere in name+bundleId.
 * "rec" matches "Recall" and "Recall: Personal Memory". "pdf" matches
 * "PDF Studio: Scan & Convert". Empty query → all apps pass.
 */
export function fuzzyMatchApp(app: AggregatedAppRow, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = (app.name + ' ' + app.bundleId).toLowerCase();
  const needle = query.trim().toLowerCase();
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}

export function filterApps(apps: AggregatedAppRow[], query: string): AggregatedAppRow[] {
  if (!query.trim()) return apps;
  return apps.filter((a) => fuzzyMatchApp(a, query));
}
```

Write the unit tests *first* (10 cases):
- empty query → returns all
- exact name match
- partial name match
- bundleId match
- case-insensitive
- subsequence match (`rec` matches `Recall`)
- multi-word fuzzy (`pdf studio` matches `PDF Studio: Scan…`)
- no match → empty array
- query with spaces → trims
- numeric query → matches version-like strings

### Step 2 — Build the header card (15 min)

Create `app/src/features/checklist/app-picker-header.tsx`:

```typescript
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronsLeftRight, Lock } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import type { AggregatedAppRow } from '@/lib/api/asc-queries';

type Props = {
  app: AggregatedAppRow | null;
  totalApps: number;
  onPress: () => void;
  locked: boolean;
};

export function AppPickerHeader({ app, totalApps, onPress, locked }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const initial = (app?.name?.[0] ?? '?').toUpperCase();
  const subtitle = app
    ? `${app.bundleId}`
    : 'Tap to pick an app';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        app ? `Currently checking ${app.name}. Tap to switch.` : 'Tap to pick an app'
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: palette.backgroundElevated,
          borderColor: palette.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: palette.accent }]}>
        {locked ? (
          <Lock size={16} color={palette.textInverse} strokeWidth={2.4} />
        ) : (
          <ThemedText style={[TypeScale.captionEmph, { color: palette.textInverse }]}>
            {initial}
          </ThemedText>
        )}
      </View>
      <View style={styles.textCol}>
        <ThemedText style={[TypeScale.subhead, { color: palette.text, fontWeight: '600' }]}
                    numberOfLines={1}>
          {app?.name ?? 'No app selected'}
        </ThemedText>
        <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}
                    numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </View>
      <View style={[styles.switchPill, { backgroundColor: palette.background }]}>
        <ChevronsLeftRight size={14} color={palette.textSecondary} strokeWidth={2.2} />
        <ThemedText style={[TypeScale.captionEmph, { color: palette.textSecondary }]}>
          {totalApps} apps
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    marginHorizontal: Spacing.four,
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, gap: 2 },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    borderRadius: Radii.pill,
  },
});
```

### Step 3 — Build the sheet (40 min)

Create `app/src/features/checklist/app-picker-sheet.tsx`. Uses RN's `Modal` with `animationType="slide"` and `presentationStyle="pageSheet"` — gives native iOS sheet behavior including swipe-down dismiss for free, no extra deps:

```typescript
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Check, Lock, Search, X } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import type { AggregatedAppRow } from '@/lib/api/asc-queries';
import { filterApps } from '@/lib/checklist/app-search';

type Props = {
  visible: boolean;
  apps: AggregatedAppRow[];
  selectedAppId: string | null;
  onPick: (appId: string) => void;
  onClose: () => void;
  isLocked?: (ascId: string) => boolean;
};

export function AppPickerSheet({
  visible,
  apps,
  selectedAppId,
  onPick,
  onClose,
  isLocked,
}: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const [query, setQuery] = useState('');

  // Reset search when the sheet re-opens — stale query shouldn't survive
  // a close/reopen cycle.
  React.useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const filtered = useMemo(() => filterApps(apps, query), [apps, query]);

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      visible={visible}
      onRequestClose={onClose}
      transparent={false}
    >
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: palette.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close picker"
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <X size={22} color={palette.textSecondary} strokeWidth={2.2} />
          </Pressable>
          <ThemedText style={[TypeScale.title3, { color: palette.text }]}>
            Switch app
          </ThemedText>
          <View style={styles.closeBtn} />{/* spacer for center alignment */}
        </View>

        {/* Search */}
        <View style={[styles.searchRow, { borderBottomColor: palette.border }]}>
          <Search size={18} color={palette.textTertiary} strokeWidth={2.2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${apps.length} apps...`}
            placeholderTextColor={palette.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            style={[styles.searchInput, { color: palette.text }]}
            accessibilityLabel="Search apps"
          />
          {query.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
            >
              <X size={16} color={palette.textTertiary} strokeWidth={2.2} />
            </Pressable>
          )}
        </View>

        {/* List */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText style={[TypeScale.body, { color: palette.textSecondary }]}>
              No apps matching &quot;{query}&quot;
            </ThemedText>
            <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
              Try a shorter query.
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.ascId}
            renderItem={({ item }) => (
              <Row
                app={item}
                selected={item.ascId === selectedAppId}
                locked={isLocked?.(item.ascId) ?? false}
                onPress={() => {
                  onPick(item.ascId);
                  // Note: the parent decides whether to close (locked apps
                  // route to paywall + keep sheet open or close — your call.)
                }}
                palette={palette}
              />
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Row({
  app,
  selected,
  locked,
  onPress,
  palette,
}: {
  app: AggregatedAppRow;
  selected: boolean;
  locked: boolean;
  onPress: () => void;
  palette: typeof Colors.light | typeof Colors.dark;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={
        locked ? `${app.name}, Pro only — tap to upgrade` : `Switch to ${app.name}`
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? palette.backgroundElevated : 'transparent' },
      ]}
    >
      <View style={styles.rowLeading}>
        {selected ? (
          <Check size={18} color={palette.accent} strokeWidth={2.4} />
        ) : locked ? (
          <Lock size={16} color={palette.textTertiary} strokeWidth={2.2} />
        ) : (
          <View style={styles.bullet} />
        )}
      </View>
      <View style={styles.rowText}>
        <ThemedText
          style={[
            TypeScale.body,
            {
              color: locked ? palette.textSecondary : palette.text,
              fontWeight: selected ? '600' : '400',
            },
          ]}
          numberOfLines={1}
        >
          {app.name}
        </ThemedText>
        <ThemedText
          style={[TypeScale.caption, { color: palette.textTertiary }]}
          numberOfLines={1}
        >
          {app.bundleId}
        </ThemedText>
      </View>
      {locked && (
        <View style={[styles.proPill, { backgroundColor: palette.warningBg }]}>
          <ThemedText style={[TypeScale.captionEmph, { color: palette.warningFg }]}>
            Pro
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    padding: 0,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  rowLeading: { width: 24, alignItems: 'center' },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
  rowText: { flex: 1, gap: 2 },
  proPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
});
```

### Step 4 — Wire the switch in `AppPicker` (10 min)

Modify `app/src/features/checklist/app-picker.tsx`:

```typescript
const CHIP_STRIP_LIMIT = 5;

export function AppPicker({ apps, selectedAppId, onSelect, isLocked }: Props) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  if (apps.length < 2) return null;

  // Small portfolio → keep the existing chip strip (proven UX for 2-5 apps)
  if (apps.length <= CHIP_STRIP_LIMIT) {
    return <ChipStrip apps={apps} selectedAppId={selectedAppId} onSelect={onSelect} isLocked={isLocked} />;
  }

  // Large portfolio → header card that opens a sheet
  const selectedApp = apps.find((a) => a.ascId === selectedAppId) ?? null;
  const selectedLocked = selectedApp ? (isLocked?.(selectedApp.ascId) ?? false) : false;
  return (
    <>
      <AppPickerHeader
        app={selectedApp}
        totalApps={apps.length}
        locked={selectedLocked}
        onPress={() => setSheetOpen(true)}
      />
      <AppPickerSheet
        visible={sheetOpen}
        apps={apps}
        selectedAppId={selectedAppId}
        isLocked={isLocked}
        onPick={(id) => {
          onSelect(id);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

// Extract the existing chip logic into a sub-component
function ChipStrip({ apps, selectedAppId, onSelect, isLocked }: Props) {
  // ...the existing return body, unchanged
}
```

### Step 5 — Verify & test (15 min)

```powershell
cd C:\Users\senth\OneDrive\Documents\release-pilot\app
npm run typecheck
npm test
npm run lint
npm run verify:cli
```

Manual smoke tests (on iPhone or simulator):
- [ ] App with 2 apps shows chip strip
- [ ] App with 6 apps shows header card
- [ ] Tap header opens sheet
- [ ] Search "pdf" filters to PDF Studio
- [ ] Empty search shows empty state
- [ ] Tap an unlocked row → selection updates, sheet closes
- [ ] Tap a locked row (free user) → paywall opens (existing behavior preserved)
- [ ] Swipe-down dismisses sheet
- [ ] X button dismisses sheet
- [ ] Search state resets when sheet re-opens
- [ ] Dark mode looks right
- [ ] VoiceOver reads "Currently checking PDF Studio. Tap to switch."

### Step 6 — Ship (5 min)

```powershell
git add app/src/features/checklist/app-picker.tsx `
        app/src/features/checklist/app-picker-header.tsx `
        app/src/features/checklist/app-picker-sheet.tsx `
        app/src/lib/checklist/app-search.ts `
        app/src/lib/checklist/app-search.test.ts `
        app/AGENTS.md `
        CHECKLIST_PICKER_PLAN.md

git commit -m "Checklist: progressive app picker (chips ≤5, sheet 6+)"
git push origin main

cd app
$env:CI=1
eas update --branch production --platform ios --message "checklist: progressive app picker for large portfolios"
```

---

## Edge cases to handle

| Case | Behavior |
|---|---|
| 0 accounts | Existing onboarding empty state (unchanged) |
| 0 apps | `AppPicker` returns null (unchanged) |
| 1 app | `AppPicker` returns null — auto-selected, no picker needed |
| 2-5 apps | Chip strip (unchanged) |
| 6+ apps, free user | Header card + sheet. Selected app row shows ✓. Other rows show Lock icon + "Pro" pill. Tapping locked row routes to paywall (existing) |
| 6+ apps, Pro user | Header card + sheet. All rows tappable |
| User typing fast in search | Filter runs synchronously per keystroke (no debounce needed — small dataset, in-memory) |
| Search matches 0 apps | Empty-state inside sheet, sheet stays open |
| App list refreshes while sheet open | TanStack Query keeps `apps` reference stable for unchanged items; `FlatList` re-renders only changed rows |
| User backgrounds the app with sheet open | `Modal` persists; reopens to same state. Fine. |
| Selected app gets removed from ASC | `selectedAppId` becomes null → header shows "No app selected"; the screen's existing `selectedAppId` self-heal kicks in |
| User taps the currently-selected app in the sheet | `onPick` called with same id → no-op (or close sheet — your call. I'd close.) |
| Very long app name | `numberOfLines={1}` + `ellipsizeMode` (already present in header + row) |

---

## Accessibility checklist

- [ ] Header card: `accessibilityRole="button"`, label = "Currently checking X. Tap to switch."
- [ ] Sheet header: `accessibilityRole="header"` on the title text
- [ ] Search: `accessibilityLabel="Search apps"`
- [ ] Each row: `accessibilityRole="button"` + `accessibilityState={{ selected: isSelected }}`
- [ ] Locked row label: "Pro only — tap to upgrade" (matches existing chip pattern)
- [ ] Close button: `accessibilityLabel="Close picker"`
- [ ] VoiceOver focus: when sheet opens, focus should land on the search input. RN Modal does this automatically with `accessibilityViewIsModal={true}`.
- [ ] Dynamic Type: all text uses `TypeScale.*` tokens → scales with iOS text size setting

---

## Tests

### Unit (`app-search.test.ts`) — write these first

```typescript
import { fuzzyMatchApp, filterApps } from './app-search';

const apps = [
  { ascId: '1', name: 'PDF Studio: Scan & Convert', bundleId: 'com.x.pdfstudio', issuerId: '', teamName: '' },
  { ascId: '2', name: 'Recall', bundleId: 'com.x.recall', issuerId: '', teamName: '' },
  { ascId: '3', name: 'Shotday', bundleId: 'com.x.shotday', issuerId: '', teamName: '' },
];

// 10+ assertions covering:
// - empty query → all apps
// - exact name match
// - partial name match
// - bundleId match
// - case-insensitive
// - subsequence ("rec" matches "Recall")
// - multi-token ("pdf studio")
// - no match
// - whitespace trimming
// - special characters in name (":", "&")
```

Run with: `npx tsx app/src/lib/checklist/app-search.test.ts`

### Manual on-device

Use the dev account (it has 4 apps). To test the 6+ branch, temporarily lower the threshold to `2` in dev to force the sheet, OR add 2 dummy apps in a test ASC team.

---

## Rollback plan

Pure JS change, no native modules touched. To roll back:

```powershell
cd app
$env:CI=1
eas update --branch production --platform ios `
  --message "rollback: revert progressive picker" `
  --republish <previous-update-id>
```

Or revert the commit and ship a new OTA. Total exposure window: minutes.

---

## Notes / decisions deferred

- **Recency**: should the sheet sort apps by "last picked"? Not in v1 — alphabetical is predictable. Revisit if users ask.
- **Section headers in sheet**: group by team / by status? Not in v1 — adds visual weight for marginal benefit at <20 apps.
- **Search debounce**: not needed for in-memory filter at any realistic portfolio size (100 apps × 1 string compare = <1ms).
- **Drag handle visual**: RN's `Modal` with `presentationStyle="pageSheet"` shows the native iOS handle. No custom needed.
- **Pull to refresh inside sheet**: skipped — apps already refresh on tab focus via `useAllAppsQuery`. Adding it here would be inconsistent and confusing.

---

## Why we're NOT using `@gorhom/bottom-sheet`

It's the de-facto RN bottom sheet library and we have its peers (Reanimated 4, Gesture Handler 2.31). But:

1. **OTA-deployable**: RN's `Modal` is built-in. Adding `@gorhom/bottom-sheet` requires a fresh EAS build because its sheet rendering hooks into native gesture pipeline.
2. **Sufficient for this use case**: a single "switch app" picker doesn't need snap points, scroll-while-pannable, or dynamic heights. `Modal` with `presentationStyle="pageSheet"` looks identical for the user.
3. **Fewer moving parts**: no `BottomSheetModalProvider` wrapper at app root, no `BottomSheetFlatList` quirks.

If we later need a sheet with snap points (e.g. "Reply composer" with drafts at half-height + full-screen on focus), revisit then.

---

## Acceptance criteria

Sunday's PR is done when:

- [ ] Threshold `CHIP_STRIP_LIMIT = 5` correctly switches between chip strip and header
- [ ] Header card shows the selected app's name + bundleId + "N apps" count
- [ ] Tapping header opens the sheet
- [ ] Sheet shows all apps in alphabetical order
- [ ] Search field filters with fuzzy match
- [ ] Selected app shows checkmark
- [ ] Locked apps show lock icon + "Pro" pill
- [ ] Tapping unlocked app: updates selection + closes sheet
- [ ] Tapping locked app (free user): opens paywall (existing behavior preserved)
- [ ] Swipe-down OR X button dismisses sheet
- [ ] `npm run typecheck && npm test && npm run lint && npm run verify:cli` all green
- [ ] Manual VoiceOver pass: header card announces correctly, list items announce selection state
- [ ] Dark mode looks correct (header card uses `palette.backgroundElevated`, sheet uses `palette.background`)
- [ ] OTA shipped to `production` branch
- [ ] Tested on physical device with ≥6 apps

---

## Total time estimate

| Step | Minutes |
|---|---|
| 1. Helpers + unit tests | 10 |
| 2. Header card | 15 |
| 3. Sheet component | 40 |
| 4. Wire switch in AppPicker | 10 |
| 5. Verify (typecheck/test/lint/cli) | 15 |
| 6. Commit + push + OTA | 5 |
| Manual on-device smoke test | 10 |
| Buffer for paint refinement | 15 |
| **Total** | **~2 hours** |

---

*Document author: agent, on 2026-06-12. Update if implementation reveals better choices.*
