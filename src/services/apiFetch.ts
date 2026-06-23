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

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Inject the CSRF token (story 7.3) on a mutating request, preserving existing headers.
function withCsrfHeader(init: RequestInit | undefined, token: string): RequestInit {
  return { ...init, headers: { ...(init?.headers as Record<string, string>), 'X-CSRF-Token': token } };
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();

  let res: Response;
  if (MUTATING_METHODS.has(method)) {
    const token = await getCsrfToken();
    res = await fetch(input, withCsrfHeader(init, token));
    // Retry ONLY on a CSRF rejection (token rotated, e.g. session changed), which
    // the server flags with X-CSRF-Token-Invalid. A bare 403 is a legitimate
    // authorization failure (non-owner, system topic) and must not be replayed.
    if (res.status === 403 && res.headers.get('X-CSRF-Token-Invalid')) {
      const fresh = await getCsrfToken(true);
      res = await fetch(input, withCsrfHeader(init, fresh));
    }
  } else {
    res = await fetch(input, init);
  }

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

  return res;
}
