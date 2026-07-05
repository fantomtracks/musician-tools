---
baseline_commit: 9594f61
arch_decision: "Détecter le 429 par response.status (JAMAIS par body.message) et le mapper vers une classe partagée RateLimitError (copie canonique detail-free), sur le modèle de PlaylistConflictError/TopicConflictError. Détection centralisée dans apiFetch (throw RateLimitError sur 429 avant le return → couvre resend, forgot-password, change-password, change-email qui passent tous par apiFetch) + check explicite dans authService.login (raw fetch, ne passe pas par apiFetch). Les pages rendent le message en amber (distinct du red des erreurs credential/champ) via `err instanceof RateLimitError`."
---

# Story 15.1: Signal UX du rate-limit (429 lisible et distinct)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur légitime rate-limité (login, resend, forgot-password, change-password, change-email),
I want un message clair et traduit m'indiquant que j'ai fait trop de tentatives,
so that je ne le confonde pas avec une erreur d'identifiants ou une erreur générique.

## Contexte & pourquoi

Issu de la revue `deferred-work.md` (item **A5 « signal UX du rate-limit légitime »**, rétro Epic 7). Première story de l'**Epic 15 (signal UX rate-limit + anti-oracle)**, cadrage sécu verrouillé le 2026-07-05. Story **front pure**, sécu-sensible, exécution légère. Indépendante de 15.2 (back, latence). **Couvre NFR-S1.**

**Le problème (vérifié dans le code).** Les 5 limiters (story 7.4, `backend/middleware/ratelimiters.js`) répondent tous via `next(createError(429))` → le error handler global renvoie `{ message: "Too Many Requests" }`. Côté front :
- **`authService.login`** (`src/services/authService.ts:82-97`) fait `throw new Error(body.message || 'Login failed')` → la string brute **« Too Many Requests »** s'affiche dans **le même emplacement rouge** que « Invalid credentials » (`LoginPage.tsx:43` → `setError`). L'utilisateur croit s'être trompé de mot de passe.
- **`verificationService.resend` / `passwordResetService.requestReset` / `profileService.changePassword` / `profileService.requestEmailChange`** passent par `apiFetch` puis `if (!res.ok) throw new Error('...générique...')` → un 429 devient « Could not resend the verification email », « Could not process the request », etc. → aucun signal « tu as trop essayé ».

