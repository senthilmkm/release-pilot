import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { AppWindow, ExternalLink, RefreshCw } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { ChecklistRowSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useFreeApp } from '@/hooks/use-free-app';
import { describeASCError, toASCError } from '@/lib/api/asc-errors';
import {
  type AggregatedAppRow,
  useAllAppsQuery,
  useChecklistQuery,
} from '@/lib/api/asc-queries';
import { summarizeChecklist } from '@/lib/domain/checklist-rules';
import { useAccountsStore } from '@/lib/state/accounts';
import { usePaywallGate } from '@/hooks/use-paywall-gate';
import { sortAppsAlphabetically } from '@/lib/subscription/free-app';
import { recordChecklistRun } from '@/lib/subscription/gate-counters';
import { haptic } from '@/lib/utils/haptics';

import { AppPicker } from '@/features/checklist/app-picker';
import { RuleRow } from '@/features/checklist/rule-row';
import { SummaryCard } from '@/features/checklist/summary-card';

const EMPTY_APPS: AggregatedAppRow[] = [];

export default function ChecklistTab() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const accounts = useAccountsStore((s) => s.accounts);
  const appsQuery = useAllAppsQuery();
  // Sort alphabetically so index 0 = the same app the rest of the app
  // treats as "free" (matches useFreeApp + releases/index.tsx ordering).
  const apps = useMemo(
    () => sortAppsAlphabetically(appsQuery.data?.apps ?? EMPTY_APPS),
    [appsQuery.data?.apps],
  );
  const [overrideAppId, setOverrideAppId] = useState<string | null>(null);
  const { isLocked, isPro } = useFreeApp();

  // Derived selection: explicit user pick wins, else first app.
  //
  // Self-heal: if the user previously selected an app that's now locked
  // (e.g. they downgraded from Pro since their last visit), silently
  // fall back to the alphabetically-first app which is always free.
  // This keeps the UI consistent without a setState dance.
  const requestedAppId = overrideAppId ?? apps[0]?.ascId ?? null;
  const selectedAppId = requestedAppId && isLocked(requestedAppId)
    ? (apps[0]?.ascId ?? null)
    : requestedAppId;

  const selectedApp = useMemo<AggregatedAppRow | null>(
    () => apps.find((a) => a.ascId === selectedAppId) ?? null,
    [apps, selectedAppId],
  );
  const account = selectedApp ? accounts.find((a) => a.issuerId === selectedApp.issuerId) : null;

  // Two-level gate: ONLY fire the network query when the selected app is
  // accessible. This stops a free user from running the checklist on a
  // locked app indirectly via TanStack auto-load (no manual re-run needed).
  const selectionAccessible = selectedApp ? !isLocked(selectedApp.ascId) : false;

  const checklist = useChecklistQuery({
    appId: selectionAccessible ? (selectedApp?.ascId ?? '') : '',
    issuerId: selectionAccessible ? (account?.issuerId ?? '') : '',
    keyId: selectionAccessible ? (account?.keyId ?? '') : '',
  });

  const paywall = usePaywallGate();

  const handlePickApp = (ascId: string) => {
    // If the user taps a locked chip, don't change selection — open the
    // paywall instead. This keeps the previously-selected app in view
    // while explaining why the new pick isn't allowed.
    if (!isPro && isLocked(ascId)) {
      paywall.openPaywall('add-app-limit');
      return;
    }
    setOverrideAppId(ascId);
  };

  const handleRerun = () => {
    // Defense-in-depth: if somehow the selected app is locked (shouldn't
    // happen because handlePickApp gates the chip tap, but covers race
    // conditions on entitlement state changes), block the re-run too.
    if (selectedApp && isLocked(selectedApp.ascId)) {
      paywall.openPaywall('add-app-limit');
      return;
    }
    // Only manual re-runs consume the weekly free-tier quota; passively
    // opening the tab doesn't (TanStack Query caches the auto-load).
    const decision = paywall.check('checklist-weekly-limit');
    if (!decision.allowed) {
      paywall.openPaywall(decision.reason);
      return;
    }
    void haptic.medium();
    recordChecklistRun();
    void checklist.refetch();
  };

  // Fire haptic on a successful re-run completion. We only listen to
  // `isFetching` transitions, so the cached-data instant render on
  // first mount doesn't trigger a misleading buzz.
  const wasFetching = useRef(false);
  useEffect(() => {
    if (wasFetching.current && !checklist.isFetching && !checklist.isError && checklist.data) {
      void haptic.success();
    }
    wasFetching.current = checklist.isFetching;
  }, [checklist.isFetching, checklist.isError, checklist.data]);

  // No accounts → onboarding hand-off
  if (accounts.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
        <Header palette={palette} />
        <EmptyState
          icon={AppWindow}
          title="No accounts connected"
          body="Connect an App Store Connect API key to run pre-submit checks."
          cta={{ label: 'Connect an account', onPress: () => router.push('/(onboarding)/why-asc') }}
        />
      </SafeAreaView>
    );
  }

  const summary = checklist.data ? summarizeChecklist(checklist.data.results) : null;
  // When the app has no draft, every rule short-circuits to NA. We use
  // this to switch the action row from "Re-run" to "Open in ASC" so the
  // user can create a draft (the actual thing they need to do).
  const hasNoDraft = Boolean(
    summary && summary.fail === 0 && summary.warn === 0 && summary.unknown === 0 && summary.pass === 0 && summary.na > 0,
  );
  const draftAscLink = checklist.data?.results?.[0]?.ascDeepLink;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <Header palette={palette} />

      <AppPicker
        apps={apps}
        selectedAppId={selectedAppId}
        onSelect={handlePickApp}
        isLocked={isLocked}
      />

      {!selectedApp || !account ? (
        <View style={styles.skeletonList} accessibilityLabel="Loading apps">
          <ChecklistRowSkeleton />
          <ChecklistRowSkeleton />
          <ChecklistRowSkeleton />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={checklist.isFetching && !checklist.isLoading}
              onRefresh={handleRerun}
              tintColor={palette.accent}
            />
          }
        >
          {checklist.isError && (
            <ErrorBanner
              variant="error"
              message={describeASCError(toASCError(checklist.error)).title}
              actionLabel="Retry"
              onAction={handleRerun}
            />
          )}

          {checklist.isLoading && !checklist.data ? (
            <View style={styles.skeletonInline} accessibilityLabel="Running pre-submit checks">
              <ChecklistRowSkeleton />
              <ChecklistRowSkeleton />
              <ChecklistRowSkeleton />
              <ChecklistRowSkeleton />
              <ChecklistRowSkeleton />
            </View>
          ) : null}

          {summary && (
            <>
              <SummaryCard summary={summary} />

              <View style={styles.actionRow}>
                <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
                  Checking{' '}
                  <ThemedText style={[TypeScale.captionEmph, { color: palette.textSecondary }]}>
                    {selectedApp.name}
                  </ThemedText>
                  {checklist.isFetching && ' · refreshing…'}
                </ThemedText>
                {hasNoDraft && draftAscLink ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${selectedApp.name} in App Store Connect to create a draft`}
                    onPress={() => {
                      void haptic.light();
                      void WebBrowser.openBrowserAsync(draftAscLink);
                    }}
                    style={({ pressed }) => [
                      styles.rerunBtn,
                      {
                        backgroundColor: palette.accent,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <ExternalLink size={14} color={palette.textInverse} strokeWidth={2.4} />
                    <ThemedText style={[TypeScale.captionEmph, { color: palette.textInverse }]}>
                      Open in ASC
                    </ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Re-run all checks"
                    onPress={handleRerun}
                    disabled={checklist.isFetching}
                    style={({ pressed }) => [
                      styles.rerunBtn,
                      {
                        backgroundColor: palette.accent,
                        opacity: pressed || checklist.isFetching ? 0.6 : 1,
                      },
                    ]}
                  >
                    {checklist.isFetching ? (
                      <ActivityIndicator size="small" color={palette.textInverse} />
                    ) : (
                      <RefreshCw size={14} color={palette.textInverse} strokeWidth={2.4} />
                    )}
                    <ThemedText style={[TypeScale.captionEmph, { color: palette.textInverse }]}>
                      {checklist.isFetching ? 'Running…' : 'Re-run'}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </>
          )}

          {/* When there's no draft, hide the per-rule rows entirely — they
              would all just say "Not applicable" and add noise. The
              summary card + action row already communicates the state. */}
          {checklist.data && !hasNoDraft && (
            <View style={styles.rulesList}>
              {checklist.data.results.map((rule) => (
                <RuleRow key={rule.id} rule={rule} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Header({ palette }: { palette: typeof Colors.light | typeof Colors.dark }) {
  return (
    <View style={styles.header}>
      <ThemedText style={[TypeScale.title1, { color: palette.text }]}>Checklist</ThemedText>
      <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
        Catch mechanical rejections before you submit.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: 2,
  },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  skeletonList: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  skeletonInline: {
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rerunBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
  },
  rulesList: {
    gap: Spacing.two,
  },
});
