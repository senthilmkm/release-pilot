import { buildApnsHeaders, buildReleasePayload, type ReleasePushInput } from './payload';
import type { SemanticState } from '../lib/semantic-state';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

const sample = (overrides: Partial<ReleasePushInput> = {}): ReleasePushInput => ({
  appName: 'Recall',
  versionString: '1.8.23',
  buildNumber: '29',
  previousState: 'submitted',
  newState: 'in_review',
  ascAppId: 'abc-123',
  bundleId: 'com.acme.recall',
  ...overrides,
});

// ---------------------------------------------------------------------------
// buildReleasePayload — shape
// ---------------------------------------------------------------------------

{
  const p = buildReleasePayload({ kind: 'alert', input: sample() });
  ok('alert: has aps.alert.title',  (p.aps as any).alert?.title === 'Recall');
  ok('alert: has aps.alert.body',   typeof (p.aps as any).alert?.body === 'string');
  ok('alert: has aps.sound default',(p.aps as any).sound === 'default');
  ok('alert: mutable-content = 1', (p.aps as any)['mutable-content'] === 1);
  ok('alert: time-sensitive level',(p.aps as any)['interruption-level'] === 'time-sensitive');
  ok('alert: NO content-available',!('content-available' in (p.aps as any)));
}

{
  const p = buildReleasePayload({ kind: 'silent', input: sample() });
  ok('silent: content-available = 1', (p.aps as any)['content-available'] === 1);
  ok('silent: NO aps.alert',          !('alert' in (p.aps as any)));
  ok('silent: NO sound',              !('sound' in (p.aps as any)));
}

// ---------------------------------------------------------------------------
// Custom payload keys (the iOS NSE + LA bridge reads these)
// ---------------------------------------------------------------------------

{
  const p = buildReleasePayload({ kind: 'alert', input: sample() });
  ok('custom: app_id', p.app_id === 'abc-123');
  ok('custom: bundle_id', p.bundle_id === 'com.acme.recall');
  ok('custom: new_state', p.new_state === 'in_review');
  ok('custom: previous_state', p.previous_state === 'submitted');
  ok('custom: version', p.version === '1.8.23');
  ok('custom: build', p.build === '29');
  ok('custom: kind', p.kind === 'alert');
}

{
  const p = buildReleasePayload({ kind: 'silent', input: sample({ previousState: null, buildNumber: null }) });
  ok('custom: previous_state nullable', p.previous_state === null);
  ok('custom: build nullable', p.build === null);
}

// ---------------------------------------------------------------------------
// All-states alert bodies are non-empty
// ---------------------------------------------------------------------------

{
  const states: SemanticState[] = [
    'drafting', 'submitted', 'in_review',
    'approved_waiting', 'approved_scheduled', 'live', 'rejected',
  ];
  for (const s of states) {
    const p = buildReleasePayload({ kind: 'alert', input: sample({ newState: s }) });
    const body = (p.aps as any).alert?.body as string | undefined;
    ok(`alert body for ${s} is non-empty`, typeof body === 'string' && body.length > 0);
    ok(`alert body for ${s} mentions version`, body!.includes('1.8.23'));
  }
}

// ---------------------------------------------------------------------------
// buildApnsHeaders
// ---------------------------------------------------------------------------

{
  const h = buildApnsHeaders({ jwt: 'TOKEN', bundleId: 'com.x.y', kind: 'alert', appId: 'A1' });
  ok('headers: bearer auth', h.authorization === 'bearer TOKEN');
  ok('headers: apns-topic',  h['apns-topic'] === 'com.x.y');
  ok('headers: push-type alert', h['apns-push-type'] === 'alert');
  ok('headers: priority 10',     h['apns-priority'] === '10');
  ok('headers: expiration 0',    h['apns-expiration'] === '0');
  ok('headers: collapse id has app id', h['apns-collapse-id'] === 'rp.state.A1');
}

{
  const h = buildApnsHeaders({ jwt: 'TOKEN', bundleId: 'com.x.y', kind: 'silent', appId: 'A1' });
  ok('silent headers: push-type background', h['apns-push-type'] === 'background');
  ok('silent headers: priority 5',           h['apns-priority'] === '5');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nworker/apns/payload: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
