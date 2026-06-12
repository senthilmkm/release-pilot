/**
 * Compact relative-time formatter for the UI.
 *
 * Pure function — depends only on `Date`. Tested.
 *
 * Examples:
 *   formatRelativeShort('2026-06-11T08:00:00Z', refDate)   → "just now"
 *   formatRelativeShort('2026-06-11T07:30:00Z', refDate)   → "30 min ago"
 *   formatRelativeShort('2026-06-10T08:00:00Z', refDate)   → "1 day ago"
 *   formatRelativeShort('2026-05-01T08:00:00Z', refDate)   → "May 1"
 *   formatRelativeShort('2025-05-01T08:00:00Z', refDate)   → "May 1, 2025"
 *   formatRelativeShort(null)                              → "—"
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatRelativeShort(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '—';

  const diffMs = now.getTime() - then.getTime();
  const future = diffMs < 0;
  const absMs = Math.abs(diffMs);

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  if (!future && absMs < 60 * SECOND) return 'just now';
  if (absMs < HOUR) {
    const m = Math.round(absMs / MINUTE);
    return future ? `in ${m} min` : `${m} min ago`;
  }
  if (absMs < DAY) {
    const h = Math.round(absMs / HOUR);
    return future ? `in ${h} hour${h === 1 ? '' : 's'}` : `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (absMs < 7 * DAY) {
    const d = Math.round(absMs / DAY);
    return future ? `in ${d} day${d === 1 ? '' : 's'}` : `${d} day${d === 1 ? '' : 's'} ago`;
  }

  // Older than a week → switch to absolute date
  const monthLabel = MONTHS[then.getMonth()];
  const day = then.getDate();
  const sameYear = then.getFullYear() === now.getFullYear();
  if (sameYear) return `${monthLabel} ${day}`;
  return `${monthLabel} ${day}, ${then.getFullYear()}`;
}
