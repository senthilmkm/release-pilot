/**
 * Parses the `releasepilot://...` URLs emitted by the widget into the
 * expo-router path the app should navigate to.
 *
 * URL formats (kept stable — change in lock-step with widget Swift):
 *   releasepilot://widget          → just open the app to its default tab
 *   releasepilot://app/<ascId>     → open releases tab + push detail for ascId
 *
 * Pure / synchronous so it's testable in plain Node.
 */

export type WidgetDeepLink =
  | { kind: 'noop' }
  | { kind: 'home' }
  | { kind: 'app'; ascId: string };

const SCHEME = 'releasepilot://';

export function parseWidgetDeepLink(url: string | null | undefined): WidgetDeepLink {
  if (!url || !url.startsWith(SCHEME)) return { kind: 'noop' };
  const path = url.slice(SCHEME.length).replace(/\/+$/, '');

  // releasepilot://widget   → just bring the app forward.
  if (path === 'widget') return { kind: 'home' };

  // releasepilot://app/<ascId>
  const match = /^app\/([A-Za-z0-9_-]+)$/.exec(path);
  if (match) return { kind: 'app', ascId: match[1]! };

  return { kind: 'noop' };
}

/** Returns the expo-router pathname (string) to push, or `null` if the
 *  URL doesn't map to a navigable destination. */
export function routeForWidgetDeepLink(link: WidgetDeepLink): string | null {
  switch (link.kind) {
    case 'app':  return `/(tabs)/releases/${link.ascId}`;
    case 'home': return '/(tabs)/releases';
    case 'noop': return null;
  }
}
