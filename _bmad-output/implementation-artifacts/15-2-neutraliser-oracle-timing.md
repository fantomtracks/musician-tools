---
baseline_commit: d717db5
arch_decision: "Fermer l'oracle de timing par un envoi email fire-and-forget UNIFORME (`void authFlows.issueAndSend(...)`) sur `resendVerificationPublic` ET `forgotPassword` : l'appel réseau Resend sort du chemin de réponse → la branche compte-existant n'est plus mesurablement plus lente que les branches inconnu/déjà-vérifié. `issueAndSend` est déjà best-effort (try/catch interne, ne rejette JAMAIS → `void` sans risque d'unhandledRejection). Corps de réponse strictement inchangés (`{success:true}` / `{message:CHECK_YOUR_INBOX}`) et `next(createError(500))` de forgotPassword préservé. Pas de respond-first (incompatible avec le next(500) de forgot + moins uniforme). `User.findOne` reste awaité sur toutes les branches (probe d'index hit/miss ≈ coût égal) — résidu accepté, la story vise l'asymétrie de l'ENVOI, pas la micro-diff DB."
---

# Story 15.2: Neutraliser l'oracle de timing (resend + forgot-password)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a garant de la posture sécurité du système,
I want une latence de réponse uniforme entre les branches compte-existant et inexistant,
so that le timing ne distingue plus les cas malgré un corps de réponse déjà uniforme.

## Contexte & pourquoi

Deuxième et dernière story de l'**Epic 15 (signal UX rate-limit + anti-oracle)**. Issue de la revue `deferred-work.md` : le **résidu 7-13 « oracle de timing »** rattaché à l'epic A5. **Sécu-sensible, back pur, indépendante de 15.1** (déjà `done`). **Couvre NFR-S4** (anti-énumération). Baseline : branche `feat/epic-15-signal-rate-limit`.

**Le trou (vérifié dans le code).** Deux endpoints anti-énumération renvoient un **corps identique** quel que soit le cas, MAIS n'attendent l'envoi d'email (appel réseau Resend, ~100s de ms) que sur **une** branche → la **latence** distingue les cas :

1. **`resendVerificationPublic`** (`usercontroller.js:279-293`) — `await authFlows.issueAndSend('verify_email', …)` **uniquement** si `user && !user.emailVerified` (l.284-286). Les branches « email inconnu » et « déjà vérifié » sautent l'await → répondent plus vite. → le timing révèle « compte existe **et** non vérifié ».
2. **`forgotPassword`** (`usercontroller.js:299-315`) — `await authFlows.issueAndSend('password_reset', …)` **uniquement** si `user` existe (l.305-307). La branche « email inconnu » saute l'await. → le timing révèle « compte existe ».

Le corps est déjà uniforme (`{ success: true }` pour resend ; `{ message: CHECK_YOUR_INBOX }` pour forgot) — c'est **seulement** l'oracle de **latence** qu'il reste à fermer.

**Insight de cadrage (verrouillé 2026-07-05).** `issueAndSend` (`services/authFlows.js:20-31`) est **déjà best-effort** : try/catch interne qui **log + avale** toute erreur et retourne `false` — il **ne rejette jamais**. On peut donc le lancer **sans `await`** (fire-and-forget) sans risque d'`unhandledRejection` : la réponse part tout de suite, l'email s'envoie en tâche de fond. Toutes les branches ne font alors plus, sur le chemin de réponse, que le `User.findOne` commun.

## ⚠️ Invariant de sécurité (transverse Epic 15 — à respecter)

- **Zéro régression NFR-S4** : les **corps de réponse** restent **strictement identiques** — `resend` → `{ success: true }` ; `forgot` → `{ message: CHECK_YOUR_INBOX }` (constante `backend/constants/messages.js`). Aucun nouveau champ, code, ou statut discriminant.
- **Detail-free** : rien n'expose l'existence d'un compte — ni corps, ni **latence** (c'est l'objet de la story), ni statut HTTP (le `200`/`{message}` générique et le `next(500)` sur erreur DB sont **inchangés**).
- **Ne pas affaiblir l'anti-bruteforce** : les rate-limiters (7.4, `forgotPasswordLimiter`/`emailSendLimiter`) restent en place, inchangés. Cette story ne touche QUE l'ordre await/réponse de l'envoi email.

## Décision d'architecture (déjà tranchée — à implémenter telle quelle)

