import { apiFetch, REQUEST_TIMEOUT_MS, RequestAbortedError } from '../services/apiFetch';
import { clearCsrfToken } from '../services/csrf';
import { RateLimitError } from '../services/rateLimit';

// Flush pending microtasks/timers so the post-fetch interceptor body runs
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('apiFetch — 401 interceptor', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;
  let assignMock: jest.Mock;

  function setLocation(pathname: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname, assign: assignMock },
    });
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify({ uid: 'u1' }));
    assignMock = jest.fn();
    setLocation('/my-sessions');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // Restore the real location so the stub never leaks into another test
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  test('a 401 clears the stored user and redirects to /login (and never resolves)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false }) as unknown as typeof fetch;

    let settled = false;
    // Do NOT await: on 401 the promise intentionally hangs (page is navigating)
    apiFetch('/api/sessions', { credentials: 'include' }).then(() => { settled = true; });
    await flush();

    expect(localStorage.getItem('user')).toBeNull();
    expect(assignMock).toHaveBeenCalledWith('/login');
    expect(settled).toBe(false); // hung, so the caller never throws a data error
  });

  test('a 401 while already on /login does NOT redirect (no loop) and resolves', async () => {
    setLocation('/login');
    global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false }) as unknown as typeof fetch;

    const res = await apiFetch('/api/auth/me', { credentials: 'include' });

    expect(assignMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).not.toBeNull();
    expect((res as unknown as { status: number }).status).toBe(401);
  });

  test('a 200 passes through untouched', async () => {
    const ok = { status: 200, ok: true };
    global.fetch = jest.fn().mockResolvedValue(ok) as unknown as typeof fetch;

    const res = await apiFetch('/api/sessions', { credentials: 'include' });

    expect(res).toBe(ok);
    expect(assignMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).not.toBeNull();
  });

  test('a non-401 error (500) is returned as-is, no redirect (the caller still throws)', async () => {
    const serverError = { status: 500, ok: false };
    global.fetch = jest.fn().mockResolvedValue(serverError) as unknown as typeof fetch;

    const res = await apiFetch('/api/sessions', { credentials: 'include' });

    expect(res).toBe(serverError);
    expect(assignMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).not.toBeNull();
  });

  test('a 429 throws a RateLimitError, not the raw response (story 15.1)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 429, ok: false }) as unknown as typeof fetch;

    await expect(apiFetch('/api/auth/forgot-password', { method: 'GET' })).rejects.toBeInstanceOf(RateLimitError);
    expect(assignMock).not.toHaveBeenCalled(); // 429 is not a session-expiry 401
  });

  test('a network rejection propagates and does NOT redirect (AC3)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(apiFetch('/api/sessions', { credentials: 'include' })).rejects.toThrow('network down');
    expect(assignMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).not.toBeNull();
  });

  test('forwards a GET url and init to fetch unchanged (safe method, no CSRF)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    const init = { credentials: 'include' as const };

    await apiFetch('/api/sessions', init);

    // Depuis la story 24.2, init n'est plus transmis STRICTEMENT tel quel : apiFetch y attache
    // un signal (borne de durée + annulation). L'intention du test est inchangée — une méthode
    // sûre passe sans machinerie CSRF — donc on vérifie les champs de l'appelant ET le signal,
    // au lieu de relâcher l'assertion en `expect.anything()`.
    const [url, passed] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/sessions');
    expect(passed.credentials).toBe('include');
    expect(passed.signal).toBeInstanceOf(AbortSignal);
    expect(passed.signal.aborted).toBe(false);
  });
});

describe('apiFetch — CSRF injection (story 7.3)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('a mutation fetches the token then injects X-CSRF-Token', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'tok-123' }) }) // GET /csrf-token
      .mockResolvedValueOnce({ status: 201, ok: true }); // the mutation
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('/api/topics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/csrf-token', { credentials: 'include' });
    const [, mutationInit] = fetchMock.mock.calls[1];
    expect(mutationInit.headers['X-CSRF-Token']).toBe('tok-123');
    expect(mutationInit.headers['Content-Type']).toBe('application/json'); // existing header preserved
  });

  // A response carrying the server's CSRF-failure marker (X-CSRF-Token-Invalid).
  const csrfRejected = { status: 403, ok: false, headers: { get: (h: string) => (h === 'X-CSRF-Token-Invalid' ? '1' : null) } };
  // A legitimate authorization 403 (non-owner, system topic) — no marker.
  const authzRejected = { status: 403, ok: false, headers: { get: () => null } };

  test('a CSRF-flagged 403 refreshes the token and retries the mutation once', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'stale' }) }) // first token
      .mockResolvedValueOnce(csrfRejected) // mutation rejected by CSRF guard
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'fresh' }) }) // refreshed token
      .mockResolvedValueOnce({ status: 200, ok: true }); // retry succeeds
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await apiFetch('/api/topics/1', { method: 'DELETE' });

    expect((res as unknown as { status: number }).status).toBe(200);
    expect(fetchMock.mock.calls[1][1].headers['X-CSRF-Token']).toBe('stale');
    expect(fetchMock.mock.calls[3][1].headers['X-CSRF-Token']).toBe('fresh');
  });

  test('a plain authorization 403 (no CSRF marker) is returned as-is, not retried', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'tok' }) }) // token
      .mockResolvedValueOnce(authzRejected); // authz failure — must NOT trigger refresh/replay
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await apiFetch('/api/topics/1', { method: 'DELETE' });

    expect(res).toBe(authzRejected);
    expect(fetchMock).toHaveBeenCalledTimes(2); // token + single mutation, no retry
  });
});

