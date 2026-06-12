import {
  appsCacheKey,
  DEFAULT_TTL_MS,
  deserializeList,
  deserializeSummaries,
  isFresh,
  reviewsCacheKey,
  serializeList,
  serializeSummaries,
  versionsCacheKey,
} from './cache-utils';
import type { VersionSummary } from '@/lib/domain/version-events';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// isFresh
ok('fresh: just-fetched is fresh',          isFresh({ fetchedAt: 1_000, now: 1_500 }));
ok('fresh: within default TTL',             isFresh({ fetchedAt: 0, now: DEFAULT_TTL_MS - 1 }));
ok('stale: exactly at TTL',                !isFresh({ fetchedAt: 0, now: DEFAULT_TTL_MS }));
ok('stale: past default TTL',              !isFresh({ fetchedAt: 0, now: DEFAULT_TTL_MS + 1 }));
ok('custom TTL: fresh under',               isFresh({ fetchedAt: 0, now: 500, ttlMs: 1000 }));
ok('custom TTL: stale over',               !isFresh({ fetchedAt: 0, now: 1001, ttlMs: 1000 }));

// cache keys
ok('appsCacheKey: includes issuer',         appsCacheKey('abc-123') === 'apps:abc-123');
ok('versionsCacheKey: includes app id',     versionsCacheKey('XYZ') === 'versions:XYZ');

// serialize / deserialize round-trip
const fixture: VersionSummary[] = [
  {
    ascId: 'v1', versionString: '1.8.23', buildNumber: '23',
    state: 'in_review', rawState: 'IN_REVIEW',
    createdAt: '2026-06-10T00:00:00Z', scheduledReleaseAt: null, releaseType: null,
    isSuperseded: false,
  },
  {
    ascId: 'v2', versionString: '1.8.22', buildNumber: '22',
    state: 'live', rawState: 'READY_FOR_SALE',
    createdAt: '2026-05-01T00:00:00Z', scheduledReleaseAt: null, releaseType: 'MANUAL',
    isSuperseded: false,
  },
];
const blob = serializeSummaries(fixture);
const round = deserializeSummaries(blob);

ok('serialize: produces string',            typeof blob === 'string');
ok('serialize: includes envelope version',  blob.includes('"v":1'));
ok('round-trip: same length',               round?.length === fixture.length);
ok('round-trip: row 0 deep-equal',          JSON.stringify(round?.[0]) === JSON.stringify(fixture[0]));
ok('round-trip: row 1 deep-equal',          JSON.stringify(round?.[1]) === JSON.stringify(fixture[1]));

// deserialize defensive: invalid JSON → null
ok('deserialize: garbage → null',           deserializeSummaries('not-json') === null);
ok('deserialize: wrong envelope → null',    deserializeSummaries('{"v":99,"rows":[]}') === null);
ok('deserialize: missing rows → null',      deserializeSummaries('{"v":1}') === null);

// reviewsCacheKey
ok('reviewsCacheKey: includes app id',      reviewsCacheKey('XYZ') === 'reviews:XYZ');

// Generic serializeList / deserializeList
{
  type Row = { id: string; rating: number };
  const rows: Row[] = [{ id: 'a', rating: 5 }, { id: 'b', rating: 1 }];
  const blob = serializeList(rows);
  const round = deserializeList<Row>(blob);
  ok('serializeList: round-trip length',     round?.length === 2);
  ok('serializeList: round-trip values',     round?.[0]?.id === 'a' && round?.[1]?.rating === 1);
  ok('deserializeList: garbage → null',      deserializeList('{not}') === null);
  ok('deserializeList: wrong envelope → null', deserializeList('{"v":99,"rows":[]}') === null);
}

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\ncache-utils: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