**Fire-and-forget uniforme** sur les deux contrôleurs : remplacer `await authFlows.issueAndSend(...)` par `void authFlows.issueAndSend(...)` (le `void` marque l'intention de ne pas attendre, et satisfait tout lint « floating promise »).

- **`issueAndSend` ne rejette jamais** (try/catch interne → `false`) → `void` est sûr, aucun `.catch()` requis. Ajouter un **commentaire** expliquant le fire-and-forget anti-timing + le fait que l'appelé est best-effort.
- **`User.findOne` reste `await`é** sur le chemin de réponse des deux fonctions — il s'exécute déjà pour toute entrée non vide (hit **et** miss), coût ≈ égal (probe d'index unique). C'est le résidu accepté : la story ferme l'asymétrie de **l'envoi** (coûteux, réseau), pas la micro-différence de lookup DB.
- **NE PAS** faire de « respond-first » (`res.json` avant le travail) :
  - incompatible avec `forgotPassword` qui fait `next(createError(500))` en cas d'erreur `findOne` → répondre avant lèverait « headers already sent » ;
  - fire-and-forget est plus simple et **uniforme** entre les deux fonctions.
- **Préserver** : le try/catch de chaque fonction, le `next(createError(500, 'Forgot-password error'))` de forgot (seul `findOne` peut encore throw ; `issueAndSend` voidé ne throw pas), le `logger.error` de resend, le trim/guard email, `User.scope(null)` sur resend (l.283).

**Hors périmètre (à NE PAS toucher) :** `createUser` (register, l.12-123) — ses **deux** branches envoient déjà un email (`sendSignupAttemptNotice` sur email-pris l.75 · `issueAndSend('verify_email')` sur nouvel email l.106), donc la latence d'envoi y est ~symétrique ; le différentiel résiduel (create + seed topic sur la branche nouvel-email) est un **résidu beta déjà acté** (commentaire l.69). N'entre pas dans 15.2.

## Acceptance Criteria

### Égalisation de latence

1. **`resendVerificationPublic` — envoi hors du chemin de réponse** — Given un appel resend pour un compte existant-non-vérifié vs un compte inconnu/déjà-vérifié, When le contrôleur s'exécute, Then l'envoi d'email (`authFlows.issueAndSend`) n'est **plus awaité** avant `res.json` → la branche existante ne revient plus mesurablement plus tard que les autres (fire-and-forget).
2. **`forgotPassword` — même égalisation** — Given un appel forgot-password pour un compte existant vs inconnu, Then `authFlows.issueAndSend('password_reset', …)` n'est **plus awaité** avant la réponse ; la même égalisation est appliquée.
3. **`User.findOne` toujours awaité sur les deux fonctions** — Given une entrée email non vide, Then le lookup reste awaité sur le chemin de réponse (hit et miss), inchangé — seul l'**envoi** passe en fire-and-forget.

### Non-régression (corps, comportement, sécurité)

