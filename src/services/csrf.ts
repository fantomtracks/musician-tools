// CSRF synchronizer-token helper (story 7.3). Fetches the per-session token from
// the backend once and caches it at module scope; every mutation echoes it in the
// X-CSRF-Token header. The cache is cleared on logout (session destroyed) and
// refreshed on a 403 (token rotated), so callers never hold a stale token.
const API_BASE = '/api';

let cachedToken: string | null = null;
// Dedup concurrent cold-start fetches: at first paint several mutations may call
// getCsrfToken() before any token is cached. Without this, each fires its own
// /csrf-token request (thundering herd). They now share one in-flight promise.
let inFlight: Promise<string> | null = null;

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (cachedToken && !forceRefresh) {
    return cachedToken;
  }
  if (inFlight && !forceRefresh) {
    return inFlight;
  }
  const request = (async () => {
    const res = await fetch(`${API_BASE}/csrf-token`, { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Failed to obtain CSRF token');
    }
    const data = await res.json();
    cachedToken = data.csrfToken;
    return cachedToken as string;
  })();
  inFlight = request;
  try {
    return await request;
  } finally {
    // Only clear if a later forceRefresh hasn't already replaced the in-flight one.
    if (inFlight === request) {
      inFlight = null;
    }
  }
}

export function clearCsrfToken(): void {
  cachedToken = null;
  inFlight = null;
}
