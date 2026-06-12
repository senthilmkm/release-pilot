import {
  deriveLatestSnapshot,
  deriveVersionTimeline,
} from './version-events';
import type { ASCAppStoreVersion, ASCBuild } from '@/lib/api/asc-types';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVersion(args: {
  id: string;
  versionString: string;
  state: string;
  createdAt?: string;
  buildId?: string;
  scheduledAt?: string;
  releaseType?: string;
}): ASCAppStoreVersion {
  return {
    type: 'appStoreVersions',
    id: args.id,
    attributes: {
      versionString: args.versionString,
      appStoreState: args.state,
      createdDate: args.createdAt,
      earliestReleaseDate: args.scheduledAt,
      releaseType: args.releaseType,
    },
    relationships: args.buildId
      ? { build: { data: { type: 'builds', id: args.buildId } } }
      : undefined,
  };
}

function makeBuild(id: string, version: string): ASCBuild {
  return {
    type: 'builds',
    id,
    attributes: { version },
  };
}

// ---------------------------------------------------------------------------
// deriveVersionTimeline
// ---------------------------------------------------------------------------

{
  const versions = [
    makeVersion({ id: '3', versionString: '1.8.23', state: 'WAITING_FOR_REVIEW', createdAt: '2026-06-10T00:00:00Z', buildId: 'b3' }),
    makeVersion({ id: '1', versionString: '1.8.21', state: 'READY_FOR_SALE', createdAt: '2026-05-01T00:00:00Z', buildId: 'b1' }),
    makeVersion({ id: '2', versionString: '1.8.22', state: 'REJECTED',       createdAt: '2026-06-01T00:00:00Z', buildId: 'b2' }),
  ];
  const builds = new Map([
    ['b1', makeBuild('b1', '21')],
    ['b2', makeBuild('b2', '22')],
    ['b3', makeBuild('b3', '23')],
  ]);

  const timeline = deriveVersionTimeline({ versions, builds });

  ok('timeline sorted newest-first', timeline[0]!.versionString === '1.8.23' && timeline[2]!.versionString === '1.8.21');
  ok('timeline binds build numbers', timeline[0]!.buildNumber === '23' && timeline[1]!.buildNumber === '22');
  ok('timeline maps state correctly', timeline[0]!.state === 'submitted' && timeline[1]!.state === 'rejected' && timeline[2]!.state === 'live');
  ok('timeline preserves rawState', timeline[0]!.rawState === 'WAITING_FOR_REVIEW');
  ok('timeline preserves ASC id', timeline[0]!.ascId === '3');
}

// versions missing builds — buildNumber should be null
{
  const versions = [
    makeVersion({ id: '1', versionString: '1.0.0', state: 'READY_FOR_SALE', createdAt: '2026-01-01T00:00:00Z' }),
  ];
  const timeline = deriveVersionTimeline({ versions, builds: new Map() });
  ok('missing build → buildNumber null', timeline[0]!.buildNumber === null);
}

// versions with null createdAt sink to end
{
  const versions = [
    makeVersion({ id: '1', versionString: '1.0.0', state: 'READY_FOR_SALE' }),
    makeVersion({ id: '2', versionString: '1.0.1', state: 'IN_REVIEW', createdAt: '2026-01-01T00:00:00Z' }),
  ];
  const timeline = deriveVersionTimeline({ versions, builds: new Map() });
  ok('null createdAt sinks to bottom', timeline[0]!.versionString === '1.0.1' && timeline[1]!.versionString === '1.0.0');
}

// scheduled release date passes through for approved_scheduled
{
  const versions = [
    makeVersion({
      id: '1',
      versionString: '2.0.0',
      state: 'PENDING_APPLE_RELEASE',
      createdAt: '2026-06-10T00:00:00Z',
      scheduledAt: '2026-06-15T12:00:00Z',
      releaseType: 'SCHEDULED',
    }),
  ];
  const timeline = deriveVersionTimeline({ versions, builds: new Map() });
  ok('scheduledReleaseAt passes through', timeline[0]!.scheduledReleaseAt === '2026-06-15T12:00:00Z');
  ok('releaseType passes through', timeline[0]!.releaseType === 'SCHEDULED');
  ok('PENDING_APPLE_RELEASE → approved_scheduled', timeline[0]!.state === 'approved_scheduled');
}

// ---------------------------------------------------------------------------
// isSuperseded — only the most-recent live row is "currently on the store"
// ---------------------------------------------------------------------------

// Multiple live versions → all but the most recent are superseded
{
  const timeline = deriveVersionTimeline({
    versions: [
      makeVersion({ id: '1', versionString: '1.0.0', state: 'READY_FOR_SALE', createdAt: '2026-02-04T00:00:00Z' }),
      makeVersion({ id: '2', versionString: '1.1.0', state: 'READY_FOR_SALE', createdAt: '2026-02-19T00:00:00Z' }),
      makeVersion({ id: '3', versionString: '1.2.0', state: 'READY_FOR_SALE', createdAt: '2026-02-26T00:00:00Z' }),
      makeVersion({ id: '4', versionString: '1.3.0', state: 'READY_FOR_SALE', createdAt: '2026-06-05T00:00:00Z' }),
    ],
    builds: new Map(),
  });
  ok('most recent live NOT superseded', timeline[0]!.versionString === '1.3.0' && timeline[0]!.isSuperseded === false);
  ok('older live #1 superseded',         timeline[1]!.versionString === '1.2.0' && timeline[1]!.isSuperseded === true);
  ok('older live #2 superseded',         timeline[2]!.versionString === '1.1.0' && timeline[2]!.isSuperseded === true);
  ok('older live #3 superseded',         timeline[3]!.versionString === '1.0.0' && timeline[3]!.isSuperseded === true);
  ok('superseded rows keep state=live (raw still accurate)', timeline[1]!.state === 'live' && timeline[2]!.state === 'live');
}

