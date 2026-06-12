import {
  countReviews,
  filterReviews,
  projectReview,
  ratingBucket,
  REPLY_BODY_MAX_CHARS,
  validateReplyBody,
  type ReviewSummary,
} from './review-feed';
import type {
  ASCCustomerReview,
  ASCCustomerReviewResponse,
} from '@/lib/api/asc-types';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRaw(args: {
  id: string;
  rating: number;
  title?: string;
  body?: string;
  nick?: string;
  territory?: string;
  createdAt?: string;
  responseId?: string;
}): ASCCustomerReview {
  return {
    type: 'customerReviews',
    id: args.id,
    attributes: {
      rating: args.rating,
      title: args.title,
      body: args.body,
      reviewerNickname: args.nick,
      territory: args.territory,
      createdDate: args.createdAt,
    },
    relationships: args.responseId
      ? { response: { data: { type: 'customerReviewResponses', id: args.responseId } } }
      : { response: { data: null } },
  };
}

function makeResponse(args: {
  id: string;
  body: string;
  state?: 'PUBLISHED' | 'PENDING_PUBLISH';
  lastModified?: string;
}): ASCCustomerReviewResponse {
  return {
    type: 'customerReviewResponses',
    id: args.id,
    attributes: {
      responseBody: args.body,
      state: args.state ?? 'PUBLISHED',
      lastModifiedDate: args.lastModified,
    },
  };
}

// ---------------------------------------------------------------------------
// projectReview
// ---------------------------------------------------------------------------

{
  const raw = makeRaw({
    id: 'r1', rating: 5, title: 'Love it', body: 'Best app ever',
    nick: 'Alex', territory: 'USA', createdAt: '2026-06-10T12:00:00Z',
  });
  const proj = projectReview({
    raw, appId: 'a1', appName: 'Recall', responses: new Map(),
  });

  ok('projectReview: basic fields',
    proj.ascId === 'r1' && proj.appId === 'a1' && proj.appName === 'Recall' &&
    proj.rating === 5 && proj.title === 'Love it' && proj.body === 'Best app ever' &&
    proj.reviewerNickname === 'Alex' && proj.territory === 'USA' &&
    proj.createdAt === '2026-06-10T12:00:00Z');
  ok('projectReview: no response → reply.none', proj.reply.kind === 'none');
}

// Anonymous nickname fallback
{
  const raw = makeRaw({ id: 'r1', rating: 4 });
  const proj = projectReview({ raw, appId: 'a1', appName: 'X', responses: new Map() });
  ok('projectReview: missing nick → "Anonymous"', proj.reviewerNickname === 'Anonymous');
  ok('projectReview: missing body → empty string', proj.body === '');
  ok('projectReview: missing territory → null', proj.territory === null);
}

// Rating clamp + non-numeric handling
{
  const tests1 = [
    { input: 5, expected: 5 },
    { input: 1, expected: 1 },
    { input: 0, expected: 1 },     // clamp low
    { input: 10, expected: 5 },    // clamp high
    { input: 3.7, expected: 4 },   // round
    { input: NaN, expected: 0 },   // bad → 0
  ];
  for (const t of tests1) {
    const raw = makeRaw({ id: 'r', rating: t.input });
    const proj = projectReview({ raw, appId: 'a', appName: 'X', responses: new Map() });
    ok(`projectReview: rating clamp ${t.input} → ${t.expected}`, proj.rating === t.expected);
  }
}

// Reply state: published
{
  const raw = makeRaw({ id: 'r1', rating: 5, responseId: 'resp1' });
  const responses = new Map([['resp1', makeResponse({ id: 'resp1', body: 'Thanks!', state: 'PUBLISHED', lastModified: '2026-06-10T13:00:00Z' })]]);
  const proj = projectReview({ raw, appId: 'a', appName: 'X', responses });
  ok('projectReview: published reply', proj.reply.kind === 'published');
  if (proj.reply.kind === 'published') {
    ok('projectReview: published body', proj.reply.body === 'Thanks!');
    ok('projectReview: published lastModified', proj.reply.lastModified === '2026-06-10T13:00:00Z');
  }
}

// Reply state: pending_publish
{
  const raw = makeRaw({ id: 'r1', rating: 5, responseId: 'resp1' });
  const responses = new Map([['resp1', makeResponse({ id: 'resp1', body: 'In moderation', state: 'PENDING_PUBLISH' })]]);
  const proj = projectReview({ raw, appId: 'a', appName: 'X', responses });
  ok('projectReview: pending_publish', proj.reply.kind === 'pending_publish');
}

// Reply state: pending_local wins over server state
{
  const raw = makeRaw({ id: 'r1', rating: 5 });
  const proj = projectReview({
    raw, appId: 'a', appName: 'X', responses: new Map(),
    pendingLocal: { body: 'sent just now', queuedAt: 1717000000000 },
  });
  ok('projectReview: pending_local wins', proj.reply.kind === 'pending_local');
  if (proj.reply.kind === 'pending_local') {
    ok('projectReview: pending_local body',     proj.reply.body === 'sent just now');
    ok('projectReview: pending_local queuedAt', proj.reply.queuedAt === 1717000000000);
  }
}

