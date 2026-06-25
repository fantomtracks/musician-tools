---
baseline_commit: f0f1093925b887a322b4e42f169bb68f8762e2a2
---

# Story 7.7: Login email-only, register handle, et anti-énumération à l'inscription

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want me connecter par email seul et m'inscrire sans jamais voir mon nom refusé ni révéler un email,
so that l'identité est un handle social et l'inscription ne fuit aucune existence de compte.

## Acceptance Criteria

1. **Login email-only** — `loginUser` : l'**email est le seul identifiant** (retrait du `Op.or` name/email). La comparaison est **insensible à la casse via `citext`** (l'email est déjà `citext` en DB depuis 7.2) → match **exact** `where: { email: login }`, **plus d'`iLike`**. Un login par **nom** ne fonctionne plus. [Source: epics.md#Story 7.7 ; migration 7.2 (email→citext)]
2. **Register : nom dupliqué → discriminator libre, jamais « name taken »** — un nom déjà porté par un autre compte n'est jamais refusé : un `discriminator` libre est attribué (random `0001`–`9999`, retry sur collision `(name, discriminator)`), handle `name#NNNN` formé. (Mécanique déjà posée en 7.2 — la conserver.) [Source: epics.md#Story 7.7]
3. **Register : email existant → réponse générique + notif au propriétaire (FR-A8)** — un register sur un **email déjà existant** ne crée rien, ne révèle rien (**jamais « email déjà pris »**), renvoie une **réponse générique** et **notifie le vrai propriétaire** via `emailService` (tentative d'inscription). L'oracle explicite « email déjà pris » disparaît. [Source: epics.md#Story 7.7 ; architecture.md#L258 (anti-énumération)]
4. **Register : email neuf → connexion directe (flux préservé)** — une inscription sur un **email neuf** crée le compte et **connecte directement** (`emailVerified=false`, le soft gate arrive en 7.9). Le **différentiel d'auto-login** (neuf = connecté / existant = réponse générique) est un **résidu conscient assumé** à l'échelle beta (bien plus faible que le message explicite supprimé). [Source: epics.md#Story 7.7 L730]
5. **Épuisement des discriminants → seul refus** — si les 9999 discriminants d'un nom sont pris (hors d'atteinte beta), seul cas de refus : **409 « ce nom est plein »**. [Source: epics.md#Story 7.7]
6. **Mot de passe ≥ 10 caractères** — validation **≥ 10 côté serveur à l'inscription** (miroir front), via le setter bcryptjs (jamais de hash manuel). [Source: epics.md#Story 7.7 L736] — _voir Open Question sur le login._
7. **Tests** — login par email OK / par nom KO ; deux users même nom → handles distincts ; register email existant → **réponse générique (pas 400 « email pris ») + `emailService` appelé** ; register email neuf → 201 auto-login ; mot de passe < 10 → 400.

## Tasks / Subtasks

- [x] **Task 1 — Login email-only (citext, sans iLike/Op.or)** (AC: 1)
  - [x] `backend/controllers/usercontroller.js` `loginUser` : remplacer le bloc `where: { [Op.or]: [{ email: {[Op.iLike]: login} }, { name: {[Op.iLike]: login} }] }` par `where: { email: login }` (citext = insensible à la casse, exact). Conserver le 400 générique `Invalid username/email or password` (inchangé). Retirer l'import `const { Op } = require('sequelize')` s'il devient inutilisé.
  - [x] (Hygiène) `login` peut être `.trim()` avant la requête (évite un échec sur espace en fin) ; ne pas lowercaser (citext s'en charge).
- [x] **Task 2 — Register : mot de passe ≥ 10 + presence** (AC: 6)
  - [x] `createUser` : **avant** la boucle de création, valider `typeof body.password === 'string' && body.password.length >= 10` → sinon `next(createError(400, 'Password must be at least 10 characters'))`. (Validation du mot de passe que l'utilisateur a saisi — ne révèle rien sur l'existence d'un email.)
  - [x] Garder le setter bcryptjs du modèle (ne jamais hasher à la main).
- [x] **Task 3 — Register : anti-énumération email existant** (AC: 2, 3, 4, 5)
  - [x] Dans la boucle `User.create`, au `catch` : si `SequelizeUniqueConstraintError` **et** `onEmail` (`err.errors.some(e => e.path === 'email')`) → **sortir de la boucle** et basculer sur le flux « email existant » (ne PAS `throw`, ne PAS révéler). Si collision `(name, discriminator)` (non-email) → `continue` (retry). (Comportement actuel, à réorganiser.)
  - [x] **Flux email existant** : notifier le propriétaire (best-effort) puis renvoyer la **réponse générique** `res.status(200).json({ auth: false, pending: true })` (jamais de 400 « email pris »).
  - [x] **Flux email neuf** (création réussie) : inchangé — seed Free practice (best-effort), session `loggedIn/user`, `res.status(201).json({ ...userWithoutPassword, auth: true })`.
  - [x] **Épuisement** (boucle finie sans `newUser` et sans email-existant) : `409 'This display name is full, please choose another.'` (inchangé).
  - [x] **Retirer l'oracle** : le `catch` final ne doit plus renvoyer « Username or email already taken ». Garder un 400 générique pour les autres `SequelizeValidationError` (ex. email invalide, champ manquant) — ces messages portent sur la saisie, pas sur l'existence.
- [x] **Task 4 — Notification au propriétaire via emailService** (AC: 3)
  - [x] Composer un email (sujet + html EN) « tentative d'inscription » envoyé à `body.email` (l'adresse soumise = celle du compte existant, match citext) : informer qu'une inscription a été tentée ; inviter à se connecter / réinitialiser le mot de passe ; lien construit depuis `process.env.APP_BASE_URL` (ex. `${APP_BASE_URL}/login`). `emailService.sendEmail` est le **seul** point d'envoi (7.6).
  - [x] **Best-effort** : envelopper l'appel dans un `try/catch` (comme le seed Free practice) — un échec d'envoi ne doit ni faire échouer la réponse ni la rendre distinguable (la réponse générique part quoi qu'il arrive). Logger l'erreur.
  - [x] Garder la composition simple/inline dans `usercontroller` (ou un petit helper local) ; ne pas sur-architecturer (les templates par flux peuvent émerger en 7.9+).
- [x] **Task 5 — Front : flux register à deux issues + miroir mot de passe** (AC: 3, 4, 6)
  - [x] `src/services/authService.ts` : `register(...)` renvoie un **résultat discriminé** au lieu de `User`. Type `RegisterResult = { status: 'created'; user: User } | { status: 'pending' }`. Sur `!response.ok` → throw (erreurs réelles : 400 mdp court, 409 nom plein). Sur ok : si `data.auth && data.uid` → `{ status:'created', user: data }` ; sinon → `{ status:'pending' }`.
  - [x] `src/contexts/AuthContext.tsx` : `register` propage le `RegisterResult` ; ne `storeUser/setUser` **que** si `status === 'created'`. Mettre à jour le type dans `AuthContextType`.
  - [x] `src/pages/RegisterPage.tsx` : après `register(...)`, si `created` → `navigate('/songs')` (inchangé) ; si `pending` → afficher un **écran/message neutre** (ex. « Thanks — check your email to continue. If you don't receive anything, you may already have an account; try signing in. ») **sans** révéler l'existence. Ajouter la **validation client `password.length >= 10`** (miroir serveur) avant submit (cohérent avec le check `confirmPassword` existant).
  - [x] Vérifier qu'aucun autre appelant de `authService.register` n'attend un `User` brut (seul `AuthContext` l'utilise).
- [x] **Task 6 — Tests** (AC: 7)
  - [x] **Back** `usercontroller.test.js` : login par **email** OK (`User.scope(null).findOne` appelé avec `where:{ email: login }`, pas d'`Op.or`/`iLike`) ; login par **nom** → 400 (le findOne renvoie null) ; **deux users même nom → handles distincts** (discriminator assigné, pas de refus) ; **register email existant** → mock `User.create` rejette `SequelizeUniqueConstraintError` onEmail → réponse **200 `{auth:false,pending:true}`** + **`emailService.sendEmail` appelé** avec `to = email` (mock `jest.mock('../services/emailService')`) ; **register email neuf** → 201 `{auth:true}` ; **mdp < 10** → 400 (pas de `User.create`).
  - [x] **Front** : `authService.register` renvoie `created` vs `pending` selon la réponse ; `RegisterPage` affiche l'écran neutre sur `pending` et navigue sur `created` ; validation client ≥10. (Adapter les tests existants qui supposaient `register → User`.)
  - [x] Suites back + front + lint, husky vert sans `--no-verify`.

## Dev Notes

### Contexte & design retenu

L'identité devient un **handle social** (`name#discriminator`, déjà posé en 7.2) et l'inscription/login cesse de **fuir l'existence d'un compte** :
- **Login** : email seul, `citext` (insensible à la casse), 400 générique unique (ni « unknown user » ni « wrong password » distincts — déjà le cas).
- **Register** : jamais « name taken » (discriminator), jamais « email taken » (réponse générique + notif au propriétaire). Le seul refus possible est l'épuisement des 9999 discriminants d'un nom.
[Source: epics.md#Story 7.7 ; architecture.md#Authentication & Security, #Format Patterns]

**Différentiel résiduel assumé** (AC4) : email neuf → auto-login ; email existant → réponse générique `{pending}`. Un attaquant peut distinguer les deux par le comportement (connecté vs « check inbox »). C'est **conscient et accepté** à l'échelle beta (bien plus faible que l'ancien message « email déjà pris »). Ne PAS sur-investir pour l'éliminer.

### État actuel (lu 2026-06-25)

- **`models/user.js`** : `email` est `STRING` côté modèle mais **`citext` en DB** (7.2) → une égalité `where:{email}` est déjà insensible à la casse. `name` non unique seul ; index unique `(name, discriminator)`. `password` a un **setter bcryptjs** (hash au set) ; `validPassword` compare. `defaultScope` exclut `password` (login utilise `scope(null)`).
- **`controllers/usercontroller.js`** :
  - `loginUser` (post-7.5) : garde `req.body || {}` + presence `login/password` → 400 ; puis `User.scope(null).findOne({ where:{ [Op.or]:[{email:{[Op.iLike]:login}},{name:{[Op.iLike]:login}}] } })`. **C'est le bloc à remplacer** par `where:{ email: login }`.
  - `createUser` (post-7.5) : `body = req.body || {}` ; boucle 50× `User.create` avec discriminator random, `continue` sur collision `(name,discriminator)`, `throw` sur email ; `if(!newUser)` → 409 ; seed Free practice (best-effort) ; session + `201 {auth:true}`. `catch` final → **400 « Username or email already taken »** (l'oracle à retirer).
- **`services/emailService.js`** (7.6) : `sendEmail({to,subject,html})`, seul point d'envoi, 502 si erreur Resend, client paresseux. → **premier consommateur réel** ici.
- **Front** : `authService.register` renvoie `User`, `AuthContext.register` fait `storeUser/setUser`, `RegisterPage` `navigate('/songs')` ou affiche `err.message`. Le flux à deux issues impose d'élargir le type de retour (Task 5).

### Pièges à éviter

- **Anti-oracle = priorité** : aucune réponse/branche ne doit révéler qu'un email existe. Statut générique 200 `{pending}` (pas 400/409). Le message front est **neutre** (jamais « cet email est déjà utilisé »).
- **Notif best-effort** : un échec `emailService` (502) ne doit PAS changer la réponse ni la faire échouer (sinon oracle par timing/erreur). `try/catch`, log, on continue.
- **Timing** : envoyer l'email ajoute une latence sur le cas « existant » → léger oracle de timing. Accepté (cohérent avec le différentiel d'auto-login déjà assumé) ; ne pas bloquer là-dessus.
- **citext** : ne PAS réintroduire d'`iLike` ni lowercaser manuellement — l'égalité citext suffit. Ne pas toucher au type DB.
- **Front breaking change** : `register` ne renvoie plus un `User` brut → adapter `AuthContext` + `RegisterPage` + tests dans la même passe (sinon TS casse / navigation cassée).
- **Détection email vs (name,disc)** : ne basculer sur « email existant » que si `err.path === 'email'`. Une collision discriminator doit continuer à retry.
- **Backend CommonJS**, `http-errors`, commentaires EN ; **TS strict + verbatimModuleSyntax** côté front (`import type` pour `RegisterResult`/`User`). [Source: project-context.md]

### Open Question (à confirmer par northwood)

- **AC6 dit « ≥ 10 à l'inscription ET au login »**. Enforcer ≥10 **au login** (serveur ou front) **verrouillerait les comptes beta existants** dont le mot de passe fait < 10 (la règle est postérieure). **Décision retenue par défaut** : ≥10 **uniquement à l'inscription** (création/changement = SET du mot de passe) côté serveur + miroir front register ; **login inchangé** (bcrypt-compare, pas de garde de longueur). À confirmer ; si tu veux vraiment gater le login, il faudra une stratégie de migration des mots de passe courts (reset forcé).

### Project Structure Notes

- **EDIT (back)** : `backend/controllers/usercontroller.js` (login email-only, register anti-énumération + mdp ≥10 + notif), `backend/__tests__/usercontroller.test.js`.
- **EDIT (front)** : `src/services/authService.ts` (type retour register), `src/contexts/AuthContext.tsx`, `src/pages/RegisterPage.tsx`, tests front associés.
- **Réutilise** `services/emailService.js` (7.6) — pas de nouveau service d'envoi. Pas de migration, pas de nouvelle dépendance.
- Conventions : contrôleurs minuscules, réponses JSON brutes, services front camelCase. [Source: project-context.md]

### References

- [Source: epics.md#Story 7.7] — ACs (login email-only, handle, anti-énumération, mdp ≥10)
- [Source: architecture.md#Authentication & Security, #Format Patterns L258-259] — anti-énumération, message générique
- [Source: migration 20260623000000-alter-users-identity.js] — email→citext, index (name,discriminator)
- [Source: models/user.js] — setter bcryptjs, scope password, index unique
- [Source: controllers/usercontroller.js] — loginUser/createUser actuels (post-7.5)
- [Source: services/emailService.js (7.6)] — sendEmail, seul point d'envoi
- [Source: src/services/authService.ts, contexts/AuthContext.tsx, pages/RegisterPage.tsx] — flux register front
- [Source: constants/messages.js (7.6)] — message générique réutilisable si besoin

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Décision confirmée par northwood (2026-06-25) : **mdp ≥10 à l'inscription uniquement**, login inchangé (ne pas verrouiller les comptes beta < 10).
- email déjà `citext` (7.2) → login `where:{ email }` exact = insensible à la casse ; `Op` retiré de `usercontroller`.
- Front : `register` change de type de retour (`User` → `RegisterResult`) ; `tsc -b` exit 0 après adaptation `authService`/`AuthContext`/`RegisterPage`.
- Tests : back 176 (+ login email/nom, anti-énum email existant + best-effort, mdp<10) ; front 247 (+ authService register created/pending/erreur, RegisterPage 3 cas). Lint back ✓.
- Lint front : 3 erreurs **pré-existantes** dans `AuthContext.tsx` (try/catch inutiles de `login`/`logout` hors scope ; export hook `useAuth`) — non introduites ici (mon édit a retiré le try/catch inutile de `register`).

### Completion Notes List

- **AC1 (login email-only)** : `loginUser` → `User.scope(null).findOne({ where: { email: login.trim() } })` (citext, exact, plus d'`Op.or`/`iLike`). Login par nom → 400. `Op` retiré.
- **AC2 (handle, jamais « name taken »)** : mécanique discriminator random + retry `(name,discriminator)` conservée (7.2).
- **AC3 (email existant → générique + notif)** : dans la boucle, `SequelizeUniqueConstraintError` sur `email` → flux anti-énum : `notifyExistingEmailSignupAttempt(email)` (best-effort via `emailService`, lien `APP_BASE_URL`) puis `200 { auth:false, pending:true }`. Oracle « email already taken » retiré du catch final.
- **AC4 (email neuf → auto-login)** : flux 201 `{auth:true}` inchangé.
- **AC5 (épuisement)** : 409 « display name is full » conservé (seul refus).
- **AC6 (mdp ≥10)** : check serveur `< 10 → 400` avant la création (setter bcryptjs conservé) ; miroir client dans `RegisterPage`. Login non gaté (décision).
- **Front** : `authService.register` → `RegisterResult = {status:'created',user} | {status:'pending'}` ; `AuthContext.register` ne connecte que si `created` ; `RegisterPage` affiche un écran neutre ambigu (anti-énum) sur `pending`, navigue sur `created`.
- **AC7 (tests)** : back (login email OK / nom KO, email existant → pending + email, best-effort, neuf → 201, mdp<10 → 400) ; front (authService 3 issues, RegisterPage 3 cas).
- **Réutilise** `emailService` (7.6) — 1ᵉʳ consommateur réel. Pas de migration, pas de nouvelle dépendance.
- **Résidu assumé** : différentiel de comportement neuf (connecté) vs existant (écran neutre) — anti-énum « best-effort » beta, acté dans l'epic.

### File List

- `backend/controllers/usercontroller.js` (EDIT — login email-only, register anti-énum + mdp≥10 + notif owner ; retrait import Op)
- `backend/__tests__/usercontroller.test.js` (EDIT — login email/nom, anti-énum, best-effort, mdp<10 ; mock emailService)
- `src/services/authService.ts` (EDIT — type `RegisterResult`, discrimination created/pending)
- `src/contexts/AuthContext.tsx` (EDIT — register propage RegisterResult, connecte si created)
- `src/pages/RegisterPage.tsx` (EDIT — écran neutre pending, navigate created, miroir mdp≥10)
- `src/__tests__/authService.test.ts` (EDIT — register created/pending/erreur)
- `src/__tests__/RegisterPage.test.tsx` (NEW — 2 issues + miroir mdp)
- `backend/services/authEmails.js` (NEW — revue : composition des emails de compte, home pour 7.9–7.11)

### Change Log

- 2026-06-25 — Suivi code review : 4 fixes + 1 extraction (zéro deferred). [#1] détection « email pris » robuste — retry discriminator **uniquement** sur collision name/discriminator positivement identifiée ; tout autre conflit d'unicité → email-taken (défaut sûr anti-énum, plus de 409-oracle si `err.errors`/`err.fields` vides). [#2] `loginUser` exige `login`/`password` **string** → 400 (plus d'IN-list/objet → 500 ; ternaire retirée). [#3] `authService.register` discrimine sur le flag explicite `data.pending`. [#4] copie RegisterPage alignée sur l'email (plus de « sign-in link ») + ton neutre. [Extraction] `backend/services/authEmails.js` (composition des emails, home des flux 7.9–7.11) au lieu d'un inline contrôleur → pas de deferred. Back 176 / front 247 verts.
- 2026-06-25 — Story 7.7 : login email-only (citext, retrait name/iLike) ; register handle (jamais « name taken ») ; anti-énumération email existant (réponse générique `{pending}` + notif au propriétaire via emailService, oracle « email taken » supprimé) ; email neuf → auto-login préservé ; mdp ≥10 à l'inscription (serveur + miroir front) ; login non gaté (décision). Front : `register` à résultat discriminé created/pending + écran neutre. Back 176 / front 247 verts. Pas de migration, réutilise emailService (7.6).