4. **Corps resend inchangé** — toutes les branches de `resendVerificationPublic` renvoient toujours **`{ success: true }`** (200).
5. **Corps forgot inchangé** — toutes les branches de `forgotPassword` renvoient toujours **`{ message: CHECK_YOUR_INBOX }`** (200) ; le `next(createError(500, 'Forgot-password error'))` sur erreur `findOne` est **préservé**.
6. **Best-effort préservé** — une erreur d'émission de token/email est toujours loggée et **avalée** (via le try/catch interne de `issueAndSend`) ; elle ne fait **jamais** échouer ni ralentir différemment la réponse, et ne produit **aucun** `unhandledRejection`.
7. **Email toujours envoyé sur la bonne branche** — le fire-and-forget déclenche toujours l'envoi pour un compte existant-non-vérifié (resend) / existant (forgot) ; il n'est **jamais** déclenché pour inconnu / déjà-vérifié (aucune régression du comportement d'envoi ni nouvel oracle).

### Tests & qualité

8. **Test structurel par contrôleur** — Given un `authFlows.issueAndSend` mocké renvoyant une promesse **non résolue**, When le contrôleur est appelé, Then `res.json` a **déjà** été appelé (preuve que la réponse n'attend pas l'envoi) et `issueAndSend` a été invoqué avec les bons arguments. Un test pour `resendVerificationPublic` (`usercontroller.test.js`) + un pour `forgotPassword` (`passwordreset.test.js`).
9. **Suite back verte** — les tests existants d'anti-énumération (corps uniformes, best-effort, no-oracle) restent **verts** ; `cd backend && npm test` + `npm run lint` clean. Aucune migration, aucune dépendance npm.

## Tasks / Subtasks

- [x] **T1 — `resendVerificationPublic` fire-and-forget** (AC: 1, 3, 4, 6, 7)
  - [x] `usercontroller.js` : `await authFlows.issueAndSend('verify_email', …)` → `void …` + commentaire anti-timing-oracle / best-effort. try/catch + `logger.error` + `res.json({ success: true })` inchangés.
- [x] **T2 — `forgotPassword` fire-and-forget** (AC: 2, 3, 5, 6, 7)
  - [x] `usercontroller.js` : `await authFlows.issueAndSend('password_reset', …)` → `void …`. `res.json({ message: CHECK_YOUR_INBOX })` + `catch → next(createError(500))` préservés.
- [x] **T3 — Test structurel resend** (AC: 8)
  - [x] `usercontroller.test.js` : `require('../services/authFlows')` ajouté ; test `issueAndSend` non résolue → `res.json({ success: true })` déjà appelé + `issueAndSend('verify_email', { uid, email })` invoqué.
- [x] **T4 — Test structurel forgot** (AC: 8)
  - [x] `passwordreset.test.js` : même patron → `res.json({ message: CHECK_YOUR_INBOX })` sans attendre l'envoi.
- [x] **T5 — Validation** (AC: 9)
  - [x] `cd backend && npm test` → **19 suites / 255 tests** verts (était 253 → +2 ; tests anti-énum existants toujours verts) ; `npm run lint` clean.

### Review Findings

_Code review adversariale 3 couches (Blind · Edge Case · Acceptance Auditor) — 2026-07-05. Auditor : 9/9 ACs SATISFIED. La « fausse alerte » d'unhandled-rejection (Blind) est levée : Edge + Auditor ont vérifié indépendamment que `issueAndSend` (authFlows.js:20-31) a un try/catch **total** (throw sync + `SENDERS[type]` undefined avalés) → ne rejette **jamais** → `void` sûr. **1 patch, 0 deferred, 2 résidus tranchés-clos, 2 écartés.**_

- [x] [Review][Patch] Fuite de `jest.spyOn` si une assertion échoue avant `spy.mockRestore()` — les 2 nouveaux tests spient `authFlows.issueAndSend` avec une promesse jamais résolue et ne restauraient qu'en **fin de test**. **Corrigé 2026-07-05** : `afterEach(() => jest.restoreAllMocks())` ajouté aux 2 fichiers (restaure même sur échec d'assertion) + `spy.mockRestore()` inline retirés (redondants). [backend/__tests__/usercontroller.test.js · passwordreset.test.js]

**Résidus tranchés — CLOS (pas deferred, aucune dette ouverte) :**
1. **Résidu de timing sub-milliseconde → ACCEPTÉ/CLOS.** `void issueAndSend(...)` exécute encore le préfixe **synchrone** (`crypto.randomBytes(32)` + sha256 dans `issueToken`, quelques µs) sur la pile de la requête avant `res.json`, seulement sur la branche compte-existant. **Décision : ne pas fixer.** Le fix (`setImmediate`) casserait ~4 tests existants pour fermer un différentiel de quelques **microsecondes**, **inobservable sur le réseau** (jitter ±10-50 ms). Même classe que le résidu `User.findOne` hit/miss que l'`arch_decision` acte déjà. La story ferme le coût **dominant** (INSERT DB + I/O réseau Resend, ms→s) — objectif sécu atteint. Résidu **clos**, pas un todo.
2. **Fenêtre de perte fire-and-forget → ASSUMÉE/CLOSE.** La réponse revient avant la fin de l'envoi ; un restart Fly.io pendant l'envoi perd token+email (best-effort). C'est une **conséquence inhérente du design fire-and-forget délibérément choisi** ; le seul « vrai fix » (outbox/queue) est hors échelle beta. L'user re-demande. Conséquence **assumée** du design, close.

**Écartés (bruit) :** (1) « `void` sans `.catch()` → risque d'unhandled-rejection » — **vérifié non-fondé** par 2 couches context-aware : `issueAndSend` ne rejette jamais (try/catch total). Un `.catch()` serait du code mort qui brouillerait le contrat. (2) « les tests ne couvrent pas le chemin de rejet » — corollaire : rien à tester côté contrôleur puisque `issueAndSend` ne rejette pas (sa robustesse est testée dans `authFlows.test.js`).

