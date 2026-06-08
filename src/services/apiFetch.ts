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
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);

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
