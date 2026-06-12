import {
  parseWidgetDeepLink,
  routeForWidgetDeepLink,
} from './widget-deeplink';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ---------------------------------------------------------------------------
// parseWidgetDeepLink
// ---------------------------------------------------------------------------

ok('parse: null → noop',
  parseWidgetDeepLink(null).kind === 'noop');

ok('parse: undefined → noop',
  parseWidgetDeepLink(undefined).kind === 'noop');

ok('parse: empty string → noop',
  parseWidgetDeepLink('').kind === 'noop');

ok('parse: wrong scheme → noop',
  parseWidgetDeepLink('https://releasepilot.app/widget').kind === 'noop');

ok('parse: releasepilot://widget → home',
  parseWidgetDeepLink('releasepilot://widget').kind === 'home');

ok('parse: trailing slash on home → home',
  parseWidgetDeepLink('releasepilot://widget/').kind === 'home');

{
  const link = parseWidgetDeepLink('releasepilot://app/12345');
  ok('parse: releasepilot://app/12345 → app',
    link.kind === 'app' && (link as any).ascId === '12345');
}

{
  const link = parseWidgetDeepLink('releasepilot://app/asc-id_with-symbols');
  ok('parse: ascId can include dashes/underscores',
    link.kind === 'app' && (link as any).ascId === 'asc-id_with-symbols');
}

ok('parse: malformed app path → noop',
  parseWidgetDeepLink('releasepilot://app/').kind === 'noop');

ok('parse: unknown verb → noop',
  parseWidgetDeepLink('releasepilot://random/12345').kind === 'noop');

// ---------------------------------------------------------------------------
// routeForWidgetDeepLink
// ---------------------------------------------------------------------------

ok('route: app → /(tabs)/releases/<id>',
  routeForWidgetDeepLink({ kind: 'app', ascId: '12345' }) === '/(tabs)/releases/12345');

ok('route: home → releases tab',
  routeForWidgetDeepLink({ kind: 'home' }) === '/(tabs)/releases');

ok('route: noop → null',
  routeForWidgetDeepLink({ kind: 'noop' }) === null);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nwidget-deeplink: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
