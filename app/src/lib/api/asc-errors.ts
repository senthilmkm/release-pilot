/**
 * Friendly error mapping for the App Store Connect API.
 *
 * Every error the user can see in Release Pilot is one of these. We never
 * let raw fetch errors or HTTP status codes bubble up to the UI.
 */

export type ASCErrorKind =
  | 'unauthorized'        // 401 — credentials mismatch (most common during onboarding)
  | 'forbidden'           // 403 — key lacks required role
  | 'not_found'           // 404 — resource gone (rare)
  | 'rate_limited'        // 429 — too many calls
  | 'server_error'        // 5xx — Apple's side
  | 'malformed_response'  // valid HTTP but unparseable body
  | 'no_network'          // device offline / DNS fail
  | 'jwt_signing_failed'  // ES256 signing barfed (bad p8?)
  | 'timeout';            // request took too long

export class ASCError extends Error {
  readonly kind: ASCErrorKind;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly detail?: string;

  constructor(kind: ASCErrorKind, opts?: { status?: number; retryAfterMs?: number; detail?: string; cause?: unknown }) {
    super(`ASCError[${kind}]${opts?.detail ? `: ${opts.detail}` : ''}`);
    this.name = 'ASCError';
    this.kind = kind;
    this.status = opts?.status;
    this.retryAfterMs = opts?.retryAfterMs;
    this.detail = opts?.detail;
  }
}

/**
 * Turn an ASCError into copy the user actually understands.
 *
 * Returns:
 *  - `title`: the headline (short)
 *  - `body`:  one-sentence explanation + what to do
 *  - `actionLabel`: button label, or `null` if no action makes sense
 */
export function describeASCError(err: ASCError): {
  title: string;
  body: string;
  actionLabel: string | null;
} {
  switch (err.kind) {
    case 'unauthorized':
      return {
        title: "Couldn't connect",
        body:
          "App Store Connect rejected these credentials. The .p8 contents likely don't match this Key ID. Did you paste a different key file?",
        actionLabel: 'Try again',
      };
    case 'forbidden':
      return {
        title: 'Key has insufficient access',
        body:
          'This API key exists but doesn\'t have the required role. Generate a new key in ASC with "App Manager" access (or higher).',
        actionLabel: 'Open App Store Connect',
      };
    case 'not_found':
      return {
        title: 'Not found',
        body: 'The resource you asked for is no longer available.',
        actionLabel: null,
      };
    case 'rate_limited':
      return {
        title: 'Rate limited',
        body: 'App Store Connect is throttling us. Try again in 30 seconds.',
        actionLabel: 'Retry',
      };
    case 'server_error':
      return {
        title: 'App Store Connect is having issues',
        body: 'Apple\'s service is unhealthy. Try again in a few minutes.',
        actionLabel: 'Retry',
      };
    case 'malformed_response':
      return {
        title: 'Unexpected response',
        body: 'App Store Connect returned something we couldn\'t read. This is rare — please report it.',
        actionLabel: 'Get help',
      };
    case 'no_network':
      return {
        title: 'You\'re offline',
        body: 'Check your internet connection and try again.',
        actionLabel: 'Retry',
      };
    case 'jwt_signing_failed':
      return {
        title: 'Couldn\'t sign the request',
        body: 'Your .p8 private key looks malformed. Re-download the file from App Store Connect and try again.',
        actionLabel: 'Try again',
      };
    case 'timeout':
      return {
        title: 'Request timed out',
        body: 'App Store Connect didn\'t respond in time. Try again.',
        actionLabel: 'Retry',
      };
  }
}

/**
 * Normalize a thrown value into an ASCError. Use at every catch boundary.
 */
export function toASCError(thrown: unknown): ASCError {
  if (thrown instanceof ASCError) return thrown;
  if (thrown instanceof Error) {
    if (thrown.name === 'AbortError') {
      return new ASCError('timeout', { detail: thrown.message });
    }
    if (/network request failed|fetch failed|enotfound|getaddrinfo/i.test(thrown.message)) {
      return new ASCError('no_network', { detail: thrown.message });
    }
    return new ASCError('malformed_response', { detail: thrown.message, cause: thrown });
  }
  return new ASCError('malformed_response', { detail: String(thrown) });
}