// Reply state: response id present but response missing from map → none
{
  const raw = makeRaw({ id: 'r1', rating: 5, responseId: 'resp-orphan' });
  const proj = projectReview({ raw, appId: 'a', appName: 'X', responses: new Map() });
  ok('projectReview: orphan response id → none', proj.reply.kind === 'none');
}

// ---------------------------------------------------------------------------
// ratingBucket
// ---------------------------------------------------------------------------

ok('ratingBucket: 1 → negative', ratingBucket(1) === 'negative');
ok('ratingBucket: 2 → negative', ratingBucket(2) === 'negative');
ok('ratingBucket: 3 → neutral',  ratingBucket(3) === 'neutral');
ok('ratingBucket: 4 → positive', ratingBucket(4) === 'positive');
ok('ratingBucket: 5 → positive', ratingBucket(5) === 'positive');

// ---------------------------------------------------------------------------
// filterReviews
// ---------------------------------------------------------------------------

function makeSummary(args: Partial<ReviewSummary> & { id: string; rating: number }): ReviewSummary {
  return {
    ascId: args.id,
    appId: args.appId ?? 'app1',
    appName: args.appName ?? 'Recall',
    rating: args.rating,
    title: args.title ?? '',
    body: args.body ?? '',
    reviewerNickname: args.reviewerNickname ?? 'Anon',
    territory: 'territory' in args ? args.territory ?? null : null,
    // Use 'in' so null overrides aren't swallowed by ??
    createdAt: 'createdAt' in args ? args.createdAt ?? null : '2026-06-10T00:00:00Z',
    reply: args.reply ?? { kind: 'none' },
  };
}

{
  const feed = [
    makeSummary({ id: '1', rating: 5, appId: 'a1', createdAt: '2026-06-10T00:00:00Z', reply: { kind: 'none' } }),
    makeSummary({ id: '2', rating: 1, appId: 'a2', createdAt: '2026-06-11T00:00:00Z', reply: { kind: 'none' } }),
    makeSummary({ id: '3', rating: 3, appId: 'a1', createdAt: '2026-06-12T00:00:00Z', reply: { kind: 'published', body: 'thx', lastModified: null } }),
  ];

  ok('filter: empty filter → all, newest-first',
    filterReviews(feed, {}).map((r) => r.ascId).join(',') === '3,2,1');

  ok('filter: appIds filter',
    filterReviews(feed, { appIds: ['a1'] }).map((r) => r.ascId).join(',') === '3,1');

  ok('filter: rating bucket — negative',
    filterReviews(feed, { ratingBuckets: ['negative'] }).map((r) => r.ascId).join(',') === '2');

  ok('filter: rating bucket — positive',
    filterReviews(feed, { ratingBuckets: ['positive'] }).map((r) => r.ascId).join(',') === '1');

  ok('filter: rating bucket — multi (neg + pos)',
    filterReviews(feed, { ratingBuckets: ['negative', 'positive'] }).map((r) => r.ascId).join(',') === '2,1');

  ok('filter: needs_reply',
    filterReviews(feed, { status: 'needs_reply' }).map((r) => r.ascId).join(',') === '2,1');

  ok('filter: replied',
    filterReviews(feed, { status: 'replied' }).map((r) => r.ascId).join(',') === '3');

  ok('filter: compose (a1 + needs_reply)',
    filterReviews(feed, { appIds: ['a1'], status: 'needs_reply' }).map((r) => r.ascId).join(',') === '1');
}

// Null createdAt sinks to bottom
{
  const feed = [
    makeSummary({ id: '1', rating: 5, createdAt: null }),
    makeSummary({ id: '2', rating: 5, createdAt: '2026-06-01T00:00:00Z' }),
  ];
  ok('filter: null createdAt sinks to bottom',
    filterReviews(feed, {}).map((r) => r.ascId).join(',') === '2,1');
}

// ---------------------------------------------------------------------------
// countReviews
// ---------------------------------------------------------------------------

{
  const feed = [
    makeSummary({ id: '1', rating: 5, reply: { kind: 'none' } }),
    makeSummary({ id: '2', rating: 1, reply: { kind: 'published', body: '', lastModified: null } }),
    makeSummary({ id: '3', rating: 3, reply: { kind: 'none' } }),
    makeSummary({ id: '4', rating: 2, reply: { kind: 'pending_local', body: 'x', queuedAt: 0 } }),
  ];
  const counts = countReviews(feed);
  ok('count: total',      counts.total === 4);
  ok('count: needsReply', counts.needsReply === 2);
  ok('count: negative',   counts.negative === 2);
  ok('count: neutral',    counts.neutral === 1);
  ok('count: positive',   counts.positive === 1);
}

// ---------------------------------------------------------------------------
// validateReplyBody
// ---------------------------------------------------------------------------

ok('validate: empty → "empty"',                  validateReplyBody('') === 'empty');
ok('validate: whitespace-only → "whitespace"',   validateReplyBody('   \n\t  ') === 'whitespace_only');
ok('validate: normal → null',                    validateReplyBody('Thanks for your feedback!') === null);
ok('validate: at limit → null',                  validateReplyBody('a'.repeat(REPLY_BODY_MAX_CHARS)) === null);
ok('validate: over limit → "too_long"',          validateReplyBody('a'.repeat(REPLY_BODY_MAX_CHARS + 1)) === 'too_long');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nreview-feed: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
