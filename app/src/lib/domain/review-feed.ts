import type {
  ASCCustomerReview,
  ASCCustomerReviewResponse,
} from '@/lib/api/asc-types';

/**
 * Pure projections for the Reviews tab.
 *
 * Same architecture pattern as `version-events.ts`:
 *  - takes raw ASC JSON:API shapes in
 *  - returns clean, sorted, filtered shapes the UI consumes
 *  - 100% pure → tested in plain Node, no RN dep
 */

// ---------------------------------------------------------------------------
// Shapes the UI consumes
// ---------------------------------------------------------------------------

export type ReviewReplyState =
  | { kind: 'none' }
  | { kind: 'published'; body: string; lastModified: string | null }
  | { kind: 'pending_publish'; body: string; lastModified: string | null }
  | { kind: 'pending_local'; body: string; queuedAt: number };

export type ReviewSummary = {
  ascId: string;
  /** The app this review belongs to. Filled at aggregation time. */
  appId: string;
  appName: string;
  rating: number;                // 1–5
  title: string;
  body: string;
  reviewerNickname: string;
  territory: string | null;      // ISO 3166-1 alpha-3
  createdAt: string | null;
  /** Reply state — composed from both the API response AND local pending queue. */
  reply: ReviewReplyState;
};

export type ReviewFilter = {
  /** Empty array = no app filter. Otherwise restrict to listed app ASC ids. */
  appIds?: string[];
  /** "negative" = 1-2★, "neutral" = 3★, "positive" = 4-5★. Empty = all. */
  ratingBuckets?: readonly ('negative' | 'neutral' | 'positive')[];
  /** "needs_reply" = no reply yet. "replied" = already responded. */
  status?: 'all' | 'needs_reply' | 'replied';
};

/**
 * Project one ASC review into a UI-ready summary.
 *
 * `pendingLocal` is the optional local-queue reply (offline send) keyed
 * by review id. If present, it overrides the API's reply state — the
 * user just hit Send moments ago and the network hasn't confirmed yet.
 */
export function projectReview(args: {
  raw: ASCCustomerReview;
  appId: string;
  appName: string;
  responses: Map<string, ASCCustomerReviewResponse>;
  pendingLocal?: { body: string; queuedAt: number } | null;
}): ReviewSummary {
  return {
    ascId: args.raw.id,
    appId: args.appId,
    appName: args.appName,
    rating: clampRating(args.raw.attributes.rating),
    title: args.raw.attributes.title ?? '',
    body: args.raw.attributes.body ?? '',
    reviewerNickname: args.raw.attributes.reviewerNickname ?? 'Anonymous',
    territory: args.raw.attributes.territory ?? null,
    createdAt: args.raw.attributes.createdDate ?? null,
    reply: deriveReplyState({
      raw: args.raw,
      responses: args.responses,
      pendingLocal: args.pendingLocal,
    }),
  };
}

/**
 * Filter + sort the aggregated review feed for the inbox.
 *
 * Sort order: newest first. We push reviews with `createdAt === null`
 * to the bottom (rare — usually only happens during partial API drops).
 */
export function filterReviews(
  reviews: ReviewSummary[],
  filter: ReviewFilter,
): ReviewSummary[] {
  const filtered = reviews.filter((r) => matchesFilter(r, filter));
  filtered.sort((a, b) => compareDescNullable(a.createdAt, b.createdAt));
  return filtered;
}

/**
 * Group reviews by rating bucket — used in the filter chip counts.
 */
export type ReviewCounts = {
  total: number;
  needsReply: number;
  negative: number;  // 1-2★
  neutral: number;   // 3★
  positive: number;  // 4-5★
};

export function countReviews(reviews: ReviewSummary[]): ReviewCounts {
  let needsReply = 0;
  let negative = 0;
  let neutral = 0;
  let positive = 0;
  for (const r of reviews) {
    if (r.reply.kind === 'none') needsReply++;
    const bucket = ratingBucket(r.rating);
    if (bucket === 'negative') negative++;
    else if (bucket === 'neutral') neutral++;
    else if (bucket === 'positive') positive++;
  }
  return { total: reviews.length, needsReply, negative, neutral, positive };
}

export function ratingBucket(rating: number): 'negative' | 'neutral' | 'positive' {
  if (rating <= 2) return 'negative';
  if (rating === 3) return 'neutral';
  return 'positive';
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function deriveReplyState(args: {
  raw: ASCCustomerReview;
  responses: Map<string, ASCCustomerReviewResponse>;
  pendingLocal?: { body: string; queuedAt: number } | null;
}): ReviewReplyState {
  // Local pending always wins — the user just submitted, even if the
  // server hasn't echoed it back yet
  if (args.pendingLocal) {
    return { kind: 'pending_local', body: args.pendingLocal.body, queuedAt: args.pendingLocal.queuedAt };
  }

  const responseId = args.raw.relationships?.response?.data?.id;
  if (!responseId) return { kind: 'none' };

  const resp = args.responses.get(responseId);
  if (!resp) return { kind: 'none' };

  const body = resp.attributes.responseBody ?? '';
  const lastModified = resp.attributes.lastModifiedDate ?? null;
  if (resp.attributes.state === 'PENDING_PUBLISH') {
    return { kind: 'pending_publish', body, lastModified };
  }
  return { kind: 'published', body, lastModified };
}

function matchesFilter(r: ReviewSummary, f: ReviewFilter): boolean {
  if (f.appIds && f.appIds.length > 0 && !f.appIds.includes(r.appId)) return false;
  if (f.ratingBuckets && f.ratingBuckets.length > 0) {
    if (!f.ratingBuckets.includes(ratingBucket(r.rating))) return false;
  }
  if (f.status === 'needs_reply' && r.reply.kind !== 'none') return false;
  if (f.status === 'replied' && r.reply.kind === 'none') return false;
  return true;
}

function clampRating(raw: number | undefined): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 0;
  if (raw < 1) return 1;
  if (raw > 5) return 5;
  return Math.round(raw);
}

function compareDescNullable(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a > b) return -1;
  if (a < b) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Reply body validation (pure, shared with the composer + queue worker)
// ---------------------------------------------------------------------------

/** ASC's hard limit on review-response bodies, per Apple's docs. */
export const REPLY_BODY_MAX_CHARS = 5800;

export type ReplyValidationError =
  | 'empty'
  | 'too_long'
  | 'whitespace_only';

export function validateReplyBody(body: string): ReplyValidationError | null {
  if (body.length === 0) return 'empty';
  if (body.trim().length === 0) return 'whitespace_only';
  if (body.length > REPLY_BODY_MAX_CHARS) return 'too_long';
  return null;
}