## Dev Notes

### État actuel des fonctions (lu — à préserver sauf l'await ciblé)

**`resendVerificationPublic`** (`usercontroller.js:279-293`)
```js
const { email } = req.body || {};
if (typeof email === 'string' && email.trim()) {
  const user = await User.scope(null).findOne({ where: { email: email.trim() } });
  if (user && !user.emailVerified) {
    await authFlows.issueAndSend('verify_email', { uid: user.uid, email: user.email }); // ← devient void
  }
}
// catch → logger.error (jamais d'erreur surface : un 500 vs 200 serait un oracle)
res.json({ success: true });
```
- `User.scope(null)` (bypass defaultScope) est **nécessaire** ici — ne pas retirer.
- Le try/catch enveloppe tout : une erreur `findOne` → log + `{ success: true }` (jamais un 500). **Préserver.**

**`forgotPassword`** (`usercontroller.js:299-315`)
```js
const trimmed = typeof email === 'string' ? email.trim() : '';
if (trimmed) {
  const user = await User.findOne({ where: { email: trimmed } }); // citext, case-insensitive
  if (user) {
    await authFlows.issueAndSend('password_reset', { uid: user.uid, email: user.email }); // ← devient void
  }
}
res.json({ message: CHECK_YOUR_INBOX });
// catch → next(createError(500, 'Forgot-password error'))
```
- Contrairement à resend, forgot **remonte un 500** sur erreur `findOne` (via `next`). **Préserver** — d'où le refus du « respond-first » (res.json avant le travail casserait ce chemin : headers already sent).

### `authFlows.issueAndSend` — pourquoi `void` est sûr

`services/authFlows.js:20-31` : `async function issueAndSend(type, {uid,email,payload})` — **try/catch total** qui log l'erreur et **`return false`**. Il ne **rejette jamais** → un `void issueAndSend(...)` non awaité ne peut pas produire d'`unhandledRejection`. Aucun `.catch()` à ajouter.

### Subtilité de test (microtasks) — pour ne pas casser l'existant

Les tests actuels de resend/forgot (`usercontroller.test.js:439-490`, `passwordreset.test.js:36-51`) mockent `authTokenService.issueToken` / `authEmails.send*` (pas `authFlows`) et **asservissent** que `issueToken` / `sendVerifyEmail` **ont été appelés** après `await controller.xxx(...)`. Avec le fire-and-forget, ces appels restent déclenchés : les mocks résolvent en un microtask, et la file de microtasks se draine **avant** que la continuation `await` du test ne s'exécute (la continuation de `issueAndSend` est enfilée avant celle du test). **Ces tests restent donc verts** — les vérifier explicitement (T5). Le test **structurel** (T3/T4) avec une promesse **jamais résolue** est la preuve autoritaire du non-await (indépendante du timing des mocks).

### Conventions backend (project-context.md)

- **CommonJS** (`require`/`module.exports`) — jamais d'ESM ; pas de `.ts` côté back.
- Contrôleurs : `try/catch` → `next(error)` ; erreurs via `http-errors` (`createError`). Ne pas changer la signature `(req, res)` de resend ni `(req, res, next)` de forgot.
- **Deux suites Jest séparées** : ici **backend uniquement** (`cd backend && npm test`, env node, `backend/__tests__/`). Modèles mockés via `jest.mock('../models')` — suivre le patron existant.
- Le hook husky pre-commit lance **les deux** suites (front + back) — commit vert obligatoire, jamais `--no-verify`.
- Tout en **anglais** (commentaires inclus).

### Previous story intelligence (15.1, `done`)

- 15.1 a livré le **signal UX** du 429 côté front (classe `RateLimitError`, détection par status). 15.2 est son pendant **back** : fermer l'oracle de **timing** — les deux couvrent ensemble A5 + 7-13.
- Leçon de la review 15.1 : **ne pas oublier une branche/surface**. Ici, l'analogue est de traiter **les deux** fonctions (resend **et** forgot) et **toutes** leurs branches — et de **ne pas** élargir à `createUser` (hors scope, cf. ci-dessus).
- La review 15.1 a laissé en deferred un **résidu `authService.register` 429** (front) — sans rapport avec 15.2 (back timing), ne pas le traiter ici.

