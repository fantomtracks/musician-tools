# Epic 7 — Suivi de test manuel (auth / compte)

Branche : `feat/7-12-topic-citext` · Démarré : 2026-06-26 · Testeur : northwood

Test manuel global de l'epic **avant merge sur main** (= déploie prod). Correctifs
à faire **sur cette même branche**. Légende : `[ ]` à tester · `[x]` OK · `[!]` bug
(noter en « Anomalies »).

Pré-requis env (local) :
- Backend up dans Docker, `GET /api/csrf-token → 200`, connecté. ✅ (vérifié 2026-06-26)
- Emails : dashboard **Resend → Emails** ouvert. Si `EMAIL_FROM=onboarding@resend.dev`,
  les mails n'arrivent qu'à l'adresse du compte Resend ; si domaine vérifié, tout destinataire OK.

---

## ▶ 7.7 — Login email-only + register handle & anti-énumération  *(EN COURS)*

- [x] Register avec un email **neuf** → compte créé + connecté + mail « Confirm your email » reçu
- [x] Register avec un email **déjà existant** → écran générique « Check your email » (pas d'oracle « email taken ») + le vrai propriétaire reçoit « Sign-up attempt with your email ». NB : différentiel assumé (email neuf → auto-login 201 ; existant → 200 non connecté) = « accepted beta residual » documenté en code. Question produit ouverte (uniformité totale = ne jamais auto-login) — à arbitrer, pas bloquant.
- [x] Login email + bon mot de passe → OK
- [x] Login mauvais mot de passe / email inconnu → erreur **générique identique** (ne révèle pas lequel)
- [x] ~5+ logins ratés → blocage **rate limit** (loginLimiter) — confirmé 429 via curl (seuil **10**/15 min/IP, compte toutes les requêtes). En local browser+curl = même IP (passerelle Docker).

Anomalies / notes :
- Rate limit login : **429 detail-free volontaire** (pas de Retry-After/RateLimit-*, l'UI n'affiche pas de message « trop de tentatives » → ressemble à une erreur de login normale). Choix anti-oracle (7.4). UX du lock-out légitime = confus, mais assumé. Store en mémoire → reset au restart backend.
- Setup email (pas un bug code) : 1er envoi échouait (« test mode ») car la clé API venait d'une autre *team* Resend. Résolu en créant une clé dans la team qui possède `musician-tools.app` (vérifié, région eu-west-1). ⚠️ **À FAIRE : `fly secrets set RESEND_API_KEY=` avec la nouvelle clé** (la prod a encore l'ancienne).
- Rappel : après modif `.env` → `docker compose up -d --force-recreate backend` (pas `restart`).
- Code OK : échec d'envoi email ne bloque pas le signup (201 + bandeau + resend possible).

---

## 7.8 — Page Profil (nom + mot de passe)

- [x] Modifier le **nom d'affichage** → persiste après reload
- [x] Changer le mdp → exige le mdp **actuel** ; mauvais actuel → refus ; spam → rate limit
- [x] Reconnexion avec le **nouveau** mdp → OK

Anomalies / notes :
-

---

## 7.9 — Vérification email à l'inscription + soft gate

- [x] Clic lien `/verify-email?token=…` → compte **vérifié**
- [x] Lien expiré (24 h) / token bidon → erreur propre (pas de 500). NB : recliquer le lien **déjà utilisé en étant connecté+vérifié** → affiche « Email confirmed » (idempotent UX **voulu et testé**) ; l'usage unique est bien enforce serveur (400). L'état d'erreur s'affiche en incognito (déconnecté) sur un token bidon.
- [~] Renvoyer l'email de vérif → **remplacé par le resend public** (voir 7.13)
- [~] ~~Non vérifié : app utilisable, « changer d'email » bloqué 403~~ → **SUPERSEDED par 7.13** : le *soft gate* devient un *hard gate* (plus de connexion sans email vérifié). Test déplacé en section 7.13.

Anomalies / notes :
- Course-correct 2026-06-26 : northwood passe le soft gate en **hard gate** → nouvelle story **7.13** (dev fait, à tester ci-dessous).

---

## 7.13 — Hard email-verification gate ✅

- [x] **Register email neuf** → écran « Check your email », **PAS** connecté (pas de redirection app), mail de vérif reçu
- [x] **Register email existant** → **même** écran exactement (indiscernable), notice au vrai propriétaire
- [x] **Login avant vérif** (bons identifiants) → bloqué avec prompt « Verify your email to sign in » + bouton **Resend** ; **pas** connecté
- [x] **Login mauvais mdp** (compte non vérifié) → erreur générique normale (PAS le prompt verify — pas d'oracle)
- [x] **Resend** depuis l'écran register OU le prompt login → nouveau mail ; spam → rate limit (IP)
- [x] **Clic lien de vérif** (déconnecté) → **connexion automatique** → « Email confirmed » → « Go to the app » entre direct dans l'app (connecté)
- [x] **Login après vérif** avec le bon mdp → OK

Anomalies / notes :
- Tests auto : back 220 ✓ + front 265 ✓, tsc clean. Comptes de test créés non vérifiés avant 7.13 ne peuvent plus se connecter (attendu) → en recréer / les vérifier.

---

## 7.10 — Reset mot de passe par email

- [x] Forgot password email existant → confirmation **générique** ; email inconnu → **même** confirmation ; spam → rate limit (forgotPasswordLimiter)
- [x] Mail « Reset your password » → lien → nouveau mdp → login OK
- [x] Rejouer le même lien → refusé (usage unique) ; lien > 1 h → refusé

Anomalies / notes :
-

---

## 7.11 — Change email (verify-before-switch)

- [x] Compte vérifié → demande de changement → mail « Confirm your new email » à la **nouvelle** adresse
- [x] Avant clic : email **inchangé** → login avec l'**ancien** email marche toujours
- [x] Clic lien (`…&flow=change-email`) → email **basculé** ; login avec le **nouveau** OK
- [x] Rejouer le lien / lien > 1 h → refusé. (~~depuis compte non vérifié → 403~~ : sans objet sous le hard gate 7.13 — on ne peut plus être connecté non vérifié)

Anomalies / notes :
-

---

## 7.12 — Unicité topic insensible casse & accents

- [ ] `Pentatonique` puis `pentatonique` → **409**
- [ ] `Été` puis `ete` → **409**
- [ ] Rename d'un topic vers une collision casse/accent d'un autre → **409**
- [ ] Nom réellement différent passe toujours (`Blues` puis `Jazz` → OK)
- [ ] (Bord) Rename d'un topic vers son **propre** nom en changeant la casse → pas d'erreur bloquante

Anomalies / notes :
-

---

## Transversal

- [x] Logout → token CSRF purgé ; action mutante après logout → **401** (pas un faux 403)
- [x] Après login, créer/éditer topic ou session → pas de « Failed to obtain CSRF token »

Anomalies / notes :
-

---

## Bilan epic

- [x] Stories fonctionnelles testées : 7.7, 7.8, 7.9, 7.10, 7.11, 7.13 ✅ + transversal ✅
- [ ] **7.12** (unicité topic casse/accents) : **pas re-testé en UI cette session** — validé indirectement (index fonctionnel présent sur la base + tests unitaires contrôleur 409). Spot-check UI optionnel avant merge.
- [x] Correctifs intégrés sur la branche (incident infra email + course-correct 7.13)
- [ ] Prêt à merger sur `main` (par northwood) — épingler le rappel `fly secrets set RESEND_API_KEY` (nouvelle clé) avant le déploiement prod
