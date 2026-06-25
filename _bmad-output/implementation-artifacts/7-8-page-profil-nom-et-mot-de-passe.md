---
baseline_commit: e568c0b7f43d691b9909be111a488be46b3f2c1d
---

# Story 7.8: Page Profil — éditer nom d'affichage et mot de passe en sécurité

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want une page Profil pour changer mon nom d'affichage et mon mot de passe,
so that je gère mon compte en autonomie, sans support.

## Acceptance Criteria

1. **Page Profil + routes** — page authentifiée accessible depuis le Header (`ProfilePage.tsx`), `profileService.ts` (passe par `apiFetch` → `X-CSRF-Token` + `credentials:'include'` + handling 401). Sections **nom d'affichage / email / mot de passe**. Routes `backend/routes/account.js` (contrôleur `accountcontroller.js`) montées **`authsess` + CSRF** (CSRF déjà global `/api`). [Source: epics.md#Story 7.8 ; architecture.md#L186-187,#L323-326]
2. **Changement de nom d'affichage** — le `discriminator` courant est **conservé** si `(nouveau_nom, disc)` est libre, sinon un libre est **réattribué** (random `0001`–`9999`, retry) ; **jamais de refus** (sauf épuisement → 409). Le **handle** (`name#NNNN`) renvoyé et **`AuthContext` rafraîchi**. [Source: epics.md#Story 7.8]
3. **Changement de mot de passe — sécurité** — le **mot de passe actuel est exigé et vérifié** (`validPassword`, via `User.scope(null)` pour accéder au hash) ; le nouveau est **≥ 10 caractères** et **confirmé** ; le hash passe par le **setter bcryptjs** ; la réponse ne renvoie **jamais** le hash. [Source: epics.md#Story 7.8 ; architecture.md#L153-155]
4. **Invalidation des autres sessions** — un change-mdp réussi **invalide les autres sessions** du user (helper unique : `DELETE` des lignes de la table `session` du user **sauf `req.sessionID`**) ; la **session courante reste active**. Rate-limit appliqué sur le change-password. [Source: epics.md#Story 7.8 ; architecture.md#L156-158,#L272-273]
5. **Email en lecture seule (7.8)** — la section email **affiche** l'email courant mais **n'est pas éditable ici** : le change-email (verify-before-switch) est la story **7.11**. Indiquer clairement (label « managed separately » / bouton désactivé), sans promettre de lien. [Source: epics.md (7.11 verify-before-switch) ; architecture.md#L274-275]
6. **Tests** — change-mdp **sans mdp actuel → rejet** ; **mauvais mdp actuel → rejet** ; succès → **autres sessions invalidées, courante conservée, hash absent de la réponse** ; change-name → handle mis à jour (discriminator conservé si libre).

## Tasks / Subtasks

- [x] **Task 1 — `changePasswordLimiter`** (AC: 4)
  - [x] `backend/middleware/ratelimiters.js` : ajouter `changePasswordLimiter` (par **compte** : `keyGenerator: (req) => (req.session && req.session.user) || ipKeyGenerator(req.ip)`, `windowMs: 15*60*1000`, `limit: 5`), même `base` (429 générique, `standardHeaders:false`). Exporter dans `module.exports`. Commentaire EN (window/limite/clé/route consommatrice).
- [x] **Task 2 — Helper d'invalidation de session** (AC: 4)
  - [x] `backend/services/sessionService.js` (NEW) : `async function invalidateOtherSessions(userUid, currentSid)` — supprime les autres sessions du user. **Store Postgres uniquement** (connect-pg-simple) : `if (process.env.NODE_ENV !== 'production') return 0;` (dev/test = MemoryStore, pas de table `session` → no-op). Sinon `sequelize.query('DELETE FROM "session" WHERE sid <> :sid AND sess ->> \'user\' = :uid', { replacements: { sid: currentSid, uid: userUid }, type: QueryTypes.DELETE })`. Source unique réutilisable (jamais de SQL ad hoc dupliqué — 7.11/futur s'en serviront). [Source: architecture.md#L272-273]
- [x] **Task 3 — `accountcontroller.js`** (AC: 1, 2, 3)
  - [x] `getProfile` : `User.findByPk(req.session.user)` (defaultScope exclut `password`) → `res.json({ name, discriminator, handle: ``${name}#${discriminator}``, email, emailVerified })`. 401 si pas de session user.
  - [x] `updateName` : valider `name` (string non vide, ≤255). Tenter `user.update({ name })` en **conservant** le discriminator courant ; sur collision unique `(name, discriminator)` → **retry** avec un discriminator random libre (même mécanique que `createUser` 7.7 : boucle, détection collision name/disc) ; épuisement → 409. Renvoyer `{ name, discriminator, handle }`. Garde `req.body || {}`.
  - [x] `changePassword` : garde `req.body || {}` ; exiger `currentPassword` et `newPassword` (sinon 400) ; `newPassword.length >= 10` (sinon 400) ; confirmation `newPassword === confirmPassword` (sinon 400) ; charger `User.scope(null).findByPk(req.session.user)` (hash accessible) ; `await user.validPassword(currentPassword)` faux → **400 générique** ; sinon `await user.update({ password: newPassword })` (setter bcryptjs) ; **invalider les autres sessions** `await sessionService.invalidateOtherSessions(req.session.user, req.sessionID)` ; `res.json({ success: true })` (jamais le hash).
- [x] **Task 4 — `routes/account.js` + montage** (AC: 1)
  - [x] `backend/routes/account.js` : `router.use(authsess)` ; `router.get('/', getProfile)` ; `router.put('/name', updateName)` ; `router.put('/password', changePasswordLimiter, changePassword)`. (CSRF déjà global `/api`.)
  - [x] `backend/routes/index.js` : `var accountRouter = require('./account')` + `router.use('/account', accountRouter)`.
- [x] **Task 5 — handle dans login/register/me (identité)** (AC: 2)
  - [x] Étendre les réponses `loginUser`/`createUser` (succès) avec `discriminator` et `handle` (`${name}#${discriminator}`) afin que `AuthContext` détienne le handle dès la connexion (additif, ne casse pas l'existant). (getProfile le renvoie déjà.)
- [x] **Task 6 — Front : `profileService.ts`** (AC: 1, 2, 3)
  - [x] `src/services/profileService.ts` : `getProfile()`, `updateName(name)`, `changePassword(currentPassword, newPassword)` — via `apiFetch` (`credentials:'include'`, CSRF auto), `if(!res.ok) throw`. Types `import type`.
- [x] **Task 7 — Front : `ProfilePage.tsx` + route + lien Header** (AC: 1, 2, 5)
  - [x] `src/pages/ProfilePage.tsx` : route authentifiée ; 3 sections. **Nom** : input + save (validation client non vide) → `updateName` → maj AuthContext + toast. **Email** : affiché **lecture seule** + note « Email changes coming soon » (7.11), pas de champ éditable. **Mot de passe** : current / new / confirm, miroir `≥10` + `new===confirm` côté client → `changePassword` → toast succès + (les autres sessions sont invalidées côté serveur). Réutiliser les patterns UI existants (`input-base`, toast manuel `setTimeout(2500)`, dark mode `dark:`).
  - [x] Enregistrer la route (`/profile`) dans le routeur de l'app (là où sont déclarées les routes authentifiées) ; ajouter un **lien Profil** dans `Header.tsx` (section authentifiée, desktop + menu mobile).
- [x] **Task 8 — Front : AuthContext handle** (AC: 2)
  - [x] `src/services/authService.ts` : `User` type → ajouter `handle?: string` (et `discriminator?: string`).
  - [x] `src/contexts/AuthContext.tsx` : exposer `handle` via `user` ; après un change-name réussi, mettre à jour le `user` stocké (`storeUser` + `setUser`) avec le nouveau handle/discriminator. (Le Header peut afficher le handle ; pas obligatoire visuellement en 7.8, mais l'état doit être cohérent.)
- [x] **Task 9 — Tests** (AC: 6)
  - [x] **Back** `accountcontroller.test.js` (mock `../models`, `../services/sessionService`, `../middleware/ratelimiters` si besoin) : changePassword **sans currentPassword → 400** ; **mauvais currentPassword → 400** (validPassword false) ; **newPassword < 10 → 400** ; **succès** → `user.update({password})` appelé, `sessionService.invalidateOtherSessions(uid, sid)` appelé avec le bon `req.sessionID`, réponse **sans hash** ; updateName succès → handle renvoyé, discriminator conservé ; updateName collision → retry discriminator. (suivre le pattern `jest.mock('../models')`.)
  - [x] **Front** : `profileService` (mock `apiFetch`) appelle les bons endpoints ; `ProfilePage` — change-name met à jour le handle ; champ mot de passe valide ≥10 + confirmation. (Testing Library.)
  - [x] Suites back + front + lint, husky vert sans `--no-verify`.

## Dev Notes

### Contexte & design retenu

Première **page de gestion de compte** : self-service nom d'affichage + mot de passe, durci contre l'account-takeover (mdp actuel exigé, ≥10, invalidation des autres sessions). **Le change-email n'est PAS dans 7.8** — il exige le verify-before-switch (`pendingEmail` + token `change_email`), c'est la **story 7.11** ; ici l'email est en lecture seule. [Source: epics.md ; architecture.md#L274-275]

### Points d'attention clés (lus 2026-06-25)

- **Invalidation de sessions = store Postgres** : la table `session` (connect-pg-simple) n'existe **qu'en prod** (dev = `MemoryStore`). Le helper **no-op hors production** (sinon le `DELETE` planterait sur une table absente). Colonnes : `sid` (text), `sess` (json — contient `user` = uid + `loggedIn`), `expire`. Requête : `DELETE FROM "session" WHERE sid <> :sid AND sess ->> 'user' = :uid`. La session courante (`req.sessionID`) est préservée. [Source: server.js (pgSession tableName 'session'), architecture.md#L156-158]
- **`validPassword` + scope** : `User.prototype.validPassword(pw)` compare via bcryptjs ; le `defaultScope` **exclut `password`** → charger avec `User.scope(null).findByPk(userId)` pour le change-password. Le setter `password` **hashe au set** — passer le clair, jamais hasher à la main. La réponse ne doit jamais inclure `password`/hash. [Source: models/user.js]
- **Discriminator au rename** : même mécanique que `createUser` (7.7) — conserver le discriminator si `(name, disc)` libre, sinon retry random ; détecter la collision via `err.name === 'SequelizeUniqueConstraintError'` sur `(name, discriminator)`. Réutiliser le pattern, ne pas le réinventer.
- **Self-ownership** : les routes account agissent sur `req.session.user` (le user lui-même) — pas de scoping `where:{uid,userUid}` ici (c'est SON compte) ; charger par `findByPk(req.session.user)`. 401 si pas de session (authsess + double-check).
- **Rate-limit** : `changePasswordLimiter` par compte (clé `req.session.user`, repli `ipKeyGenerator(req.ip)` pour le validateur v8) — cohérent avec `emailSendLimiter` (7.4). 429 générique.
- **Front profileService via `apiFetch`** (pas `fetch` brut comme authService) : profil = post-auth → bénéficie du CSRF auto + handling 401 (story 5.1/7.3). [Source: src/services/apiFetch.ts]
- **Header** : n'affiche aujourd'hui **aucun** nom/handle ; ajouter un **lien Profil** (authentifié, desktop + menu hamburger mobile 9.1). L'affichage du handle est optionnel visuellement mais l'état AuthContext doit être cohérent après un rename.
- **CSRF déjà global** (`router.use(csrf)` dans index.js) : ne PAS le re-poser sur account.js ; juste `authsess` + (sur /password) le limiter.
- Backend **CommonJS**, `http-errors`, commentaires EN, modèles mockés dans les tests. Front **TS strict + verbatimModuleSyntax** (`import type`). [Source: project-context.md]

### Pièges à éviter

- **Ne jamais renvoyer le hash** : `getProfile` via defaultScope (password exclu) ; `changePassword` répond `{ success: true }`.
- **Invalidation hors-prod** : guard `NODE_ENV !== 'production'` → no-op (sinon crash dev/test sur table absente). La session courante (`req.sessionID`) **doit survivre** (filtre `sid <> :sid`).
- **Change-mdp générique** : mauvais mdp actuel → **400 générique** (pas de message distinguant « utilisateur » vs « mdp »), cohérent anti-oracle.
- **Ne pas implémenter le change-email** (7.11) : email en lecture seule.
- **Discriminator** : ne pas refuser un rename pour cause de nom dupliqué (réattribuer) ; seul refus = épuisement (409).
- **Réutiliser** `apiFetch`, le pattern toast (`setTimeout(2500)`), `ConfirmDialog` si une confirmation destructive est utile, `input-base`/`label-base`, `authsess`, `ratelimiters`. Ne rien réinventer.

### Project Structure Notes

- **NEW** : `backend/controllers/accountcontroller.js`, `backend/routes/account.js`, `backend/services/sessionService.js`, `src/pages/ProfilePage.tsx`, `src/services/profileService.ts`, `backend/__tests__/accountcontroller.test.js`, tests front (`ProfilePage.test.tsx` / `profileService`).
- **EDIT** : `backend/middleware/ratelimiters.js` (changePasswordLimiter), `backend/routes/index.js` (mount account), `backend/controllers/usercontroller.js` (handle dans login/register), `src/services/authService.ts` (User.handle), `src/contexts/AuthContext.tsx` (handle), `src/components/Header.tsx` (lien Profil), le routeur d'app (route `/profile`).
- **Pas de migration** (toutes les colonnes existent : name, discriminator, email, emailVerified, password). Réutilise `emailService`? Non (pas d'email en 7.8). Pas de nouvelle dépendance.
- Conventions : contrôleur/route minuscules, service front camelCase, page PascalCase. [Source: project-context.md, architecture.md#Structure Patterns]

### References

- [Source: epics.md#Story 7.8] — ACs (profil, change-name discriminator, change-password sécurité, invalidation sessions)
- [Source: architecture.md#L153-158 (account takeover), #L186-190 (page Profil + AuthContext handle), #L272-275 (invalidation/verify-before-switch), #L323-326 (account.js/accountcontroller.js)]
- [Source: models/user.js] — validPassword, setter bcryptjs, defaultScope exclut password, discriminator
- [Source: controllers/usercontroller.js (7.7)] — mécanique discriminator + retry à réutiliser
- [Source: middleware/ratelimiters.js (7.4)] — pattern limiteur par compte
- [Source: server.js] — connect-pg-simple tableName 'session', store Postgres prod / MemoryStore dev
- [Source: src/services/apiFetch.ts, contexts/AuthContext.tsx, components/Header.tsx] — chokepoint front, état auth, header
- [Source: story 7.11 (à venir)] — change-email verify-before-switch (hors scope 7.8)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Invalidation de sessions : `sessionService.invalidateOtherSessions` no-op hors prod (MemoryStore, pas de table `session`) ; `DELETE FROM "session" WHERE sid <> :sid AND sess ->> 'user' = :uid` en prod.
- `changePassword` charge via `User.scope(null).findByPk` (hash pour `validPassword`) ; setter bcryptjs au `update` ; réponse `{ success:true }` (jamais de hash).
- handle ajouté aux réponses login/register (additif) → `AuthContext.user.handle` ; `patchUser` rafraîchit après rename.
- Tests : back 185 (+9 accountcontroller), front 251 (+4 ProfilePage). tsc + lint back OK. Front : `AuthContext.tsx` garde 3 erreurs lint **pré-existantes** (try/catch login/logout, export hook) — aucune introduite ici.

### Completion Notes List

- **AC1 (page + routes)** : `routes/account.js` (`authsess`, CSRF global) — `GET /account`, `PUT /account/name`, `PUT /account/password` ; `accountcontroller.js` ; `profileService.ts` via `apiFetch` ; `ProfilePage.tsx` (3 sections) + route `/profile` + lien Header.
- **AC2 (nom + discriminator)** : `updateName` conserve le discriminator si `(name,disc)` libre, sinon retry random ; jamais de refus (409 si épuisement) ; handle renvoyé + `AuthContext` rafraîchi (`patchUser`).
- **AC3 (change-mdp sécurisé)** : mdp actuel exigé (`validPassword` via `scope(null)`), nouveau ≥10 + confirmé, setter bcryptjs, **jamais le hash** en réponse.
- **AC4 (invalidation)** : `changePasswordLimiter` (5/15min/compte) ajouté ; helper unique `invalidateOtherSessions(uid, req.sessionID)` (autres sessions supprimées, courante conservée ; prod-only).
- **AC5 (email lecture seule)** : section email affichée, non éditable, note « managed separately » (change-email = 7.11).
- **AC6 (tests)** : back — sans mdp actuel/mauvais mdp/<10 → 400, succès → update + invalidation(uid,sid) + pas de hash, updateName conserve/réattribue le discriminator ; front — load profil, save nom→patchUser+handle, validation mdp.
- **Identité** : handle ajouté aux réponses login/register. Pas de migration, pas de nouvelle dépendance.

### File List

- `backend/middleware/ratelimiters.js` (EDIT — changePasswordLimiter)
- `backend/services/sessionService.js` (NEW — invalidateOtherSessions)
- `backend/controllers/accountcontroller.js` (NEW — getProfile/updateName/changePassword)
- `backend/routes/account.js` (NEW)
- `backend/routes/index.js` (EDIT — mount /account)
- `backend/controllers/usercontroller.js` (EDIT — handle dans login/register)
- `backend/models/user.js` (EDIT — revue : `getHandle()` null-guardé)
- `backend/__tests__/accountcontroller.test.js` (NEW)
- `src/services/profileService.ts` (NEW)
- `src/services/authService.ts` (EDIT — User.handle/discriminator)
- `src/contexts/AuthContext.tsx` (EDIT — patchUser)
- `src/pages/ProfilePage.tsx` (NEW)
- `src/App.tsx` (EDIT — route /profile)
- `src/components/Header.tsx` (EDIT — lien Profile)
- `src/__tests__/ProfilePage.test.tsx` (NEW)

### Change Log

- 2026-06-25 — Suivi code review : 1 correctness + 4 quality. [#1] `changePassword` — invalidation des sessions passée en **best-effort** (try/catch + log) : un échec n'invalide plus le change-mdp réussi (plus de 500 trompeur + retry cassé). [#2] handle centralisé dans **`User.prototype.getHandle()`** (null-guardé → plus de « name#null »), 4 sites alignés. [#3] `AuthContext.patchUser` — effet de bord sorti de l'updater `setUser`. [#4] `ProfilePage` — classes `dark:` ajoutées aux bandeaux/erreurs. [#5] `updateName` — retry discriminator seulement sur collision `(name,discriminator)` avérée (cohérent 7.7). + commentaire self-ownership sur les routes account. 1 deferred (extraction boucle discriminator). Back 185 / front 251 verts.
- 2026-06-25 — Story 7.8 : page Profil. Backend `account.js`/`accountcontroller.js` (authsess+CSRF) : GET profil, PUT name (discriminator conservé/réattribué, handle), PUT password (mdp actuel exigé, ≥10, setter bcryptjs, jamais de hash) + invalidation des autres sessions (helper `sessionService`, prod-only) + `changePasswordLimiter`. Front `ProfilePage`/`profileService` (apiFetch), email lecture seule (change-email = 7.11), lien Header, `AuthContext.handle` + `patchUser`. handle ajouté aux réponses login/register. Back 185 / front 251 verts. Pas de migration.
