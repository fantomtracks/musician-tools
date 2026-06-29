---
baseline_commit: de24195
arch_decision: "Distinguer côté backend un token de vérif CONSOMMÉ-MAIS-VALIDE (clic redondant sur un 2e appareil) d'un token INVALIDE : verifyEmail renvoie 200 { alreadyVerified: true } SANS ouvrir de session (token single-use déjà dépensé), au lieu d'un 400 générique. Pas d'oracle (le token est un secret de 32 octets ; rien n'est keyé sur l'email)."
---

# Story 12.1: UX de vérification email — token consommé-valide vs invalide (+ tests des branches verif)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur qui vérifie son email,
I want que rouvrir mon lien de vérification (déjà utilisé) sur un 2e appareil affiche un message **clair** (« déjà vérifié, connecte-toi ») au lieu de « lien invalide ou expiré »,
so that je ne croie pas que ma vérification a échoué alors qu'elle a réussi.

## Contexte & pourquoi

Issu de la revue `deferred-work.md` du 2026-06-28 (provenance : reviews 7-13), **promu prio 1** par northwood. Première story de l'**Epic 12 (confort vérif email)**.

**Le bug (vérifié dans le code) :** `authTokenService.verifyToken` (`backend/services/authTokenService.js:40-57`) fait un **UPDATE atomique** guardé sur `usedAt: null` + `expiresAt > now` → renvoie `null` pour **tout** échec (inconnu / **consommé** / expiré). Le contrôleur `verifyEmail` (`usercontroller.js:220-223`) mappe `null` → **400 « Invalid or expired verification link »**. Donc :
- Appareil A : clic sur le lien → token consommé (`usedAt` posé), user `emailVerified=true`, **loggé sur A** (hard gate 7.13).
- Appareil B (jamais loggé) : rouvre **le même lien** → `verifyToken` voit le token mais `usedAt != null` → exclu → `null` → **400** → la page affiche « Link invalid or expired » alors que **la vérif a réussi**. UX trompeuse.

Le front (`VerifyEmailPage.tsx:53-61`) **gère déjà** ce cas **uniquement si l'user est loggé+vérifié** (`isAuthenticated && user?.emailVerified` → success). Le 2e appareil est **déconnecté** → tombe en `error`. Le fix doit donc venir du **backend** (distinguer consommé-valide) pour couvrir le cas déconnecté.

**Prio 2 (groupée ici, même zone) :** ajouter les **tests front** des branches vérif non couvertes — `needsVerification` (Login) et le bouton **Resend** (Register).

**Périmètre :** backend (1 helper + `verifyEmail`) + front (service `verify` + `VerifyEmailPage`) + tests (back + front). **Pas de migration, pas de dépendance npm.**

## ⚠️ Décision de sécurité (déjà tranchée — à respecter)

1. **Un token consommé ne r'ouvre JAMAIS de session.** Le token est single-use : la réponse « alreadyVerified » est **purement informationnelle** (200, **aucun** `req.session`), pas une 2ᵉ auto-login. L'appareil B est invité à **se connecter** normalement. (Réutiliser un token pour ouvrir une session casserait le single-use.)
2. **Pas d'oracle d'énumération.** Le token est un secret de 32 octets (`crypto.randomBytes(32)`), keyé sur **le hash du token**, jamais sur l'email. Distinguer « consommé-valide » d'« invalide » exige de **posséder le lien** → aucun attaquant ne peut sonder ça. Ce n'est donc PAS un assouplissement anti-énum (≠ les oracles email volontairement neutralisés en 7.4/7.13).

## Acceptance Criteria

### Backend — distinguer consommé-valide (prio 1)

1. **Token consommé-valide → 200 `{ alreadyVerified: true }` sans session** — Given un token `verify_email` dont le hash existe, de type correct, mais **déjà utilisé** (`usedAt != null`), et dont l'user existe et a `emailVerified = true`, When `POST /api/auth/verify-email` est appelé, Then la réponse est **200 `{ alreadyVerified: true }`** et **aucune session n'est créée** (`req.session.loggedIn` non posé).
2. **Token réellement invalide → 400 inchangé** — Given un token inconnu (hash absent), expiré-non-utilisé, ou de mauvais type, Then la réponse reste **400 « Invalid or expired verification link »** (comportement actuel).
3. **Succès normal inchangé** — Given un token valide non consommé, Then le flux 7.13 est **identique** : user marqué vérifié, session régénérée + ouverte, `200 { success: true, user }`. (Aucune régression du happy path.)
4. **Helper de lookup dédié** — `authTokenService` expose une fonction (ex. `findConsumedToken(clearToken, type)`) qui ne renvoie un token que s'il existe avec ce hash+type **et** `usedAt != null` ; elle ne **mute rien** (lecture seule).

