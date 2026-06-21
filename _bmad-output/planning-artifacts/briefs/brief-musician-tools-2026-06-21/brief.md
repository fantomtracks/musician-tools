---
title: "Product Brief — Epic 7 : Compte utilisateur"
status: final
created: 2026-06-21
updated: 2026-06-21
---

# Product Brief: Epic 7 — Compte utilisateur

## Executive Summary

L'authentification de musician-tools a toujours été supposée « déjà là » : on s'inscrit, on se connecte, on se déconnecte — mais on ne peut **rien gérer** de son compte. Pas de changement de mot de passe, pas de correction d'email, pas de « mot de passe oublié ». Pour 3-4 utilisateurs beta, le moindre oubli ou faute de frappe se règle aujourd'hui en support manuel par northwood.

L'Epic 7 livre une **vraie gestion de compte** : éditer son profil (nom d'affichage, email, mot de passe), réinitialiser un mot de passe oublié par email, et vérifier les emails. Mais cet épic était **bloqué** pour une bonne raison : exposer des routes de compte sur Internet sans avoir d'abord durci la posture de sécurité, c'est ouvrir une surface d'**account takeover**. Ce brief traite donc **deux choses indissociables** : la fonctionnalité de gestion de compte, et le **design sécurité app-wide** qui doit l'accompagner.

Posture retenue (northwood, « propre une bonne fois ») : on traite les **quatre menaces** à fond plutôt que de colmater au minimum.

## The Problem

- **Pour l'utilisateur** : aucun moyen de mettre son compte à jour en autonomie. Email mal saisi à l'inscription = compte bancal. Mot de passe oublié = perte d'accès totale (aucun flux de reset). Email à corriger = ticket support.
- **Pour le produit** : la couche auth porte une dette latente — un vrai trou IDOR (`getSong` sans contrôle d'ownership), un oracle d'énumération (403 vs 404), une posture CSRF reposant sur le seul SameSite, un JWT mort et un secret en dur. Tant qu'on n'expose pas de routes de compte, le risque est contenu ; dès qu'on le fait, il devient réel.

## The Solution

Une **page Profil** (accessible au Header, authentifié) et les flux de compte associés, posés sur une **base d'auth durcie** :

- Éditer **nom d'affichage**, **email** (avec vérification de possession), **mot de passe** (mot de passe actuel exigé).
- **Réinitialisation de mot de passe** par email (« mot de passe oublié »).
- **Vérification d'email obligatoire à l'inscription**.
- **Login email-only** : l'email est le seul identifiant de connexion.
- **Identité Discord-style** : nom d'affichage **non unique** + **discriminant `#NNNN`** auto-assigné → un **handle unique et partageable** (`northwood#8590`), socle d'un futur partage de songlist.

Le tout sur une infra d'**email transactionnel** (nouvelle, à monter) qui sert les trois usages : changement d'email, reset, vérification d'inscription.

## Who This Serves

Les utilisateurs de musician-tools (musiciens qui suivent leur pratique) — aujourd'hui 3-4 en beta, mono-utilisateur (chacun ses données, pas de partage). Bénéfice : autonomie sur son compte, et un compte réellement protégé contre le détournement. Bénéfice indirect pour northwood : fin du support manuel sur les comptes.

## Scope

**Dans l'épic :**
- Page Profil : édition nom d'affichage / email / mot de passe.
- Reset de mot de passe par email.
- Vérification d'email à l'inscription.
- Login email-only.
- **Modèle d'identité Discord-style** : nom d'affichage non unique + discriminant `#NNNN` → handle unique partageable.
- Infra email transactionnel (socle des trois flux email).
- **Le design sécurité ci-dessous** (app-wide), traité dans le même épic.

**Hors épic (assumé) :**
- **Partage de songlist** (le handle en est le socle, mais le partage lui-même = épic futur).
- Multi-utilisateur / collaboration.
- SSO / OAuth / 2FA (pas pour cette beta).
- Verrouillages de concurrence app-wide (restent en dette consciente, cf. `deferred-work.md`).

## Design sécurité (le vrai bloqueur de l'épic)

Quatre menaces, traitées à fond. _Détail technique → `addendum.md`._

**① Account takeover**
- Mot de passe : **minimum 10 caractères**, pas de règles de composition, pas de rotation forcée. Setter bcryptjs du modèle ; le hash n'est jamais renvoyé.
- Changement de mot de passe : **mot de passe actuel exigé et vérifié** (`validPassword`).
- **Invalidation des autres sessions** au changement de mot de passe (on garde la session courante) — via le store Postgres `connect-pg-simple`.
- **Rate-limiting** (`express-rate-limit`) sur le login et le changement de mot de passe.

**② IDOR / ownership**
- **Audit systématique** de toutes les routes contre le pattern canonique d'ownership. Le code est déjà sain quasi partout ; trous confirmés : **`getSong`** (aucun ownership) et la non-validation de l'`instrumentUid` dans `markSongPlayed`.

**③ CSRF**
- **Token CSRF** (synchronizer token, en plus du `SameSite=Lax` déjà en place) vérifié sur toutes les routes mutantes.
- **`logout` GET → POST** (seul state-changing GET, angle résiduel de Lax) ; audit qu'aucune autre mutation n'est en GET.
- Hygiène : **retrait du JWT vestigial** (émis, jamais vérifié) et **secret obligatoire au démarrage** (fin du fallback `'MUSICIAN_SECRET'`).

**④ Énumération de comptes**
- **403 vs 404 → collapse en 404 partout** (requêtes scopées `where: { uid, userUid }`) : « pas à toi » indistinguable de « n'existe pas ».
- **Email généricisé** : plus jamais « email déjà pris » ; on répond toujours « vérifie ta boîte » et on **notifie le vrai propriétaire** si l'email existe.
- **Nom jamais refusé** (identité Discord-style : doublons auto-disambiguïsés par le discriminant) → l'oracle d'énumération sur le nom **disparaît par construction**.
- **Email normalisé** (lowercase/trim) + **unique insensible à la casse** (`citext`/`LOWER()`).

## Success Criteria

- Un utilisateur change seul son mot de passe, son email (confirmé par lien) et son nom d'affichage — sans support.
- Deux utilisateurs peuvent porter le même nom d'affichage ; chacun garde un **handle unique** (`name#NNNN`) sans qu'aucune inscription ne soit refusée pour cause de nom pris.
- Un utilisateur qui a oublié son mot de passe le réinitialise seul par email.
- `getSong` et toute route renvoient 404 (jamais une donnée d'autrui, jamais un 403 révélateur).
- Aucune réponse ne révèle l'existence d'un email/compte.
- Une requête mutante sans token CSRF valide est rejetée.
- Le démarrage échoue si le secret de session est absent ; plus aucun JWT ni secret en dur dans le code.

## Open Questions (niveau architecture — non bloquantes pour ce brief)

1. **État d'un utilisateur non vérifié** : gate dur (aucun accès tant que non vérifié) vs soft (connecté mais limité/relancé) ?
2. **Fournisseur email transactionnel** : Resend / Postmark / SMTP ?
3. **Mécanique du token CSRF** : synchronizer token (session) vs double-submit cookie ?
4. **Rate-limit** : fenêtre et plafond.
5. **Migration des users beta** : attribution d'un discriminant aux comptes existants + normalisation des emails.
6. **Discriminant** : format (`0001`–`9999` ?) et **stabilité** quand on change de nom d'affichage (garder le numéro si `(nom, disc)` libre, sinon réassigner).
