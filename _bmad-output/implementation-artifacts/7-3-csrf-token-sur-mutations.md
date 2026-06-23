---
baseline_commit: 47276f1c439801359c546b8980fcef7f5fdbe260
---

# Story 7.3: Protéger toutes les mutations par un token CSRF

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur authentifié,
I want que toute requête mutante exige un token CSRF valide,
so that une page tierce ne peut pas agir en mon nom (défense en profondeur par-dessus SameSite=Lax).

## Acceptance Criteria

1. **Endpoint token** — `GET /api/csrf-token` (session existante ou créée) renvoie `{ csrfToken }` : un **synchronizer token par session**, stocké côté session (store Postgres en prod).
2. **Garde middleware** — toute requête **non-GET** (POST/PUT/PATCH/DELETE) sans en-tête `X-CSRF-Token` valide est rejetée avec un statut **normalisé/générique** (403, sans détail révélateur). Les routes **GET** ne sont pas soumises au check.
3. **Injection front centralisée** — le helper lit le token et l'injecte en `X-CSRF-Token` sur **toutes** les mutations, en **un seul point** (`apiFetch` pour les services de domaine + `authService` pour les POST pré-auth).
4. **POST pré-auth** — login/register récupèrent d'abord le token via `GET /api/csrf-token` puis l'envoient ; le middleware couvre **aussi** ces routes.
5. **`logout` GET→POST** — `logout` (seul GET state-changing) devient un POST protégé par CSRF ; audit : aucune autre mutation ne reste en GET.
6. **Tests** — back : le middleware rejette une mutation sans token et accepte avec token valide ; front : `apiFetch` injecte l'en-tête sur une mutation.

## Tasks / Subtasks