### Frontend — message clair même déconnecté (prio 1)

5. **Service `verify` distingue les 3 issues** — Given `verificationService.verify(token)`, Then il distingue : succès auto-login (`{ user }`) · **déjà vérifié** (`{ alreadyVerified: true }`) · échec (throw). (Type de retour discriminé, pas juste `User`.)
6. **`VerifyEmailPage` — état « déjà vérifié »** — Given la réponse `alreadyVerified`, When la page se résout, Then elle affiche un état **clair** (ex. « Email already verified ✓ / You can sign in. » + lien **Sign in**), **distinct** de l'erreur « Link invalid or expired » — **y compris déconnecté** (le cas du 2e appareil).
7. **Non-régression page** — succès auto-login (`{ user }` → `applyAuthenticatedUser` + « Email confirmed ✓ » + « Go to the app ») et flux change-email (`?flow=change-email`) **inchangés** ; le garde `ranRef` (single-run) préservé.

### Tests des branches vérif (prio 2)

8. **Tests front Login `needsVerification`** — Given `LoginPage` (pas de test aujourd'hui), Then un test couvre : login retournant `{ needsVerification: true }` → affiche le prompt de vérif + l'action **Resend** ; cliquer Resend appelle `verificationService.resend`.
9. **Tests front Register Resend** — Given `RegisterPage.test.tsx` (existe, mais le bouton Resend non couvert), Then un test couvre `handleResend` → appelle `verificationService.resend(email)` + affiche le message de confirmation.

### Non-régression globale

10. Suites back + front vertes ; `tsc -b` + ESLint clean. Pas de migration, pas de dépendance npm.

## Tasks / Subtasks

### Task 1 — Backend : helper consommé + `verifyEmail` (AC1–AC4)

- [x] `backend/services/authTokenService.js` : ajouter `async function findConsumedToken(clearToken, type)` → `AuthToken.findOne({ where: { tokenHash: hashToken(clearToken), type, usedAt: { [Op.ne]: null } } })` → renvoie `{ userUid }` ou `null`. **Lecture seule.** Exporter.
- [x] `backend/controllers/usercontroller.js` › `verifyEmail` (l.214-258) : sur `result === null` (avant le `createError(400)`), tenter `const consumed = await authTokenService.findConsumedToken(token, 'verify_email')` ; si `consumed`, charger l'user (`User.findByPk(consumed.userUid)`) et si `user && user.emailVerified` → `return res.json({ alreadyVerified: true })` (**200, aucune session**). Sinon → 400 inchangé. Le happy path (result non-null) **inchangé**.
- [x] Garder le `catch` → `createError(500)` ; ne pas avaler d'erreurs.

### Task 2 — Frontend : service + page (AC5–AC7)

- [x] `src/services/verificationService.ts` › `verify` : changer le retour en type discriminé, ex. `Promise<{ user?: User; alreadyVerified?: boolean }>`. Sur `res.ok`, lire le body : `if (body.alreadyVerified) return { alreadyVerified: true }` sinon `return { user: body.user }`. Sur `!res.ok` → throw (inchangé). Adapter le type d'appel.
- [x] `src/pages/VerifyEmailPage.tsx` : ajouter un état (`Status` → ajouter `'already-verified'`, ou un flag). Dans le `.then` de `verificationService.verify` : `if (res.alreadyVerified) setStatus('already-verified')` ; `else if (res.user) { applyAuthenticatedUser(res.user); setStatus('success') }`. Rendre un bloc « already-verified » : titre « Email already verified ✓ », texte « Your email is already verified. » + `<Link to="/login">Sign in</Link>`. **Tailwind + dark mode** comme les blocs existants. Le `.catch` (cas loggé-vérifié) peut rester en filet. `ranRef` inchangé.

### Task 3 — Tests (AC1–AC9)

- [x] **Back `backend/__tests__/usercontroller.test.js`** (ou le fichier verifyEmail) : (a) token consommé + user vérifié → `res.json({ alreadyVerified: true })`, **pas** de `req.session.loggedIn`, pas de `regenerateSession` ; (b) token inconnu/expiré → 400 ; (c) happy path inchangé (session + user). Mock `authTokenService.verifyToken`/`findConsumedToken` + `User`.
- [x] **Front `src/__tests__/VerifyEmailPage.test.tsx`** (existe) : ajouter — `verify` résout `{ alreadyVerified: true }` (user **déconnecté**) → affiche « already verified » + lien Sign in, **pas** « invalid or expired ». Garder les cas success/error existants.
- [x] **Front `src/__tests__/LoginPage.test.tsx`** (NEW) : login → `{ needsVerification: true }` → prompt vérif + Resend ; clic Resend → `verificationService.resend` appelé. Mock `useAuth().login` + `verificationService`.
- [x] **Front `src/__tests__/RegisterPage.test.tsx`** (existe) : ajouter — clic Resend → `verificationService.resend(email)` + message de confirmation.
- [x] Vérifs : `cd backend && npm test` + `npm test` (front) verts ; `tsc -b` + `eslint .` clean.

## Dev Notes

### Mécanisme actuel (à préserver)
- **`authTokenService.verifyToken`** (`:40-57`) : UPDATE atomique `{usedAt: now}` guardé `usedAt: null` + `expiresAt > now`, `returning: true`. Single-use **race-free** (pas de TOCTOU) → **ne pas casser** ce design ; le helper de consommation est une **lecture séparée**, après coup, jamais un 2ᵉ chemin de consommation.
- **`verifyEmail`** (`:214-258`) : `verifyToken` → `User.update(emailVerified)` → `sessionService.regenerateSession` (anti-fixation 7.3) → `loggedIn/user/emailVerified` en session → `200 {success, user}`. Le user supprimé entre émission et clic = 400 (pas 500). **Tout ce chemin reste pour le happy path.**
- **`VerifyEmailPage`** (`:23-64`) : `ranRef` exécute le verify **une seule fois** (token single-use, StrictMode double-invoke en dev) — **préserver**. Le `.catch` actuel montre success si `isAuthenticated && user?.emailVerified` (clic redondant **loggé**) — devient un filet ; le nouveau 200 `alreadyVerified` couvre le cas **déconnecté**.
- Page **partagée** avec change-email (`?flow=change-email`, 7.11) — **ne pas** toucher cette branche (hors périmètre ; on ne traite que le verify-signup).

### Ce qui doit être préservé (ne pas casser)
- **Single-use** : aucune session ouverte sur un token consommé (AC décision sécu #1).
- **Pas d'oracle** : la distinction est keyée sur le **hash du token** (secret), jamais sur l'email → ne PAS exposer la distinction sur un canal keyé email (≠ les 429/réponses génériques anti-énum 7.4/7.13, qu'on ne touche pas).
- **Hard gate 7.13** : le happy path auto-login reste identique.
- Réponses : entité JSON brute (pas d'enveloppe `{data}`).

### Conventions (cf. project-context.md)
- Backend **JS CommonJS**, `http-errors` (`createError`), try/catch → `next`. Tests back : `jest.mock('../models')` / mock des services. **Tout en anglais** (messages UI + commentaires).
- Front **TS strict** + `verbatimModuleSyntax` (`import type`), imports relatifs. Tailwind + `dark:` sur chaque élément. Tests front Testing Library (comportement visible), mock des services. Nouveaux tests `*.test.tsx` dans `src/__tests__/`.

### Garde-fous workflow
- **Jamais sur `main`** : branche `feat/epic-12-verif-email-ux` (déjà créée). Tout merge = prod (pas de staging) ; northwood **merge à la main**. Touche le **flux d'auth prod** → soigner les tests + un smoke manuel avant merge.
- Commits Conventional (`fix(auth): ...`, `test(auth): ...`).
- Hook pre-commit front + back + ESLint — **jamais `--no-verify`**.

### Project Structure Notes
- **EDIT** : `backend/services/authTokenService.js`, `backend/controllers/usercontroller.js`, `src/services/verificationService.ts`, `src/pages/VerifyEmailPage.tsx`.
- **Tests** : `backend/__tests__/usercontroller.test.js` (ou équivalent verifyEmail), `src/__tests__/VerifyEmailPage.test.tsx` (EDIT), `src/__tests__/RegisterPage.test.tsx` (EDIT), `src/__tests__/LoginPage.test.tsx` (NEW).
- **Pas de** : migration, dépendance npm, changement du `verifyToken` atomique.

### References
- [Source: backend/services/authTokenService.js:40-57] — `verifyToken` atomique single-use (à ne pas casser ; ajouter `findConsumedToken`)
- [Source: backend/controllers/usercontroller.js:214-258] — `verifyEmail` (point d'insertion du fallback consommé-valide)
- [Source: src/pages/VerifyEmailPage.tsx:23-64,83-91] — `ranRef`, branches success/error, bloc « Link invalid or expired »
- [Source: src/services/verificationService.ts] — `verify`/`resend` (retour à discriminer)
- [Source: src/pages/LoginPage.tsx:15-53] — `needsVerification` + Resend (à tester)
- [Source: src/pages/RegisterPage.tsx:16-30] — `handleResend` (à tester)
- [Source: _bmad-output/implementation-artifacts/7-13-hard-email-verification-gate.md] — provenance (hard gate, réponses génériques anti-énum à NE PAS confondre)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — items promus (prio 1 bug 2e-appareil, prio 2 tests verif)
- [Source: _bmad-output/project-context.md] — conventions backend/front, tests, garde-fous

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow)

### Debug Log References
- **Tests** : back `npm test` **246/246** (+2 verifyEmail) ; front `npm test` **302/302** (+5 : VerifyEmailPage +1, LoginPage +3, RegisterPage +1) ; `tsc -b` 0 ; `eslint .` front + back clean.
- Détail test : `findByText(/already verified/i)` matchait le titre **et** le paragraphe → ciblé sur `findByRole('heading', …)`. L'ancien test de succès mockait `verify` → user brut ; mis à jour pour le nouveau contrat `{ user }`.

### Completion Notes List
- **AC1–AC4 (backend)** : `authTokenService.findConsumedToken(clearToken, type)` (lecture seule : `AuthToken.findOne` sur `tokenHash+type+usedAt != null`). `verifyEmail` : sur `verifyToken` null, tente `findConsumedToken` ; si trouvé **et** `User.findByPk(...).emailVerified` → `res.json({ alreadyVerified: true })` (**200, aucune session**) ; sinon 400. `verifyToken` atomique **inchangé** ; happy path 7.13 intact.
- **AC5–AC7 (front)** : `verificationService.verify` renvoie désormais `{ user? , alreadyVerified? }`. `VerifyEmailPage` : nouvel état `'already-verified'` → « Email already verified ✓ / Sign in » (lien `/login`), affiché **même déconnecté**. Branches success (auto-login) + change-email + `ranRef` inchangées ; le `.catch` (clic redondant **loggé**) reste en filet.
- **AC8–AC9 (tests prio 2)** : `LoginPage.test.tsx` (NEW) — `needsVerification` → prompt + pas de navigation ; clic Resend → `verificationService.resend(email)` ; login vérifié → `/songs`. `RegisterPage.test.tsx` — clic « Resend the link » sur l'écran pending → `resend(email)` + confirmation.
- **Sécurité** : token consommé **n'ouvre jamais** de session (testé : pas de `regenerate`/`loggedIn`) ; distinction keyée sur le **hash** du token (secret), pas l'email → pas d'oracle.

### File List
- `backend/services/authTokenService.js` (EDIT — `findConsumedToken` lecture seule + export)
- `backend/controllers/usercontroller.js` (EDIT — `verifyEmail` fallback consommé-valide → 200 `{alreadyVerified}`)
- `backend/__tests__/usercontroller.test.js` (EDIT — mock `findConsumedToken` + 2 tests consommé/valide & consommé/non-vérifié)
- `src/services/verificationService.ts` (EDIT — `verify` retour discriminé `{user?, alreadyVerified?}`)
- `src/pages/VerifyEmailPage.tsx` (EDIT — état `already-verified` + adaptation `.then`)
- `src/__tests__/VerifyEmailPage.test.tsx` (EDIT — contrat `{user}` + test already-verified déconnecté)
- `src/__tests__/LoginPage.test.tsx` (NEW — branches needsVerification + Resend)
- `src/__tests__/RegisterPage.test.tsx` (EDIT — test bouton Resend)
- `CHANGELOG.md` (EDIT — entrée `[Unreleased]`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (EDIT — statut 12-1 → review)

## Change Log

| Date       | Version | Description                                                                 |
|------------|---------|-----------------------------------------------------------------------------|
| 2026-06-29 | 0.1     | Story 12.1 — UX vérif email : backend distingue token **consommé-valide** (clic redondant 2e appareil → 200 `{alreadyVerified}` **sans session**) d'**invalide** (400) ; front affiche « Email already verified ✓ / Sign in » même déconnecté. + tests des branches verif Login (`needsVerification`/Resend) & Register (Resend). `verifyToken` atomique inchangé ; pas d'oracle (keyé hash). Back 246 ✓ (+2), front 302 ✓ (+5), tsc/lint clean. Statut → review. |
