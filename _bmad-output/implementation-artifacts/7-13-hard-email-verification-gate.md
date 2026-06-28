---
baseline_commit: 4c338754393d71515373a871abf10282f0d9d59b
---

# Story 7.13: Hard email-verification gate (plus de connexion sans email vérifié)

Status: done

> **Course-correct 2026-06-26** (pendant le test manuel Epic 7) : northwood change
> d'avis sur le *soft gate* de 7.9. On passe à un **hard gate** : un compte ne peut
> pas se connecter tant que l'email n'est pas vérifié. Bénéfice : ça **résout le
> résidu d'anti-énumération de 7.7** (register/login deviennent uniformes).

## Story

As a produit soucieux de la qualité des comptes et de l'anti-énumération,
I want qu'un utilisateur **vérifie son email avant de pouvoir se connecter**,
so that aucun compte non vérifié n'utilise l'app et que register/login ne trahissent
jamais l'existence d'un email.

## Décisions produit (arbitrées 2026-06-26)

1. **Login sur compte non vérifié** : après un **bon** mot de passe → message
   « vérifie ton email » + bouton renvoyer. Révélé seulement après identifiants
   corrects (le caller a prouvé qu'il possède le compte) → pas d'oracle (un mauvais
   mot de passe garde le 400 générique).
2. **Clic du lien de vérification** (atteint **déconnecté**) → **connexion
   automatique** : le token usage-unique prouve la possession de l'email, on ouvre
   la session et on renvoie l'utilisateur pour hydrater le client.

## Acceptance Criteria

1. **Register n'auto-connecte plus** — `createUser` ne pose plus de session ;
   renvoie la **même** réponse générique `{auth:false, pending:true}` (200) qu'un
   email déjà existant → register est uniforme (anti-énum, supersede le résidu 7.7).
   Le mail de vérif est toujours envoyé (best-effort).
2. **Login gaté sur `emailVerified`** — identifiants corrects mais
   `emailVerified=false` → `403 {auth:false, code:'email_not_verified'}`, **sans**
   ouvrir de session. Mauvais mot de passe → 400 générique **avant** ce check.
3. **verify-email auto-connecte** — sur token valide : `emailVerified=true`, session
   ouverte, réponse `{success:true, user}`. Token invalide/expiré/déjà utilisé →
   400 générique, pas de session.
4. **Resend public par email** — `POST /api/auth/verify-email/resend` devient public
   (le user n'est pas connecté sous le hard gate), prend `{email}`, rate-limité par
   IP, renvoie **toujours** `{success:true}` (jamais d'oracle).
5. **Front** — RegisterPage affiche toujours « Check your email » + Resend ;
   LoginPage gère `email_not_verified` (message + Resend) ; VerifyEmailPage hydrate
   l'auth depuis l'utilisateur renvoyé puis « Go to the app ».

## Implémentation

- Backend : `controllers/usercontroller.js` (`createUser`, `loginUser`, `verifyEmail`,
  `resendVerificationPublic` qui remplace `resendVerification`), `routes/auth.js`
  (resend public + IP rate-limit, drop `authsess`).
- Front : `services/authService.ts` (login surface `needsVerification` sur 403),
  `services/verificationService.ts` (`verify` renvoie le user ; `resend(email)`),
  `contexts/AuthContext.tsx` (`login` renvoie `{needsVerification}` ;
  `applyAuthenticatedUser`), `pages/{Register,Login,VerifyEmail}Page.tsx`,
  `components/VerifyEmailBanner.tsx` (resend par email ; banner désormais dormant
  car tout user connecté est vérifié — gardé en défense).

## Tests

- Backend `__tests__/usercontroller.test.js` : register générique sans session
  (+ test d'indiscernabilité new vs existing), login 403 unverified, mauvais mdp
  avant le check, verify auto-login + user, resend public (unverified/verified/
  inconnu/sans email/erreur → toujours 200). 25 tests verts.
- Front `__tests__/VerifyEmailPage.test.tsx` mis à jour (verify renvoie le user →
  `applyAuthenticatedUser`). Suites front 265 verts, `tsc` clean.

## Notes / dette

- `requireVerified` (middleware 7.9) et `VerifyEmailBanner` deviennent redondants
  (tout user connecté est vérifié) — **gardés en défense**, non retirés.
- À vérifier au test manuel : les comptes de test créés non vérifiés ne peuvent plus
  se connecter (attendu) ; un vrai beta user grandfathered (`email_verified=true` via
  backfill 7.2) n'est pas impacté.

## Review Findings

_Code review adversariale 3 couches (Blind / Edge / Auditor) — 2026-06-28. Tous les AC satisfaits ; la session-fixation soupçonnée par le Blind Hunter est un **faux positif** (`regenerateSession` confirmé à `usercontroller.js:231`). Findings résiduels :_

- [ ] [Review][Decision] Le « hard gate » n'évince pas les sessions actives non vérifiées de l'ère soft-gate — la garde n'existe qu'au `loginUser` (`usercontroller.js:161`) ; `middleware/authsess.js` n'autorise que sur `loggedIn === true`, jamais `emailVerified`. Un user non vérifié (inscrit pendant la fenêtre soft-gate 7.9) avec une session vivante garde l'accès complet jusqu'au logout. Le gate ne force la vérification que pour les **nouvelles** connexions. Sévérité Medium.
- [ ] [Review][Patch] `authService.login` lit le body deux fois sur un 403 sans `email_not_verified` → `TypeError: body stream already read` au lieu d'une erreur propre [`src/services/authService.ts:89-97`] (reachable via un 403 CSRF).
- [ ] [Review][Patch] `verifyEmail` : `User.scope(null).findByPk` peut renvoyer `null` (compte supprimé entre update et fetch) → `user.uid` jette → 500 opaque au lieu d'un 400 « token invalide » [`backend/controllers/usercontroller.js:228-233`].
- [ ] [Review][Patch] Bannière `needsVerification` de LoginPage jamais réinitialisée au re-submit → bannière « Verify your email » fantôme à côté d'une erreur classique [`src/pages/LoginPage.tsx` handleSubmit].
- [x] [Review][Defer] Token consommé rouvert sur un 2e device affiche « invalid/expired » malgré la vérification réussie [`src/pages/VerifyEmailPage.tsx:53-61`] — deferred, le backend ne distingue pas consommé-valide d'invalide après usage.
- [x] [Review][Defer] Oracle de timing sur `resendVerificationPublic` (envoi email awaité avant la réponse seulement sur la branche existant-non-vérifié) [`backend/controllers/usercontroller.js:260-279`] — deferred, même résidu que `forgotPassword` (anti-énum géré au niveau body).
- [x] [Review][Defer] UI vérification de Login/Register sans test front automatisé [`src/pages/LoginPage.tsx` / `RegisterPage.tsx`] — deferred, dans le plan de test déclaré de la story (seul VerifyEmailPage couvert).