- [x] **Task 1 — Middleware CSRF backend** (AC: 1, 2)
  - [x] Créer `backend/middleware/csrf.js` (CommonJS, commentaires EN). Logique : si `!req.session.csrfToken` → générer `crypto.randomBytes(32).toString('hex')` et le stocker en session. Méthodes sûres (`GET`/`HEAD`/`OPTIONS`) → `next()` sans check. Sinon comparer `req.get('X-CSRF-Token')` au token de session en **temps constant** (`crypto.timingSafeEqual`, après garde de longueur) → si absent/invalide `next(createError(403, 'Forbidden'))` (générique).
  - [x] Monter le middleware sur le routeur `/api` **après** la session, **avant** les routes : dans `backend/routes/index.js`, `router.use(csrf)` en tête (avant la route `/` et les sous-routeurs).
  - [x] Ajouter la route `router.get('/csrf-token', (req, res) => res.json({ csrfToken: req.session.csrfToken }))` (pas d'`authsess` — accessible pré-auth ; le middleware a déjà garanti le token).
- [x] **Task 2 — `logout` GET→POST** (AC: 5)
  - [x] `backend/routes/auth.js` : `router.get('/logout', ...)` → `router.post('/logout', ...)`.
  - [x] **Audit** : `grep` des routes pour toute autre mutation en GET (`router.get` qui modifie l'état) — il ne doit en rester aucune. Documenter le résultat.
- [x] **Task 3 — Helper CSRF front + injection centralisée** (AC: 3, 4)
  - [x] Créer `src/services/csrf.ts` : `getCsrfToken(forceRefresh = false)` qui `GET /api/csrf-token` (`credentials:'include'`), **met en cache** le token au niveau module ; `clearCsrfToken()` pour invalider le cache.
  - [x] `src/services/apiFetch.ts` : pour les méthodes mutantes (`POST/PUT/PATCH/DELETE`), récupérer le token via `getCsrfToken()` et l'injecter en `X-CSRF-Token` (fusionner avec les headers existants, sans écraser `Content-Type`). **Retry unique** : si la réponse est `403`, `getCsrfToken(true)` (token rafraîchi après rotation de session) puis rejouer la requête une fois. Conserver le handling 401 existant intact.
  - [x] `src/services/authService.ts` : `login`/`register` (fetch brut, pré-auth) → `getCsrfToken()` d'abord, puis injecter `X-CSRF-Token`. `logout` → méthode **POST** + `X-CSRF-Token`, puis `clearCsrfToken()` (la session est détruite, le token est périmé).
- [x] **Task 4 — Tests** (AC: 6)
  - [x] `backend/__tests__/csrf.test.js` : middleware — GET passe sans token ; POST sans header → 403 ; POST avec mauvais token → 403 ; POST avec token = `req.session.csrfToken` → `next()` sans erreur ; génère un token si absent en session.
  - [x] `src/__tests__/apiFetch.test.ts` (existant) : ajouter — une mutation injecte `X-CSRF-Token` (mock `fetch` : 1er appel `/csrf-token` → `{csrfToken}`, 2e = la mutation portant l'en-tête) ; le handling 401 existant reste vert.
  - [x] Suites back + front + lint, husky vert sans `--no-verify`.

### Review Findings

_Code review 2026-06-23 — 3 couches. AC1–AC6 toutes satisfaites. 2 patches, 3 deferred, dismissed (CORS origine = allowlist figée, pas de reflet ; robustesse mocks)._

_Suivi 2026-06-23 : les 2 patches (High + Med) ont été appliqués et testés (back 148 / front 241 verts). Les 3 deferred restent reportés (déjà tracés dans deferred-work.md)._

_Revue #2 (2026-06-23, post-patches) : aucun bug de correction confirmé dans le diff 7.3. Un finding de cohérence (faible) corrigé en marge : `playlistService.addSongToPlaylist`/`removeSongFromPlaylist` omettaient `credentials: 'include'` (inoffensif en same-origin, mais incohérent + landmine si cross-origin un jour). Aligné sur le reste des services._

- [x] [Review][Patch][High] `apiFetch` rejoue **tout** 403 (refetch token + ré-émission), or des 403 d'autorisation **légitimes** existent sur les routes mutantes (ex. « Cannot edit the system topic », PUT/DELETE non-owner) → double-soumission + aller-retour inutile. **Fix** : marquer le rejet CSRF côté serveur (en-tête `X-CSRF-Token-Invalid`) et ne rejouer que sur ce marqueur. [apiFetch.ts + csrf.js + server.js expose-header] — ✅ résolu 2026-06-23 : `csrf.js` pose `X-CSRF-Token-Invalid: 1` sur tous ses rejets (helper `reject`), `server.js` l'expose via `Access-Control-Expose-Headers`, `apiFetch` ne rafraîchit+rejoue que si le marqueur est présent. Test ajouté : 403 d'autz (sans marqueur) → pas de retry.
- [x] [Review][Patch][Med] `logout` non résilient : si `getCsrfToken()` throw (réseau) ou si le POST renvoie 403, l'état client n'est pas nettoyé (UI bloquée « connecté ») / l'erreur remonte. **Fix** : logout best-effort — toujours `clearCsrfToken()` + purge `localStorage` même si l'appel serveur échoue. [authService.ts] — ✅ résolu 2026-06-23 : `logout` enveloppe l'appel serveur dans `try/catch` + nettoie l'état client dans `finally`. Test ajouté : token fetch en échec réseau → logout résout quand même et vide `localStorage`.
- [x] [Review][Defer][Med] **Fixation de session** : `loginUser`/`createUser` ne `regenerate()` pas la session → l'id de session + le token CSRF mintés en pré-auth survivent au passage authentifié. Pré-existant (login n'a jamais régénéré) ; relève d'une passe durcissement session. [usercontroller.js] — deferred-work
- [x] [Review][Defer][Low] `getCsrfToken` : pas de dé-duplication de la requête en vol → N mutations concurrentes au cold-start font N appels `/csrf-token`. [csrf.ts] — deferred-work
- [x] [Review][Defer][Low] `withCsrfHeader` suppose des headers objet simple ; un `Headers`/array casserait le merge (non atteint aujourd'hui, tous les appelants passent un objet). [apiFetch.ts] — deferred-work

## Dev Notes

### Contexte & design retenu

CSRF en **synchronizer token** : un token aléatoire par session (stocké server-side dans le store de session Postgres), exposé au front via `GET /api/csrf-token`, ré-émis par le front en en-tête `X-CSRF-Token` sur **toute mutation**, comparé server-side. Défense en profondeur au-dessus de `SameSite=Lax` (déjà posé sur le cookie). **Hand-rolled, sans lib** (csurf est déprécié ; le besoin est simple). [Source: architecture.md#API & Communication Patterns, #Format Patterns]

### Chokepoint front (déjà existant — à exploiter, ne PAS réinventer)

- **Les services de domaine passent déjà par `apiFetch`** (`topicService`, `songService`, `playlistService`, `instrumentService`, `practiceSessionService`, `songPlayService`, `songLinksService`). Injecter le token **dans `apiFetch`** couvre donc toutes leurs mutations d'un coup. [Source: src/services/*.ts]
- **Seul `authService` utilise `fetch` brut** (login/register/logout, volontairement hors `apiFetch` car 401 = mauvais identifiants, pas une session morte). → traiter login/register/logout **explicitement** dans `authService`.
- Forme d'une mutation service : `apiFetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(...), credentials:'include' })`. Fusionner l'en-tête CSRF sans casser `Content-Type`.

### État actuel des fichiers touchés (lu)

- **`src/services/apiFetch.ts`** — wrapper `fetch` qui intercepte **uniquement le 401** (→ purge `localStorage('user')` + redirect `/login`, story 5.1). Ne PAS toucher ce comportement 401. Le CSRF s'ajoute en amont pour les mutations ; un **403** (échec CSRF) ne doit PAS déclencher le redirect 401 — il est géré par le retry.
- **`src/services/authService.ts`** — `register`/`login`/`logout` en `fetch` brut, `credentials:'include'`, `Content-Type: application/json`. `logout` est aujourd'hui un **GET**. `AuthContext.logout()` → `authService.logout()` ; boutons dans `Header.tsx`/`PageHeader.tsx` (aucun changement d'appelant requis, juste la méthode interne).
- **`backend/routes/index.js`** — routeur `/api` ; monte les sous-routeurs après une route `/`. C'est là que va `router.use(csrf)` + la route `/csrf-token`.
- **`backend/routes/auth.js`** — `post('/register')`, `post('/login')`, **`get('/logout')`**. Utilise `body-parser` (transitif ; ne pas l'étendre — préférer `express.json()` déjà monté globalement, mais hors-scope ici).
- **`backend/server.js`** — `app.use(session(...))` puis CORS puis `app.use('/api', indexRouter)`. `X-CSRF-Token` doit être autorisé par CORS (`Access-Control-Allow-Headers`) — **l'ajouter** (actuellement `Origin, X-Requested-With, Content-Type, Accept`).

### Pièges à éviter

- **CORS** : ajouter `X-CSRF-Token` à `Access-Control-Allow-Headers` dans `server.js`, sinon le navigateur bloque l'en-tête custom (même origine ici, mais explicite = sûr).
- **`saveUninitialized:false`** : poser `req.session.csrfToken` **initialise** la session → cookie émis. C'est voulu : `GET /api/csrf-token` crée la session pré-auth.
- **`timingSafeEqual`** exige des buffers de même longueur → garder la garde de longueur avant l'appel.
- **Rotation de session** : après `logout` (session détruite) le token caché front est périmé → `clearCsrfToken()` au logout + retry-sur-403 dans `apiFetch` couvrent le cas.
- **Rejet générique** : 403 `'Forbidden'` sans détail (anti-oracle), cohérent avec le collapse 403→404/normalisation de l'epic. [Source: architecture.md#Enforcement]
- Backend **CommonJS**, `http-errors`, commentaires EN. Front **TS strict** + `verbatimModuleSyntax` (imports de type en `import type`). [Source: project-context.md]

### Project Structure Notes

- NEW : `backend/middleware/csrf.js`, `src/services/csrf.ts`, `backend/__tests__/csrf.test.js`.
- EDIT : `backend/routes/index.js`, `backend/routes/auth.js`, `backend/server.js` (CORS header), `src/services/apiFetch.ts`, `src/services/authService.ts`, `src/__tests__/apiFetch.test.ts`.
- Convention : middleware en minuscules collées (`csrf.js`), cf. `authsess.js`. [Source: architecture.md#Structure Patterns]
- Couvrira automatiquement forgot-password/reset (7.10) et les flux 7.7/7.8/7.11 dès qu'ils passent par `apiFetch`/`authService`.

### References

- [Source: epics.md#Story 7.3] — ACs
- [Source: architecture.md#API & Communication Patterns] — synchronizer token, `GET /api/csrf-token`, `X-CSRF-Token`, logout GET→POST
- [Source: architecture.md#Structure Patterns / #Format Patterns / #Enforcement] — emplacement middleware, header exact, rejet normalisé
- [Source: src/services/apiFetch.ts, authService.ts, topicService.ts] — chokepoint et forme des mutations
- [Source: 7-1/7-2 stories] — secrets/session déjà durcis ; sessions par cookie `credentials:'include'`

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Audit GET mutants : seul `auth/logout` mutait (détruit la session) → passé en POST. Tous les autres `router.get` sont en lecture seule (`markSongPlayed` est déjà POST).
- Smoke e2e sur le stack dev : `GET /api/csrf-token` → 200 + token ; `POST /login` **sans** header → **403** ; **avec** header → **400** (passe le CSRF, atteint le contrôleur).
- Tests : backend 148 (+6 csrf) ✓ + lint ✓ ; frontend 238 (+2 injection) ✓ ; `tsc -b` exit 0.
- Audit `fetch(` hors services : vide → toutes les mutations passent par `apiFetch`/`authService`.

### Completion Notes List

- **AC1/AC2 (middleware)** : `backend/middleware/csrf.js` — mint lazy `crypto.randomBytes(32).hex` en session, exempte GET/HEAD/OPTIONS, compare `X-CSRF-Token` en temps constant (`timingSafeEqual` + garde de longueur), rejet 403 générique. Monté en tête du routeur `/api` (`routes/index.js`) + route `GET /api/csrf-token`.
- **AC5 (logout)** : `routes/auth.js` `get('/logout')` → `post('/logout')`. CORS : `X-CSRF-Token` ajouté à `Access-Control-Allow-Headers` (`server.js`).
- **AC3/AC4 (front)** : `src/services/csrf.ts` (cache module + `clearCsrfToken`) ; `apiFetch` injecte le token sur les mutations + **retry unique sur 403** (token rafraîchi) ; `authService` login/register récupèrent le token avant le POST, `logout` en POST + token + `clearCsrfToken`. Le handling 401 (story 5.1) est préservé.
- **AC6 (tests)** : `csrf.test.js` (6 cas) ; `apiFetch.test.ts` (injection + retry 403) ; tests `authService`/`songPlayService` existants adaptés au round-trip token.
- **Décisions** : synchronizer token maison (zéro dep) ; CSRF aussi sur login/register pré-auth.
- ✅ Résolu review finding [High] : retry CSRF discriminé par marqueur serveur `X-CSRF-Token-Invalid` (helper `reject` dans `csrf.js` + `Access-Control-Expose-Headers` dans `server.js` + garde sur le marqueur dans `apiFetch`). Les 403 d'autorisation légitimes ne sont plus rejoués.
- ✅ Résolu review finding [Med] : `authService.logout` best-effort (`try/catch` + nettoyage état client en `finally`) — la déconnexion aboutit même backend mort / réseau coupé.
- Tests post-revue : `csrf.test.js` asserte le marqueur sur rejet / absent sur succès (mock `res.set`) ; `apiFetch.test.ts` ajoute « 403 d'autz sans marqueur → pas de retry » ; `authService.test.ts` ajoute le logout best-effort (échec réseau + succès). Back 148 / front 241 verts ; `tsc -b` + lints OK.

### File List

- `backend/middleware/csrf.js` (NEW)
- `backend/__tests__/csrf.test.js` (NEW)
- `backend/routes/index.js` (EDIT — mount csrf + /csrf-token)
- `backend/routes/auth.js` (EDIT — logout GET→POST)
- `backend/server.js` (EDIT — CORS header X-CSRF-Token)
- `src/services/csrf.ts` (NEW)
- `src/services/apiFetch.ts` (EDIT — injection + retry 403)
- `src/services/authService.ts` (EDIT — token sur login/register/logout)
- `src/__tests__/apiFetch.test.ts` (EDIT — tests CSRF)
- `src/__tests__/authService.test.ts` (EDIT — mock token)
- `src/__tests__/songPlayService.test.ts` (EDIT — mock token)
- `src/services/playlistService.ts` (EDIT — revue #2 : `credentials: 'include'` manquant sur add/remove song)

### Change Log

- 2026-06-23 — Story 7.3 : protection CSRF (synchronizer token) sur toutes les mutations. Middleware backend + endpoint token + logout GET→POST + CORS ; injection front centralisée (`apiFetch` + `authService`) avec retry sur 403. Validé e2e (403 sans token / 400 avec). Back 148 / front 238 verts.
- 2026-06-23 — Suivi code review : 2 findings résolus (1 High, 1 Med). [High] retry CSRF discriminé par marqueur serveur `X-CSRF-Token-Invalid` (plus de rejeu des 403 d'autorisation). [Med] `logout` best-effort. Back 148 / front 241 verts.

## Open Questions — RÉSOLUES (2026-06-23)

1. ✅ **Synchronizer token maison** (zéro dépendance ; csurf déprécié).
2. ✅ **CSRF aussi sur login/register pré-auth** (conforme archi ; le front fait un `GET /api/csrf-token` avant le POST).
