import { formatRelativeShort } from './date-format';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

const NOW = new Date('2026-06-11T08:00:00Z');

ok('null → em-dash',                formatRelativeShort(null, NOW) === '—');
ok('undefined → em-dash',           formatRelativeShort(undefined, NOW) === '—');
ok('garbage → em-dash',             formatRelativeShort('not-a-date', NOW) === '—');

ok('30s ago → just now',            formatRelativeShort('2026-06-11T07:59:30Z', NOW) === 'just now');
ok('30 min ago → "30 min ago"',     formatRelativeShort('2026-06-11T07:30:00Z', NOW) === '30 min ago');
ok('2h ago → "2 hours ago"',        formatRelativeShort('2026-06-11T06:00:00Z', NOW) === '2 hours ago');
ok('1h ago → "1 hour ago" singular', formatRelativeShort('2026-06-11T07:00:00Z', NOW) === '1 hour ago');
ok('1 day ago → "1 day ago"',       formatRelativeShort('2026-06-10T08:00:00Z', NOW) === '1 day ago');
ok('3 days ago → "3 days ago"',     formatRelativeShort('2026-06-08T08:00:00Z', NOW) === '3 days ago');

ok('1 month ago → "May 11"',        formatRelativeShort('2026-05-11T08:00:00Z', NOW) === 'May 11');
ok('1 year ago → "May 1, 2025"',    formatRelativeShort('2025-05-01T08:00:00Z', NOW) === 'May 1, 2025');

// Future dates (scheduled release)
ok('30 min in future → "in 30 min"',formatRelativeShort('2026-06-11T08:30:00Z', NOW) === 'in 30 min');
ok('2 days in future → "in 2 days"',formatRelativeShort('2026-06-13T08:00:00Z', NOW) === 'in 2 days');

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\ndate-format: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
