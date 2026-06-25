/**
 * Friendly error mapping for the RevenueCat REST API v2.
 *
 * Mirrors `asc-errors.ts` — keeps the same `kind` taxonomy so callers
 * (briefing screen, settings UI) can use the same `describeError(...)`
 * pattern across both APIs.
 */

export type RevenueCatErrorKind =
  | 'unauthorized'             // 401 — secret key invalid / revoked
  | 'forbidden_missing_scope'  // 403 — key lacks the required Charts metrics scope
  | 'project_not_found'        // 404 — project_id doesn't match this key
  | 'rate_limited'             // 429 — exceeded 25 req/min charts domain
  | 'server_error'             // 5xx — RC's side
  | 'malformed_response'       // valid HTTP but unparseable body
  | 'no_network'               // device offline
  | 'timeout'                  // request took too long
  | 'pro_required';            // defense-in-depth: caller is on free tier

export class RevenueCatError extends Error {
  readonly kind: RevenueCatErrorKind;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly detail?: string;

  constructor(
    kind: RevenueCatErrorKind,
    opts?: { status?: number; retryAfterMs?: number; detail?: string; cause?: unknown },
  ) {
    super(`RevenueCatError[${kind}]${opts?.detail ? `: ${opts.detail}` : ''}`);
    this.name = 'RevenueCatError';
    this.kind = kind;
    this.status = opts?.status;
    this.retryAfterMs = opts?.retryAfterMs;
    this.detail = opts?.detail;
  }
}

export function describeRevenueCatError(err: RevenueCatError): {
  title: string;
  body: string;
  actionLabel: string | null;
} {
  switch (err.kind) {
    case 'unauthorized':
      return {
        title: "RevenueCat rejected the key",
        body:
          'The secret API key looks invalid or was revoked. Generate a new V2 secret key in RevenueCat and paste it again.',
        actionLabel: 'Open RevenueCat',
      };
    case 'forbidden_missing_scope':
      return {
        title: "Key is missing a permission",
        body:
          'This key works but does not have access to revenue metrics. In RevenueCat, go to API keys → Secret API keys → Edit, select API version V2, then set Charts metrics permissions to Read only.',
        actionLabel: 'Open RevenueCat',
      };
    case 'project_not_found':
      return {
        title: "Project ID doesn't match this key",
        body:
          "The Project ID you entered doesn't belong to the same RevenueCat project as the secret key. Double-check both values and try again.",
        actionLabel: 'Try again',
      };
    case 'rate_limited':
      return {
        title: 'Rate limited',
        body: "RevenueCat is throttling us (25 requests/min limit). Try again in a minute.",
        actionLabel: 'Retry',
      };
    case 'server_error':
      return {
        title: 'RevenueCat is having issues',
        body: "RevenueCat's service is unhealthy. We'll keep showing your cached numbers until they recover.",
        actionLabel: 'Retry',
      };
    case 'malformed_response':
      return {
        title: 'Unexpected response',
        body: "RevenueCat returned something we couldn't read. Please report it if it keeps happening.",
        actionLabel: 'Get help',
      };
    case 'no_network':
      return {
        title: "You're offline",
        body: 'Check your internet connection and try again.',
        actionLabel: 'Retry',
      };
    case 'timeout':
      return {
        title: 'Request timed out',
        body: "RevenueCat didn't respond in time. Try again.",
        actionLabel: 'Retry',
      };
    case 'pro_required':
      return {
        title: 'RevenueCat is a Pro feature',
        body:
          'Subscribe to Pro to connect RevenueCat and see live MRR, active subscribers, and 28-day revenue on the Today tab.',
        actionLabel: 'See plans',
      };
  }
}

export function toRevenueCatError(thrown: unknown): RevenueCatError {
  if (thrown instanceof RevenueCatError) return thrown;
  if (thrown instanceof Error) {
    if (thrown.name === 'AbortError') {
      return new RevenueCatError('timeout', { detail: thrown.message });
    }
    if (/network request failed|fetch failed|enotfound|getaddrinfo/i.test(thrown.message)) {
      return new RevenueCatError('no_network', { detail: thrown.message });
    }
    return new RevenueCatError('malformed_response', { detail: thrown.message, cause: thrown });
  }
  return new RevenueCatError('malformed_response', { detail: String(thrown) });
}
