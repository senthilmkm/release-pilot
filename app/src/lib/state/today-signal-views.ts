import { mergeSeenSignalIds, type TodaySignal } from '@/lib/domain/today-signals';
import { storage } from '@/lib/state/storage';

const KEY = 'today.signal-views.v1';

export type TodaySignalViews = Record<string, string[]>;

export function loadTodaySignalViews(): TodaySignalViews {
  const raw = storage.getString(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const views: TodaySignalViews = {};
    for (const [appId, ids] of Object.entries(parsed)) {
      if (typeof appId !== 'string' || !Array.isArray(ids)) continue;
      views[appId] = ids.filter((id): id is string => typeof id === 'string').slice(-40);
    }
    return views;
  } catch {
    return {};
  }
}

export function getSeenTodaySignalIds(ascAppId: string): string[] {
  return loadTodaySignalViews()[ascAppId] ?? [];
}

export function markTodaySignalsSeen(ascAppId: string, signals: TodaySignal[]): void {
  if (signals.length === 0) return;
  const views = loadTodaySignalViews();
  views[ascAppId] = mergeSeenSignalIds(views[ascAppId] ?? [], signals);
  storage.set(KEY, JSON.stringify(views));
}
