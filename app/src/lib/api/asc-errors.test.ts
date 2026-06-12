import { ASCError, describeASCError, toASCError } from './asc-errors';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// Every kind produces a non-empty title + body
for (const kind of [
  'unauthorized', 'forbidden', 'not_found', 'rate_limited',
  'server_error', 'malformed_response', 'no_network',
  'jwt_signing_failed', 'timeout',
] as const) {
  const d = describeASCError(new ASCError(kind));
  ok(`${kind}: title is non-empty`, d.title.length > 0);
  ok(`${kind}: body is non-empty`, d.body.length > 0);
}

// 401 gets the most-helpful "wrong key paired with wrong Key ID" message
const unauthorizedMsg = describeASCError(new ASCError('unauthorized'));
ok('unauthorized message mentions Key ID', unauthorizedMsg.body.includes('Key ID'));

// 403 directs user to ASC, not to retry
const forbiddenMsg = describeASCError(new ASCError('forbidden'));
ok('forbidden message mentions App Manager role', forbiddenMsg.body.includes('App Manager'));

// toASCError normalizes various thrown values
ok('toASCError passes through ASCError', toASCError(new ASCError('not_found')).kind === 'not_found');
ok('toASCError detects network failure', toASCError(new Error('Network request failed')).kind === 'no_network');
ok('toASCError detects AbortError', (() => {
  const e = new Error('aborted'); e.name = 'AbortError';
  return toASCError(e).kind === 'timeout';
})());
ok('toASCError wraps unknown', toASCError('something bad').kind === 'malformed_response');

const passed = tests.filter(t => t.pass).length;
const failed = tests.filter(t => !t.pass);
console.log(`\nasc-errors: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
