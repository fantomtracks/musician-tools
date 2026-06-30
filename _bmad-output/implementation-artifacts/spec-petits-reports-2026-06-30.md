---
title: 'Petits reports différés — lot 2026-06-30 (12-1 jumeau, 10-2, 7-11)'
type: 'bugfix'
created: '2026-06-30'
status: 'done'
baseline_commit: '236f5d9f7cedf1f65d206102dc1151309a737a7e'
context: ['{project-root}/_bmad-output/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trois reports différés (deferred-work.md) à solder en un lot, un commit chacun : (1) le flux change-email n'a pas le fallback "token déjà consommé" de 12.1 → 2e clic d'un lien consommé = « Link invalid or expired » alors que le changement a réussi ; (2) `handleCreatePlaylist` n'a pas de garde anti-double-soumission ; (3) une nouvelle demande de change-email ne révoque pas les anciens tokens `change_email` non utilisés. (Le report « ✗ discret » de 13.1 est CLOS par décision : la bannière ambre est acceptée dans les deux modes.)

**Approach:** Cloner le pattern `findConsumedToken` de `verifyEmail` vers `confirmEmailChange` (back) + brancher front ; ajouter un flag in-flight (ref) sur `handleCreatePlaylist` ; révoquer les tokens `change_email` pendants à chaque `requestEmailChange`.

## Boundaries & Constraints

**Always:** Respecter le pattern contrôleur (anti-oracle, réponses génériques) ; ne jamais ouvrir de session depuis un token consommé ; backend CommonJS, modèles mockés en test ; TS strict + `import type` ; UI/commentaires en anglais ; un commit Conventional par report.

**Never:** Toucher `main` (branche `fix/petits-reports-2026-06-30`) ; introduire une unicité de titre serveur ; révéler l'existence d'un email (anti-énumération) ; commit `--no-verify` ; toucher au warning doublon de `SongForm` (décision : statu quo bannière).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| change-email 2e clic, changement déjà appliqué | token `change_email` consommé, `user.email === payload.pendingEmail` | `200 { alreadyChanged:true, email }` SANS session ; front affiche « Email already updated » | — |
| change-email token consommé mais email pas switché (collision passée) | consommé, `user.email !== pendingEmail` | `400` générique (inchangé) | reject générique |
| change-email lien vraiment invalide/expiré | aucun token / hash inconnu | `400` générique (inchangé) | reject générique |
| double clic « Create playlist » | 2 appels rapprochés | 1 seul `createPlaylist` ; le 2e est ignoré (no-op) | flag relâché en `finally` |
| nouvelle demande change-email | un token `change_email` non utilisé existe déjà | l'ancien token passe `usedAt` avant émission du nouveau | best-effort |

</frozen-after-approval>

## Code Map

- `backend/services/authTokenService.js` -- `findConsumedToken` retourne `{userUid}` seul ; ajouter `payload` ; ajouter helper d'invalidation de tokens pendants.
- `backend/controllers/usercontroller.js` -- `confirmEmailChange` (363-387) : ajouter le fallback `findConsumedToken('change_email')` (miroir de `verifyEmail` 221-234).
- `backend/controllers/accountcontroller.js` -- `requestEmailChange` (154-198) : révoquer les tokens `change_email` pendants après `update({pendingEmail})`, avant `issueAndSend`.
- `src/services/verificationService.ts` -- `confirmEmailChange` retourne `{email?, alreadyChanged?}` (comme `verify`).
- `src/pages/VerifyEmailPage.tsx` -- branche `?flow=change-email` : gérer `alreadyChanged` ; copie change-mode du bloc `already-verified`.
- `src/pages/Songs.tsx` -- `handleCreatePlaylist` (779-796) : flag in-flight via `useRef`.

## Tasks & Acceptance

**Execution:**
- [x] `backend/services/authTokenService.js` -- (a) `findConsumedToken` retourne aussi `payload` ; (b) ajouter `invalidatePendingTokens(userUid, type)` (`update {usedAt:now}` where `userUid,type,usedAt:null`) ; exporter -- réutilisable par les 2 contrôleurs.
- [x] `backend/controllers/usercontroller.js` -- `confirmEmailChange` : sur `verifyToken` null/sans pendingEmail → `findConsumedToken`, charger le user, si `user.email === consumed.payload.pendingEmail` → `res.json({alreadyChanged:true, email:user.email})` ; sinon 400 générique inchangé.
- [x] `backend/controllers/accountcontroller.js` -- `requestEmailChange` : après `user.update({pendingEmail})`, `authTokenService.invalidatePendingTokens(userId,'change_email')` (best-effort, log+swallow) avant la branche `!taken`.
- [x] `src/services/verificationService.ts` -- `confirmEmailChange` : parser `{email, alreadyChanged}`.
- [x] `src/pages/VerifyEmailPage.tsx` -- gérer `alreadyChanged` (logged-out → `already-verified` ; logged-in → `success` + `patchUser`) ; rendre `already-verified` change-aware.
- [x] `src/pages/Songs.tsx` -- `handleCreatePlaylist` : `creatingPlaylistRef`, early-return si en vol, relâche en `finally`.
- [x] Tests -- back : `confirmEmailChange` alreadyChanged + invalidation (`changeemail.test.js`/`authTokenService.test.js`) ; front : double-submit no-op (`SongsPlaylistInlineCreate.test.tsx`), VerifyEmailPage change alreadyChanged.

**Acceptance Criteria:**
- Given un lien change-email déjà confirmé recliqué hors-session, when la page se charge, then « Email already updated — sign in » (pas d'erreur, pas de session).
- Given un double clic rapide sur « Create playlist », when les handlers tournent, then un seul `createPlaylist` part.
- Given une 2e demande de change-email, when elle est traitée, then les anciens tokens `change_email` non utilisés sont `usedAt`.

## Verification

**Commands:**
- `cd backend && npm test` -- expected: vert (incl. nouveaux cas change-email/invalidation)
- `npm test` -- expected: vert (playlist inline, VerifyEmailPage)
- `npm run lint && cd backend && npm run lint` -- expected: clean
- `npx tsc -b` -- expected: pas d'erreur de types

## Spec Change Log

- **2026-06-30 — review patch (Blind hunter MED, no loopback).** `requestEmailChange` révoquait les tokens pendants **inconditionnellement** → une demande vers une adresse **déjà prise** tuait le token valide précédent sans le remplacer. Corrigé : révocation déplacée **dans le bloc `!taken`, juste avant `issueAndSend`** (couplée à l'émission), conforme à la matrice I/O. Test « TAKEN address » durci (`invalidatePendingTokens` non appelé). KEEP : garde `email === pendingEmail` côté `confirmEmailChange`, best-effort log+swallow.

## Suggested Review Order

**Report 1 — change-email « already updated » sur lien consommé (12-1 jumeau)**

- Point d'entrée : le fallback miroir de `verifyEmail` — ne ré-ouvre pas de session, garde `email === pendingEmail`.
  [`usercontroller.js:372`](../../backend/controllers/usercontroller.js#L372)
- Le socle : `findConsumedToken` retourne désormais le `payload`.
  [`authTokenService.js:64`](../../backend/services/authTokenService.js#L64)
- Contrat front : `{email?, alreadyChanged?}`.
  [`verificationService.ts:30`](../../src/services/verificationService.ts#L30)
- Routage UI : `alreadyChanged && !isAuthenticated → already-verified` (copie change-aware).
  [`VerifyEmailPage.tsx:38`](../../src/pages/VerifyEmailPage.tsx#L38)

**Report 3 — révocation des tokens change-email pendants (7-11)**

- Le helper : `update {usedAt} where {userUid,type,usedAt:null}`.
  [`authTokenService.js:71`](../../backend/services/authTokenService.js#L71)
- L'usage (post-review) : couplé à l'émission, dans `!taken`, avant `issueAndSend`.
  [`accountcontroller.js:186`](../../backend/controllers/accountcontroller.js#L186)

**Report 2 — garde anti-double-soumission playlist (10-2)**

- Ref in-flight, relâche en `finally` (miroir de `savingRef`).
  [`Songs.tsx:783`](../../src/pages/Songs.tsx#L783)

**Tests**

- Socle (findConsumedToken payload + invalidatePendingTokens).
  [`authTokenService.test.js:80`](../../backend/__tests__/authTokenService.test.js#L80)
- Flux change-email (alreadyChanged, révocation, ordre, best-effort).
  [`changeemail.test.js:45`](../../backend/__tests__/changeemail.test.js#L45)
- Double-submit no-op + branches change-email front.
  [`SongsPlaylistInlineCreate.test.tsx:186`](../../src/__tests__/SongsPlaylistInlineCreate.test.tsx#L186)
