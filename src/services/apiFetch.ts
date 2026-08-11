// A drop-in replacement for fetch that turns a dead session into a clean
// re-login instead of a misleading data error (story 5.1, the "401 dead-end").
//
// The frontend believes it is logged in via localStorage ('user'), but the real
// session lives in the server cookie/memory. When that session is gone (expiry,
// or a dev backend restart wiping the in-memory store), every call returns 401.
// Here we intercept ONLY the 401: clear the stale stored user and send the user
// to /login with a full reload (which resets React state and re-reads the now
// empty localStorage, so AuthContext shows the login screen).
//
// Intentionally NOT used by authService: /auth/login returns 401 on bad
// credentials and must show the login error, not redirect-loop.
import { getCsrfToken } from './csrf';
import { RateLimitError } from './rateLimit';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// A last-resort bound, NOT a control mechanism (story 24.2, decision C). It exists for the
// request that never answers — a mobile network dropping mid-flight — after which a bulk action
// stayed disabled with no recap until a reload. 30s is deliberately generous: it must never fire
// on a slow-but-alive request, because a false abort here looks to the user exactly like a
// failure. Batches are bounded by their own signal, not by this.
export const REQUEST_TIMEOUT_MS = 30_000;

// Typed so callers can tell "you (or the clock) cancelled this" apart from "the network failed".
// Same shape as RateLimitError: pages branch on `instanceof`, never on a message.
export class RequestAbortedError extends Error {
  readonly timedOut: boolean;
  constructor(timedOut: boolean) {
    super(timedOut
      ? 'The request took too long and was cancelled.'
      : 'The request was cancelled.');
    this.name = 'RequestAbortedError';
    this.timedOut = timedOut;
  }
}

// Merge the caller's signal with our timeout into ONE signal handed to fetch. Written by hand
// rather than with AbortSignal.any(): jsdom does not implement it, so the tests would exercise a
// different code path than the browser — the exact kind of gap this project keeps getting bitten by.
function withDeadline(init: RequestInit | undefined) {
  const controller = new AbortController();
  const callerSignal = init?.signal;

  if (callerSignal?.aborted) controller.abort();
  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', onCallerAbort);

  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);

  return {
    signal: controller.signal,
    // MUST be called on every exit path, including the ones that never resolve — a leaked timer
    // keeps a jsdom test alive and, in the browser, fires an abort on a request already done.
    release: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
    wasTimeout: () => timedOut,
  };
}

// Inject the CSRF token (story 7.3) on a mutating request, preserving existing headers.
function withCsrfHeader(init: RequestInit | undefined, token: string): RequestInit {
  return { ...init, headers: { ...(init?.headers as Record<string, string>), 'X-CSRF-Token': token } };
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const deadline = withDeadline(init);
  // Every fetch below carries the merged signal, the CSRF replay INCLUDED — it is a second
  // fetch, and leaving it unsignalled would keep one non-cancellable request precisely on the
  // write path.
  const bounded: RequestInit = { ...init, signal: deadline.signal };

  let res: Response;
  try {
    if (MUTATING_METHODS.has(method)) {
      const token = await getCsrfToken();
      res = await fetch(input, withCsrfHeader(bounded, token));
      // Retry ONLY on a CSRF rejection (token rotated, e.g. session changed), which
      // the server flags with X-CSRF-Token-Invalid. A bare 403 is a legitimate
      // authorization failure (non-owner, system topic) and must not be replayed.
      if (res.status === 403 && res.headers.get('X-CSRF-Token-Invalid')) {
        const fresh = await getCsrfToken(true);
        res = await fetch(input, withCsrfHeader(bounded, fresh));
      }
    } else {
      res = await fetch(input, bounded);
    }
  } catch (error) {
    deadline.release();
    // Translate the DOMException. A raw AbortError is indistinguishable from a network failure
    // at the call site — which is what made an abandoned batch impossible to report honestly.
    if (deadline.signal.aborted) throw new RequestAbortedError(deadline.wasTimeout());
    throw error;
  }
  // Released on every path from here on, including the 401 that never settles.
  deadline.release();

  if (res.status === 401 && window.location.pathname !== '/login') {
    localStorage.removeItem('user');
    window.location.assign('/login');
    // The page is navigating away to /login. Hang instead of resolving: if we
    // returned the 401 response, the caller's `if (!res.ok) throw` would set a
    // misleading data error ("Heatmap could not be loaded") and flash it for a
    // tick before the full reload tears the document down — the exact dead-end
    // this story removes. The pending promise is reclaimed by the reload.
    return new Promise<Response>(() => { /* never settles: navigating to /login */ });
  }

  // A rate-limited auth endpoint (story 7.4 limiters) replies 429. Surface it as a
  // typed error so callers show a clear "too many attempts" message instead of a
  // generic failure (story 15.1). Detail-free: no RateLimit-*/Retry-After is read —
  // only the status. Covers resend / forgot-password / change-password / change-email
  // (all go through apiFetch); /auth/login uses raw fetch and checks 429 itself.
  if (res.status === 429) {
    throw new RateLimitError();
  }

  return res;
}