**Insight de cadrage (repris de l'epic).** Améliorer le message `429` est du **pur UX sans coût sécu** : le `429` est déjà observable et ne révèle **pas** l'existence d'un compte (les limiters de login/forgot sont keyés IP ; resend/change keyés user). Le seul secret à garder est **`Retry-After` / la fenêtre exacte** (qui aiderait un attaquant à cadencer un brute-force) — et il n'est **déjà pas exposé** (`ratelimiters.js` : `standardHeaders:false, legacyHeaders:false`, aucun `Retry-After`). On ne consomme donc **aucun** header ; on affiche une formulation **qualitative** seule.

**Périmètre :** front uniquement (1 classe d'erreur partagée + `apiFetch` + `authService.login` + 5 points d'affichage dans 4 pages) + tests front. **Aucune** modif backend, **aucune** migration, **aucune** dépendance npm.

## ⚠️ Invariant de sécurité (transverse Epic 15 — à respecter absolument)

**DETAIL-FREE.** Le message reste une formulation **qualitative** : « Too many attempts. Please try again in a few minutes. »
- **Aucun** `Retry-After`, **aucune** fenêtre exacte (15 min / 1 h…), **aucun** compte à rebours, **aucun** nombre de tentatives restantes.
- **Aucun** header `RateLimit-*` / `Retry-After` consommé (ils ne sont de toute façon pas émis — ne pas ajouter de code qui essaie de les lire).
- Détecter le 429 **par `response.status === 429`**, **JAMAIS** par `body.message === 'Too Many Requests'` (fragile, couplé à la copie serveur, et lit un body inutilement).
- Ne PAS révéler quel limiter a déclenché ni son seuil : une seule copie générique pour les 5 points.

## Décision d'architecture (déjà tranchée — à implémenter telle quelle)

1. **Classe `RateLimitError extends Error`** dans un nouveau module partagé **`src/services/rateLimit.ts`**, sur le modèle exact de `PlaylistConflictError` (`playlistService.ts:17-24`) et `TopicConflictError`. Constructeur sans argument, `super('Too many attempts. Please try again in a few minutes.')`, `this.name = 'RateLimitError'`. **La copie canonique vit dans la classe** (une seule source de vérité).
2. **Détection centralisée dans `apiFetch`** (`src/services/apiFetch.ts`) : juste avant le `return res` final, `if (res.status === 429) throw new RateLimitError();`. Couvre d'un coup **resend · forgot-password · change-password · change-email** (tous passent par `apiFetch`). Aucun autre endpoint n'est rate-limité → **zéro régression** pour les autres services qui utilisent `apiFetch`.
3. **`authService.login` ne passe PAS par `apiFetch`** (raw `fetch`, volontairement — cf. commentaire d'entête `apiFetch.ts`). Ajouter un check **explicite** dans `login` : après réception de la réponse, **avant** de lire le body, `if (response.status === 429) throw new RateLimitError();` (sinon le body « Too Many Requests » serait mappé en erreur credential).
4. **Pages** : dans chaque `catch`, tester `err instanceof RateLimitError` en premier → rendre le message en **amber** (`text-amber-700 dark:text-amber-300`, la convention info existante du repo) pour le **distinguer visuellement** du **red** (`text-red-600 dark:text-red-400`) réservé aux erreurs credential/champ. Importer `RateLimitError` depuis `../services/rateLimit`.

**Pourquoi une classe et pas juste le message ?** `err.message` afficherait déjà la bonne copie, mais le style **amber distinct** (exigé par l'AC « visuellement distinct ») nécessite un test de type fiable — `instanceof RateLimitError` — au lieu d'un fragile `err.message.includes('too many')`. C'est aussi le pattern maison (10.2/8.2).

## Acceptance Criteria

### Détection (service)

1. **429 détecté par status, pas par body** — Given un endpoint d'auth rate-limité renvoie `429`, When le front le reçoit, Then il le détecte via `response.status === 429` (**jamais** via `body.message`) et lève une `RateLimitError` portant la copie canonique. Aucun header `RateLimit-*`/`Retry-After` n'est lu.
2. **`apiFetch` lève `RateLimitError` sur 429** — Given un appel via `apiFetch` recevant `429`, Then il **throw `RateLimitError`** (avant le `return res`), sans déclencher la redirection 401 ni le retry CSRF. Les autres statuts et le comportement 401/403-CSRF existants sont **inchangés**.
3. **`authService.login` lève `RateLimitError` sur 429** — Given `authService.login` reçoit `429`, Then il **throw `RateLimitError`** **avant** de lire le body → il ne mappe **jamais** un 429 vers « Login failed » / « Too Many Requests ». Le happy path, le `401` (bad credentials → « Login failed ») et le `403 email_not_verified` (→ `needsVerification`) restent **inchangés**.

### Affichage aux 5 points d'échec (inline, distinct)

4. **Login** — Given un `429` au submit de `LoginPage`, Then le message rate-limit s'affiche **inline** au point d'échec, en **amber**, distinct du rouge « Login failed ».
5. **Verify-email / Resend** (Login **et** Register) — Given un `429` sur `handleResend` (`LoginPage.tsx:49-60`, `RegisterPage.tsx:21-31`, qui aujourd'hui `catch {}` → `resendMessage` générique), Then le slot `resendMessage` affiche la copie rate-limit (au lieu de « Could not send right now… »).
6. **Forgot-password** — Given un `429` sur `ForgotPasswordPage` (`passwordResetService.requestReset`), Then le message rate-limit s'affiche inline, amber, distinct du rouge.
7. **Change-password** — Given un `429` sur le formulaire mot de passe de `ProfilePage` (`profileService.changePassword`), Then `pwError` affiche la copie rate-limit, distinct des messages credential (« Current password is incorrect »).
8. **Change-email** — Given un `429` sur le formulaire email de `ProfilePage` (`profileService.requestEmailChange`), Then `emailError` affiche la copie rate-limit.

### Invariant & non-régression

9. **Detail-free** — Le message affiché aux 5 points est **exactement** « Too many attempts. Please try again in a few minutes. » (qualitatif, aucun délai/fenêtre/compte à rebours/nombre de tentatives). UI en anglais ; dark mode géré (classes `dark:`).
10. **Test dédié** — **Au moins un** test front vérifie que la branche `429` mappe vers la copie « rate-limit » et **NON** vers la copie « erreur d'identifiants »/générique (ex. `authService.login` reçoit `429` → `RateLimitError` ; et/ou `LoginPage` sur 429 affiche le message rate-limit, pas « Login failed »).
11. **Non-régression globale** — Suite front verte ; `tsc -b` + ESLint clean. Aucune modif backend, aucune migration, aucune dépendance npm.

## Tasks / Subtasks

- [x] **T1 — Classe d'erreur partagée** (AC: 1, 9)
  - [x] Créer `src/services/rateLimit.ts` : `export class RateLimitError extends Error` — `super('Too many attempts. Please try again in a few minutes.')`, `this.name = 'RateLimitError'` (miroir de `PlaylistConflictError`).
- [x] **T2 — Détection centralisée `apiFetch`** (AC: 1, 2)
  - [x] Dans `src/services/apiFetch.ts`, importer `RateLimitError` ; juste avant `return res`, ajouter `if (res.status === 429) throw new RateLimitError();`.
  - [x] Vérifier que ça ne perturbe pas le chemin 401 (redirect) ni le retry CSRF 403 (le 429 n'est ni 401 ni 403). — 429 placé après le bloc 401, avant `return res` ; test dédié vérifie « pas de redirect ».
- [x] **T3 — Détection explicite `authService.login`** (AC: 1, 3)
  - [x] Dans `login` (`authService.ts`), après `const response = await fetch(...)` et **avant** `const body = await response.json()`, ajouter `if (response.status === 429) throw new RateLimitError();`. Importer `RateLimitError`.
  - [x] Ne rien changer d'autre (`register`/`logout` ne sont pas rate-limités → pas de check).
- [x] **T4 — Affichage Login** (AC: 4, 5, 9)
  - [x] `LoginPage.tsx` : flag `rateLimited` → `error` rendu amber vs red ; reset en tête de `handleSubmit`.
  - [x] `handleResend` : `catch (err)` → `setResendMessage(err instanceof RateLimitError ? err.message : '…')` (slot déjà amber).
- [x] **T5 — Affichage Register (Resend)** (AC: 5, 9)
  - [x] `RegisterPage.tsx` `handleResend` : même traitement que T4 sur `resendMessage`.
- [x] **T6 — Affichage Forgot-password** (AC: 6, 9)
  - [x] `ForgotPasswordPage.tsx` : flag `rateLimited` → `error` amber vs red.
- [x] **T7 — Affichage Profil (change-password + change-email)** (AC: 7, 8, 9)
  - [x] `ProfilePage.tsx` : flags `pwRateLimited` / `emailRateLimited` → `pwError` / `emailError` amber vs red.
- [x] **T8 — Tests** (AC: 10, 11)
  - [x] Test service `apiFetch` : un 429 → rejette `RateLimitError` (pas de redirect). (`apiFetch.test.ts`)
  - [x] Test service `authService.login` : sur 429 → rejette `RateLimitError`, **pas** « Login failed », body **jamais** lu. (`authService.test.ts`)
  - [x] Test page `LoginPage` : sur 429 → affiche « Too many attempts… », pas « Login failed », pas de navigation. (`LoginPage.test.tsx`)
  - [x] `npm test` (front) vert (326/326) ; `tsc -b` + ESLint clean.

### Review Findings

_Code review adversariale 3 couches (Blind · Edge Case · Acceptance Auditor) — 2026-07-05. Les 11 ACs sont SATISFIED, invariant detail-free vérifié (status-based, body jamais lu sur 429, zéro header consommé). 1 patch, 2 defer, 3 écartés (bruit)._

- [x] [Review][Patch] `VerifyEmailBanner` resend non rate-limit-aware — 3ᵉ surface de resend (montée globalement `App.tsx:74`, affichée quand `emailVerified === false`) : son bouton « Resend link » appelle `verificationService.resend` → `emailSendLimiter` → 429 → `RateLimitError`, mais son `catch {}` nu affiche la copie générique « Could not send right now… » au lieu de la copie rate-limit. **Corrigé 2026-07-05** : `catch (err)` → `err instanceof RateLimitError ? err.message : …` (miroir Login/Register) + test dédié. [src/components/VerifyEmailBanner.tsx:24-25]
- [x] [Review][Defer] `authService.register` n'a pas de garde 429 (asymétrie avec `login`) — latent : `/auth/register` n'est pas rate-limité aujourd'hui ; si un limiter y est ajouté un jour, le 429 tomberait en rouge « Registration failed » au lieu de l'amber rate-limit. [src/services/authService.ts:51-74] — deferred, latent
- [x] [Review][Defer] Asymétrie a11y : les erreurs rouges (credential/champ) n'ont pas de role live-region ; seul l'amber rate-limit reçoit `role="status"`. Pattern pré-existant (les divs rouges n'en avaient jamais). [src/pages/*.tsx] — deferred, pre-existing

**Écartés (bruit) :** (1) « apiFetch throw 429 global au-delà des 5 endpoints » — **by design** (décision archi de la story : centraliser dans apiFetch) et vérifié sûr (aucun endpoint non-auth n'est rate-limité). (2) « message `RateLimitError` potentiellement vide » — faux positif (copie non-vide `rateLimit.ts:9` ; le Blind Hunter n'avait pas le fichier). (3) « Register resend gris ≠ amber » — cosmétique **explicitement permis** par les Dev Notes de la story (slot resend jamais rouge → aucune confusion red/amber).

## Dev Notes

### Endpoints rate-limités → points d'affichage (vérifié dans `backend/routes/`)

| Endpoint (429 possible) | Limiter (7.4) | Service front | Page / état |
|---|---|---|---|
| `POST /api/auth/login` | `loginLimiter` (IP, 10/15 min) | `authService.login` (**raw fetch**) | `LoginPage` `setError` |
| `POST /api/auth/verify-email/resend` | `emailSendLimiter` (user, 5/h) | `verificationService.resend` (apiFetch) | `LoginPage`/`RegisterPage` `resendMessage` |
| `POST /api/auth/forgot-password` | `forgotPasswordLimiter` (IP, 5/h) | `passwordResetService.requestReset` (apiFetch) | `ForgotPasswordPage` `error` |
| `PUT /api/account/password` | `changePasswordLimiter` (user, 5/15 min) | `profileService.changePassword` (apiFetch) | `ProfilePage` `pwError` |
| `PUT /api/account/email` | `emailSendLimiter` (user, 5/h) | `profileService.requestEmailChange` (apiFetch) | `ProfilePage` `emailError` |

**`/auth/register` n'a PAS de limiter** → le submit d'inscription n'est pas concerné ; `RegisterPage` n'est touchée que pour son **Resend** (verify-email/resend).

### État actuel des fichiers à modifier (lu — ne rien casser)

- **`src/services/apiFetch.ts`** — choke point partagé. Gère 401 (clear user + redirect `/login`, promesse qui ne se résout jamais) et le retry CSRF sur 403 `X-CSRF-Token-Invalid`. Le 429 s'insère proprement avant `return res` (ni 401 ni 403). Utilisé par verification/passwordReset/profile/song/playlist/… — mais **seuls les 5 endpoints ci-dessus émettent 429**, donc throw sur 429 est sûr partout.
- **`src/services/authService.ts`** — `login` fait `const body = await response.json().catch(...)` puis gère `403 email_not_verified` (→ `needsVerification`) sinon `throw new Error(body.message || 'Login failed')`. Le check 429 doit venir **avant** cette lecture de body. Ne pas toucher `register`/`logout`.
- **`LoginPage.tsx`** — `error` rendu en red ; `resendMessage` déjà en amber (`text-amber-700 dark:text-amber-300`, l.98). `handleResend` a un `catch {}` générique.
- **`RegisterPage.tsx`** — symétrique ; `resendMessage` rendu en gris (l.107) — pour le rate-limit, l'amber est préférable pour la distinction ; a minima afficher `err.message`.
- **`ForgotPasswordPage.tsx`** — `error` en red (l.41). Réponse succès générique (anti-énum) inchangée.
- **`ProfilePage.tsx`** — `pwError`/`emailError`/`nameError` en red (l.152/174) ; amber déjà utilisé pour du texte informatif (l.140/147). `loadError` en encart red.

### Convention couleur (établie, à réutiliser)

- **Red** (`text-red-600 dark:text-red-400`, encart `red-50/red-200`) = erreur credential/champ/dure.
- **Amber** (`text-amber-700 dark:text-amber-300`) = info / non-bloquant (déjà utilisé pour resend & pending-email). → **le rate-limit va en amber** : ce n'est pas « tu t'es trompé », c'est « réessaie plus tard ».

### Pattern classe d'erreur (maison)

Copier la forme de `PlaylistConflictError` (`playlistService.ts:17-24`) : `export class ... extends Error { constructor() { super('...'); this.name = '...'; } }`. Consommation page : `if (err instanceof RateLimitError) { ... }` (cf. `Songs.tsx:801`, `MySessionsPage.tsx:417`).

### Règles projet (project-context.md) à respecter

- `verbatimModuleSyntax` : `import { RateLimitError }` (valeur, pas `import type`).
- `strict` + `noUnusedLocals/Parameters` : pas de variable morte, sinon `tsc -b` casse.
- Imports **relatifs** (`../services/rateLimit`), pas d'alias.
- Tout en **anglais** (UI + commentaires). Tailwind only, réutiliser les couleurs du thème.
- Deux suites Jest séparées : ici **frontend uniquement** (`npm test` à la racine, tests dans `src/__tests__/`). Le hook pre-commit lance les deux — ne jamais `--no-verify`.
- Services : `credentials: 'include'` déjà en place ; pattern erreur `if (!res.ok) throw` conservé (le 429 est intercepté **avant**).

### Piège à éviter

- **Ne pas** ajouter le check 429 dans chaque méthode de service **en plus** de `apiFetch` (double détection, code mort/incohérent). `apiFetch` couvre 4/5 ; seul `authService.login` (raw fetch) a besoin du check explicite. **Une seule** détection par chemin.
- **Ne pas** mapper sur `body.message` (fragile, couplé à la copie serveur `createError(429)` — qui pourrait changer). Toujours `response.status === 429`.

### Project Structure Notes

- Nouveau fichier : `src/services/rateLimit.ts` (aligné avec les autres `src/services/*.ts`). Pas de conflit de structure.
- Aucun fichier backend touché ; l'invariant detail-free est déjà garanti côté serveur (`ratelimiters.js` sans headers) — cette story ne fait que **le refléter** proprement côté UI.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.1] — ACs BDD, invariant detail-free, liste des 5 points.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 15] — insight de cadrage (429 observable, seul secret = fenêtre), NFR-S1.
- [Source: backend/middleware/ratelimiters.js] — 5 limiters, `standardHeaders:false/legacyHeaders:false` (aucun `Retry-After`), `next(createError(429))`.
- [Source: backend/routes/auth.js:14,23,26 · backend/routes/account.js:14,16] — mapping endpoint→limiter.
- [Source: src/services/apiFetch.ts] — choke point (401/CSRF) où insérer le throw 429.
- [Source: src/services/authService.ts:82-97] — `login` raw fetch (check explicite requis).
- [Source: src/services/playlistService.ts:17-24] — pattern `class …Error extends Error`.
- [Source: _bmad-output/project-context.md] — règles TS/React/services/tests.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Debug Log References

- `npx tsc -b` → clean.
- `npx jest apiFetch/authService/LoginPage` → 23/23 (ciblé).
- `npm test` (suite front complète) → **36 suites / 326 tests** verts (était 323 → +3).
- `npx eslint` (fichiers touchés) → 0 erreur.

### Completion Notes List

- **Détection par status, jamais par body** (invariant respecté) : `apiFetch` throw `RateLimitError` sur `res.status === 429` (couvre resend · forgot-password · change-password · change-email) ; `authService.login` (raw fetch, hors apiFetch) fait le check `response.status === 429` **avant** de lire le body — un test assert que `json()` n'est jamais appelé sur un 429.
- **Distinction visuelle** : une seule copie canonique detail-free portée par `RateLimitError` (`Too many attempts. Please try again in a few minutes.`) ; les 5 points la rendent en **amber** (`text-amber-700`/`amber-800` + `role="status"`), distinct du **red** des erreurs credential/champ. Implémenté via un flag booléen d'état par surface (`rateLimited`, `pwRateLimited`, `emailRateLimited`) réinitialisé au début de chaque soumission.
- **Register submit non concerné** : `/auth/register` n'a pas de limiter ; seul le *Resend* de RegisterPage (verify-email/resend) surface la copie rate-limit.
- **Zéro régression sécu** : aucun header `RateLimit-*`/`Retry-After` lu ; les réponses génériques anti-énumération (forgot-password, change-email) inchangées. Aucune modif backend, migration, ou dépendance npm.
- **Détection unique par chemin** : pas de double-check apiFetch + service (piège évité) — apiFetch pour 4/5, check explicite login pour le 5ᵉ.

### File List

**Nouveau**
- `src/services/rateLimit.ts` — classe partagée `RateLimitError` (copie canonique detail-free).

**Modifié — services**
- `src/services/apiFetch.ts` — throw `RateLimitError` sur 429 (avant `return res`).
- `src/services/authService.ts` — `login` : check `429` explicite avant lecture du body.

**Modifié — pages / composants (affichage)**
- `src/pages/LoginPage.tsx` — flag `rateLimited` (submit amber vs red) + `handleResend` rate-limit-aware.
- `src/pages/RegisterPage.tsx` — `handleResend` rate-limit-aware.
- `src/pages/ForgotPasswordPage.tsx` — flag `rateLimited` (amber vs red).
- `src/pages/ProfilePage.tsx` — flags `pwRateLimited` / `emailRateLimited` (amber vs red).
- `src/components/VerifyEmailBanner.tsx` — resend rate-limit-aware (patch review P1 : 3ᵉ surface de resend).

**Modifié — tests**
- `src/__tests__/apiFetch.test.ts` — 429 → `RateLimitError`, pas de redirect.
- `src/__tests__/authService.test.ts` — login 429 → `RateLimitError`, body jamais lu.
- `src/__tests__/LoginPage.test.tsx` — page 429 → copie rate-limit, pas « Login failed ».
- `src/__tests__/VerifyEmailBanner.test.tsx` — resend 429 → copie rate-limit, pas la copie générique (patch review P1).

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-07-05 | 0.1 | Implémentation story 15.1 — signal UX rate-limit (429 lisible et distinct) sur les 5 points d'auth ; classe partagée `RateLimitError`, détection par status (apiFetch + authService.login), rendu amber distinct. Front 326✓, tsc + ESLint clean. Status → review. |
| 2026-07-05 | 1.0 | Code review 3 couches : 11/11 ACs OK, invariant detail-free vérifié. Patch P1 appliqué — `VerifyEmailBanner` (3ᵉ surface de resend) rendu rate-limit-aware + test. 2 items deferred (register 429 latent, a11y role rouge). Front 327✓, tsc + ESLint clean. Status → done. |