// Single live version → never superseded
{
  const timeline = deriveVersionTimeline({
    versions: [
      makeVersion({ id: '1', versionString: '1.0.0', state: 'READY_FOR_SALE', createdAt: '2026-02-04T00:00:00Z' }),
    ],
    builds: new Map(),
  });
  ok('lone live row NOT superseded', timeline[0]!.isSuperseded === false);
}

// In-flight + multiple live → only oldest lives are superseded; in-flight unaffected
{
  const timeline = deriveVersionTimeline({
    versions: [
      makeVersion({ id: '1', versionString: '1.0.0', state: 'READY_FOR_SALE', createdAt: '2026-02-04T00:00:00Z' }),
      makeVersion({ id: '2', versionString: '1.1.0', state: 'READY_FOR_SALE', createdAt: '2026-05-01T00:00:00Z' }),
      makeVersion({ id: '3', versionString: '1.2.0', state: 'IN_REVIEW',      createdAt: '2026-06-10T00:00:00Z' }),
    ],
    builds: new Map(),
  });
  ok('in-flight row never marked superseded', timeline[0]!.state === 'in_review' && timeline[0]!.isSuperseded === false);
  ok('most recent live NOT superseded',       timeline[1]!.versionString === '1.1.0' && timeline[1]!.isSuperseded === false);
  ok('older live superseded',                 timeline[2]!.versionString === '1.0.0' && timeline[2]!.isSuperseded === true);
}

// Rejected + live → rejected never superseded (it was never on the store)
{
  const timeline = deriveVersionTimeline({
    versions: [
      makeVersion({ id: '1', versionString: '1.0.0', state: 'READY_FOR_SALE', createdAt: '2026-02-04T00:00:00Z' }),
      makeVersion({ id: '2', versionString: '1.1.0', state: 'REJECTED',       createdAt: '2026-05-01T00:00:00Z' }),
    ],
    builds: new Map(),
  });
  ok('rejected row never marked superseded', timeline[0]!.state === 'rejected' && timeline[0]!.isSuperseded === false);
  ok('lone live (in mix) NOT superseded',    timeline[1]!.state === 'live'     && timeline[1]!.isSuperseded === false);
}

// ---------------------------------------------------------------------------
// deriveLatestSnapshot — priority rules
// ---------------------------------------------------------------------------

// Empty
{
  const snap = deriveLatestSnapshot([]);
  ok('empty → isEmpty true', snap.isEmpty);
  ok('empty → state drafting placeholder', snap.state === 'drafting');
  ok('empty → versionString blank', snap.versionString === '');
}

// In-flight beats Live
{
  const timeline = deriveVersionTimeline({
    versions: [
      makeVersion({ id: '1', versionString: '1.0.0', state: 'READY_FOR_SALE',     createdAt: '2026-05-01T00:00:00Z' }),
      makeVersion({ id: '2', versionString: '1.1.0', state: 'IN_REVIEW',          createdAt: '2026-06-10T00:00:00Z' }),
    ],
    builds: new Map(),
  });
  const snap = deriveLatestSnapshot(timeline);
  ok('in-flight beats live', snap.state === 'in_review' && snap.versionString === '1.1.0');
}

// Live shown when no in-flight version exists
{
  const timeline = deriveVersionTimeline({
    versions: [
      makeVersion({ id: '1', versionString: '1.0.0', state: 'READY_FOR_SALE', createdAt: '2026-05-01T00:00:00Z' }),
    ],
    builds: new Map(),
  });
  const snap = deriveLatestSnapshot(timeline);
  ok('lone live → live', snap.state === 'live' && snap.versionString === '1.0.0');
}

// Rejected shown when neither in-flight nor live exists (rare — fresh project)
{
  const timeline = deriveVersionTimeline({
    versions: [
      makeVersion({ id: '1', versionString: '0.9.0', state: 'REJECTED', createdAt: '2026-05-01T00:00:00Z' }),
    ],
    builds: new Map(),
  });
  const snap = deriveLatestSnapshot(timeline);
  ok('lone rejected → rejected', snap.state === 'rejected');
}

// Drafting falls through (no in-flight, no live, no rejected)
{
  const timeline = deriveVersionTimeline({
    versions: [
      makeVersion({ id: '1', versionString: '0.1.0', state: 'PREPARE_FOR_SUBMISSION', createdAt: '2026-05-01T00:00:00Z' }),
    ],
    builds: new Map(),
  });
  const snap = deriveLatestSnapshot(timeline);
  ok('drafting fallthrough', snap.state === 'drafting');
}

// Each in-flight state qualifies as "in-flight"
for (const raw of ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'PENDING_APPLE_RELEASE'] as const) {
  const timeline = deriveVersionTimeline({
    versions: [
      makeVersion({ id: '1', versionString: '1.0.0', state: 'READY_FOR_SALE', createdAt: '2026-05-01T00:00:00Z' }),
      makeVersion({ id: '2', versionString: '1.1.0', state: raw,              createdAt: '2026-06-01T00:00:00Z' }),
    ],
    builds: new Map(),
  });
  const snap = deriveLatestSnapshot(timeline);
  ok(`in-flight ${raw} preferred over live`, snap.versionString === '1.1.0');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nversion-events: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