// ---------------------------------------------------------------------------
// Story 24.2 — bornes de durée et annulation
// ---------------------------------------------------------------------------
// Aucun appel n'était borné ni annulable : une requête qui ne répond jamais
// laissait une fonctionnalité morte jusqu'au rechargement, et un lot abandonné
// continuait d'écrire en silence.

describe('apiFetch — annulation et timeout (story 24.2)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

  test('une requête qui ne répond jamais est bornée, et l\'erreur dit que c\'est un timeout', async () => {
    jest.useFakeTimers();
    // Le vrai fetch REJETTE quand son signal s'abaisse. Un mock qui ignore le signal ne
    // reproduit pas le navigateur — et le test attendrait alors une promesse qui ne vient
    // jamais, en accusant le code à tort.
    global.fetch = jest.fn((_input, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })) as unknown as typeof fetch;

    const promise = apiFetch('/api/songs');
    // `name` reste 'AbortError' (contrat corrigé en review) ; le type porte le détail.
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError', timedOut: true });
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS + 10);
    await assertion;
  });

  test('une requête normale n\'est PAS annulée par le timeout', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true }) as unknown as typeof fetch;

    const res = await apiFetch('/api/songs');
    expect((res as unknown as { status: number }).status).toBe(200);
    // Le minuteur ne doit pas rester armé derrière une requête aboutie.
    expect(jest.getTimerCount()).toBe(0);
  });

  test('une annulation par l\'appelant rejette avec l\'erreur typée, timedOut à false', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn((_input, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })) as unknown as typeof fetch;

    const promise = apiFetch('/api/songs', { signal: controller.signal });
    controller.abort();

    // Distinguable d'un échec réseau : c'est toute la valeur du type.
    await expect(promise).rejects.toMatchObject({ name: 'AbortError', timedOut: false });
  });

  test('le signal de l\'appelant atteint AUSSI le rejeu CSRF', async () => {
    // Le rejeu est un SECOND fetch : l'oublier laissait une requête non annulable,
    // précisément sur le chemin des écritures.
    const controller = new AbortController();
    const csrfRejected = { status: 403, ok: false, headers: { get: (h: string) => (h === 'X-CSRF-Token-Invalid' ? '1' : null) } };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'stale' }) })
      .mockResolvedValueOnce(csrfRejected)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'fresh' }) })
      .mockResolvedValueOnce({ status: 200, ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    clearCsrfToken();

    await apiFetch('/api/topics/1', { method: 'DELETE', signal: controller.signal });

    const retryInit = fetchMock.mock.calls[3][1];
    expect(retryInit.signal).toBeDefined();
    expect(retryInit.signal.aborted).toBe(false);
  });

  test('le chemin 401 reste DÉLIBÉRÉMENT non borné — il est suivi d\'un rechargement', async () => {
    // Décision AC2 : la promesse du 401 ne se règle jamais parce que la page navigue
    // vers /login. Un timeout qui la ferait rejeter réintroduirait exactement l'erreur
    // de données trompeuse que la story 5.1 avait supprimée.
    jest.useFakeTimers();
    localStorage.setItem('user', JSON.stringify({ uid: 'u1' }));
    Object.defineProperty(window, 'location', {
      configurable: true, value: { pathname: '/songs', assign: jest.fn() },
    });
    global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false }) as unknown as typeof fetch;

    let rejected = false;
    apiFetch('/api/songs').catch(() => { rejected = true; });
    await Promise.resolve();
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS * 3);
    await Promise.resolve();

    expect(rejected).toBe(false);
    expect(jest.getTimerCount()).toBe(0); // le minuteur est libéré, il ne fuit pas
  });
});

// ---------------------------------------------------------------------------
// Correctifs des 2 bloquants de la code review (story 24.2)
// ---------------------------------------------------------------------------

describe('apiFetch — compatibilité des gardes AbortError existants', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); clearCsrfToken(); });

  test('BLOQUANT 1 — l\'erreur d\'annulation reste reconnue par `err.name === "AbortError"`', async () => {
    // 8 endroits dans src/pages ignorent une requête SUPPLANTÉE avec ce test exact
    // (recherche, filtre, pagination). Un nom nouveau les tue toutes en silence, et la page
    // Catalog affiche alors un « Something went wrong. » permanent sur une simple recherche.
    const controller = new AbortController();
    global.fetch = jest.fn((_i, init?: RequestInit) => new Promise((_r, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })) as unknown as typeof fetch;

    const promise = apiFetch('/api/songs', { signal: controller.signal });
    controller.abort();

    const err = await promise.catch(e => e);
    expect(err.name).toBe('AbortError');            // les 8 gardes continuent de fonctionner
    expect(err).toBeInstanceOf(RequestAbortedError); // et le typage reste disponible
    expect(err.timedOut).toBe(false);
  });

  test('une VRAIE erreur réseau n\'est pas maquillée en annulation', async () => {
    // Classer d'après l'état du signal plutôt que d'après l'erreur relabellisait un échec
    // réseau tombant dans le même tick qu'un abandon.
    const controller = new AbortController();
    global.fetch = jest.fn(async () => { controller.abort(); throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;

    const err = await apiFetch('/api/songs', { signal: controller.signal }).catch(e => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(RequestAbortedError);
  });

  test('BLOQUANT 2 — une écriture dont le jeton CSRF ne répond jamais est BORNÉE', async () => {
    // csrf.ts fait un fetch SANS signal, et apiFetch l'attend avant le sien : tous les
    // POST/PUT/PATCH/DELETE pouvaient donc pendre indéfiniment — soit exactement ce que
    // cette story existe pour supprimer, sur le chemin qui compte le plus.
    jest.useFakeTimers();
    clearCsrfToken();
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch; // le jeton ne vient jamais

    const promise = apiFetch('/api/topics/1', { method: 'DELETE' });
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError', timedOut: true });
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS + 10);
    await assertion;
  });
});
