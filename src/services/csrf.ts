// CSRF synchronizer-token helper (story 7.3). Fetches the per-session token from
// the backend once and caches it at module scope; every mutation echoes it in the
// X-CSRF-Token header. The cache is cleared on logout (session destroyed) and
// refreshed on a 403 (token rotated), so callers never hold a stale token.
const API_BASE = '/api';

let cachedToken: string | null = null;

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (cachedToken && !forceRefresh) {
    return cachedToken;
  }
  const res = await fetch(`${API_BASE}/csrf-token`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Failed to obtain CSRF token');
  }
  const data = await res.json();
  cachedToken = data.csrfToken;
  return cachedToken as string;
}

export function clearCsrfToken(): void {
  cachedToken = null;
}