### Project Structure Notes

- Aucun fichier nouveau ; 2 lignes modifiées dans `usercontroller.js` + 2 tests ajoutés. Pas de migration, pas de dépendance, pas de changement de route/middleware.
- Après 15.2 → Epic 15 complet (15.1 + 15.2 `done`) : candidat merge `main` + rétro (cadence rétro systématique actée).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.2] — ACs BDD, NFR-S4, fire-and-forget vs await-toutes-branches.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 15] — insight de cadrage, invariant detail-free transverse.
- [Source: backend/controllers/usercontroller.js:279-315] — `resendVerificationPublic` + `forgotPassword` (cibles).
- [Source: backend/services/authFlows.js:20-31] — `issueAndSend` best-effort (ne rejette jamais → `void` sûr).
- [Source: backend/constants/messages.js:6] — `CHECK_YOUR_INBOX` (corps forgot inchangé).
- [Source: backend/__tests__/usercontroller.test.js:438-491] · [passwordreset.test.js:25-53] — tests anti-énum existants à garder verts + patron de mock.
- [Source: backend/controllers/usercontroller.js:66-114] — `createUser` : deux branches envoient déjà un email → hors scope 15.2.
- [Source: _bmad-output/project-context.md] — conventions back CommonJS / tests / contrôleurs.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Debug Log References

- `cd backend && npm test` → **19 suites / 255 tests** verts (était 253 → +2 tests structurels). Le `console.log` « Email delivery failed » est attendu (test best-effort avec envoi mocké en échec).
- `cd backend && npm run lint` → exit 0.

### Completion Notes List

- **Fire-and-forget uniforme** : `await authFlows.issueAndSend(...)` → `void authFlows.issueAndSend(...)` sur `resendVerificationPublic` (verify_email) et `forgotPassword` (password_reset). L'envoi email (appel réseau Resend) sort du chemin de réponse → la branche compte-existant n'est plus mesurablement plus lente que les branches inconnu/déjà-vérifié.
- **`void` sûr** : `issueAndSend` a un try/catch total (log + `return false`) → ne rejette jamais → aucun `unhandledRejection`. Aucun `.catch()` ajouté ; commentaire explicatif posé sur chaque site.
- **Zéro régression de comportement** : corps inchangés (`{ success: true }` / `{ message: CHECK_YOUR_INBOX }`) ; `User.findOne` toujours awaité sur les deux branches ; `next(createError(500))` de forgot préservé (seul `findOne` peut throw). Décision « respond-first » écartée (aurait cassé le next(500) → headers already sent).
- **Tests** : un test structurel par contrôleur — `jest.spyOn(authFlows, 'issueAndSend')` renvoyant une promesse **jamais résolue** ; si le contrôleur l'awaitait, `res.json` ne serait jamais atteint (test hang). Prouve le non-await indépendamment du timing des mocks. Les tests anti-énum existants (corps uniformes, best-effort, no-oracle) restent verts.
- **Hors scope respecté** : `createUser` (register) non touché — ses deux branches envoient déjà un email (~symétrique).

### File List

**Modifié — backend**
- `backend/controllers/usercontroller.js` — `resendVerificationPublic` + `forgotPassword` : envoi email en `void` (fire-and-forget).

**Modifié — tests backend**
- `backend/__tests__/usercontroller.test.js` — require `authFlows` + test structurel resend (non-await) + `afterEach(restoreAllMocks)` (patch review P1).
- `backend/__tests__/passwordreset.test.js` — require `authFlows` + test structurel forgot (non-await) + `afterEach(restoreAllMocks)` (patch review P1).

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-07-05 | 0.1 | Implémentation story 15.2 — neutraliser l'oracle de timing (resend + forgot-password) : envoi email en fire-and-forget (`void issueAndSend`), corps/comportement inchangés, 2 tests structurels. Back 255✓, lint clean. Status → review. |
| 2026-07-05 | 1.0 | Code review 3 couches : 9/9 ACs OK, `void` safety confirmé (issueAndSend ne rejette jamais). Patch P1 appliqué — `afterEach(restoreAllMocks)` (hygiène spy). 2 résidus tranchés-clos (timing sub-ms inobservable réseau + fenêtre de perte inhérente au fire-and-forget) — **0 deferred**. Back 255✓, lint clean. Status → done. |
