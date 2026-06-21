# Addendum — Brief Epic 7 (détail technique pour PRD / architecture)

Profondeur technique volontairement sortie du brief (qui reste à 1-2 pages). À reprendre en architecture / PRD.

## Infra email transactionnel (déclenchée par la décision C3-b)

Décision C3-b : le changement d'email se fait **verify-before-switch** → nécessite d'envoyer un email de confirmation. Aucune infra d'envoi n'existe aujourd'hui (vérifié : pas de nodemailer/sendgrid/resend/smtp dans `backend`).

**Ce que ça implique (à cadrer en architecture) :**
- **Choix d'un fournisseur** transactionnel (candidats : Resend, Postmark, SMTP). Décision d'archi → _open question_, pas tranchée dans le brief.
- **Pattern verify-before-switch** : ne PAS écraser `email` tant que non confirmé. Stocker un `pendingEmail` + un **token signé et expirant** ; bascule `pendingEmail → email` au clic du lien ; le login reste sur l'ancien email tant que non vérifié.
- **Secret/signature des tokens** : réutiliser une vraie variable d'env (cf. nettoyage du fallback `'MUSICIAN_SECRET'`).

**Ce que l'infra email débloque ensuite (effet de levier) :**
- **Vérification d'email à l'inscription** (aujourd'hui : aucun contrôle de possession au register).
- **Reset de mot de passe par email** (« mot de passe oublié » — absent aujourd'hui).

→ Conséquence de périmètre à trancher avec northwood : monter l'email pour le seul change-email, ou en profiter pour couvrir aussi signup-verification et/ou password-reset dans l'Epic 7.

## Menace #1 — mécanique retenue

- Mot de passe : min 10 caractères, validé côté serveur (et miroir côté front pour l'UX). Setter bcryptjs du modèle (jamais de hash manuel). `validPassword` pour vérifier l'actuel.
- Invalidation des autres sessions au change de mdp : suppression ciblée des lignes de session du user dans le store Postgres (`connect-pg-simple` — table `session`), en gardant `req.sessionID` courant.
- Rate-limiting : `express-rate-limit` sur `/login` et l'endpoint change-password (fenêtre + plafond à définir en archi).

## Menace #3 — CSRF (option c, token)

- Base déjà en place : cookie `httpOnly` + `secure`(prod) + `sameSite:lax`.
- **Token CSRF** retenu (défense en profondeur par-dessus SameSite). Reco : **synchronizer token stocké côté session** (store Postgres `connect-pg-simple` déjà là) — le serveur génère un token par session, le front le lit (endpoint ou cookie lisible) et le renvoie en en-tête (`X-CSRF-Token`) sur chaque requête mutante ; middleware de vérification sur toutes les routes non-GET. Alternative : double-submit cookie (stateless) — à trancher en archi.
- `logout` : **GET → POST** (state-changing GET = angle résiduel de SameSite=Lax). Audit : aucune autre route mutante en GET.
- Hygiène : retrait du JWT vestigial (jamais vérifié) ; secret(s) obligatoire(s) au boot (échec si absent, fin du fallback `'MUSICIAN_SECRET'`).
- CORS (`server.js:104-112`) : une seule origine autorisée — base de l'éventuel check Origin ; vérifier `Access-Control-Allow-Credentials`.

## Identité Discord-style (handle name#discriminant)

Objectif : une identité **unique et partageable** (socle d'un futur partage de songlist), sans refuser de nom à l'inscription.

- **Modèle** : `email` (login, unique, normalisé casse-insensible) ; `name` (affichage, **non unique**) ; `discriminator` (`#NNNN`). Unicité DB sur la **paire `(name, discriminator)`** — ou colonne `handle` calculée unique. Collation cohérente avec l'email (insensible casse).
- **Migration `Users`** : drop de la contrainte `unique` sur `name` (модèle actuel l'a, `user.js:14-21`) ; ajout `discriminator` ; backfill d'un discriminant pour les comptes existants ; index unique sur la paire.
- **Attribution** : à l'inscription, choisir un discriminant **libre pour ce nom** (random dans `0001`–`9999`, retry sur collision ; à l'échelle beta, trivial). Jamais d'erreur « nom pris » côté UX.
- **Garde-fou d'épuisement** : si les 9999 discriminants d'un nom sont **tous** pris (cas extrême, hors d'atteinte à l'échelle actuelle), basculer en **refus** et demander un autre nom d'affichage. Seul cas où l'UX oppose « ce nom est plein » (fuite d'énumération négligeable : révèle qu'un nom a 9999 comptes).
- **Changement de nom d'affichage** (profil) : garder le discriminant courant si `(nouveau_nom, disc)` est libre, sinon en réattribuer un libre. À confirmer en archi (Discord gardait le numéro stable).
- **Login** : email-only (`loginUser` simplifié, retrait du `Op.or` name/email). Le handle n'est **pas** un identifiant de connexion — c'est une identité sociale/partage.
- **Hors Epic 7** : le **partage de songlist** lui-même (le handle n'en est que le prérequis).
