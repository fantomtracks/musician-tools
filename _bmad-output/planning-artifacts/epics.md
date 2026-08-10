---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/prd.md
  - _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/addendum.md
  - _bmad-output/planning-artifacts/briefs/brief-musician-tools-2026-06-21/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-musician-tools-2026-06-21/addendum.md
  - _bmad-output/planning-artifacts/architecture.md
epic7:
  source: 'hors-PRD — brief + addendum + architecture (validé northwood 2026-06-21)'
  stepsCompleted: [1, 2, 3, 4]
epic14:
  source: 'issu deferred-work (lot UX/UI mobile, option 1) — cadré bmad-ux 2026-07-04 (DESIGN.md + EXPERIENCE.md status:final)'
  added: 2026-07-04
epic15:
  source: 'issu deferred-work (A5 signal UX rate-limit, rétro Epic 7) + résidu 7-13 rattaché — cadrage verrouillé 2026-07-05'
  added: 2026-07-05
epic16:
  source: 'issu deferred-work § À brainstormer (bug prod trim artiste + quick-win tuning basse) — cadré 2026-07-09 ; auto-création SongForm volontairement EXCLUE (epic dédiée après brainstorm)'
  added: 2026-07-09
epic17:
  source: 'issu brainstorm 2026-07-10 (auto-création fiche chanson, exclue d''Epic 16) — synthèse brainstorming-session-2026-07-10-0810.md ; décisions ouvertes tranchées northwood 2026-07-10 (casse-insensible, interroger prod avant merge FK, blocage doublon symétrique durcit 13.1)'
  added: 2026-07-10
epic18:
  source: 'issu rétro Epic 17 + QA 17.2 (fiche chanson = état local, pas une route) — cadré en ADR architecture-song-route-2026-07-11.md (décision northwood : migrer vers data-router). Ferme 3 items nav (refresh, back-button, guard maison 17.2). Découpage tranché : 2 stories (migration pure → route-ify + swap guard).'
  added: 2026-07-11
epic19:
  source: 'Catalog — pool partagé de chansons. Source = prd-musician-tools-2026-07-12 (FR-1..13, NFR-1..6) + addendum + ux-musician-tools-2026-07-12 (DESIGN/EXPERIENCE, DL-*) + architecture-catalog-2026-07-12.md. Première donnée partagée non-scopée userUid ; rôle isCurator (403) ; Add snapshot+provenance ; Collections + playlist miroir.'
  added: 2026-07-15
  inputDocuments:
    - _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-07-12/prd.md
    - _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-07-12/addendum.md
    - _bmad-output/planning-artifacts/ux-designs/ux-musician-tools-2026-07-12/DESIGN.md
    - _bmad-output/planning-artifacts/ux-designs/ux-musician-tools-2026-07-12/EXPERIENCE.md
    - _bmad-output/planning-artifacts/architecture-catalog-2026-07-12.md
epic22:
  source: 'issu deferred-work § "Found during: QA prod Catalog — curation & parcours lecteur" (2026-08-08) — fil rouge northwood « dès qu''on affiche une liste de chansons, c''est l''affichage Songlist ». Pas d''ADR : front-only, aucune migration, aucun endpoint nouveau (les briques 19.9/20.3 existent). Relevé corrigé contre le code au cadrage : useRowSelection déjà branché sur CatalogManage, StickyActionBar hors sujet (coquille de formulaire), MultiSelectTable jamais livré (descope 19.9 non tracé). 4 décisions verrouillées 2026-08-10 : A N appels front best-effort (pas d''endpoint bulk) · B un sous-ensemble n''alimente pas la playlist miroir · C pas de MultiSelectTable générique (colonnes légitimement différentes) · D l''affichage Songlist est la référence visuelle.'
  added: 2026-08-10
---

# musician-tools - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for musician-tools, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1 : L'utilisateur peut créer un sujet de travail avec un nom (requis) et une catégorie libre (optionnelle). Pas de hiérarchie : liste plate.
FR2 : L'utilisateur peut renommer, recatégoriser et supprimer ses propres sujets (propriété vérifiée, comme pour les chansons).
FR3 : L'utilisateur dispose d'une page de gestion simple listant tous ses sujets.
FR4 : La suppression d'un sujet ne supprime pas l'historique : les sessions passées qui le référencent continuent d'afficher son nom. En rééditant une session, l'utilisateur peut reclasser une entrée vers un autre sujet.
FR5 : Les sujets de travail sont distincts des « techniques » existantes (métadonnées de chanson) : aucun rapprochement automatique dans cette itération.
FR6 _(amendé 2026-06-18)_ : L'utilisateur peut créer une session avec : date (défaut : aujourd'hui ; toute date passée autorisée — session rétroactive ; dates futures interdites) et instrument. Plus de durée globale saisie (le temps se loggue via les entrées — FR13). Aucune durée minimale.
FR7 : Une session porte exactement un instrument. Deux instruments le même jour = deux sessions distinctes.
FR8 : Une session contient zéro ou plusieurs entrées ; chaque entrée référence une chanson ou un sujet, avec minutes (optionnelles) et note libre contextuelle (optionnelle).
FR9 : Une session porte une note libre globale (optionnelle).
FR10 _(amendé 2026-06-18)_ : Toute session est éditable a posteriori : date, instrument, entrées (dont leurs minutes), notes. (Durée totale dérivée des entrées, plus saisie.)
FR11 : Toute session est supprimable, avec dialogue de confirmation (pattern existant).
FR12 : La saisie est optimisée pour la vitesse : chansons et sujets récents suggérés en premier, recherche instantanée, instrument par défaut pré-rempli. Cible : session complète saisie en moins de 30 secondes.
FR13 _(amendé 2026-06-18)_ : La durée totale d'une session est toujours la somme des minutes de ses entrées — plus de durée globale surchargeable. Le temps non structuré se loggue via une entrée sur le topic système « Free practice » (FR25).
FR14 : L'utilisateur peut consulter l'historique de ses sessions (liste antichronologique avec date, durée, instrument, entrées).
FR15 _(précisé 2026-06-18)_ : Grille annuelle type GitHub, une case par jour ; intensité = minutes totales du jour (= somme des minutes des entrées), échelle relative à l'utilisateur (paliers type quartiles GitHub). Toute session allume le jour quelle que soit sa durée (intensité minimale visible).
FR16 : Cliquer sur un jour ouvre le détail : sessions de la journée avec leurs entrées et notes.
FR17 : L'utilisateur peut naviguer entre les années.
FR18 : Aucune mécanique punitive : pas de compteur de streak cassée, pas de couleur agressive sur les jours vides, pas de notification de relance.
FR19 : Le « jour » d'une session est la date locale de l'appareil au moment de la saisie — le client détermine la date, jamais l'horloge du serveur.
FR20 : La heatmap est visible dès le premier jour, même vide — pas de seuil minimal de sessions.
FR21 : « Mark as Played Now » crée la session du jour pour l'instrument concerné (si absente) ou la complète : chanson ajoutée comme entrée, sans minutes. Jour = date locale de l'appareil.
FR22 : Rétro-import : l'historique de lectures existant (« Mark as Played » passés) est projeté dans la heatmap — chaque lecture passée allume son jour à l'intensité minimale.
FR23 : Cohérence inverse : ajouter une chanson à une session met à jour son « dernier joué » pour l'instrument de la session si la date de la session est plus récente ; éditer la date d'une session ou la supprimer recalcule le « dernier joué » des chansons concernées.

### NonFunctional Requirements

NFR1 : Vitesse de saisie — formulaire de session utilisable en < 30 s par un utilisateur récurrent ; aucune étape obligatoire au-delà de la date et de l'instrument.
NFR2 : Performance heatmap — rendu < 1 s avec une année complète de données (365 jours, plusieurs centaines de sessions, rétro-import inclus).
NFR3 : Responsive complet — journal, saisie et heatmap pleinement utilisables sur mobile et desktop ; dark mode partout ; préférences d'affichage via le pattern localStorage existant.
NFR4 : Propriété des données — un utilisateur ne voit et ne modifie que ses propres sessions et sujets (middleware d'ownership existant appliqué aux nouvelles routes).
NFR5 : Migrations — nouvelles tables (sessions, sujets, entrées) en migrations idempotentes (standard projet) ; rétro-import (FR22) rejouable sans doublon.
NFR6 : Accessibilité — heatmap navigable au clavier avec alternatives textuelles (ARIA) ; formulaires labellisés (standard existant).

### Additional Requirements

- Pas de starter template : projet brownfield — l'itération se greffe sur l'app existante (React + TypeScript + Vite + Tailwind ; Express + Sequelize + Supabase ; déploiement Fly.io auto sur main).
- Modèle de données cible (addendum) : Session (date, durée totale, un seul instrument, note libre globale, entrées[]) ; Entrée/SessionItem (référence chanson OU sujet, minutes optionnelles, note libre optionnelle) ; Sujet (nom, catégorie libre optionnelle). Garder le modèle Session minimal — les évolutions futures s'y branchent sans le modifier.
- La table `SongPlay` existante reste la source d'événements de lecture ; le « dernier joué » par instrument en est dérivé (`Song.lastPlayed` est global). Recalcul du dérivé à l'édition/suppression de session (FR23).
- Rétro-import (FR22) : projeter les `SongPlay` historiques dans la heatmap — projection rejouable, sans duplication en table session (arbitrage projection à la lecture vs backfill matérialisé à faire en implémentation).
- Date locale client (FR19/FR21) : ne pas horodater le jour côté serveur — l'implémentation actuelle de `markSongPlayed` utilise l'horloge serveur, à corriger au passage.
- Mesure des métriques produit (M1-M4) depuis les données serveur existantes — pas d'outil d'analytics tiers dans cette itération.

### UX Design Requirements

_Aucun document UX Design — section sans objet pour cette itération. Les exigences UX portées par le PRD : philosophie « miroir, pas fouet » (FR18), saisie < 30 s (FR12/NFR1), heatmap type GitHub à échelle relative (FR15), responsive + dark mode (NFR3), accessibilité (NFR6)._

### FR Coverage Map

FR1: Epic 1 - Création de sujet (nom + catégorie libre, liste plate)
FR2: Epic 1 - Renommer/recatégoriser/supprimer ses sujets (ownership)
FR3: Epic 1 - Page de gestion des sujets
FR4: Epic 1 - Suppression sans trou d'historique + reclassement d'entrée
FR5: Epic 1 - Sujets distincts des « techniques » existantes
FR6: Epic 2 - Création de session (date rétroactive, pas de durée minimale, dates futures interdites)
FR7: Epic 2 - Une session = un instrument
FR8: Epic 2 - Entrées chanson OU sujet (minutes + note optionnelles)
FR9: Epic 2 - Note libre globale de session
FR10: Epic 2 - Édition complète a posteriori
FR11: Epic 2 - Suppression avec confirmation
FR12: Epic 2 - Saisie < 30 s (suggestions récentes, recherche instantanée, défauts)
FR13: Epic 2 (amendé Epic 8, 2026-06-18) - Durée = somme des entrées, plus de surcharge globale
FR14: Epic 2 - Historique antichronologique des sessions
FR15: Epic 3 - Grille annuelle type GitHub, échelle relative, toute session allume le jour
FR16: Epic 3 - Détail des sessions au clic sur un jour
FR17: Epic 3 - Navigation entre années
FR18: Epic 3 - Aucune mécanique punitive
FR19: Epic 3 - Jour = date locale de l'appareil (client source de vérité)
FR20: Epic 3 - Heatmap visible dès le premier jour
FR21: Epic 4 - « Mark as Played » crée/complète la session du jour de l'instrument
FR22: Epic 3 - Rétro-import de l'historique de lectures dans la heatmap
FR23: Epic 4 - Cohérence bidirectionnelle du « dernier joué » (mise à jour + recalcul)
FR24: Epic 6 (étendu Epic 8) - Durée de chanson alimentant le pré-remplissage du temps de session (Mark as Played ET entrée manuelle)
FR21 (amendé 2026-06-10): Epic 4 + Epic 6 - Mark as Played pré-remplit / incrémente les minutes depuis la durée de chanson
FR25 (ajouté 2026-06-18): Epic 8 - Topic système « Free practice » épinglé pour le temps non structuré
FR26 (ajouté 2026-06-18): Epic 8 - Création de topic à la volée dans le sélecteur d'entrée

---

### Epic 7 — Compte utilisateur (hors-PRD, ajouté 2026-06-21)

_Source : brief + addendum (2026-06-21) + architecture (2026-06-21), validés northwood. Pas de PRD dédié (auth supposée préexistante dans le PRD initial). Numérotation **namespacée** (`FR-A*` Account, `NFR-S*` Security) pour marquer la frontière avec le PRD._

**Exigences fonctionnelles — gestion de compte (`FR-A*`)**

FR-A1 : Page Profil authentifiée (accès depuis le Header) permettant d'éditer nom d'affichage, email et mot de passe.
FR-A2 : Changement d'email en *verify-before-switch* — l'email n'est jamais écrasé directement ; stockage `pendingEmail` + token `change_email` expirant (1 h), bascule `pendingEmail → email` au clic du lien ; le login reste sur l'ancien email jusqu'à confirmation.
FR-A3 : Vérification d'email à l'inscription en **soft gate** — l'inscription connecte directement, bandeau persistant « vérifie ton email », actions sensibles (change-email, futur partage) bloquées tant que non vérifié ; endpoint « renvoyer le lien » (rate-limité). Token `verify_email` expirant (24 h).
FR-A4 : Reset de mot de passe par email (« mot de passe oublié ») — pages forgot/reset, token `password_reset` expirant (1 h), usage unique.
FR-A5 : Login **email-only** — l'email est le seul identifiant de connexion (retrait du `Op.or` name/email dans `loginUser`) ; le handle n'est pas un identifiant.
FR-A6 : Identité Discord-style — `name` non-unique + `discriminator #NNNN` (`0001`–`9999`, STRING zero-paddée) → handle unique et partageable `name#NNNN`. Attribution d'un discriminant libre à l'inscription (retry sur collision), **jamais de refus de nom** (sauf épuisement des 9999) ; stable au rename si `(nouveau_nom, disc)` libre, sinon réattribué.
FR-A7 : Infra email transactionnel (Resend, via `emailService` unique) — socle commun des trois flux email (verify-signup, password-reset, change-email).
FR-A8 : Au register sur un email déjà existant — réponse générique (jamais « email déjà pris ») + **notification au vrai propriétaire** de la tentative (via `emailService`).

**Exigences non-fonctionnelles — sécurité (le bloqueur de l'épic, `NFR-S*` = les 4 menaces)**

NFR-S1 (① Account takeover) : mot de passe ≥ 10 caractères (validé serveur + miroir front, setter bcryptjs) ; mot de passe actuel exigé et vérifié (`validPassword`) au change-mdp ; **invalidation des autres sessions** au change-mdp (suppression des lignes `session` du user sauf `req.sessionID`) ; **rate-limiting** (`express-rate-limit ^8`, `trust proxy`) sur login (10/15 min/IP), forgot-password (5/h/IP), envoi d'email (5/h/compte).
NFR-S2 (② IDOR / ownership) : audit systématique de toutes les routes vs le pattern ownership canonique ; correction de `getSong` (aucun ownership → requête scopée `where:{uid,userUid}`) et validation de l'appartenance d'`instrumentUid` dans `markSongPlayed`.
NFR-S3 (③ CSRF) : synchronizer token en session (`X-CSRF-Token`, endpoint `GET /api/csrf-token`) vérifié sur **toutes les routes non-GET** ; `logout` GET→POST (audit : aucune autre mutation en GET) ; retrait total du JWT vestigial ; secret(s) **fail-fast au boot** (`SESSION_SECRET`, `RESEND_API_KEY` obligatoires sinon `process.exit(1)`, fin du fallback `'MUSICIAN_SECRET'`).
NFR-S4 (④ Énumération de comptes) : collapse **403→404 partout** (« pas à toi » indistinguable de « n'existe pas ») ; réponses email génériques identiques (`CHECK_YOUR_INBOX`) quel que soit l'existence du compte ; nom jamais refusé (désambiguïsation par discriminant) ; email en `citext` normalisé (lowercase/trim), unique insensible à la casse.

**Exigences additionnelles / contraintes (architecture + project-context)**

- Brownfield, prod sans staging : **pas de story d'init** ; toute migration `Users`/`AuthTokens` idempotente et testée localement avant merge (`main` = déploiement prod auto).
- Nouvelles tables/colonnes : `Users` += `discriminator`/`emailVerified`/`pendingEmail`, drop `unique(name)`, index unique `(name, discriminator)`, email `citext` ; table `AuthTokens` (`type` ENUM `verify_email|password_reset|change_email`, `tokenHash` sha256, `payload`, `expiresAt`, `usedAt`) — pattern `Songs` (camelCase JS + `field:'snake_case'`).
- Backfill beta (grandfathering) : discriminant aléatoire libre par nom, email lowercase, `emailVerified=true`, `pendingEmail=null` — migration rejouable.
- Briques transverses **réutilisables obligatoires** : `emailService`, middleware `csrf`/`ratelimiters`/`requireverified`, helper d'invalidation de session, helper CSRF front (`apiFetch`), constante `CHECK_YOUR_INBOX` — jamais réimplémentées localement.
- Nouvelles variables d'env (à provisionner Fly) : `SESSION_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`.
- Backend CommonJS strict, pattern contrôleur ownership canonique, réponses JSON brutes, double suite Jest, langue anglaise — les 46 règles de `project-context.md` s'appliquent telles quelles.

**FR Coverage Map — Epic 7 (toutes les exigences → Epic 7, story pressentie entre parenthèses)**

FR-A1 : Epic 7 (7.8) - Page Profil : nom d'affichage + change-mdp
FR-A2 : Epic 7 (7.11) - Change-email verify-before-switch
FR-A3 : Epic 7 (7.9) - Vérif inscription + soft gate
FR-A4 : Epic 7 (7.10) - Reset mot de passe par email
FR-A5 : Epic 7 (7.7) - Login email-only
FR-A6 : Epic 7 (7.2 migration, 7.7 register) - Identité Discord-style name#NNNN
FR-A7 : Epic 7 (7.6) - Infra email Resend + AuthTokens
FR-A8 : Epic 7 (7.7) - Notification du vrai propriétaire au register sur email existant
NFR-S1 : Epic 7 (7.4 rate-limit, 7.8 mdp actuel + invalidation sessions) - Account takeover
NFR-S2 : Epic 7 (7.5) - IDOR/ownership : audit + getSong + markSongPlayed
NFR-S3 : Epic 7 (7.1 secret/JWT, 7.3 CSRF) - CSRF + hygiène secrets
NFR-S4 : Epic 7 (7.2 citext, 7.5 collapse 403→404, 7.7 réponses génériques) - Énumération
Durcissements repliés du deferred-work (2026-06-21) : garde `req.body` généralisée → Epic 7 (7.5) ; unicité topic citext serveur (gap AC10 de 8-2) → Epic 7 (7.12)

## Epic List

### Epic 1: Ma bibliothèque de sujets de travail
Je définis et gère mes sujets de travail (pentatonique, gammes, technique…) — la deuxième dimension de ma pratique existe dans l'app.
**FRs covered:** FR1, FR2, FR3, FR4, FR5

### Epic 2: Mon journal de sessions
Je logge toute ma pratique — chansons et sujets, durées, notes — y compris rétroactivement, en moins de 30 secondes, et je consulte mon historique.
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14

### Epic 3: Ma pratique en un coup d'œil (heatmap)
Je vois ma régularité dans une grille annuelle type GitHub — et ma grille a déjà une histoire grâce au rétro-import de mon historique de lectures.
**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR20, FR22

### Epic 4: La capture sans effort (pont avec l'existant)
Je joue comme avant — « Mark as Played » — et mon journal se remplit tout seul, sans jamais fausser mon « dernier joué ».
**FRs covered:** FR21, FR23

### Epic 5: Robustesse / confort (post-PRD, issu des rétros)
Petites stories de robustesse et de confort nées des rétros et du terrain (pas dans le PRD initial). Stories : 5.1 re-login 401 (done), 5.2 saisie de session repensée / combobox (done, v1.3.1), 5.3 Songlist & navigation au propre (done), 5.4 filtres Songlist cohérents (done), 5.5 libellé chanson « Artiste - Titre » cohérent partout (done), 5.6 suppression de chanson → nettoyer les playlists / UID orphelin (done, bug), 5.7 playlists ↔ chansons : vrai lien en base / clé étrangère (done, v1.3.x), 5.8 Songlist détection de doublon / visibilité (done, v1.3.6, rétroactif). Détail dans `implementation-artifacts/`.

### Epic 6: Capture enrichie — durée de répertoire
Je renseigne une durée sur mes chansons et le « Mark as Played » remplit automatiquement le temps de ma session.
**FRs covered:** FR24, FR21 (amendé)

### Epic 7: Compte utilisateur + durcissement sécurité app-wide
Je gère mon compte en autonomie (page Profil : nom d'affichage, email, mot de passe ; reset par email ; vérification d'email à l'inscription) sous une identité partageable `name#NNNN` — le tout posé sur une base d'auth durcie contre les 4 menaces (account takeover, IDOR, CSRF, énumération de comptes). _Cadré 2026-06-21 (brief + addendum + architecture) ; débloque le stub « HORS PRD » du 2026-06-10._
**FRs covered:** FR-A1, FR-A2, FR-A3, FR-A4, FR-A5, FR-A6, FR-A7, FR-A8 — **NFRs:** NFR-S1, NFR-S2, NFR-S3, NFR-S4

### Epic 8: Refonte temps de session — « tout est entrée »
La session devient un simple regroupement (jour + instrument) ; la durée totale = somme des minutes des entrées ; le temps non structuré se loggue via le topic système « Free practice ».
**FRs covered:** FR13 (amendé), FR15 (précisé), FR24 (étendu), FR25, FR26

### Epic 9: Robustesse / confort UI (post-rétro)
Petites stories de confort/robustesse UI nées du terrain et de la revue `deferred-work.md`, soldées **avant l'Epic 7** : nav mobile, clarté des filtres Songlist, dé-duplication de l'affichage de session, navigation chanson depuis l'historique.
**Couvre :** NFR3 (responsive) + dette de maintenabilité (deferred-work 2026-06-21)

### Epic 10: Confort / playlists (post-rétro Epic 7, issu deferred-work)
Créer une playlist à la volée depuis la fiche chanson, adossé à l'unicité serveur du nom de playlist. Stories : 10.1 unicité nom playlist serveur (done), 10.2 créer une playlist à la volée (done). _Détail § Epic 10 ci-dessous._

### Epic 11: Dette technique / santé du socle (issu rétro Epic 10)
Parité dev/CI sur l'unicité : garde fail-fast au boot + ordonnancement migrate-then-app, hook `afterSync` retiré. Story : 11.1 parité-sync unicité dev (done). _Détail § Epic 11 ci-dessous._

### Epic 12: Confort vérification email (issu deferred-work, items 7-13 promus)
Distinguer un lien de vérif consommé-mais-valide d'un lien invalide (clic redondant sur un 2e appareil) + combler les tests front des branches de vérif. Story : 12.1 verif-email UX (done). _Détail § Epic 12 ci-dessous._

### Epic 13: Confort édition — « atelier vivant » (issu brainstorm auto-save 2026-06-29)
Auto-save de la fiche chanson (debounce + flush, `lastPlayed` exclu), statut « Saving/Saved », barre Back sticky. Story : 13.1 auto-save fiche chanson (done). _Détail § Epic 13 ci-dessous._

### Epic 14: Confort mobile — Songlist + édition (issu deferred-work, cadré bmad-ux 2026-07-04)
Rendre l'app pleinement utilisable au téléphone (NFR3) : favicon produit, header non-connecté qui ne déborde plus, Songlist responsive (tableau scroll interne cap 65vh + en-tête sticky + filtres repliables + `min-w-0`/scroll horizontal), fiche d'édition lisible. Stories : 14.1 favicon, 14.2 header overflow non-connecté, 14.3 Songlist responsive, 14.4 SongForm mobile (toutes backlog). _Détail § Epic 14 ci-dessous._

### Epic 15: Signal UX rate-limit + anti-oracle (issu deferred-work, A5 + 7-13)
Un user légitime rate-limité voit un message **clair et traduit** (« too many attempts ») au lieu du `Too Many Requests` brut confondu avec une erreur d'identifiants ; et la **latence de resend/forgot-password est égalisée** pour fermer l'oracle de timing résiduel — sans affaiblir l'anti-bruteforce ni rouvrir d'oracle d'énumération. Stories : 15.1 signal UX 429, 15.2 égalisation latence (backlog). **Couvre :** NFR-S1 (rate-limit) + NFR-S4 (anti-énumération). _Détail § Epic 15 ci-dessous._

### Epic 16: Fix prod doublons artiste + confort tunings (issu deferred-work § À brainstormer)
Deux items indépendants sortis de la revue deferred-work : un **vrai bug prod** — les champs `artist`/`album`/`title` sont stockés verbatim sans `.trim()`, donc « michael jackson » vs « michael jackson　» créent deux artistes distincts dans les suggestions/filtres (fix saisie + migration one-off de nettoyage) — et un **quick-win** — ajouter le tuning « Half-step down » manquant pour la basse (4 et 5 cordes). Stories : 16.1 trim + migration cleanup, 16.2 tuning basse demi-ton (backlog). _L'auto-création SongForm (retrait du bouton `Add`) est **volontairement exclue** : design-avant-code, epic dédiée après brainstorm — cf. deferred-work § À brainstormer. Détail § Epic 16 ci-dessous._

### Epic 17: Auto-création fiche chanson + unicité serveur (issu brainstorm 2026-07-10)
L'auto-création exclue d'Epic 16, cadrée après brainstorm (First Principles + Reverse Brainstorming, 8 décisions verrouillées). Le **titre devient l'identité** (artiste facultatif) : on retire le bouton `Add` interne du `SongForm` et la chanson **naît au débounce** (calque 13.1) au lieu d'un submit explicite ; garde-fous anti-chanson-vide (régimes Seuil 1), bascule `add→edit` invisible + verrou in-flight. En parallèle, une **politique doublon unique dans toute l'app** : clé **(titre + artiste)** casse-insensible, **blocage symétrique création + édition** (durcit 13.1 : « bloque » au lieu de « prévient mais sauve »), adossée à une **garde serveur** (index unique + 409, mirror 10.1). Stories : 17.1 unicité chanson serveur (merge FK ciblé + index unique + 409), 17.2 auto-création front + blocage doublon symétrique (backlog). ⚠️ 17.1 **rouvre le merge FK** esquivé par 16.1 → interroger la prod d'abord. **Ferme** l'item 🧊 course find-or-create chansons. _Détail § Epic 17 ci-dessous._

### Epic 18: Fiche chanson = vraie route (migration data-router)
Issu de la rétro Epic 17 + QA 17.2 : la fiche chanson est un **état local** (`page:'form'` + `editingUid`), pas une route → 3 symptômes de même racine (refresh sur une chanson → songlist ; back-button navigateur non gardé ; `useBlocker` indispo → guard de nav **maison** construit en 17.2). Cadré en **ADR** (`architecture-song-route-2026-07-11.md`, décision northwood) : **migrer `<BrowserRouter>` → `createBrowserRouter`/`<RouterProvider>` (data-router)** et **router-ifier le form** (`/songs`, `/songs/new`, `/songs/:uid`). Débloque `useBlocker` qui **remplace intégralement** le guard maison → **dette nette réduite**. Stories : 18.1 migration data-router **pure** (aucun changement de comportement, toutes routes à l'identique), 18.2 route-ify le form + swap guard→`useBlocker` (ferme refresh + back-button + 404 scopé deep-link). ⚠️ **Révise du code shippé** (guard 17.2, v1.13.0) : le remplacement `useBlocker` doit préserver l'UX validée en QA 17.2. _Détail § Epic 18 ci-dessous._

### Epic 19: Catalog — Browse & Add (pool partagé, cadré 2026-07-12)
Le **Catalog** — première donnée **partagée non-scopée `userUid`** de l'app : un utilisateur trouve une chanson **déjà remplie** et l'ajoute à sa Songlist en secondes (copie **snapshot + provenance**, éditable, garde de doublon 409), et le **curateur** (`isCurator`) crée/édite des fiches (auto-fill, unicité canonique **globale**) pour que le Catalog ait du contenu. Pose les fondations : modèle `CatalogSong` + index canonique global, `requireCurator`/403, `sourceCatalogUid` (référence **souple**), endpoint liste **paginé à enveloppe**, mécanique **Add dédiée**, front URL-as-state + flag doublon **client-side**, crochet Songlist-vide (CTA). Cadré en `architecture-catalog-2026-07-12.md` (PRD Catalog `prd-musician-tools-2026-07-12` FR-1..13). _Livre SM-2 (time-to-first-song)._
**FRs couverts (espace Catalog) :** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-10, FR-11, FR-13 — **NFRs :** NFR-1..6. _Détail § Epic 19 ci-dessous._

### Epic 19 — Story 19.5 : Curateur — gérer les fiches (ajoutée en QA 2026-07-15)
Découvert en QA de l'Epic 19 : l'admin curateur (19-2) est **création-only** ; le curateur ne peut pas **lister / éditer / supprimer** les fiches existantes depuis l'app (seulement via SQL). Or le backend a déjà tout le CRUD (19-1 : `PUT`/`DELETE /api/catalog/:uid`, 409 rename). Story de suivi : un **écran de gestion** dans `/catalog/admin` — liste des fiches + **édition in-place** (réutilise le form de 19-2 en mode edit, `updateCatalogEntry` déjà exposé au service) + **suppression** (`ConfirmDialog` + delete ; le découplage `sourceCatalogUid` souple garantit que les Songs perso copiées survivent). Décision northwood (2026-07-15) : story de suivi, à faire avant ou après le merge de l'epic (TBD). Réutilise 19-1/19-2/19-3.

### Epic 20: Catalog — Collections (peuplement thématique, cadré 2026-07-12)
Un utilisateur **importe une Collection** curée (« Rock 90 ») d'un geste → chansons dans sa Songlist + **Playlist perso miroir** idempotente ; le curateur **compose** des Collections. Bâtit sur Epic 19 (modèle fiche + mécanique Add stables) : tables `CatalogCollection` + jointure, import **non-atomique** best-effort, enrichit le crochet Songlist-vide (aperçu Collections).
**FRs couverts (espace Catalog) :** FR-8, FR-9, FR-12. _Détail § Epic 20 ci-dessous._

### Epic 21: Catalog ↔ Song — provenance & refresh de drift (cadré 2026-07-21, ADR `architecture-catalog-song-link-2026-07-21.md`)
La copie Songlist (19.4 *Add* / 20.3 *import*) est un **snapshot déconnecté** portant `sourceCatalogUid` — aujourd'hui **écrit mais lu nulle part**. Cet épic **expose le lien** (provenance « from the Catalog » + navigation Song → fiche source) et permet de **rafraîchir** une copie quand le curateur a fait évoluer la fiche source : **drift par timestamp** (`sourceCatalogSyncedAt`), **Refresh** qui écrase les champs **intrinsèques** à la version Catalog et **préserve** les champs perso (instrument/accordage/notes…). **Additif strict sur 19.4** : le défaut reste snapshot, la connexion est **opt-in** (action explicite). Raffinement post-Catalog (hors PRD initial). _Détail § Epic 21 ci-dessous._

**Dépendances :** E1 → E2 → (E3 ∥ E4). Les epics 3 et 4 sont indépendants l'un de l'autre. E6 dépend d'E4 (pont Mark as Played). E5 est transverse ; E9 (confort UI, post-rétro) est autonome et se solde avant E7 ; E7 (compte + sécurité, hors-PRD) est autonome — ne dépend d'aucun épic PRD et n'en bloque aucun. E10–E17 (confort/dette/sécu post-rétro) sont de même autonomes, sans dépendance inter-epics, en exécution légère (E15 s'adosse à l'auth durcie d'E7 mais ne dépend d'aucun autre épic). **Intra-E17 :** 17.2 (front) dépend de 17.1 (garde serveur + 409) ; ordre imposé 17.1 → 17.2. E17 durcit rétroactivement la politique doublon posée par 13.1 (édition) mais ne dépend d'aucun autre épic. **Intra-E18 :** 18.2 (route-ify + swap guard) dépend de 18.1 (migration data-router) ; ordre imposé 18.1 → 18.2. E18 révise rétroactivement le guard de nav livré par 17.2 (le supprime au profit de `useBlocker`) mais ne dépend d'aucun autre épic. **E19 → E20** : E19 (Browse & Add + curation de fiches) pose le modèle `CatalogSong` + la mécanique Add dont E20 (Collections) dépend — ordre imposé E19 → E20. E19/E20 (Catalog) sont autonomes vis-à-vis des epics journal ; ils réutilisent SANS les modifier l'unicité Epic 17, les playlists Epic 10, l'auto-fill 8.1 et le data-router Epic 18 (additif strict). Les NFR1-NFR6 et NFR-S1-S4 transverses s'appliquent aux critères d'acceptation des stories concernées ; les NFR-1..6 **Catalog** (espace propre) s'appliquent à E19/E20. **E19 → E21** : E21 (provenance & refresh) dépend du modèle `CatalogSong`, du pointeur `sourceCatalogUid` et de `buildSongFromCatalog` (E19) et de la fiche Song en vraie route (E18) ; **additif strict** sur le snapshot 19.4 (défaut inchangé, connexion opt-in). **Intra-E21 :** 21.2 (front) dépend de 21.1 (colonne + `getSong` enrichi + endpoint Refresh) ; ordre imposé 21.1 → 21.2.

## Epic 1: Ma bibliothèque de sujets de travail

Je définis et gère mes sujets de travail (pentatonique, gammes, technique…) — la deuxième dimension de ma pratique existe dans l'app.

### Story 1.1: Créer un sujet de travail

As a musicien,
I want créer un sujet de travail avec un nom et une catégorie libre optionnelle,
So that je peux nommer ce que je travaille au-delà des chansons.

**Acceptance Criteria:**

**Given** je suis authentifié
**When** je crée un sujet « Pentatonique » sans catégorie
**Then** le sujet est sauvegardé et m'appartient (invisible pour les autres utilisateurs)
**And** il apparaît immédiatement dans ma liste de sujets

**Given** je crée un sujet « Walking bass » avec la catégorie « Technique »
**When** je valide
**Then** le nom et la catégorie sont sauvegardés

**Given** un nom vide
**When** je valide
**Then** une erreur de validation s'affiche (client et serveur) et rien n'est créé

**Given** un déploiement
**When** la migration de la table des sujets s'exécute
**Then** elle est idempotente — rejouable sans erreur (NFR5)
**And** le formulaire est labellisé, responsive et dark mode (NFR3, NFR6)

### Story 1.2: Gérer ma bibliothèque de sujets

As a musicien,
I want consulter, renommer, recatégoriser et supprimer mes sujets,
So that ma bibliothèque reste fidèle à ma pratique réelle.

**Acceptance Criteria:**

**Given** des sujets existants
**When** j'ouvre la page « Sujets »
**Then** je vois la liste plate de tous mes sujets avec nom et catégorie — aucune hiérarchie

**Given** un sujet
**When** je le renomme ou change sa catégorie
**Then** la modification est sauvegardée et visible immédiatement

**Given** un sujet
**When** je le supprime
**Then** un dialogue de confirmation s'affiche (pattern existant) avant suppression définitive
**And** la sémantique de suppression préserve le nom pour les références futures de l'historique (préparation FR4 — vérifié de bout en bout à l'Epic 2)

**Given** les « techniques » existantes des chansons
**When** cette story est livrée
**Then** aucun rapprochement ni migration : le formulaire chanson est inchangé (FR5)

**Given** un autre utilisateur
**When** il tente d'accéder à mes sujets (page ou API)
**Then** l'accès est refusé (NFR4)

## Epic 2: Mon journal de sessions

Je logge toute ma pratique — chansons et sujets, durées, notes — y compris rétroactivement, en moins de 30 secondes, et je consulte mon historique.

### Story 2.1: Créer une session de pratique

As a musicien,
I want enregistrer une session (date, instrument, durée, note libre),
So that ma pratique du jour — ou d'un jour passé — laisse une trace fidèle.

**Acceptance Criteria:**

**Given** je suis authentifié
**When** je crée une session avec la date du jour (pré-remplie), l'instrument « Basse » et 40 minutes
**Then** la session est sauvegardée et m'appartient (NFR4)

**Given** j'ai pratiqué hier sans logger
**When** je crée une session datée d'hier
**Then** la session rétroactive est acceptée sans distinction de traitement (FR6)

**Given** une date future
**When** je valide
**Then** une erreur de validation s'affiche — dates futures interdites (FR6)

**Given** une session de 2 minutes
**When** je valide
**Then** elle est acceptée — aucune durée minimale (FR6)

**Given** le formulaire de création
**When** je choisis l'instrument
**Then** exactement un instrument par session (FR7) ; je peux ajouter une note libre globale optionnelle (FR9)
**And** la migration de la table sessions est idempotente (NFR5) ; formulaire responsive, dark mode, labellisé (NFR3, NFR6)

### Story 2.2: Détailler ma session avec des entrées

As a musicien,
I want ajouter à ma session des entrées — chansons de mon répertoire ou sujets de ma bibliothèque — avec minutes et note contextuelle,
So that je sais précisément ce que j'ai travaillé, et avec quel ressenti.

**Acceptance Criteria:**

**Given** une session en cours de création ou d'édition
**When** j'ajoute une entrée
**Then** je choisis une chanson de mon répertoire **ou** un sujet de ma bibliothèque (FR8)
**And** je peux préciser des minutes optionnelles et une note libre optionnelle (« à 30 BPM ») (FR8)

**Given** une session avec entrées « Sweet Child (15 min) » et « Pentatonique (25 min) »
**When** toutes les entrées portent des minutes
**Then** la durée totale est la somme = 40 min (FR13, amendé 2026-06-18 : dérivée des entrées, plus de surcharge globale)

**Given** une session sans aucune entrée
**When** je valide
**Then** elle est acceptée — zéro entrée est valide (FR8)

**Given** la migration de la table des entrées
**When** elle s'exécute
**Then** elle est idempotente (NFR5)

### Story 2.3: Consulter mon historique de sessions

As a musicien,
I want voir la liste de mes sessions passées,
So that je peux me remémorer ce que j'ai travaillé et quand.

**Acceptance Criteria:**

**Given** des sessions existantes
**When** j'ouvre la page « Sessions »
**Then** je vois la liste antichronologique : date, durée, instrument, entrées (FR14)
**And** les notes (globales et par entrée) sont consultables

**Given** un autre utilisateur
**When** il consulte son historique
**Then** il ne voit jamais mes sessions (NFR4)
**And** la page est responsive et dark mode (NFR3)

### Story 2.4: Corriger mon journal a posteriori

As a musicien,
I want éditer ou supprimer toute session,
So that mon journal reste fidèle à ma pratique réelle, pas à mon usage de l'app.

**Acceptance Criteria:**

**Given** une session existante
**When** je l'édite
**Then** date, durée, instrument, entrées et notes sont tous modifiables (FR10)

**Given** une session référençant un sujet supprimé depuis
**When** je la consulte ou l'édite
**Then** le nom du sujet supprimé reste affiché (FR4)
**And** je peux reclasser l'entrée vers un autre sujet (FR4)

**Given** une session
**When** je la supprime
**Then** dialogue de confirmation avant suppression définitive (FR11)

### Story 2.5: Logger en moins de 30 secondes

As a musicien récurrent,
I want une saisie éclair — suggestions intelligentes et défauts pré-remplis,
So that logger ne devienne jamais une corvée qui me fait abandonner le journal.

**Acceptance Criteria:**

**Given** j'ouvre le formulaire de session
**When** il s'affiche
**Then** date du jour et mon instrument le plus récemment utilisé sont pré-remplis (FR12)
**And** seules date et instrument sont obligatoires (NFR1)

**Given** j'ajoute une entrée
**When** la liste de choix s'affiche
**Then** mes chansons et sujets récemment loggés apparaissent en premier (FR12)
**And** une recherche instantanée filtre répertoire et sujets au fil de la saisie (FR12)

**Given** un utilisateur récurrent
**When** il logge une session type (2 entrées, minutes, une note)
**Then** le parcours complet tient en moins de 30 secondes (NFR1/M2)

## Epic 3: Ma pratique en un coup d'œil (heatmap)

Je vois ma régularité dans une grille annuelle type GitHub — et ma grille a déjà une histoire grâce au rétro-import de mon historique de lectures.

### Story 3.1: Ma grille annuelle de pratique

As a musicien,
I want voir une grille annuelle type GitHub où chaque jour pratiqué s'allume selon mes minutes,
So that ma régularité — et mes trous — me sautent aux yeux, sans jugement.

**Acceptance Criteria:**

**Given** des sessions sur plusieurs jours
**When** j'ouvre la heatmap
**Then** une grille annuelle affiche une case par jour, intensité = minutes totales du jour (FR15)
**And** l'échelle est relative à ma propre distribution (paliers type quartiles GitHub) (FR15)

**Given** une session de 2 minutes ou sans durée un jour donné
**When** la grille s'affiche
**Then** ce jour s'allume à l'intensité minimale visible — toute session compte (FR15)

**Given** un nouvel utilisateur sans aucune session
**When** il ouvre la heatmap
**Then** la grille s'affiche, vide, dès le premier jour — aucun seuil (FR20)

**Given** des jours sans pratique
**When** la grille s'affiche
**Then** aucun compteur de streak, aucune couleur agressive, aucune notification de relance (FR18)

**Given** le calcul du « jour » d'une session
**When** la grille agrège
**Then** elle utilise la date telle que saisie côté client (date locale de l'appareil), sans conversion serveur (FR19)

**Given** une année complète de données (plusieurs centaines de sessions)
**When** la grille se rend
**Then** affichage < 1 s (NFR2) ; navigable au clavier avec alternatives textuelles ARIA (NFR6) ; responsive et dark mode (NFR3)

### Story 3.2: Explorer ma pratique depuis la grille

As a musicien,
I want cliquer sur un jour pour voir le détail, et naviguer entre les années,
So that la grille devienne la porte d'entrée de mon journal.

**Acceptance Criteria:**

**Given** un jour allumé
**When** je clique (ou valide au clavier) sur sa case
**Then** le détail s'ouvre : sessions du jour avec entrées, durées et notes (FR16)

**Given** un jour vide
**When** je clique dessus
**Then** un état vide neutre s'affiche — sans reproche ni incitation culpabilisante (FR16, FR18)

**Given** plusieurs années de données
**When** j'utilise la navigation d'années
**Then** je passe d'une année à l'autre et la grille se recharge (FR17)

**Given** le détail d'un jour affichant une session _(ajout northwood, 2026-06-07)_
**When** je choisis « Edit » sur cette session
**Then** le formulaire de session s'ouvre directement en mode édition de cette session (réutilisation du mode édition existant, deep-link)

**Given** le détail d'un jour vide _(ajout northwood, 2026-06-07)_
**When** je choisis « Log a session for this day »
**Then** le formulaire de session s'ouvre avec la date de ce jour pré-remplie — une affordance choisie par l'utilisateur, pas une relance (FR18 préservé)

**Given** le détail d'un jour affichant une session _(ajout northwood, 2026-06-07, après test terrain)_
**When** je choisis « Delete » sur cette session
**Then** un dialogue de confirmation s'affiche (FR11), et après confirmation la session disparaît du détail ET la grille se met à jour

**Given** le formulaire en mode édition _(ajout northwood, 2026-06-07, après test terrain)_
**When** j'édite une session
**Then** l'historique sous le formulaire est masqué (éviter la confusion), And un bouton « Delete session » est disponible dans le bandeau d'édition (avec confirmation FR11)

### Story 3.3: Ma grille a déjà une histoire (rétro-import)

As a musicien qui utilise l'app depuis des mois,
I want que mes « Mark as Played » passés apparaissent dans la heatmap dès le lancement,
So that ma grille reflète ma vraie histoire au jour 1 — pas un désert décourageant.

**Acceptance Criteria:**

**Given** mon historique de lectures existant (enregistrements de lectures passés)
**When** la heatmap s'affiche après le déploiement de cette fonctionnalité
**Then** chaque lecture passée allume son jour à l'intensité minimale (FR22)

**Given** un jour avec à la fois des lectures historiques et une vraie session
**When** la grille agrège
**Then** pas de double comptage : les minutes de session priment, l'historique n'ajoute que la présence (FR22)

**Given** le mécanisme de rétro-import
**When** il est rejoué (redéploiement, re-calcul)
**Then** aucun doublon n'est créé — opération idempotente (NFR5)

**Given** le détail d'un jour uniquement historique (FR16)
**When** je l'ouvre
**Then** les lectures sont identifiables comme telles (« joué », sans durée), distinctes des sessions loggées

## Epic 4: La capture sans effort (pont avec l'existant)

Je joue comme avant — « Mark as Played » — et mon journal se remplit tout seul, sans jamais fausser mon « dernier joué ».

### Story 4.1: « Mark as Played » remplit mon journal tout seul

As a musicien qui n'a pas encore adopté le journal,
I want que cliquer « Mark as Played Now » alimente automatiquement la session du jour de mon instrument,
So that ma heatmap vit même si je n'ouvre jamais le formulaire de session.

**Acceptance Criteria:**

**Given** aucune session aujourd'hui pour la guitare
**When** je clique « Mark as Played Now » sur une chanson avec l'instrument guitare
**Then** une session du jour est créée pour la guitare, avec la chanson comme entrée sans minutes (FR21)

**Given** une session guitare existe déjà aujourd'hui
**When** je marque une autre chanson jouée à la guitare
**Then** la chanson s'ajoute comme entrée à cette session existante — pas de session en double (FR21)

**Given** une session basse existe aujourd'hui, mais aucune pour la guitare
**When** je marque une chanson jouée à la guitare
**Then** une session guitare distincte est créée — une session par instrument (FR21, FR7)

**Given** la même chanson déjà présente dans la session du jour
**When** je la marque jouée à nouveau
**Then** pas d'entrée dupliquée dans la session

**Given** un clic à 23h50 heure locale
**When** la session du jour est déterminée
**Then** c'est la date locale de l'appareil qui fait foi — le code serveur n'utilise plus son horloge pour dater le jour (FR19/FR21, correction de l'horodatage existant)

### Story 4.2: Mon « dernier joué » ne ment jamais

As a musicien qui filtre par « dernier joué » pour faire tourner son répertoire,
I want que le journal et le « dernier joué » restent cohérents dans les deux sens,
So that mon usage quotidien — repêcher les morceaux délaissés — reste fiable.

**Acceptance Criteria:**

**Given** une chanson dont le « dernier joué » basse date de janvier
**When** je l'ajoute à une session basse datée de mars (y compris rétroactive)
**Then** son « dernier joué » basse devient mars (FR23)

**Given** la même chanson
**When** je l'ajoute à une session datée de décembre dernier (antérieure à janvier)
**Then** son « dernier joué » reste janvier — on ne recule jamais par simple ajout (FR23)

**Given** une session de mars qui portait la lecture la plus récente d'une chanson
**When** je supprime cette session ou change sa date
**Then** le « dernier joué » de la chanson est recalculé depuis l'historique restant (FR23)

**Given** le tri « dernier joué » existant de la liste de chansons
**When** toutes ces opérations s'exécutent
**Then** le tri reflète toujours la réalité — aucune régression de l'usage existant (FR23, CM2)

---

## Epic 6: Capture enrichie — durée de répertoire

_Ajouté 2026-06-10 (Correct Course). PRD amendé : FR21 + FR24. Décision : « pré-remplir mais éditable »._

### Story 6.1: Durée de chanson → temps de session auto

As a musicien qui marque ses chansons jouées,
I want que la durée de la chanson alimente automatiquement le temps de ma session,
So that mon journal reflète mon temps de pratique sans saisie manuelle.

**Acceptance Criteria:**

**Given** le formulaire chanson
**When** je renseigne une durée (minutes)
**Then** elle est persistée ; une chanson sans durée reste valide (FR24, champ nullable)

**Given** une chanson avec une durée
**When** je clique « Mark as Played Now »
**Then** l'entrée créée porte cette durée en minutes (FR21 amendé), éditable a posteriori

**Given** une chanson sans durée
**When** je la marque jouée
**Then** l'entrée est ajoutée sans minutes (FR21 d'origine)

**Given** la même chanson déjà entrée dans la session du jour
**When** je la re-marque jouée
**Then** pas de doublon, mais les minutes de l'entrée existante sont incrémentées de la durée (le temps s'additionne)

**Given** des entrées portant des minutes
**When** la durée totale de session est calculée
**Then** elle suit FR13 (somme des entrées ; surcharge globale retirée par Epic 8, 2026-06-18) — aucune régression de l'édition de session ni du répertoire (CM2)

---

## Epic 7: Compte utilisateur + durcissement sécurité app-wide

_Cadré 2026-06-21 (brief + addendum + architecture, validés northwood) — débloque le stub « HORS PRD » du 2026-06-10. **Hors scope du PRD musician-tools** (auth supposée préexistante)._

Je gère mon compte en autonomie (page Profil : nom d'affichage, email, mot de passe ; reset par email ; vérification d'email à l'inscription) sous une identité partageable `name#NNNN` — le tout posé sur une base d'auth durcie contre les 4 menaces (account takeover, IDOR, CSRF, énumération de comptes).

**FRs covered:** FR-A1, FR-A2, FR-A3, FR-A4, FR-A5, FR-A6, FR-A7, FR-A8 — **NFRs:** NFR-S1, NFR-S2, NFR-S3, NFR-S4

**Séquence & dépendances (ordre d'implémentation, sans dépendance avant) :** 7.1 (socle) → 7.2 (migration identité) → 7.3 (CSRF) ∥ 7.4 (rate-limit) → 7.5 (ownership/404) → 7.6 (email + AuthTokens) → 7.7 (login/register/handle) → 7.8 (Profil) → 7.9 (verify + soft gate, **crée `requireVerified`**) → {7.10 reset ∥ 7.11 change-email}. Les flux email (7.9–7.11) dépendent de 7.6 ; 7.11 (change-email) consomme le `requireVerified` créé en 7.9 ; toute mutation des stories suivantes passe le CSRF de 7.3. Risque maximal sur 7.2 (migration prod sans staging) → testée localement avant merge. **7.12 (citext topics, repliée du deferred-work)** est indépendante — jouable à tout moment après 7.2.

### Story 7.1: Durcir le socle d'auth (secret fail-fast, retrait du JWT, trust proxy)

As a mainteneur du produit,
I want que l'app refuse de démarrer sans ses secrets et n'émette plus de JWT mort,
So that la base d'auth est saine avant d'exposer la moindre route de compte.

**Acceptance Criteria:**

**Given** le démarrage du serveur
**When** `SESSION_SECRET` est absent de l'environnement
**Then** le process échoue immédiatement (`process.exit(1)`) avec un log explicite
**And** plus aucun fallback `'musician-secret'` / `'MUSICIAN_SECRET'` n'existe dans le code

**Given** le cycle login / register
**When** un utilisateur s'authentifie
**Then** aucun JWT n'est signé, renvoyé ni stocké en session (`jwt.sign` et le champ `token` retirés)
**And** `authsess` ne s'appuie que sur `req.session.loggedIn` ; la dépendance `jsonwebtoken` devient retirable

**Given** le déploiement derrière le proxy Fly.io
**When** l'app démarre
**Then** `app.set('trust proxy', 1)` est posé (prérequis du rate-limiting par IP réelle — story 7.4)

**Given** la suite de tests backend
**Then** un test couvre le fail-fast (secret absent → exit non-zéro) et l'absence de tout JWT dans la réponse de login

### Story 7.2: Migrer le modèle Users vers l'identité Discord-style (+ backfill beta)

As a produit,
I want le modèle Users migré vers `name#discriminator` et l'email casse-insensible,
So that le handle et les flux de compte reposent sur un schéma sain, en prod, sans casse de données.

**Acceptance Criteria:**

**Given** la migration `alter-users-identity` (idempotente, gardes `describeTable`)
**When** elle s'exécute
**Then** `CREATE EXTENSION IF NOT EXISTS citext` ; `email` passé en `citext` ; ajout `discriminator` (STRING), `emailVerified` (BOOLEAN default false), `pendingEmail` (STRING null)
**And** la contrainte `unique(name)` est retirée et un index **unique `(name, discriminator)`** est créé (collation cohérente avec l'email)

**Given** la migration `backfill-users-beta` (idempotente, rejouable)
**When** elle s'exécute sur la base beta
**Then** chaque user existant reçoit un `discriminator` libre pour son nom (`0001`–`9999`, zero-paddé STRING), son `email` est normalisé (lowercase/trim), `emailVerified=true` (grandfathering), `pendingEmail=null`

**Given** le modèle `user.js`
**Then** `name` n'est plus `unique` ; les nouveaux champs sont déclarés en camelCase JS + `field:'snake_case'` (`email_verified`, `pending_email`) ; `discriminator` stocké en STRING 4 chiffres

**Given** deux comptes portant le même nom d'affichage
**Then** l'index `(name, discriminator)` garantit l'unicité du handle, et `loginUser` n'a plus besoin d'`iLike` (citext)

**Given** une ré-exécution des migrations (double filet release_command + `sync`)
**Then** aucune erreur ; testé localement (`make migrate`) avant merge (`main` = prod)

### Story 7.3: Protéger toutes les mutations par un token CSRF

As a utilisateur authentifié,
I want que toute requête mutante exige un token CSRF valide,
So that une page tierce ne peut pas agir en mon nom (défense en profondeur par-dessus SameSite=Lax).

**Acceptance Criteria:**

**Given** une session
**When** le front appelle `GET /api/csrf-token`
**Then** le serveur renvoie `{ csrfToken }` (synchronizer token par session, stocké côté session Postgres)

**Given** une requête non-GET (POST/PUT/PATCH/DELETE)
**When** l'en-tête `X-CSRF-Token` est absent ou invalide
**Then** la requête est rejetée avec un statut **normalisé** (pas de détail révélateur)

**Given** le front (`src/services/apiFetch.ts`)
**Then** le helper lit le token et l'injecte en `X-CSRF-Token` sur **toutes** les mutations, de façon centralisée (un seul point pour tous les services)

**Given** les POST pré-auth (login, register, forgot-password)
**When** ils s'exécutent
**Then** le front récupère d'abord le token via `GET /api/csrf-token` ; le middleware couvre aussi ces routes (intégration pré-auth explicitée)

**Given** les routes GET
**Then** elles ne sont pas soumises au check CSRF

**And** tests : middleware rejette une mutation sans token (back) ; `apiFetch` injecte l'en-tête (front)

### Story 7.4: Plafonner les endpoints sensibles (rate-limiting)

As a mainteneur,
I want plafonner login, reset et envois d'email,
So that le brute-force et l'abus d'email transactionnel sont contenus.

**Acceptance Criteria:**

**Given** `express-rate-limit ^8` et `trust proxy` (story 7.1), middleware `ratelimiters.js`
**Then** les limiteurs nommés et réutilisables sont montés : `/login` **10 / 15 min / IP** ; forgot-password **5 / h / IP** ; envoi d'email (resend-verification, change-email) **5 / h / compte**

**Given** un dépassement de seuil
**When** une requête arrive au-delà du plafond
**Then** réponse **429 générique** sans détail

**Given** la limite consciente (store en mémoire, par instance, reset au deploy)
**Then** elle est documentée comme acceptable beta (store persistant = futur)

**And** test : un appel au-delà du seuil renvoie 429

### Story 7.5: Auditer l'ownership et normaliser 403→404 (fix getSong & markSongPlayed)

As a utilisateur,
I want que jamais une réponse ne révèle l'existence d'une donnée qui n'est pas à moi,
So that il n'y a ni IDOR ni oracle d'énumération par code de statut.

**Acceptance Criteria:**

**Given** `getSong` (GET /api/songs/:uid), aujourd'hui sans contrôle d'ownership
**When** l'`uid` n'appartient pas au user courant
**Then** requête scopée `where:{ uid, userUid }` → **404** (plus aucune donnée d'autrui renvoyée, IDOR fermé)

**Given** `markSongPlayed`
**When** un `instrumentUid` est fourni
**Then** son appartenance au user est validée ; sinon **404**

**Given** l'audit systématique de toutes les routes vs le pattern ownership canonique
**Then** tout échec d'ownership renvoie **404, jamais 403** ; aucune nouvelle route ne renvoie 403 pour de l'ownership (« pas à toi » indistinguable de « n'existe pas »)

**Given** les contrôleurs préexistants (topic / instrument / song…) sans garde de corps de requête
**When** un POST/PUT arrive sans corps JSON
**Then** la garde `req.body || {}` est **généralisée** (pattern déjà posé en story 2.1 practicesession) → **400** explicite au lieu d'un 500 (deferred-work 2026-06-21)

**And** tests : `getSong` d'un autre user → 404 ; `markSongPlayed` avec `instrumentUid` étranger → 404 ; POST sans corps JSON → 400 (pas 500)

### Story 7.6: Monter l'infra email transactionnel (Resend) + table AuthTokens

As a produit,
I want une brique d'envoi d'email et une table de tokens à usage unique,
So that les trois flux email (verify-signup, password-reset, change-email) reposent sur un socle sûr et partagé.

**Acceptance Criteria:**

**Given** `backend/services/emailService.js`
**Then** c'est le **seul** point d'envoi (wrapper Resend), configuré par `RESEND_API_KEY` / `EMAIL_FROM` / `APP_BASE_URL` (obligatoires au boot — fail-fast comme 7.1)

**Given** la migration `create-auth-tokens` (idempotente) et le modèle `authtoken.js`
**Then** table `AuthTokens` : `uid` (PK UUID), `userUid` (FK → `user_uid`), `type` ENUM **`verify_email | password_reset | change_email`**, `tokenHash` (sha256 hex), `payload`, `expiresAt`, `usedAt` ; pattern `Songs` (camelCase JS + `field:'snake_case'`), auto-chargé par `models/index.js`

**Given** l'émission d'un token
**Then** token opaque `crypto.randomBytes(32).toString('base64url')` envoyé **en clair par email**, **stocké hashé** (sha256, jamais en clair), **usage unique** (`usedAt`) et expirant : `verify_email` **24 h**, `password_reset` **1 h**, `change_email` **1 h**

**Given** `backend/constants/messages.js`
**Then** source unique des messages anti-énumération (`CHECK_YOUR_INBOX`, etc.), réutilisée par tous les flux

**And** tests : émission + vérification d'un token (hash match, usage unique respecté, expiration respectée)

### Story 7.7: Login email-only, register handle, et anti-énumération à l'inscription

As a utilisateur,
I want me connecter par email seul et m'inscrire sans jamais voir mon nom refusé ni révéler un email,
So that l'identité est un handle social et l'inscription ne fuit aucune existence de compte.

**Acceptance Criteria:**

**Given** `loginUser`
**When** je me connecte
**Then** l'**email est le seul identifiant** (retrait du `Op.or` name/email) ; comparaison via `citext` (plus d'`iLike`)

**Given** le register avec un nom déjà porté par un autre compte
**When** je m'inscris
**Then** un `discriminator` libre m'est attribué (random `0001`–`9999`, retry sur collision), handle `name#NNNN` formé ; **jamais de réponse « name taken »**

**Given** un register sur un email **déjà existant**
**When** je soumets
**Then** réponse **générique** (jamais « email déjà pris ») **et** notification au vrai propriétaire via `emailService` (tentative d'inscription) — FR-A8 ; l'oracle explicite « email déjà pris » disparaît
**And** une inscription sur un email **neuf** connecte directement (flux actuel préservé, `emailVerified=false` — le soft gate arrive en story 7.9) ; le différentiel d'auto-login (neuf vs existant) est un **résidu conscient** assumé à l'échelle beta, bien plus faible que le message explicite supprimé

**Given** l'épuisement des 9999 discriminants d'un nom (hors d'atteinte beta)
**Then** seul cas de refus : « ce nom est plein »

**Given** le mot de passe à l'inscription et au login
**Then** validation **≥ 10 caractères** côté serveur (miroir front), setter bcryptjs (jamais de hash manuel)

**And** tests : login par email OK / par nom KO ; deux users même nom → handles distincts ; register email existant → réponse générique + email au propriétaire

### Story 7.8: Page Profil — éditer nom d'affichage et mot de passe en sécurité

As a utilisateur,
I want une page Profil pour changer mon nom d'affichage et mon mot de passe,
So that je gère mon compte en autonomie, sans support.

**Acceptance Criteria:**

**Given** la page Profil (route authentifiée, accès depuis le Header), `profileService.ts` (fetch brut, `credentials:'include'`, `X-CSRF-Token` via `apiFetch`)
**Then** elle présente les sections nom d'affichage / email / mot de passe ; routes `account.js` montées `authsess` + CSRF

**Given** un changement de nom d'affichage
**When** je le soumets
**Then** le `discriminator` courant est conservé si `(nouveau_nom, disc)` est libre, sinon réattribué un libre ; jamais de refus (sauf épuisement) ; le handle et `AuthContext` (`handle`) sont rafraîchis

**Given** un changement de mot de passe
**When** je le soumets
**Then** le **mot de passe actuel est exigé et vérifié** (`validPassword`, via `scope(null)` pour accéder au hash), le nouveau est **≥ 10 caractères** et confirmé, le hash passe par le setter bcryptjs, et la réponse ne renvoie **jamais** le hash

**Given** un changement de mot de passe réussi
**Then** les **autres sessions du user sont invalidées** (helper unique : suppression des lignes `session` du user sauf `req.sessionID`), la session courante reste active (rate-limit change-password appliqué)

**And** tests : change-mdp sans mdp actuel → rejet ; mauvais mdp actuel → rejet ; succès → autres sessions invalidées, courante conservée, hash absent de la réponse

### Story 7.9: Vérification d'email à l'inscription + soft gate

As a utilisateur,
I want vérifier mon email après inscription sans être bloqué dans l'usage courant,
So that mon compte est confirmé tout en restant utilisable immédiatement.

**Acceptance Criteria:**

**Given** un register réussi (story 7.7)
**Then** un token `verify_email` (24 h) est envoyé via `emailService` ; l'utilisateur est connecté directement (soft gate, flux préservé) avec `emailVerified=false`

**Given** un user non vérifié
**Then** un **bandeau persistant** `VerifyEmailBanner` (lit `emailVerified` depuis `AuthContext`) affiche « vérifie ton email » + un bouton **« renvoyer le lien »** (rate-limité **5 / h / compte**)

**Given** le clic sur un lien de vérification valide (`VerifyEmailPage`, partagée avec la confirmation change-email)
**Then** `emailVerified=true`, token marqué `usedAt`, le bandeau disparaît

**Given** une **action sensible** (change-email story 7.11, futur partage de songlist) tentée par un user non vérifié
**Then** le middleware `requireVerified` (créé par cette story) la bloque (statut normalisé) ; le **reste de l'app reste accessible** non vérifié

**Given** un token de vérification expiré
**When** je clique « renvoyer le lien »
**Then** un nouveau token `verify_email` est généré et envoyé

**And** tests : register → `emailVerified=false` + token créé ; clic valide → `true` ; `requireVerified` bloque une route sensible si non vérifié

### Story 7.10: Réinitialiser un mot de passe oublié par email

As a utilisateur qui a oublié son mot de passe,
I want le réinitialiser par email,
So that je récupère l'accès seul, sans support.

**Acceptance Criteria:**

**Given** la page `ForgotPasswordPage` (pré-auth, via `apiFetch`/CSRF)
**When** je soumets un email
**Then** la réponse est **toujours** générique (`CHECK_YOUR_INBOX`) quel que soit l'existence du compte ; si l'email existe, un token `password_reset` (1 h, usage unique) est envoyé (rate-limit **5 / h / IP**)

**Given** la page `ResetPasswordPage` (lien email) avec un token valide
**When** je soumets un nouveau mot de passe (≥ 10, confirmé)
**Then** le mot de passe est changé (setter bcryptjs), token marqué `usedAt`, et les **autres sessions sont invalidées** (helper unique)

**Given** un token expiré, réutilisé ou invalide
**Then** rejet générique

**And** tests : forgot sur email inexistant → 200 générique sans envoi ; reset token valide → mdp changé + sessions invalidées ; token réutilisé → rejet

### Story 7.11: Changer d'email en verify-before-switch

As a utilisateur vérifié,
I want changer mon email avec confirmation par lien sur la nouvelle adresse,
So that personne ne détourne mon compte via un email non possédé.

**Acceptance Criteria:**

**Given** un user **vérifié** (middleware `requireVerified` issu de la story 7.9, soft gate)
**When** je demande un changement d'email
**Then** `pendingEmail` est stocké (l'`email` n'est **jamais** écrasé directement) et un token `change_email` (1 h, usage unique) est envoyé à la **nouvelle** adresse via `emailService`

**Given** le clic sur un lien valide (`VerifyEmailPage`, partagée avec la vérification d'inscription)
**Then** bascule `pendingEmail → email`, `pendingEmail=null`, token marqué `usedAt`

**Given** une nouvelle adresse déjà prise ou inexistante
**Then** réponse **générique** (anti-énumération), jamais « email déjà pris »

**Given** la transition (avant confirmation)
**Then** le login reste sur l'**ancien** email tant que le nouveau n'est pas confirmé

**Given** un token expiré ou déjà utilisé
**Then** rejet générique ; routes montées `authsess` + CSRF + `requireVerified` + rate-limit email

**And** tests : demande → `pendingEmail` posé + email envoyé, `email` inchangé ; clic valide → bascule ; token réutilisé → rejet

### Story 7.12: Unicité de topic insensible à la casse/accents (côté serveur)

As a utilisateur,
I want que mes topics ne se dédoublonnent pas selon la casse ou les accents,
So that « Pentatonique » et « pentatonique » ne créent jamais deux topics distincts.

**Acceptance Criteria:**

**Given** le dédoublonnage actuel garanti **côté client seulement** (`foldForSearch`) et l'index `(user_uid, name)` sensible à la casse (gap AC10 de la story 8-2, deferred-work 2026-06-21)
**When** deux topics ne diffèrent que par la casse ou les accents
**Then** une contrainte **serveur** les empêche : `name` en `citext` (ou comparaison `LOWER()`), index unique `(user_uid, name)` insensible à la casse, collation cohérente avec l'email (story 7.2)

**Given** la migration (idempotente, testée localement avant merge — `main` = prod)
**When** elle s'exécute sur la base beta
**Then** `name` est converti et les éventuels doublons existants sont normalisés/résolus (dédoublonnage one-shot documenté avant ajout de la contrainte unique)

**Given** le contrôleur topic (création / rename)
**When** un nom en collision casse-insensible est soumis
**Then** il s'appuie sur la contrainte serveur, avec une réponse d'erreur **normalisée** (pas d'oracle d'énumération — cohérent NFR-S4)

**And** tests : créer « Pentatonique » puis « pentatonique » → refus/normalisé ; rename en collision → refus

_Indépendant des autres stories Epic 7 (feature topics isolée) ; risque = migration prod. Jouable à tout moment après 7.2 (collation citext partagée)._

---

## Epic 8: Refonte temps de session — « tout est entrée »

_Ajouté 2026-06-18 (Correct Course — cf. sprint-change-proposal-2026-06-18, issu du brainstorm 2026-06-18). PRD amendé : FR13 (retrait surcharge), FR15 (précision), FR24 (étendu) ; ajouts FR25, FR26._

**Objectif :** supprimer la double source de vérité du temps. La session devient un simple regroupement (jour + instrument) ; la durée totale est **toujours** la somme des minutes des entrées. Le temps non structuré se loggue via une entrée sur le topic système « Free practice ».

**FRs covered:** FR13 (amendé), FR15 (précisé), FR24 (étendu), FR25, FR26

**Décision archi en suspens (à trancher en 8-2/8-3) :** topic « Free practice » seedé par user vs virtuel/built-in.

### Story 8.1: Auto-remplissage des minutes d'entrée depuis la durée chanson (Phase A)

As a musicien qui détaille sa session,
I want que choisir une chanson ayant une durée pré-remplisse le temps de l'entrée,
So that je saisis moins.

**Acceptance Criteria (esquisse) :**

**Given** une chanson avec une durée, dans le sélecteur d'entrée d'une session
**When** je la sélectionne et que le champ minutes de l'entrée est vide
**Then** les minutes sont pré-remplies avec la durée de la chanson (arrondie), éditable (FR24 étendu)

**Given** une chanson sans durée, ou un champ minutes déjà saisi
**When** je sélectionne la chanson
**Then** rien n'est écrasé (pas de régression)

_Indépendant, faible risque — jouable immédiatement._

### Story 8.2: Topic système « Free practice » épinglé + création de topic à la volée (Phase B)

As a musicien qui veut tout logger en entrée,
I want un topic « Free practice » toujours dispo et pouvoir créer un topic à la volée,
So that logguer du temps non structuré reste rapide (< 30 s, NFR1).

**Acceptance Criteria (esquisse) :**

**Given** le sélecteur d'entrée
**Then** un topic système « Free practice » est épinglé en tête, sans avoir à le créer (FR25)

**Given** une recherche sans correspondance dans le sélecteur
**When** je choisis « Create topic "…" »
**Then** le topic est créé et sélectionné sans quitter le formulaire (FR26)

_Prérequis de 8.3. Trancher : Free practice seedé vs virtuel._

### Story 8.3: Suppression de la durée globale + heatmap somme des entrées + migration (Phase C)

As a produit,
I want retirer la durée globale de session,
So that le temps a une seule source de vérité (les entrées).

**Acceptance Criteria (esquisse) :**

**Given** le formulaire de session
**Then** plus de champ « Duration » saisi ; le total affiché = somme des entrées (lecture seule) (FR13 amendé)

**Given** le heatmap
**When** il calcule les minutes d'un jour
**Then** il somme les `SessionItem.minutes` (au lieu de `PracticeSession.duration_minutes`) (FR15)

**Given** la base existante (beta, 3-4 users)
**When** la migration s'exécute
**Then** `duration_minutes` est retirée ; le delta « non détaillé » est accepté perdu OU converti one-shot en entrée « Free practice » (à confirmer au cadrage)

**Et** retrait du code devenu inutile : sync `markSongPlayed → durationMinutes` (story 6.1) et calage/plancher session (commits 380e8c4, cbd6676).

_Démarre après 8.2. Breaking changes tolérés (beta)._

---

## Epic 9: Robustesse / confort UI (post-rétro)

_Ajouté 2026-06-21 — issu de la revue `deferred-work.md` (rituel avant Epic 7). Exécution **légère** : cadrage + implémentation directe par branche (façon quick wins), sans create-story/dev-story/review formel. Soldé avant l'Epic 7._

**Objectif :** nettoyer la dette UI/confort accumulée avant d'attaquer la grosse Epic 7. Quatre stories autonomes (sauf 9.4 qui dépend de 9.3).

**Ordre :** 9.1 ∥ 9.2 (indépendantes) → 9.3 (refacto) → 9.4 (dépend de 9.3).

### Story 9.1: Navigation mobile (menu hamburger)

As a utilisateur sur mobile,
I want un menu hamburger qui expose les liens de navigation,
So that je peux accéder à toutes les pages depuis un téléphone (NFR3).

**Acceptance Criteria:**

**Given** un viewport mobile (`< md`) et un utilisateur authentifié
**When** j'ouvre le Header
**Then** un bouton hamburger (`md:hidden`) est visible ; la nav desktop (`hidden md:flex`) reste inchangée au-dessus de `md`

**Given** le menu fermé
**When** je clique le hamburger
**Then** un panneau déroulant affiche les 6 liens (Songlist, Heatmap, Sessions, Playlists, Topics, Instruments) empilés ; clic sur un lien ferme le menu ; `Échap` ferme aussi

**Given** un utilisateur non authentifié
**Then** pas de hamburger (aucun lien à dérouler) ; les boutons Sign in / Create account restent visibles

**And** dark mode respecté ; liens dédupliqués (un seul tableau mappé pour desktop et mobile)

### Story 9.2: Filtres Songlist clarifiés + filtre « sans instrument »

As a utilisateur qui range sa songlist,
I want des libellés de filtre instrument non ambigus et pouvoir isoler les chansons sans instrument,
So that je distingue « instrument du morceau » de « mon instrument » et je repère les orphelins.

**Acceptance Criteria:**

**Given** la sidebar Songlist (`SongsSidebar.tsx`)
**When** je lis les deux filtres instrument
**Then** les libellés sont clairement distincts (ex. « Instrument du morceau » vs « Mon instrument »), plus « Filter by instrument » / « Filter by my instrument » trop proches

**Given** le filtre instrument du morceau
**When** je choisis l'option « Sans instrument »
**Then** la liste n'affiche que les chansons liées à **aucun** instrument (orphelins), via une valeur spéciale dédiée

**And** persistance localStorage cohérente avec le pattern existant ; pas de régression sur les filtres actuels

### Story 9.3: Composant partagé `SessionHistoryCard` (dé-duplication)

As a mainteneur,
I want extraire le rendu d'une session + ses entrées en un composant partagé,
So that toute évolution se fait à un seul endroit (la duplication a déjà causé des incohérences).

**Acceptance Criteria:**

**Given** le rendu dupliqué d'une session (en-tête date · instrument · durée + liste « played during X minutes ») dans `MySessionsPage.tsx` et `MyHeatmapPage.tsx`
**When** j'extrais un composant `SessionHistoryCard` (+ `SessionEntryLine`)
**Then** les deux pages le consomment ; les actions spécifiques (la Heatmap a aussi les plays hors-session) passent en props/callbacks

**Given** le détail jour de la heatmap (`MyHeatmapPage.tsx`) qui rendait le titre seul, sans artiste
**Then** il est unifié sur le composant partagé → « Artiste - Titre » cohérent partout (comme depuis 5.5)

**And** aucun changement de comportement visible hors la correction d'incohérence ; tests des deux pages au vert

### Story 9.4: Chanson cliquable dans l'historique de session

As a utilisateur qui relit son journal,
I want cliquer une entrée chanson pour ouvrir sa fiche,
So that je passe de l'historique à l'édition de la chanson sans la rechercher.

**Acceptance Criteria:**

**Given** le composant `SessionHistoryCard` (story 9.3) et une entrée référençant une chanson (`songUid` non nul)
**When** je clique le libellé de l'entrée
**Then** je suis navigué vers l'édition de cette chanson (via `songUid`)

**Given** une entrée orpheline (`songUid` nul) ou un topic
**Then** pas de lien (texte statique), pas de navigation cassée

**And** dépend de 9.3 (le lien vit dans le composant partagé) ; pas de régression d'affichage

## Epic 10: Confort / playlists

_Ajouté 2026-06-28 — issu de la revue `deferred-work.md` (rituel avant nouvelle epic). Epic de **confort**, exécution **légère**. Première story : la création de playlist à la volée depuis la fiche chanson (planifiée 2026-06-26)._

**Objectif :** réduire les frottements autour des playlists. Première brique : ranger une chanson dans une **nouvelle** playlist sans quitter l'écran d'édition, en mirrorant le « créer un sujet à la volée » de la story 8.2.

**Découpage (façon 7.12→8.2) :** les noms de playlist ne sont **pas** uniques en base (pas de 409, contrairement aux topics). On pose d'abord l'unicité serveur (**10.1**, prérequis), puis la création à la volée côté front (**10.2**) qui consomme ce 409.

**Ordre :** 10.1 (backend, unicité serveur) → 10.2 (front, dépend de 10.1).

### Story 10.1: Unicité de nom de playlist insensible à la casse (côté serveur)

As a musicien qui range ses chansons,
I want que mes playlists ne se dédoublonnent pas selon la casse,
So that je n'aie jamais deux playlists au même nom et que la création à la volée (10.2) retombe proprement sur l'existante.

**Acceptance Criteria:**

**Given** les playlists d'un user
**When** la migration s'exécute
**Then** un index unique fonctionnel `(user_uid, lower(name))` est posé après dédoublonnage one-shot des collisions existantes (reco : **RENAME** non destructif des perdantes, survivant = la plus ancienne) ; idempotente, testée localement avant merge (`main` = prod)

**Given** une création ou un rename de playlist en collision (casse comprise) avec une playlist existante du user
**Then** le contrôleur répond **409** `{ message: 'Playlist already exists', playlist: <existante> }` (scopé `user_uid`, pas d'oracle), en mirrorant `topiccontroller`

**And** parité avec le picker (`.toLowerCase()`) → granularité **`lower(name)`** (casse seule, pas d'accents/`f_unaccent`) recommandée ; pas de front, pas de dépendance npm ; calqué sur la story 7.12.

### Story 10.2: Créer une playlist à la volée depuis l'édition d'une chanson

As a musicien qui édite une chanson,
I want créer une nouvelle playlist et y ajouter la chanson en cours sans quitter l'écran,
So that ranger une chanson dans une nouvelle playlist reste un seul geste, sans détour par la page Playlists.

**Dépend de 10.1** (unicité serveur + 409).

**Acceptance Criteria:**

**Given** le picker de playlists de la fiche chanson (mode édition) et une recherche non vide qui ne matche **aucune** playlist existante (`.toLowerCase()`)
**When** la liste déroulante s'affiche
**Then** une option « Create playlist "&lt;texte&gt;" » apparaît en bas ; absente si le nom matche une playlist existante ou si la saisie est vide

**Given** l'option « Create playlist "…" »
**When** je la choisis
**Then** la playlist est créée avec la chanson dedans (`createPlaylist({ name, songUids: [<uid>] })`), ajoutée à l'état + sélectionnée (chip), sans fermer ni soumettre le formulaire ; le diff on-Save reste cohérent (pas de double-ajout)

**Given** une création qui passe la garde client mais collide côté serveur (catalogue périmé)
**When** `createPlaylist` rejette `PlaylistConflictError`
**Then** la playlist existante (renvoyée dans le 409) est sélectionnée à la place — pas d'erreur bloquante, pas de doublon (façon 8.2 AC10)

**And** création possible même sans aucune playlist (combobox dispo) ; nav clavier (Entrée sélectionne sans soumettre) ; échec réseau → toast non bloquant ; périmètre **mode édition** ; pas de régression du picker existant.

## Epic 11: Dette technique / santé du socle

_Ajouté 2026-06-28 — issu de la rétro Epic 10 (dette parité-sync promue en story planifiée). Epic « dette technique » : réduire la dette du socle plutôt qu'ajouter de la feature. Accueillera d'autres items dette au besoin._

**Objectif :** faire des **migrations la source unique** du schéma et rendre tout écart **bruyant** (fail-fast), au lieu de machinerie d'auto-réparation qui duplique la SQL.

### Story 11.1: Parité unicité dev/CI — migrations source unique + garde fail-fast (retrait du hook afterSync topic)

As a mainteneur,
I want que les index uniques fonctionnels (topics 7.12, playlists 10.1) viennent **uniquement des migrations** et qu'un boot sur un schéma incomplet **échoue clairement**,
So that je n'aie ni divergence dev/CI silencieuse, ni SQL de migration dupliquée dans des hooks `afterSync` à maintenir.

**Décision (rétro Epic 10) :** approche **« migrations = source unique + fail-fast »**, **pas** de hook `afterSync` côté playlists ; on **retire** celui des topics. Net : dette réduite.

**Acceptance Criteria:**

**Given** le boot backend (`server.js`, après `sequelize.sync({alter:false})`)
**When** un index unique fonctionnel attendu manque (`topics_user_uid_name_ci_unaccent`, `playlists_user_uid_name_ci`)
**Then** le boot **échoue clairement** (log explicite « run `make migrate` » + `process.exit(1)`), au lieu de servir un schéma sans unicité

**Given** le hook `afterSync` de `backend/models/topic.js` (qui duplique la migration 7.12)
**When** cette story est livrée
**Then** il est **retiré** (la garde fail-fast remplace son rôle de filet) ; l'index non-unique `topics_name` et le contrat du modèle restent intacts ; **aucun** hook équivalent n'est ajouté côté playlists

**Given** un dev qui lance `make start` / `make up` sur une base fraîche
**Then** les migrations sont jouées (cibles dépendant de `migrate`) → les index existent → la garde ne se déclenche jamais en flux normal

**And** commentaire trompeur de `server.js` (« Run migrations on startup » alors qu'il ne fait que `sync`) corrigé ; garde extraite en util **testée** (présent → no-op ; manquant → échec) ; suite back verte ; **prod non impactée** (release-migrate a déjà créé les index → garde passe) ; pas de dépendance npm.

## Epic 12: Confort vérification email

_Ajouté 2026-06-29 — issu de la revue `deferred-work.md` (items reviews 7-13 promus). Epic de confort/polissage du flux de vérification email._

**Objectif :** lever les frottements UX restants autour de la vérification email, et combler les lacunes de test des branches vérif.

### Story 12.1: UX de vérification email — token consommé-valide vs invalide

As a utilisateur qui vérifie son email,
I want que rouvrir mon lien de vérif (déjà utilisé) sur un 2e appareil affiche un message clair plutôt que « lien invalide ou expiré »,
So that je ne croie pas que ma vérification a échoué alors qu'elle a réussi.

**Acceptance Criteria:**

**Given** un token `verify_email` au hash connu mais **déjà consommé** (`usedAt != null`), dont l'user existe et est `emailVerified`
**When** `POST /api/auth/verify-email`
**Then** réponse **200 `{ alreadyVerified: true }` sans ouvrir de session** (le token single-use est déjà dépensé) ; un token réellement inconnu/expiré reste **400** ; le happy path auto-login (7.13) inchangé

**Given** la réponse `alreadyVerified` (y compris **déconnecté**, cas du 2e appareil)
**Then** `VerifyEmailPage` affiche un état clair (« Email already verified ✓ / Sign in ») distinct de « Link invalid or expired »

**And** sécurité : aucune session sur un token consommé ; **pas d'oracle** (keyé sur le hash du token, secret, jamais sur l'email) ; tests front ajoutés pour les branches vérif `needsVerification` (Login) et Resend (Register) — lacunes de test des stories 7-13.

## Epic 13: Confort édition — « atelier vivant »

_Ajouté 2026-06-29 — issu du brainstorm auto-save (deferred-work prio 3). Repenser la fiche d'édition comme un espace qu'on ajuste en jouant, pas un formulaire à soumettre._

**Objectif :** supprimer les frottements du save manuel (bouton en bas + ré-éjection vers la liste) en passant à l'auto-save, et résoudre la dette `isDirty` fragile + la garde « modifs non enregistrées ».

### Story 13.1: Auto-save de la fiche chanson

As a musicien qui ajuste une chanson pendant qu'il la joue,
I want que la fiche se sauve toute seule et que je reste dessus (Back to songlist explicite en haut),
So that je ne pense plus à Save, je ne suis plus ré-éjecté, et je ne perds rien.

**Acceptance Criteria:**

**Given** la fiche en **mode édition** et un champ modifié
**When** une pause de frappe (debounce ~1–1.5 s) ou un blur survient
**Then** la chanson est persistée automatiquement (`updateSong`), je **reste sur la chanson** (pas de redirection, pas de reset du form) ; le bouton **Save est retiré** (mode création inchangé)

**Given** une modif en attente
**When** je clique « ← Back to songlist » (sticky en haut) ou quitte l'écran
**Then** l'auto-save est **flushé avant** de naviguer ; un indicateur ambiant montre `Saving…/Saved ✓/⚠️ Not saved — retry` (jamais de modale)

**Given** un titre/artiste transitoirement en doublon (`liveDuplicate`)
**Then** **les autres champs continuent de se sauver**, `title`/`artist` sont gelés + ✗ discret (décision 🅰️) — _NB : aucune unicité backend, c'est 100% client_

**And** la garde « Unsaved changes » du Mark-as-Played devient **caduque** (fiche toujours sauvée) ; `isDirty` fragile résolu ; course 2-appareils **reportée** (beta) ; suites vertes.

## Epic 14: Confort mobile (Songlist + édition)

_Ajouté 2026-07-04 — issu de la revue `deferred-work.md` (lot UX/UI mobile promu, option 1). Cadré via `bmad-ux` : `planning-artifacts/ux-designs/ux-musician-tools-2026-07-04/` (DESIGN.md + EXPERIENCE.md, `status: final`). Epic de **confort**, exécution **légère**._

**Objectif :** rendre l'app pleinement utilisable au téléphone (NFR3) — la page Songs (liste + filtres) et la fiche d'édition tiennent enfin dans la main, sans régresser le desktop. Plus un quick-win favicon.

**Découpage :** 4 stories largement **indépendantes**, livrables une à une. Ordre recommandé 14.1→14.4 (quick-wins d'abord, cœur responsive ensuite). Breakpoints déjà en place : `lg` (1024px) layout, `sm` (640px) grille form — aucun nouveau seuil introduit.

### Story 14.1: Favicon produit

As a visiteur,
I want voir une icône propre au produit dans l'onglet,
So that l'app n'affiche plus le favicon Vite par défaut.

**Acceptance Criteria:**

**Given** l'app chargée dans un navigateur
**Then** le favicon est une icône propre au produit (remplace le `vite.svg` par défaut), déclarée dans `index.html` ; formats raisonnables (svg ou png 32/180) ; pas de 404 sur l'ancien asset

**And** quick-win, aucune dépendance ; pas d'impact fonctionnel.

### Story 14.2: Header non-connecté qui ne déborde plus sur mobile

As a visiteur déconnecté sur mobile,
I want un header qui ne déborde pas à 390px,
So that le titre et le toggle dark ne soient plus poussés hors écran par les boutons Sign in / Create account.

**Acceptance Criteria:**

**Given** un utilisateur **non connecté** sur mobile (~390px)
**When** il voit le header
**Then** les CTA _Sign in_ / _Create account_ ne débordent plus : ils sont **retirés du header en non-connecté** et **relayés dans la HomePage** (padding pour ne pas coller au footer) ; header = titre + toggle dark seulement

**Given** un utilisateur connecté
**Then** le header (hamburger `md:hidden` de 9.1, liens) est **inchangé**

**And** V1 sobre — le placement définitif des CTA sera repris par une future landing page (deferred-work § À brainstormer) ; `Header.test.tsx` mis à jour (le test « unauthenticated … sign-in actions remain » est inversé) ; UI en anglais ; dark mode. `[src/App.tsx HomePage, src/components/Header.tsx]`

### Story 14.3: Songlist responsive — tableau scrollable + filtres repliables

As a musicien qui cherche une chanson au téléphone,
I want une liste qui tient dans l'écran (tableau qui scrolle en interne, filtres repliés, pas de débordement latéral),
So that je vois mes chansons tout de suite au lieu de scroller un mur de filtres et une page infinie.

**Cadrage UX :** décisions D2/D3/D4 (`EXPERIENCE.md` § Responsive & Platform, `DESIGN.md` § Components). Groupée volontairement (un écran, un PR).

**Acceptance Criteria:**

**Given** la page Songs avec beaucoup de chansons
**When** je la consulte (mobile ou desktop)
**Then** le tableau est **plafonné à ~65vh** et **scrolle en interne** (la page ne s'allonge plus) ; l'**en-tête de colonnes est `sticky`** dans la zone de scroll (fond opaque, `z-10` sous les dropdowns `z-50` et la save-bar `z-20`) — **D2**

**Given** un tableau plus large que l'écran
**Then** il **scrolle horizontalement dans son conteneur** (toutes colonnes gardées, pas de reflow en cartes) ; les blocs voisins (recherche, filtres) **ne débordent plus** grâce à **`min-w-0`** sur la colonne `flex-1` (`SongsList.tsx:202`) — **D4**

**Given** un écran **sous `lg` (1024px)**
**When** j'arrive sur la page
**Then** les filtres sont dans un **disclosure « Filters » replié par défaut** (chansons visibles immédiatement) ; le bouton affiche le **compteur de filtres actifs** (« Filters · 2 ») même replié ; `aria-expanded` / `aria-controls` posés ; au-dessus de `lg`, la **sidebar reste statique** (comportement actuel)  — **D3**

**And** zéro régression desktop ; dark mode sur les nouveaux éléments (bouton disclosure, fond sticky) ; conteneur scroll focalisable clavier ; microcopie EN ; état déplié non persisté (D7). `[src/components/SongsList.tsx, src/components/SongsSidebar.tsx]`

### Story 14.4: Fiche d'édition (SongForm) lisible sur mobile

As a musicien qui édite une chanson au téléphone,
I want des champs qui s'empilent lisiblement au lieu d'être écrasés,
So that je puisse corriger une méta sans zoomer.

**Cadrage UX :** décision D8 (`DESIGN.md` § Components, form grid).

**Acceptance Criteria:**

**Given** le SongForm sur un écran **sous `sm` (640px)**
**When** j'affiche les grilles de méta (`SongForm.tsx:624`, `:697`)
**Then** elles passent de `grid-cols-3` à **`grid-cols-1 sm:grid-cols-3`** : une colonne empilée sous `sm`, trois dès `sm+`

**Given** la fiche en édition sur mobile
**Then** la **save-bar sticky** (13-1, `Songs.tsx:1815`) ne déborde pas (statut « Saving/Saved » tronque si besoin) et le **playlist picker** (`Songs.tsx:1917`) reste utilisable (dropdown déjà `overflow-y-auto`) — audit visuel, pas de régression de l'auto-save

**And** dark mode ; UI en anglais ; suites front vertes. `[src/components/SongForm.tsx, src/pages/Songs.tsx]`

## Epic 15: Signal UX rate-limit + anti-oracle

_Ajouté 2026-07-05 — issu de la revue `deferred-work.md` (item A5 « signal UX du rate-limit légitime », rétro Epic 7) avec le résidu **7-13 « oracle de timing »** rattaché. Cadrage sécu verrouillé le 2026-07-05 (cf. deferred-work § À brainstormer). Epic **sécu-sensible**, exécution **légère**._

**Objectif :** combler l'angle mort UX du rate-limit (A5) **et** fermer le résidu d'oracle de timing (7-13), **sans** affaiblir l'anti-bruteforce ni rouvrir d'oracle d'énumération de comptes. Couvre **NFR-S1** (rate-limit) et **NFR-S4** (anti-énumération).

**Insight de cadrage :** améliorer le message `429` est du **pur UX sans coût sécu** — le `429` est déjà observable et ne révèle pas l'existence d'un compte ; le seul secret à garder est `Retry-After`/la fenêtre exacte (qui aiderait à **cadencer** un brute-force). Aujourd'hui `createError(429)` renvoie `{message:"Too Many Requests"}` qui **remonte déjà brut** à l'écran (`authService` fait `throw new Error(body.message)`), dans le même emplacement d'erreur que « Invalid credentials ».

**Découpage :** 2 stories largement **indépendantes** (15.1 front UX, 15.2 back latence), livrables séparément. **Invariant transverse : detail-free** (aucun `Retry-After`/fenêtre/compte à rebours exposé).

### Story 15.1: Signal UX du rate-limit (429 lisible et distinct)

As a utilisateur légitime rate-limité (login, resend, forgot-password, change-password, change-email),
I want un message clair et traduit m'indiquant que j'ai fait trop de tentatives,
So that je ne le confonde pas avec une erreur d'identifiants ou une erreur générique.

**Acceptance Criteria:**

**Given** un `429` renvoyé par un endpoint d'auth rate-limité
**When** le front le reçoit
**Then** il le détecte par `response.status` (**pas** par `body.message`) et affiche un message localisé clair (« Too many attempts. Please try again in a few minutes. ») **visuellement distinct** des erreurs de champ / d'identifiants

**Given** la posture anti-oracle (7.4)
**Then** le message reste **detail-free** : formulation **qualitative** seule — aucun `Retry-After`, aucune fenêtre exacte, aucun compte à rebours ; aucun header `RateLimit-*` consommé

**Given** les 5 points d'échec — login · verify-email/resend · forgot-password · change-password · change-email
**Then** chacun surface le message **inline au point d'échec** (pas de report post-auth)

**And** UI en anglais ; dark mode ; suites front vertes ; **un test** vérifie que la branche `429` mappe vers la copie « rate-limit » et **non** vers la copie « erreur d'identifiants ». `[src/services/authService.ts, src/services/apiFetch.ts, src/pages/{Login,ForgotPassword,Register,VerifyEmail}Page.tsx + page Profil (change email / mot de passe)]`

### Story 15.2: Neutraliser l'oracle de timing (resend + forgot-password)

As a garant de la posture sécurité du système,
I want une latence de réponse uniforme entre les branches compte-existant et inexistant,
So that le timing ne distingue plus les cas malgré un corps de réponse déjà uniforme.

**Acceptance Criteria:**

**Given** `resendVerificationPublic`
**When** il est appelé pour un compte existant-non-vérifié vs un compte inconnu/déjà vérifié
**Then** l'envoi d'email ne rend plus la branche existante plus lente que les autres (fire-and-forget, **ou** `await` sur **toutes** les branches) → la réponse revient en ~temps uniforme

**Given** `forgotPassword` (même résidu accepté, même famille anti-énumération)
**Then** la même égalisation de latence est appliquée

**And** les corps de réponse restent **uniformes** (`CHECK_YOUR_INBOX` / générique — **zéro régression NFR-S4**) ; suite back verte ; **un test** documente l'approche (structurel : l'envoi n'est pas awaité avant `res.json`, ou l'est sur toutes les branches). `[backend/controllers/usercontroller.js resendVerificationPublic ~260-279 + forgotPassword ~300-313]`

## Epic 16: Fix prod doublons artiste + confort tunings

_Ajouté 2026-07-09 — issu de la revue `deferred-work.md` (§ À brainstormer) : un bug prod signalé par northwood (2026-07-05) + un quick-win tuning. Epic **fourre-tout léger** (2 items indépendants, sans lien fonctionnel), exécution **légère**. L'auto-création SongForm relevée dans la même passe est **volontairement exclue** (design-avant-code → epic dédiée après brainstorm)._

**Objectif :** solder le **bug de doublons d'artistes en prod** (saisie non trimmée) — saisie **et** données existantes — et combler un **tuning basse manquant**. Aucun FR/NFR du PRD ; confort + hygiène de données.

**Découpage :** 2 stories **totalement indépendantes**, livrables séparément. Ordre recommandé 16.1 (le bug prod d'abord) → 16.2 (quick-win). ⚠️ 16.1 embarque une **migration** → part en prod, idempotente et testée en local avant merge (project-context § migrations).

### Story 16.1: Trim artiste/album/titre + migration de nettoyage des doublons

As a musicien qui saisit ses chansons,
I want que les espaces parasites en début/fin de nom d'artiste (ou album/titre) soient ignorés,
So that « michael jackson » et « michael jackson　» ne créent plus deux artistes distincts dans mes suggestions et mes filtres.

**Contexte :** `artist`/`album`/`title` sont stockés **verbatim** depuis `req.body` (`songcontroller.js` createSong ~110-134 / updateSong ~171-187), contrairement à `language`/`instrumentType` qui passent par un helper de trim. Un espace final suffit à créer un « distinct » supplémentaire (l'artiste est une string libre par chanson — pas de FK, trimmer suffit à collapser).

**Acceptance Criteria:**

**Given** la création ou la mise à jour d'une chanson (volet **saisie**)
**When** `artist`, `album` ou `title` arrivent avec des espaces en début/fin
**Then** ils sont **trimmés côté serveur** avant persistance (miroir du traitement `language`) ; une valeur qui n'est plus qu'espaces est traitée comme les autres champs vides (chaîne vide / `null` selon la convention existante du champ) ; `title` reste requis après trim (un titre tout-espaces → même 400 que titre vide)

**Given** les données **déjà en prod** (volet **données existantes**)
**When** la migration de nettoyage s'exécute
**Then** une migration **idempotente** one-off collapse les doublons déjà présents : `UPDATE "Songs" SET artist = TRIM(artist) WHERE artist <> TRIM(artist)` (idem `album`, `title`) ; relançable sans effet de bord (le `WHERE` la rend no-op au 2e passage) ; testée en local (`make migrate`) avant tout merge

**And** UI/commentaires en anglais ; pattern contrôleur inchangé (ownership/scoping) ; suite back verte (le trim `artist`/`album`/`title` couvert par un test create/update) ; **zéro** merge FK — l'artiste restant une string libre, trimmer suffit. `[backend/controllers/songcontroller.js createSong ~110-134 / updateSong ~171-187, nouvelle migration backend/migrations/]`

### Story 16.2: Tuning basse « Half-step down » (4 et 5 cordes)

As a bassiste qui accorde un demi-ton plus bas,
I want pouvoir sélectionner le tuning `EbAbDbGb` (et `BbEbAbDbGb` en 5 cordes) sur mes chansons,
So that j'aie la parité avec la guitare (qui a déjà son demi-ton) et que mon accordage réel soit renseignable.

**Contexte :** `instrumentTuningsMap.Bass` n'expose aujourd'hui que EADG / BEADG / BEADGC / DADG ; la guitare a déjà `EbAbDbGbBbEb (Half-step down)`. Pur ajout d'options d'affichage dans une liste curée — **aucun impact modèle, aucune migration** (`instrumentTuning` est une string libre).

**Acceptance Criteria:**

**Given** le sélecteur de tuning d'une chanson en **Bass**
**When** j'ouvre la liste des accordages
**Then** deux entrées « Half-step down » sont disponibles : `{ value: 'EbAbDbGb', label: 'EbAbDbGb (Half-step down 4-string)' }` et `{ value: 'BbEbAbDbGb', label: 'BbEbAbDbGb (Half-step down 5-string)' }`, placées de façon cohérente avec l'ordre existant du bloc Bass

**And** libellés en anglais, alignés sur le style des entrées existantes ; aucun autre instrument touché ; aucune migration ni changement de modèle ; suites vertes (typecheck front inclus). `[src/constants/instrumentTypes.ts bloc Bass ~45-51]`

## Epic 17: Auto-création fiche chanson + unicité serveur

_Ajouté 2026-07-10 — issu du brainstorm `brainstorming-session-2026-07-10-0810.md` (First Principles Thinking + Reverse Brainstorming, 14 idées → 8 décisions verrouillées + découpage 2 stories). C'est l'auto-création **volontairement exclue** d'Epic 16 (design-avant-code) : le brainstorm a été tenu, l'epic dédiée est ici. Mirror de l'Epic 13 (auto-save 13.1) côté méthode et de l'Epic 10 côté découpage (back d'abord, puis front). Aucun FR/NFR du PRD ; confort + cohérence UX + hygiène de données._

**Décisions ouvertes du brainstorm tranchées par northwood (2026-07-10) :**
1. **Clé doublon casse-insensible** — index sur `lower(title)` + `COALESCE(lower(artist), '')` (cohérent 7.12/10.1). Accents laissés de côté.
2. **Merge FK résiduel : interroger la prod d'abord** — compter les doublons exacts post-16.1 en prod AVANT de coder, puis **merge ciblé** (pas de moteur générique surdimensionné).
3. **Blocage doublon symétrique** — on **durcit 13.1** : sur collision (titre+artiste), aucune persistance ni en création ni en édition (« bloque » remplace « prévient mais sauve »). Une seule règle doublon dans toute l'app.

**Objectif :** faire de la **création** de chanson une expérience **sans bouton**, cohérente avec l'édition auto-save (13.1) : le titre EST l'identité, la chanson naît au débounce, artiste facultatif. Et adosser cette identité à une **garantie serveur d'unicité** (titre + artiste) qui remplace la protection cosmétique actuelle par une garde structurelle (index unique + 409), fermant la course find-or-create multi-appareils pour les chansons.

**Découpage :** 2 stories, **ordre imposé** 17.1 (back, prérequis) → 17.2 (front). ⚠️ 17.1 embarque une **migration** (merge FK + index unique) → part en prod, idempotente et testée en local avant merge (project-context § migrations). ⚠️ 17.2 **révise une story shippée (13.1)** : la politique doublon en édition passe de « prévient mais sauve » à « bloque » — AC dédiée.

**Périmètre à ne pas cacher (dette assumée) :**
- 🔁 **Revisite 13.1 (shippée)** : blocage doublon désormais aussi en édition. Mettre à jour la décision du 30/06 dans `deferred-work.md`.
- 🔓 **Merge FK rouvert** : 16.1 l'avait volontairement esquivé (l'artiste étant une string libre, le trim suffisait sans merge). L'index unique l'impose pour les doublons **exacts** résiduels → interroger la prod avant de dimensionner (décision 2 ci-dessus).
- 🧊 **Ferme un item glaçon** : la course find-or-create chansons devient couverte côté serveur.

### Story 17.1: Unicité chanson serveur — merge FK ciblé + index unique + 409

As a musicien qui gère sa songlist,
I want que le serveur garantisse qu'une même chanson (même titre + même artiste) ne puisse pas exister en double dans ma collection,
So that mes suggestions, filtres et statistiques ne soient jamais pollués par des doublons — y compris en cas de saisie concurrente sur deux appareils.

**Contexte :** aujourd'hui rien n'empêche structurellement deux `Songs` `(userUid, title, artist)` identiques (protection seulement côté client, best-effort). Mirror de l'unicité playlist (10.1) et de l'unicité topic casse/accent (7.12). Un index unique ne peut être posé **que si la base est déjà dédoublonnée** → prérequis migration de merge. 16.1 a trimmé (collapsé les quasi-doublons d'espaces) mais a **volontairement esquivé le merge FK** des doublons exacts ; cette story le rouvre. `SongPlays` (FK `songUid`, pas de `userUid` propre — ownership via le Song parent) et les liens playlists (`PlaylistSongs` ou équivalent) du doublon supprimé doivent être **réassignés** vers la ligne gardée avant suppression, sinon perte d'historique de pratique / de playlist.

**Acceptance Criteria:**

**Given** l'état des données prod post-16.1 (volet **cadrage préalable**)
**When** on dimensionne le merge
**Then** on **interroge d'abord la prod** pour compter les doublons exacts `(userUid, lower(title), COALESCE(lower(artist),''))` restants ; le résultat est **consigné** (commentaire de migration ou note de story) et **conditionne** l'approche : merge **ciblé** si volume faible, jamais un moteur générique surdimensionné (décision northwood 2026-07-10)

**Given** des doublons exacts résiduels en base (volet **merge FK**)
**When** la migration de dédoublonnage s'exécute
**Then** pour chaque groupe de doublons `(userUid, lower(title), COALESCE(lower(artist),''))`, une ligne **gardée** est choisie de façon déterministe (ex. plus ancienne `createdAt`, sinon plus petit `uid`) ; **tous les `SongPlays.songUid`** des doublons sont réassignés vers la gardée ; **tous les liens playlists** des doublons sont réassignés vers la gardée (en dédoublonnant les liens qui collisionneraient) ; puis les lignes doublons sont **supprimées** ; **aucune perte** d'historique de pratique ni d'appartenance playlist

**Given** une base dédoublonnée (volet **garde structurelle**)
**When** la migration pose la contrainte
**Then** un **index unique** est créé sur `(user_uid, lower(title), COALESCE(lower(artist), ''))` — casse-insensible, `COALESCE('')` pour gérer l'artiste `NULL` (deux sans-artiste collisionnent) ; **idempotent** (garde `describeTable`/`showIndex` avant création, pattern project-context) ; testé en local (`make migrate`) avant tout merge

**Given** une tentative de create/update qui violerait l'unicité (volet **API**)
**When** le contrôleur persiste et Postgres lève l'erreur d'unicité (`23505`)
**Then** l'erreur est mappée en **409** avec un **corps typé** (ex. `{ error: 'duplicate_song' }`) exploitable par le front — mirror du mapping 10.1/7.12 ; le pattern contrôleur (scoping `userUid`, ownership par `where` → 404) reste inchangé ; le 409 ne fuit aucune info d'un autre utilisateur (l'unicité est scopée `userUid`)

**And** UI/commentaires en anglais ; suite back verte, avec un test qui **mocke `Song.create`/`update`** pour couvrir le mapping `23505 → 409` (le folding réel n'est validé que par la migration locale — même limite assumée que 7.12) ; migration idempotente et relançable sans effet de bord. `[backend/controllers/songcontroller.js createSong/updateSong, nouvelle migration backend/migrations/, backend/__tests__/songcontroller.test.js]`

### Story 17.2: Auto-création front (sans bouton) + blocage doublon symétrique

As a musicien qui ajoute une chanson,
I want que ma chanson se crée toute seule dès que je lui donne un titre, sans bouton à cliquer,
So that la création soit aussi fluide que l'édition (auto-save) et que je ne perde jamais de saisie ni ne crée de chanson vide par accident.

**Contexte :** l'auto-save 13.1 est **édition-only** (debounce + flush au blur, `lastPlayed` exclu, statut « Saving/Saved », sticky Back) ; la **création** garde encore un bouton `Add` explicite (`SongForm.tsx` bas de form, mode `add` = submit qui crée). Retirer `Add` tel quel **casse la création** → il faut étendre l'auto-save/auto-création au mode `add`. Le point d'entrée « Add song » de la songlist reste (il ouvre un form vierge) ; seul le **bouton de validation interne** disparaît. S'adosse à la garde serveur 17.1 (409 typé) pour la politique doublon. `[src/components/SongForm.tsx bas de form mode add, src/pages/Songs.tsx flux create/onSubmit]`

**Acceptance Criteria:**

**Given** un formulaire de création vierge (mode `add`) (volet **déclencheur & bascule**)
**When** je saisis un titre non vide (trimmé) et que la frappe se stabilise (**débounce ~800ms**, calque 13.1)
**Then** la chanson est **créée** côté serveur ; la transition `add → edit` est **invisible** — l'UID créé est récupéré, l'URL/state basculent en douce (zéro rechargement), la pastille passe à « Saved », l'auto-save 13.1 prend le relais pour les frappes suivantes ; le **bouton `Add` interne a disparu**

**Given** une création déjà en vol (CREATE réseau lent) (volet **verrou in-flight**)
**When** un nouveau débounce se déclenche avant la réponse
**Then** on ne tire **pas** un 2ᵉ CREATE : la frappe est empilée et rejouée en **UPDATE** une fois l'UID connu (miroir `savingRef`/`creatingPlaylistRef` de 13.1/10.2) — aucune double-création

**Given** un titre vidé après coup (volet **anti-chanson-vide, régimes Seuil 1**)
**When** je quitte / navigue hors de la fiche
**Then** si la chanson n'a **rien d'autre que le titre effacé** (aucun autre champ rempli, aucune pratique, aucune playlist → « frais », Seuil 1) → **nettoyage silencieux** (rien de persisté / suppression du brouillon sans alerte) ; sinon (chanson à valeur) → **popup « ⚠️ ta chanson n'a plus de titre — Supprimer / Continuer »** ; la popup ne se déclenche **qu'à la sortie/navigation** (pas au changement de champ interne : titre vide = état transitoire toléré) ; « Continuer à éditer » ferme la popup et **re-vérifie au prochain essai de sortie** (événementiel, aucun minuteur)

**Given** un CREATE qui échoue (réseau / 500) (volet **résilience**)
**When** la requête n'aboutit pas
**Then** la donnée **vit côté client**, statut « **Not saved — retrying** », le **prochain débounce réessaie** ; aucune saisie perdue ; quitter en plein CREATE parti = la chanson **naît quand même** (quitter = garder, pas d'annulation d'un CREATE en vol)

**Given** une saisie qui collisionne avec une chanson existante — **création OU édition** (volet **blocage doublon symétrique**)
**When** la clé **(titre + artiste)** casse-insensible entre en collision (deux sans-artiste = doublon ; même titre + artistes différents = deux entrées légitimes) et le serveur répond **409** (17.1)
**Then** **aucune persistance** — ni création, ni update ; bannière « **not saved — already exists** » ; l'invariant est **bloquer = refuser d'écrire, jamais supprimer/corrompre** (la chanson garde sa dernière valeur valide) ; le blocage **force la résolution** (rien ne se persiste tant que non différencié, y compris éditer un champ d'un doublon legacy) mais **n'enferme pas** dans la page (titre non vide → pas de popup titre-vide → on peut toujours quitter) ; débloqué dès qu'on différencie titre ou artiste

**And** ⚠️ **révise 13.1 (shippée)** : la politique doublon en **édition** passe de « prévient mais sauve » à « bloque » — cette AC est le durcissement assumé ; UI/messages en anglais ; réutiliser les patterns existants (statut Saving/Saved 13.1, `ConfirmDialog` pour la popup titre-vide, toasts/bannières manuels — pas de lib) ; suite front verte (tests du débounce-create, du verrou in-flight, des deux régimes Seuil 1, du blocage 409 en création ET édition) ; mettre à jour la décision 13.1 du 30/06 dans `deferred-work.md`. `[src/components/SongForm.tsx, src/pages/Songs.tsx, src/services/songService.ts]`

## Epic 18: Fiche chanson = vraie route (migration data-router)

_Ajouté 2026-07-11 — issu de la **rétro Epic 17** (leçon #1 : dette « form = état local, pas une route » remontée 3× dans le même epic) + QA 17.2 (refresh signalé northwood). Cadré en **ADR** `_bmad-output/planning-artifacts/architecture-song-route-2026-07-11.md` (cadrage archi 2026-07-11, décision northwood : migrer vers data-router). Epic **dette technique / archi** : réduire la dette du socle (supprimer le guard maison 17.2) tout en fermant 3 symptômes UX._

**Objectif :** faire de la fiche chanson une **vraie route** (`/songs/:uid`) en migrant le socle routing vers le **data-router** react-router (`createBrowserRouter`/`<RouterProvider>`), ce qui débloque **`useBlocker`**. Ferme d'un coup : **refresh sur une chanson → reste sur la chanson** ; **back-button navigateur gardé** ; et **supprime le guard de navigation maison** (`LeaveGuardContext`/`Provider`/`GuardedLink`) construit en 17.2 → dette nette réduite. Aucun FR/NFR du PRD ; archi + confort + hygiène de dette.

**Découpage :** 2 stories, **ordre imposé** 18.1 (migration infra) → 18.2 (route-ify + swap guard), pour **dé-risquer** la refonte de la racine routing. ⚠️ 18.2 **révise du code shippé** (le guard 17.2, en prod v1.13.0) : `useBlocker` doit préserver l'UX validée en QA 17.2 (popup titre-vide, fresh-delete silencieux, symétrie du blocage doublon).

**Décisions verrouillées (ADR 2026-07-11) :**
1. **Migrer vers data-router** (`createBrowserRouter` + `<RouterProvider>`, `future` flags conservés) — pas de refonte du modèle d'auth (**pas de loaders** ; wrapper `<RequireAuth>`, `AuthProvider` reste au-dessus du router).
2. **Routes** : `/songs` (liste) · `/songs/new` (ajout, form vierge) · `/songs/:uid` (édition). `editingUid`/`page` **dérivés de l'URL** (`useParams`).
3. **Guard** : **supprimer** `LeaveGuardContext.ts` + `LeaveGuardProvider.tsx` + `GuardedLink` (Header → `<Link>` simples) + le `LeaveGuardProvider` d'`App` ; **remplacer** par `useBlocker`, en **réutilisant** `isFreshSong`/`deleteEditingSong`/`ConfirmDialog` de 17.2. `beforeunload` conservé.
4. **Auto-création** : `navigate('/songs/' + newUid, { replace: true })` (bascule invisible, zéro spam d'historique).
5. **Deep-link** : `/songs/:uid` inconnu/pas-à-moi → 404 scopé (invariant 7.5, pas d'oracle) → écran « Song not found » + retour liste.

### Story 18.1: Migration vers le data-router (infra pure, zéro changement de comportement)

As a mainteneur du socle,
I want migrer le routing de `<BrowserRouter>` vers `createBrowserRouter`/`<RouterProvider>` sans rien changer au comportement,
So that `useBlocker` devienne disponible pour la story suivante, en ayant prouvé d'abord que la bascule d'infra ne casse aucune route.

**Contexte :** `src/main.tsx` = `<BrowserRouter future={{…}}>` → `<AuthProvider>` → `<App>`. `src/App.tsx` = `<LeaveGuardProvider>` → div → `<Header/> <VerifyEmailBanner/> <main><Routes>…</Routes></main> <Footer/>`. Les routes protégées sont des éléments conditionnels `isAuthenticated ? <Page/> : <Navigate to="/login"/>`. `[src/main.tsx, src/App.tsx, éventuel src/components/RequireAuth.tsx NEW]`

**Acceptance Criteria:**

**Given** le socle routing actuel (`<BrowserRouter>`)
**When** on migre vers le data-router
**Then** `main.tsx` rend `<RouterProvider router={router}/>` avec un `createBrowserRouter([...])` (les mêmes `future` flags `v7_startTransition`/`v7_relativeSplatPath` conservés) ; `AuthProvider` reste **au-dessus** de `RouterProvider` (l'auth reste un contexte client, `useAuth` dispo dans tous les éléments de route) ; **aucun loader/action** react-router n'est introduit

**Given** le layout et toutes les routes existantes
**When** on définit l'arbre de routes du data-router
**Then** le layout racine (Header / VerifyEmailBanner / `<main><Outlet/></main>` / Footer) devient l'**élément d'une route layout** ; les routes protégées passent par un wrapper **`<RequireAuth>`** (`isAuthenticated ? <Outlet/> : <Navigate to="/login" replace/>`) ; **toutes** les routes existantes sont reproduites **à l'identique** (`/`, `/songs`, `/my-instruments`, `/my-playlists`, `/my-topics`, `/my-sessions`, `/my-heatmap`, `/profile`, `/verify-email`, `/forgot-password`, `/reset-password`, `/login`, `/register`, `*`) avec les **mêmes** redirections (`/login`↔`/songs` selon auth, `*`→`/`)

**Given** la fiche chanson
**When** la migration 18.1 est livrée
**Then** elle **reste** en `page`-state local (pas encore route-ifiée — c'est 18.2) ; le **guard maison 17.2 reste en place** cette story ; **aucun changement de comportement UX** observable (mêmes URLs, mêmes flux, refresh se comporte comme avant)

**And** aucune régression : suites front + back vertes, tsc + lint clean ; les tests qui rendent des pages via `<MemoryRouter>` adaptés au besoin (ou `createMemoryRouter`) sans changer ce qu'ils vérifient ; ⚠️ vérifier `AuthProvider × RouterProvider` (loading, redirections) et le double-invoke StrictMode. UI/commentaires en anglais. `[src/main.tsx, src/App.tsx, src/components/RequireAuth.tsx (NEW), tests de routing]`

### Story 18.2: Route-ify la fiche chanson + remplacer le guard maison par `useBlocker`

As a musicien qui édite une chanson,
I want que l'URL reflète la chanson ouverte (`/songs/:uid`),
So that rafraîchir reste sur la chanson, le bouton back du navigateur soit géré, et l'app n'ait plus de guard de navigation maison à maintenir.

**Contexte :** s'appuie sur le data-router de 18.1. `Songs.tsx` porte aujourd'hui `page:'list'|'form'` + `editingUid` en `useState`, et l'auto-save/auto-création/blocage doublon/Seuil 1 de 13.1+17.2. Le guard maison 17.2 (`LeaveGuardContext`/`Provider`/`GuardedLink` + enregistrement `attemptLeave`) est à retirer. `[src/pages/Songs.tsx, src/components/Header.tsx, DELETE src/contexts/LeaveGuardContext.ts + LeaveGuardProvider.tsx, src/services/songService.ts (getSong déjà là)]`

**Acceptance Criteria:**

**Given** les routes `/songs` / `/songs/new` / `/songs/:uid` (volet **route-ify**)
**When** on navigue
**Then** `editingUid` et le mode (liste/add/edit) sont **dérivés de l'URL** (`useParams`) et non plus d'un `useState` : `/songs` → liste ; `/songs/new` → add (`editingUid = null`) ; `/songs/:uid` → édition (charge la chanson depuis `songs` en mémoire ou `getSong(uid)`) ; **refresh sur `/songs/:uid` reste sur la chanson** ; toute la machinerie 13.1/17.2 (auto-save débounce, verrou in-flight, `editBaselineJson`, blocage doublon symétrique, Seuil 1) est **conservée** — seul le transport (état local → URL) change

**Given** l'auto-création (volet **bascule invisible**)
**When** on saisit un titre sur `/songs/new` et que la chanson naît au débounce
**Then** `navigate('/songs/' + newUid, { replace: true })` bascule vers l'édition — **zéro rechargement**, **zéro entrée d'historique** parasite (le `replace` remplace `/songs/new`) ; le verrou in-flight `savingRef` (17.2) prévient toujours la double-création

**Given** un titre vidé sur une chanson à valeur (volet **guard → `useBlocker`**)
**When** l'utilisateur tente de quitter — **y compris le bouton back du navigateur / popstate**
**Then** un **`useBlocker`** intercepte : réutilise `isFreshSong`/`deleteEditingSong`/`ConfirmDialog` de 17.2 — fresh → DELETE silencieux + `blocker.proceed()` ; à valeur → popup « This song has no title » (Delete → delete + `proceed()` ; Continue editing → `blocker.reset()`) ; le **guard maison de 17.2 est SUPPRIMÉ** (`LeaveGuardContext.ts` + `LeaveGuardProvider.tsx` **supprimés**, `Header` revient à des `<Link>` simples, `App` sans `LeaveGuardProvider`) ; `beforeunload` (refresh/fermeture d'onglet) **conservé**

**Given** un deep-link `/songs/:uid` inconnu ou appartenant à un autre user (volet **404 scopé**)
**When** la page tente de charger la chanson
**Then** `getSong` renvoie **404 scopé** (invariant 7.5 : « pas à toi » indistinguable de « n'existe pas ») → écran **« Song not found »** + lien retour `/songs` ; aucun oracle d'existence

**And** ⚠️ **révise le guard livré en 17.2 (prod v1.13.0)** : le comportement UX (popup titre-vide, fresh-delete silencieux, symétrie du blocage doublon) doit être **préservé à l'identique** — validé par la QA nav app-wide (comme 17.2) ; UI/messages en anglais ; suites vertes (tests route/param, deep-link 404, `useBlocker` popup fresh vs à-valeur, auto-création `navigate(replace)`) ; tsc + lint clean ; mettre à jour `deferred-work.md` (les 2 defer nav de 17.2 → **fermés**). `[src/pages/Songs.tsx, src/components/Header.tsx, DELETE src/contexts/LeaveGuardContext.ts + src/contexts/LeaveGuardProvider.tsx]`

---

# Catalog (Epic 19+) — Requirements

_Ajouté 2026-07-15. Source : PRD Catalog `prd-musician-tools-2026-07-12` (espace de FR PROPRE — FR-1..13, ne pas confondre avec les FR1..26 du journal), UX `ux-musician-tools-2026-07-12`, architecture `architecture-catalog-2026-07-12.md`. Découpage en epics/stories ci-dessous._

## Functional Requirements (Catalog)

- **FR-1** — Parcourir le Catalog (connecté ; non connecté → 401 ; liste paginée/virtualisée).
- **FR-2** — Rechercher (titre/artiste, casse+accents pliés) et filtrer par métadonnées intrinsèques : `key · mode · timeSignature · genre` (combinables ; état « aucun résultat »).
- **FR-3** — Consulter le détail d'une fiche (tous champs intrinsèques + liens cliquables) ; CTA unique `Add to my songlist` ou état doublon.
- **FR-4** — `Add to my songlist` : copie snapshot des champs canoniques (deep-clone) + `sourceCatalogUid` inerte ; champs perso vierges.
- **FR-5** — La copie est pleinement éditable et indépendante (aucune synchro Catalog ↔ copie).
- **FR-6** — Garde de doublon à l'ajout : clé canonique déjà en Songlist → bloqué (409), pointe l'existante.
- **FR-7** — Garde-fou unidirectionnel : aucun chemin utilisateur n'écrit dans le Catalog.
- **FR-8** — Parcourir les Collections et voir leurs fiches (nom + description éventuelle + compteur).
- **FR-9** — Importer une Collection : garde de doublon par fiche + crée/réutilise une Playlist perso miroir du nom ; best-effort ; récap `{added, skipped, failed}`.
- **FR-10** — Rôle Curator (`isCurator`) : écriture Catalog réservée ; sinon 403 explicite.
- **FR-11** — Gérer les fiches (create/edit in-place uid stable/delete) ; titre requis ; auto-fill sans écraser.
- **FR-12** — Composer des Collections (une fiche dans plusieurs Collections ; suppression fiche → retrait des Collections).
- **FR-13** — Unicité canonique GLOBALE (title+artist) : 409 sur create ET rename.

## Non-Functional Requirements (Catalog)

- **NFR-1** — Donnée partagée non-scopée `userUid` (lecture aux connectés, écriture Curator).
- **NFR-2** — Performance/scalabilité : pagination/virtualisation, index clé canonique + axes de filtre.
- **NFR-3** — Sécurité/autorisation : rôle Curator, écriture → 403 (exception nommée au 404 anti-oracle 7.5).
- **NFR-4** — Intégrité/découplage : suppression/édition fiche ne casse jamais une Song copiée (référence souple, pas de FK).
- **NFR-5** — Cohérence UI : réutilise le design system, comboboxes, confirm/toast (aucune primitive neuve).
- **NFR-6** — i18n de contenu : chaînes UI en anglais.

## Additional Requirements (Architecture)

- **AR-1** — Migration-first : `CatalogSong` (sous-ensemble intrinsèque, sans `userUid`) + index unique canonique GLOBAL `(lower(title), COALESCE(lower(artist),''))` créé par migration, absent du modèle (discipline Epic 17, 23505→409).
- **AR-2** — `Users.isCurator` (bool) + middleware `requireCurator` (403) ; lecture non-scopée via `catalogcontroller` nommé + commentaire d'ancrage.
- **AR-3** — `Songs.sourceCatalogUid` référence SOUPLE (aucune FK vive) ; dangling délibéré (crochet popularité).
- **AR-4** — Tables Collections (`CatalogCollection` + jointure `CatalogCollectionSongs`) ; nettoyage DUR des jointures à la suppression d'une fiche.
- **AR-5** — Endpoint liste paginé à ENVELOPPE `{items,total,page,limit}` (exception nommée) ; `ORDER BY artist,title,uid` ; `catalogService` séparé, type `CatalogSong` distinct.
- **AR-6** — Mécanique Add = endpoint dédié `POST /api/catalog/:uid/add-to-songlist` (réutilise `Song.create` + `respondDuplicateSong`).
- **AR-7** — Import NON-ATOMIQUE (best-effort, pas de transaction englobante ; playlist miroir idempotente).
- **AR-8** — Flag doublon CLIENT-SIDE (réutilise `songDuplicate.ts`) ; URL-as-state (`useSearchParams`) + debounce/`AbortController`.
- **AR-9** — 4 gaps à fermer en story 1-2 : whitelist `sort`, cap `limit`, CSRF sur writes, folding `unaccent` (extension déjà présente).
- **AR-10** — Écrire principe §3 + exceptions dans `project-context.md` AVANT la 1ʳᵉ code-review Catalog ; séquencement seed (curation → seed → exposition).

## UX Design Requirements (Catalog)

- **UX-DR1** — Ordre Browse fixe : Search → rail Collections → strip Recently added → liste filtrable (DL-5).
- **UX-DR2** — Search-to-collapse : filtre en place, rails effacés, titre `All songs`→`Results(n)` (DL-6).
- **UX-DR3** — Tuile Collection = gradient marque + scrim de contraste (compteur ≥4.5:1) (DL-7).
- **UX-DR4** — Bouton Add 3 états : default / flash `✓ Added` / `✓ Already in your songlist` (DL-8).
- **UX-DR5** — État doublon = vert calme cliquable vers l'existante, jamais rouge (DL-11).
- **UX-DR6** — Import Collection : `ConfirmDialog` (N + playlist créée/réutilisée) + toast récap (DL-12).
- **UX-DR7** — URL-as-state (search+filtres en query params) + retour du focus sur back-nav (DL-10).
- **UX-DR8** — Admin curateur utilitaire : entry form structure SongForm restreinte + composer search Add/Remove (pas de drag) (DL-14).
- **UX-DR9** — Crochet Songlist-vide → CTA `Browse the Catalog` + aperçu Collections, dégradation propre (DL-13).
- **UX-DR10** — Stretched-link a11y partout (titre = lien, Add/badge = frères, pas d'imbrication).
- **UX-DR11** — Filtres intrinsèques SEULEMENT (Key·Genre·Mode·Time signature), aucun instrument/difficulté/accordage (DL-17).
- **UX-DR12** — Artiste d'abord dans rows/cartes/détail (DL-18).
- **UX-DR13** — Nav = 7e lien `Catalog` après Songlist ; entrée admin `Curate` dans le dropdown compte si `isCurator` (DL-4/Nav).
- **UX-DR14** — Accessibility floor : live-regions (nombre de résultats, toasts), rails = listes nommées, cibles ≥44px.
- **UX-DR15** — Responsive : deltas hérités (lg layout, sm grilles, rails scroll horizontal), dark mode partout.

## FR Coverage Map (Catalog)

| FR | Epic | Note |
|---|---|---|
| FR-1 Browse | 19 | liste paginée |
| FR-2 Search/filter | 19 | key·mode·timeSig·genre + texte |
| FR-3 Détail | 19 | lecture seule + CTA |
| FR-4 Add snapshot | 19 | endpoint dédié |
| FR-5 Éditable/indépendant | 19 | Song séparée |
| FR-6 Garde doublon | 19 | 409 + badge |
| FR-7 Unidirectionnel | 19 | requireCurator |
| FR-8 Browse Collections | 20 | |
| FR-9 Import Collection | 20 | + playlist miroir |
| FR-10 Rôle Curator | 19 | isCurator/403 |
| FR-11 Gérer fiches | 19 | in-place + auto-fill |
| FR-12 Composer Collections | 20 | jointure multi |
| FR-13 Unicité canonique | 19 | index global 409 |

**Couverture UX-DR :** UX-DR1-7, 9-15 → Epic 19 (browse/add/admin fiches/fondations) ; UX-DR3 (tuile Collection), UX-DR6 (import confirm/toast), UX-DR8 (composer) → Epic 20. Aucun FR/UX-DR non couvert.

---

## Epic 19: Catalog — Browse & Add

Première donnée **partagée non-scopée `userUid`** de l'app. Un utilisateur trouve une chanson déjà remplie et l'ajoute à sa Songlist en secondes ; le curateur crée/édite les fiches pour alimenter le Catalog. Fondations : modèle `CatalogSong` + index canonique global, `isCurator`/`requireCurator` (403), `sourceCatalogUid` (référence souple), endpoint liste paginé, mécanique Add dédiée. Réutilise SANS modifier : unicité Epic 17 (`respondDuplicateSong`), auto-fill 8.1, data-router Epic 18, `songDuplicate.ts`. Cadré en `architecture-catalog-2026-07-12.md`.

### Story 19.1: Fondation Catalog + le curateur gère les fiches (backend)

En tant que **curateur**,
je veux créer, éditer et supprimer des fiches Catalog via une API protégée,
afin que le Catalog dispose de contenu canonique unique, sans écrire de SQL.

**Acceptance Criteria:**

**Given** les migrations Catalog
**When** elles s'exécutent
**Then** une table `CatalogSong` existe (sous-ensemble intrinsèque : `title` NOT NULL, `artist`, `album`, `key`, `bpm`, `mode`, `timeSignature`, `durationSeconds`, `language` JSONB, `genre` JSONB, `streamingLinks` JSONB, `pitchStandard` ; PK `uid` UUID, `timestamps` ; `field:'snake_case'`), **sans** `userUid` ni aucun champ instrument/perso
**And** un **index unique fonctionnel GLOBAL** `(lower(title), COALESCE(lower(artist), ''))` est créé **par migration** (`CREATE UNIQUE INDEX IF NOT EXISTS`), **absent du modèle** Sequelize (`sync()` ne le touche pas)
**And** une colonne `Users.isCurator` (bool, défaut `false`) est ajoutée
**And** chaque migration est **idempotente** (`showAllTables`/`describeTable`) et testée en local

**Given** un utilisateur `isCurator = true`
**When** `POST /api/catalog` avec un `title`
**Then** 201 + fiche créée (entité brute) ; sans titre → **400** « Title is required »

**Given** un utilisateur **non-curateur** (ou anonyme)
**When** `POST` / `PUT` / `DELETE /api/catalog`
**Then** **403** explicite « You don't have curator access. » via `requireCurator` — **jamais** 404 (la ressource est lisible, aucun secret d'énumération)

**Given** une fiche `(title + artist)` existe déjà au Catalog
**When** on crée **ou** on renomme une autre fiche vers la même **clé canonique** (casse pliée, accents gardés : « Beyoncé » ≠ « Beyonce »)
**Then** **409** typé `{ error:'duplicate_catalog_entry', message, entry }` (via le mapping `23505`, mécanique Epic 17 sans `user_uid`)

**Given** une fiche potentiellement référencée
**When** le curateur la corrige (`PUT`)
**Then** c'est un `UPDATE` **in-place**, `uid` **préservé** (jamais delete+recreate)

**And** les routes d'écriture passent par la CSRF app-wide ; tests backend (`jest.mock('../models')`) : `requireCurator` (403/passe), 409 create ET rename, 400 titre requis
`[backend/migrations/*-create-catalog-songs.js, *-add-is-curator-to-users.js, backend/models/catalogsong.js, backend/models/user.js, backend/middleware/requirecurator.js, backend/routes/catalog.js, backend/controllers/catalogcontroller.js]`

### Story 19.2: Écran d'administration — saisir une fiche (front)

En tant que **curateur**,
je veux un formulaire d'administration pour saisir une fiche avec auto-fill,
afin d'enrichir le Catalog sans toucher à la base (UJ-3).

**Acceptance Criteria:**

**Given** un utilisateur `isCurator`
**When** il ouvre le dropdown compte
**Then** une entrée « Curate » apparaît → `/catalog/admin` ; pour un `!isCurator` elle est **absente** et la route est protégée

**Given** l'écran `/catalog/admin`
**When** le curateur saisit une fiche
**Then** le formulaire réutilise la **structure `SongForm`** mais **restreinte aux champs intrinsèques** (DL-17 : **pas** de instrument/difficulté/accordage/capo/technique/instrumentLinks) ; titre requis

**Given** un titre + artiste saisis
**When** l'auto-fill SongBPM est déclenché (réutilise `/api/songs/lookup`)
**Then** BPM/durée sont proposés **sans écraser** une saisie existante (FR-11)

**Given** une fiche `(title + artist)` déjà au Catalog
**When** le curateur enregistre
**Then** message inline « A "{title}" by {artist} is already in the Catalog. » (409, pas d'erreur rouge générique)

**And** UI en anglais, dark mode, posture utilitaire ; `catalogService` porte les méthodes d'écriture
`[src/pages/CatalogAdmin.tsx, src/services/catalogService.ts, src/components/Header.tsx, src/router.tsx]`

### Story 19.3: Browse — parcourir, rechercher, filtrer, voir le détail

En tant qu'**utilisateur connecté**,
je veux parcourir, rechercher et filtrer le Catalog puis ouvrir une fiche,
afin de trouver une chanson déjà remplie (UJ-1).

**Acceptance Criteria:**

**Given** un utilisateur **non connecté**
**When** il atteint `/api/catalog` ou `/catalog`
**Then** 401 / redirection, **aucune** fuite de contenu

**Given** un utilisateur connecté
**When** `GET /api/catalog?search=&key=&mode=&timeSignature=&genre=&sort=&page=&limit=`
**Then** réponse **à enveloppe** `{ items, total, page, limit }` ; `ORDER BY artist, title, uid` (tiebreaker obligatoire) ; filtres combinés en ET ; `sort` limité à une **whitelist** ; `limit` **plafonné** (défaut + max)
**And** la requête est **non scopée `userUid`** (contrôleur `catalog*` + commentaire d'ancrage au principe partagé) — jamais rescopée

**Given** une recherche « beyonce »
**When** elle s'exécute
**Then** elle matche « Beyoncé » (folding `unaccent` serveur, réutilise le pattern topics) ; 0 résultat → « No songs match your search. » titre `Results (0)` ; le nombre est annoncé via `aria-live`

**Given** je tape dans la recherche / change un filtre
**When** l'UI réagit
**Then** l'état vit dans l'**URL** (`useSearchParams`, source unique), avec **debounce** (~250-300ms) et **annulation** des requêtes périmées (`AbortController`) ; les rails se replient ; le back-button restaure la vue filtrée

**Given** un deep-link `/catalog/:uid` inconnu/supprimé
**When** la page charge
**Then** **404 calme** « This song is no longer in the Catalog. » + lien `Browse the Catalog` (data-router Epic 18) ; le détail n'affiche que les champs **intrinsèques** + liens YouTube/Spotify cliquables, sans édition

**And** un 7e lien `Catalog` est ajouté à la nav (après Songlist) ; états chargement (skeleton) / erreur (Retry) calmes
`[backend/controllers/catalogcontroller.js, backend/routes/catalog.js, src/services/catalogService.ts, src/pages/Catalog.tsx, src/components/CatalogList.tsx, src/pages/CatalogEntry.tsx, src/components/Header.tsx, src/router.tsx]`

### Story 19.4: Add to my songlist — copie snapshot en un geste

En tant qu'**utilisateur**,
je veux ajouter une fiche à ma Songlist en un clic,
afin qu'elle atterrisse complète sans aucune saisie (climax UJ-1).

**Acceptance Criteria:**

**Given** la migration
**When** elle s'exécute
**Then** `Songs.sourceCatalogUid` (nullable UUID, `field:'source_catalog_uid'`) est ajoutée en **référence souple** — **aucune FK vive** ; idempotente

**Given** une fiche pas encore dans ma Songlist
**When** je clique `Add to my songlist` (`POST /api/catalog/:uid/add-to-songlist`)
**Then** une `Song` perso est créée en **deep-clone** des JSON (`structuredClone`, aucun partage de référence) + `userUid` + `sourceCatalogUid` ; champs perso vierges (`lastPlayed=null`, aucun SongPlay/playlist) ; 201 entité brute ; toast « Added to your songlist » (annoncé)

**Given** une clé canonique déjà présente dans ma Songlist
**When** j'ajoute (ou à l'affichage de la ligne)
**Then** le bouton **naît/bascule** en « ✓ Already in your songlist » (vert, cliquable → la Song existante) ; **aucune** insertion (`23505` → `respondDuplicateSong` → 409) ; jamais rouge (FR-6). Le flag est calculé **côté client** en réutilisant `songDuplicate.ts` contre les clés de ma Songlist (la lecture Catalog reste purement partagée)

**Given** le curateur supprime la fiche Catalog source
**When** j'ouvre ma Song copiée
**Then** elle reste **intacte** (référence souple, dangling toléré)

**Given** ma Songlist est vide
**When** j'ouvre la page Songs
**Then** un crochet « Your songlist is empty — Browse the Catalog to fill it in seconds » + CTA `/catalog` s'affiche ; si le fetch Catalog échoue → **CTA seul** (dégradation propre)

**And** le bouton a 3 états (default / flash `✓ Added` / `Already`), inline sur row/carte/fiche, optimiste, re-tentable ; cible ≥44px ; stretched-link (bouton = frère du lien titre)
`[backend/migrations/*-add-source-catalog-uid-to-songs.js, backend/controllers/catalogcontroller.js, backend/routes/catalog.js, src/components/CatalogAddButton.tsx, src/pages/Catalog.tsx, src/pages/CatalogEntry.tsx, src/pages/Songs.tsx, src/services/catalogService.ts]`

---

## Epic 20: Catalog — Collections

Un utilisateur importe une Collection curée d'un geste (chansons + Playlist perso miroir) ; le curateur compose les Collections. Bâtit sur Epic 19 (modèle fiche + mécanique Add stables). Réutilise SANS modifier : `createPlaylist`/`PlaylistConflictError` (Epic 10), la mécanique Add (19.4).

### Story 20.1: Fondation Collections + composition (backend)

En tant que **curateur**,
je veux créer des Collections et y ajouter/retirer des fiches via API,
afin de regrouper des chansons par thème.

**Acceptance Criteria:**

**Given** les migrations
**When** elles s'exécutent
**Then** une table `CatalogCollection` (`uid`, `name`, `description` nullable, `timestamps`) et une jointure `CatalogCollectionSongs` `(collection_uid, catalog_song_uid)` **composite unique** existent ; idempotentes

**Given** un curateur
**When** il crée une Collection puis y ajoute des fiches
**Then** 201 ; une fiche peut appartenir à **plusieurs** Collections (FR-12)

**Given** une fiche référencée par des Collections
**When** le curateur **supprime** la fiche Catalog
**Then** les lignes de jointure sont **nettoyées** (nettoyage DUR, pas de référence morte) — **étend** le `DELETE` de la story 19.1 (régime opposé à `sourceCatalogUid` souple)

**Given** un non-curateur
**When** il tente une écriture Collection
**Then** **403**

**And** `GET /api/catalog/collections` (nom, description, compteur) et `GET /api/catalog/collections/:uid` (détail + fiches) ; `/:uid` inconnu → 404 calme
`[backend/migrations/*-create-catalog-collections.js, *-create-catalog-collection-songs.js, backend/models/catalogcollection.js, backend/models/catalogcollectionsong.js, backend/controllers/catalogcontroller.js, backend/routes/catalog.js]`

### Story 20.2: Composer des Collections (admin front)

En tant que **curateur**,
je veux un composer pour bâtir une Collection par recherche + Add/Remove,
afin de monter un répertoire thématique sans drag-and-drop.

**Acceptance Criteria:**

**Given** le composer sur `/catalog/admin`
**When** je cherche une fiche et clique `Add`
**Then** elle rejoint la Collection ; `Remove` la retire ; **pas de drag** (DL-14) ; navigation **clavier** accessible (réutilise `comboboxKeyboard`)

**Given** une fiche
**When** je l'ajoute à deux Collections
**Then** c'est autorisé (multi-appartenance)

**And** UI en anglais, posture utilitaire ; `catalogService` porte les méthodes Collections curateur
`[src/pages/CatalogAdmin.tsx, src/services/catalogService.ts]`

### Story 20.3: Import endpoint — non-atomique + playlist miroir (backend)

En tant qu'**utilisateur**,
je veux importer toutes les fiches d'une Collection en une action,
afin de peupler ma Songlist par thème (UJ-2).

**Acceptance Criteria:**

**Given** une Collection de N fiches
**When** `POST /api/catalog/collections/:uid/add-to-songlist`
**Then** une Playlist perso du **nom de la Collection** est **créée ou réutilisée** (`lower(name)`, réutilise Epic 10) ; chaque fiche est traitée comme **unité autonome** (réutilise la mécanique Add 19.4) ; les fiches déjà présentes sont **skippées à l'insert** mais **toutes** les chansons du lot sont **rattachées** à la Playlist miroir (attache idempotente sur `(playlist_uid, song_uid)`)

**Given** un échec sur une fiche
**When** l'import se poursuit
**Then** le lot **n'est pas annulé** — **best-effort**, **pas** de transaction englobante ; réponse `{ added, skipped, failed, playlistUid }`

**Given** un ré-import de la même Collection
**When** il s'exécute
**Then** **idempotent** : ni chanson ni entrée de playlist dupliquée

**And** CSRF sur la route ; tests backend : skip doublon + rattachement playlist, best-effort avec échec, idempotence
`[backend/controllers/catalogcontroller.js, backend/routes/catalog.js]`

### Story 20.4: Browse & importer des Collections (front)

En tant qu'**utilisateur**,
je veux voir les Collections et en importer une avec confirmation et récapitulatif,
afin de peupler ma Songlist d'un geste (UJ-2).

**Acceptance Criteria:**

**Given** `/catalog` avec des Collections
**When** la page charge (champ de recherche vide)
**Then** un **rail Collections** (tuiles **gradient marque** + scrim de contraste, stretched-link vers le détail) s'affiche **au-dessus** de la liste (ordre DL-5) et **se replie** dès la saisie

**Given** la page détail d'une Collection `/catalog/collections/:uid`
**When** elle s'affiche
**Then** nom + **description éventuelle** + compteur + liste des fiches (Artist · Title · Key · BPM) + bouton `Add collection to my songlist` ; `/:uid` inconnu → 404 calme

**Given** je clique `Add collection to my songlist`
**When** l'action se déclenche
**Then** un **ConfirmDialog** annonce « Add N songs to your Songlist? A "X" playlist will be created or reused. » → à la confirmation, import → **toast récap** « Added 18 · 2 already in your songlist » (annoncé `role="status"`)

**Given** ma Songlist est vide
**When** le crochet s'affiche
**Then** il **enrichit** la story 19.4 avec un aperçu de **2-3 Collections** ; si le fetch échoue → CTA seul (dégradation propre)

**And** a11y : stretched-link, cibles ≥44px, live-region pour le récap ; UI en anglais, dark mode
`[src/pages/Catalog.tsx, src/components/CollectionCard.tsx, src/pages/CatalogCollection.tsx, src/pages/Songs.tsx, src/services/catalogService.ts, src/router.tsx]`

## Epic 21: Catalog ↔ Song — provenance & refresh de drift

La copie Songlist est un snapshot déconnecté (19.4/20.3) portant `sourceCatalogUid` inutilisé. Cet épic l'exploite : **provenance + navigation** (Song ↔ fiche source) et **refresh de drift** quand le curateur fait évoluer la fiche Catalog. Cadré dans l'ADR `architecture-catalog-song-link-2026-07-21.md` (décisions verrouillées : drift par timestamp ; Refresh écrase l'intrinsèque + préserve le perso ; dégradation propre si source supprimée/dépubliée). **Additif strict** sur le modèle snapshot 19.4 — la connexion est opt-in par action. Réutilise SANS le modifier `buildSongFromCatalog` (E19), le pattern contrôleur scopé `userUid`→404 (7.5), l'exception lecture Catalog non-scopée (§3), la fiche Song en route (E18), `ConfirmDialog`.

**Ordre imposé : 21.1 (back) → 21.2 (front).**

### Story 21.1: Provenance + drift + refresh (backend)

En tant qu'**utilisateur**,
je veux que ma chanson copiée connaisse sa fiche Catalog d'origine et sache si celle-ci a évolué,
afin de pouvoir mettre à jour ma copie à la version du Catalog.

**Acceptance Criteria:**

**Given** la migration
**When** elle s'exécute
**Then** `Songs.source_catalog_synced_at` (DATE nullable) existe ; **backfill idempotent** des copies existantes (`source_catalog_uid` non nul) = `CatalogSong.updated_at` de la source si résolvable, sinon `Songs.created_at` — **aucun faux « update available »** sur le legacy ; idempotente (part en **prod** au merge)

**Given** une copie depuis le Catalog (chemins *Add* 19.4 et *import* 20.3)
**When** `buildSongFromCatalog` construit la Song
**Then** `sourceCatalogSyncedAt = catalog.updatedAt` est posé

**Given** un `GET /api/songs/:uid` d'une Song avec `sourceCatalogUid` posé **et** source **publiée**
**When** la réponse est construite
**Then** elle inclut `sourceCatalog: { uid, updatedAt, drift }` où `drift = CatalogSong.updatedAt > Song.sourceCatalogSyncedAt` (lecture Catalog **non scopée**, §3) ; si la source est **absente ou en brouillon** → champ `sourceCatalog` **absent** (dégradation propre)

**Given** `POST /api/songs/:uid/refresh-from-catalog`
**When** l'utilisateur rafraîchit sa copie (scopé `userUid` → **404** si pas à lui/inconnu)
**Then** si la source n'existe plus / est en brouillon → **404/409** ; sinon les champs **intrinsèques** (`key, bpm, mode, timeSignature, durationSeconds, language, genre, streamingLinks, pitchStandard`, JSON **deep-cloned**) sont **écrasés** depuis la fiche Catalog courante ; les champs **perso** (`instrument, instrumentTuning, instrumentDifficulty, capo, technique, instrumentLinks, notes, lastPlayed, myInstrumentUid`) et `title/artist/album` sont **inchangés** ; `sourceCatalogSyncedAt = CatalogSong.updatedAt` ; renvoie la Song

**And** tests backend mockés (drift true/false, refresh préserve le perso, 404/409 source absente) + **smoke base dev** ; migration validée base dev avant « done »
`[backend/migrations/*-add-source-catalog-synced-at-to-songs.js, backend/models/song.js, backend/controllers/songcontroller.js (getSong, refreshSongFromCatalog), backend/controllers/catalogcontroller.js (buildSongFromCatalog), backend/routes/songs.js]`

### Story 21.2: Provenance + drift + Refresh (front, fiche Song)

En tant qu'**utilisateur**,
sur la fiche d'une chanson venue du Catalog, je veux voir d'où elle vient et être prévenu quand la version Catalog a évolué,
afin de rafraîchir ma copie d'un geste.

**Acceptance Criteria:**

**Given** une fiche Song dont `getSong` renvoie `sourceCatalog` (source publiée)
**When** la fiche s'affiche
**Then** un **badge « Added from the Catalog »** + un **lien vers `/catalog/:uid`** (fiche source) sont présents

**Given** `sourceCatalog.drift === true`
**When** la fiche s'affiche
**Then** une **bannière** « A newer version of this song is in the Catalog » + un bouton **Refresh** apparaissent

**Given** le clic sur **Refresh**
**When** l'action se déclenche
**Then** un **ConfirmDialog** annonce « Update key, BPM, etc. to the Catalog version? Your instrument, tuning and notes are kept. » → à la confirmation, `refreshSongFromCatalog` → la fiche se met à jour (le drift retombe) + **feedback** de succès (bannière/toast, `role="status"`)

**Given** une source **supprimée / dépubliée** (`sourceCatalog` absent), ou une erreur de refresh (source disparue entre-temps)
**When** la fiche s'affiche / le refresh échoue
**Then** **ni badge ni bannière** (dégradation propre) ; l'échec de refresh affiche un message clair (**erreur** distincte du succès)

**And** `songService.refreshSongFromCatalog` ; UI en anglais, dark mode, a11y ; tests (`StrictMode`) ; front vert
`[src/services/songService.ts, src/pages/Songs.tsx (fiche), src/components/ConfirmDialog.tsx, éventuel composant badge/bannière]`

## Epic 22: Unification des listes de chansons du Catalog

Fil rouge unique tiré par northwood en curant le Catalog en prod (relevé `deferred-work` 2026-08-08) : **« dès qu'on affiche une liste de chansons, c'est l'affichage Songlist »** — tableau + case à cocher à gauche + barre d'actions groupées « N selected ». Les 4 surfaces Catalog divergent aujourd'hui chacune à leur façon, et deux d'entre elles rendent une action de lot littéralement impossible (ajouter un lot d'entrées à une collection, ajouter un sous-ensemble d'une collection à sa songlist).

**État réel du code (vérifié, corrige le relevé initial)** :
- `useRowSelection` (19.9) **est déjà branché** sur `/catalog/manage?tab=entries` — il manque un 2ᵉ bouton, pas la sélection. À brancher sur les 3 autres surfaces.
- `StickyActionBar` (19.10) **n'est pas** la brique de cette épic : c'est la coquille du formulaire (Back/statut/Publish), avec le piège `backdrop-filter` documenté. Les barres « N selected » de `SongsList.tsx` et `CatalogManage.tsx` sont **deux `<div>` inline dupliqués**, et ils ne sont **pas** iso-visuels.
- `<MultiSelectTable>` annoncé en 19.9 **n'a jamais été livré** (descope non tracé). L'épic tranche ce point plutôt que de le laisser pendre.

**Front-only. Aucune migration, aucun nouvel endpoint** (décision A ci-dessous). Réutilise `useRowSelection` (19.9), le pattern de récap best-effort de 20.3/20.4, `ConfirmDialog`.

**Décisions de cadrage (tranchées northwood 2026-08-10)** :
- **A — Actions groupées = N appels front** sur les endpoints unitaires existants (`POST /catalog/collections/:uid/songs`, `DELETE /catalog/collections/:uid/songs/:catalogSongUid`, `POST /catalog/:uid/add-to-songlist`), avec **concurrence bornée** et **récap agrégé**. Reste dans le régime best-effort non-atomique déjà ancré en 20.3 ; volumes petits (24 lignes/page max). **Pas d'endpoint bulk, pas de backend.**
- **B — Un sous-ensemble n'alimente PAS la playlist miroir.** La sélection est un geste à la carte ; seule l'action « toute la collection » (20.3, `resolveMirrorPlaylist`) crée/réutilise la playlist du nom de la collection. Éviter les playlists à moitié vides qui mentent sur leur contenu.
- **C — Pas de `<MultiSelectTable>` générique.** Les colonnes diffèrent légitimement d'une surface à l'autre (Songlist porte instrument/tuning/lastPlayed, le Catalog porte key/mode/timeSignature). On partage la **barre** et les **primitives de case à cocher**, pas le tableau. Ferme le descope de 19.9 par une décision, pas par un oubli.
- **D — L'affichage Songlist est la référence visuelle.** Là où les deux styles divergent, c'est celui de `SongsList` qui gagne ; le changement visuel côté Catalog est **assumé** (même régime que `datalist`→combobox en 19.11).

**Ordre imposé : 22.1 → {22.2, 22.3, 22.4}.** 22.1 d'abord, sinon les trois suivantes redupliquent ce qu'elles sont censées unifier.

### Story 22.1: Barre d'actions groupées + cases à cocher partagées

En tant que **développeur du produit**,
je veux une barre « N selected » et des cases à cocher de ligne partagées entre la Songlist et le Catalog,
afin que les écrans de liste cessent de diverger à chaque nouvelle surface.

**Acceptance Criteria:**

**Given** un composant `<BulkActionBar>` partagé
**When** il reçoit un compte de sélection et des actions en `children`
**Then** il rend la coquille + le libellé « N {noun} selected » + les actions ; il rend **`null`** quand le compte est à 0 (la garde est centralisée, plus dans chaque page) ; le nom d'objet est un prop (`song(s)` côté Songlist, `entry`/`song` côté Catalog)

**Given** les primitives de sélection partagées (case à cocher d'en-tête « tout sélectionner » + case de ligne)
**When** une page les utilise
**Then** l'`aria-label` explicite, la cible ≥44px et le `stopPropagation` (une case cochée ne déclenche jamais la navigation de ligne) sont **portés par la primitive**, plus recopiés par page

**Given** `SongsList.tsx` — la référence visuelle (D)
**When** il bascule sur `<BulkActionBar>`
**Then** le rendu est **iso-visuel et iso-fonctionnel** (playlist picker, Mark as played, Delete selected inchangés) ; les tests Songlist existants passent **sans modification d'assertion**

**Given** `CatalogManage.tsx` (onglet Entries), dont la barre inline diverge (`rounded-lg border bg-gray-50` vs `card-base glass-effect`)
**When** il bascule sur `<BulkActionBar>`
**Then** il **adopte le style Songlist** — changement visuel **assumé** (D) ; le comportement (Delete selected + `ConfirmDialog`) est inchangé

**Given** la décision C
**When** la story se termine
**Then** **aucun** `<MultiSelectTable>` générique n'est créé ; la décision est inscrite en commentaire dans le composant partagé pour que la prochaine surface ne re-tente pas l'abstraction

**And** refacto **iso-fonctionnelle**, zéro nouveau comportement ; tests des composants partagés (`StrictMode`) ; front vert, `tsc -b` + ESLint propres
`[src/components/BulkActionBar.tsx (nouveau), src/components/SelectionCheckbox.tsx (nouveau), src/components/SongsList.tsx, src/pages/CatalogManage.tsx]`

### Story 22.2: Ajouter une sélection d'entrées à une collection (curateur)

En tant que **curateur**,
je veux pousser plusieurs entrées sélectionnées dans une collection en une action,
afin de ne plus avoir à ouvrir la collection et à retrouver chaque entrée une par une au typeahead.

**Acceptance Criteria:**

**Given** des entrées sélectionnées sur `/catalog/manage?tab=entries`
**When** la barre « N selected » s'affiche
**Then** un **2ᵉ bouton « Add to collection »** est présent à côté de *Delete selected*, ouvrant une **liste déroulante des collections existantes** (`catalogService.listCollections`) ; **aucune création de collection à la volée** (hors périmètre)

**Given** une collection choisie et la confirmation
**When** l'ajout se déclenche
**Then** N appels `addSongToCollection` partent en **concurrence bornée** (best-effort, mirror 20.3) ; le bouton est désactivé pendant l'action et une double soumission est impossible

**Given** la fin de l'action
**When** le récap s'affiche
**Then** il est **inline et persistant** (pas un toast fugace, leçon 20.4) avec `role="status"` / `role="alert"`, et **segmenté** : « X added · Y already in · Z failed » — une entrée déjà membre compte comme **already in**, jamais comme une erreur (la jointure est idempotente, composite unique 20.1) ; un résultat entièrement no-op a son **propre message clair**, pas un « Added 0 » dégradé (leçon rétro 20 #5)

**Given** un ajout partiellement en échec
**When** le récap s'affiche
**Then** les entrées **en échec restent sélectionnées** (le lot peut être rejoué) ; les entrées réussies sortent de la sélection

**And** aucun backend, aucune migration ; tests (`StrictMode`) couvrant succès / déjà-membre / échec partiel ; front vert
`[src/pages/CatalogManage.tsx, src/services/catalogService.ts (addSongToCollection existant), src/components/BulkActionBar.tsx]`

### Story 22.3: Fiche collection (admin) en tableau sélectionnable

En tant que **curateur**,
je veux voir les membres d'une collection dans le même tableau que partout ailleurs et en retirer plusieurs d'un coup,
afin que l'écran de composition cesse d'être une liste à part.

**Acceptance Criteria:**

**Given** `/catalog/manage/collections/:uid`, dont les membres sont aujourd'hui une `<ul>/<li>` avec un *Remove* par ligne
**When** la page s'affiche
**Then** les membres sont rendus en **tableau** (Artist · Title · Key · BPM + badge `Draft` conservé) avec une **colonne de cases à cocher** en tête de ligne, via les primitives de 22.1

**Given** des membres sélectionnés
**When** la barre « N selected » s'affiche
**Then** elle propose **« Remove selected »** ; le **Remove par ligne disparaît** (un seul chemin de retrait — décision de cadrage, revisitable au `create-story` si la QA le conteste)

**Given** la confirmation du retrait groupé
**When** l'action se déclenche
**Then** N appels `removeSongFromCollection` en concurrence bornée (best-effort) + `ConfirmDialog` ; récap **segmenté et persistant** comme en 22.2 ; un membre déjà retiré (404) compte comme **retiré**, pas comme une erreur

**Given** le retrait effectué
**When** la liste se rafraîchit
**Then** la sélection est nettoyée des membres réellement retirés (`removeMany`) et la recherche/ajout par typeahead au-dessus reste inchangée

**And** front-only, aucun endpoint nouveau ; tests (`StrictMode`) ; front vert
`[src/pages/CatalogCollectionCompose.tsx, src/components/BulkActionBar.tsx, src/components/SelectionCheckbox.tsx]`

### Story 22.4: Ajouter une sélection à ma songlist (lecteur)

En tant qu'**utilisateur**,
je veux cocher plusieurs chansons dans le Catalog — au browse comme dans une collection — et les ajouter d'un coup à ma songlist,
afin de ne plus les ajouter une par une ni d'avoir à tout prendre ou rien.

**Acceptance Criteria:**

**Given** `/catalog` (browse), dont `CatalogList` est **déjà** un tableau sticky sans case à cocher
**When** la page s'affiche
**Then** une **colonne de cases à cocher** est ajoutée (primitives 22.1) sans casser le clic-ligne-ouvre-la-fiche ni le bouton *Add* par ligne (qui reste) ; la sélection **survit à la pagination** (sémantique `addMany`/`removeMany`, comme `CatalogManage`) et n'est **pas persistée** (pas de `persistKey`)

**Given** `/catalog/collections/:uid` (vue publique), aujourd'hui une `<ul>/<li>` sans autre option que l'import total
**When** la page s'affiche
**Then** les chansons sont en **tableau + cases à cocher** ; le bouton **« Add collection to my songlist »** reste en **raccourci** (import total 20.3, playlist miroir incluse)

**Given** une sélection et le clic sur **« Add selected to my songlist »**
**When** l'action se déclenche
**Then** N appels `addToSonglist` en concurrence bornée (best-effort) après `ConfirmDialog` ; **aucune playlist miroir n'est créée** pour un sous-ensemble (décision B) et le `ConfirmDialog` le dit explicitement, pour que la différence avec le bouton « toute la collection » soit lisible

**Given** une chanson déjà présente dans la songlist de l'utilisateur (409 `duplicate_song`)
**When** le récap s'affiche
**Then** elle compte comme **« already in your songlist »**, pas comme un échec ; récap **segmenté et persistant** (« X added · Y already in · Z failed ») ; le flag doublon existant (`useSonglistMatcher`) reste cohérent avec le résultat après l'action

**And** front-only ; UI en anglais, dark mode, a11y (≥44px) ; tests (`StrictMode`) couvrant browse + collection publique, succès / doublon / échec partiel ; front vert
`[src/components/CatalogList.tsx, src/pages/Catalog.tsx, src/pages/CatalogCollection.tsx, src/services/catalogService.ts (addToSonglist existant), src/components/BulkActionBar.tsx]`

## Epic 23: Amorcer le Catalog depuis les chansons de la prod

Demandé par northwood (relevé `deferred-work` 2026-08-08), cadré 2026-08-10. Les Epics 19 → 22 ont construit tout l'outillage du Catalog — browse, facettes, collections, provenance, sélection groupée — **au-dessus d'un pool quasi vide** (5 entrées constatées en QA). Cette epic remplit le pool en **promouvant les chansons déjà saisies en prod** en entrées Catalog partagées, et en **rattachant les chansons personnelles existantes** à leur entrée, sans qu'aucun beta-testeur ne perde une miette de sa donnée d'entraînement.

**Aucun modèle à inventer.** Le lien Song → Catalog est le couple `Song.sourceCatalogUid` / `Song.sourceCatalogSyncedAt` (Epic 21, `song.js:132,140`), l'UI de provenance est `CatalogSourceBanner` + `POST /api/songs/:uid/refresh-from-catalog`. Il n'y a que de la **donnée à créer et à brancher**.

### État réel du code et de la donnée (mesuré, pas estimé)

- **CSV** `backups/songs_par_user_20260725_004820.csv` : **87 lignes**, colonnes `user,email,artist,title` **uniquement** — donc aucun `key`/`bpm`/`mode`/`timeSignature`/`durationSeconds`. **Zéro doublon** sur la clé foldée `(lower(artist), lower(title))`. ~5 lignes de déchet de test à exclure → **~82 entrées réelles**.
- **⚠️ CORRECTION D'UNE NOTE DU PROJET** : les notes de la story 19.6 décrivent l'index canonique du Catalog comme « PARTIEL (published only, 409 au Publish) ». **C'est faux.** La migration `20260716000100` dit explicitement *« the 19.1 canonical unique index is untouched, so every row (draft or published) is unique »*, et aucune migration ne crée d'index partiel ni ne supprime `catalog_songs_title_artist_ci`. L'unicité est **globale, brouillons compris** — donc **une collision se produit à la CRÉATION, pas à la publication**. Vérifié : « Numb » est déjà au Catalog et figure dans le CSV. Le seed **doit** sauter ce qui existe déjà.
- **Le CSV contient des emails d'utilisateurs.** Toute entrée du script versionnée dans le dépôt doit être réduite à `artist,title` — ni `user`, ni `email`.

### Décisions verrouillées (northwood, 2026-08-10)

- **A — Seed en BROUILLON** (`publishedAt = NULL`). Une fiche seedée n'a que titre + artiste : publiée, un « Refresh » écraserait la tonalité et le tempo du user avec du vide (`refreshSongFromCatalog` écrit `catalog[f] ?? null`). En brouillon, le lien est posé mais dormant — `getSong` n'émet pas `sourceCatalog`, la bannière ne s'affiche pas, le refresh 409. **Le lien s'allume tout seul quand le curateur publie**, une fois la fiche enrichie. La sémantique du Refresh livrée en Epic 21 n'est **pas** touchée.
- **B — `sourceCatalogSyncedAt` backfillé à `catalog.updatedAt`**, corollaire de A : à `NULL`, toutes les chansons rattachées afficheraient « mise à jour disponible » dès la publication, pour proposer un refresh appauvrissant.
- **C — Script one-off manuel**, idempotent et ré-exécutable, avec `--dry-run`. **Pas une migration** : un seed de contenu n'a rien à faire dans le pipeline de schéma, et northwood veut choisir le moment. Séquence imposée : `make db-backup-prod` → `make db-restore` en local → dry-run → exécution locale → **vérification navigateur** → seulement ensuite la prod.
- **D — Epic minimale** : seed + rattachement. Les liens streaming éditables et l'instrument à l'import restent des candidates séparées, malgré leur affinité.
- **F — Table d'alias + correction orthographique chez l'utilisateur** (northwood, 2026-08-10, après mesure). Corriger une typo dans le Catalog **casse le rapprochement exact-fold de la chanson d'origine** : mesuré, **9 entrées sur 82**, dont 7 chez le même beta-testeur. northwood : *« je ne veux pas que les utilisateurs payent »*. Donc (1) le CSV d'origine devient une **table d'alias** `fold(saisie) → entrée canonique`, utilisée **en plus** du fold exact au rattachement ; (2) pour ces lignes, la Song de l'utilisateur est **renommée** vers l'orthographe canonique. Le Catalog est propre **et** personne ne perd de lien.
- **E — Nettoyage du CSV à la main avant seed** : ~82 lignes, une passe. Déchet de test exclu, typos corrigées (`Jamiroquoi`, `AC DC`…). Ne pas attendre le folding d'article / les alias : **une typo seedée se fige dans un pool partagé**, ce qui est bien pire qu'un lien manquant.

### Invariants non négociables

1. **Jamais recréer une Song de user.** Toute la donnée d'entraînement (`SongPlays`, `SessionItems` + leur snapshot FR4, `playlist_songs`, `lastPlayed`, instrument et tuning perso) pend au `Song.uid` existant. Le rattachement est un `UPDATE` sur la ligne en place — **jamais** de delete/recreate.
   **⚠️ AMENDÉ par la décision F** : cet invariant interdisait aussi toute réécriture de `title`/`artist`. Il est **levé pour le seul cas listé dans la table d'alias** (9 lignes nommément identifiées), et uniquement pour aligner l'orthographe sur la fiche canonique. Il reste entier partout ailleurs — et la sémantique de `refreshSongFromCatalog`, qui ne touche jamais `title`/`artist`, n'est **pas** modifiée.
   **Conséquences vérifiées de cette levée** : (a) `songs_user_uid_title_artist_ci` rend l'unicité par utilisateur — une renommée **peut** collisionner avec une autre chanson du même user, donc garde obligatoire et rapport ; (b) `SessionItems.label` est un **snapshot FR4** (« an entry keeps its display name even after the song is deleted ») — l'historique des sessions **garde l'ancienne orthographe**, c'est le contrat, pas une régression. À dire à northwood plutôt qu'à découvrir.
2. **Ne jamais toucher une Song déjà rattachée** (`sourceCatalogUid IS NOT NULL`) — elle vient d'un vrai « Add from Catalog ».
3. **Le fold doit être celui de l'app** : `lower` + `f_unaccent` en SQL (`catalogcontroller.foldedLike`), pas un `toLowerCase()` JS — l'écart entre les deux est une dette déjà relevée en 17.1.
4. **Rattachement par requête sur la base, pas ligne à ligne depuis le CSV** : le CSV est un instantané du 2026-07-25, la prod a bougé depuis. Le CSV ne sert qu'à **créer les entrées**. Corollaire : le script rattache aussi les chansons arrivées depuis, et reste ré-exécutable.

**Ordre imposé : 23.1 → 23.2 → 23.3 → 23.4.**

### Story 23.1: Script de seed — créer les entrées Catalog en brouillon

En tant que **curateur**,
je veux créer d'un coup les entrées Catalog correspondant aux chansons déjà saisies en prod,
afin que le Catalog cesse d'être vide et devienne curable.

**Acceptance Criteria:**

**Given** un fichier d'entrée réduit à `artist,title` (ni `user`, ni `email`) et nettoyé à la main
**When** le script est lancé avec `--dry-run`
**Then** il **n'écrit rien** et rapporte : nombre de lignes lues, nombre d'entrées à créer, nombre sautées **avec leur raison** (déjà au Catalog / ligne vide / doublon interne)

**Given** une entrée dont le fold `(lower(title), COALESCE(lower(artist),''))` existe **déjà** dans `CatalogSongs`
**When** le script s'exécute
**Then** elle est **sautée**, pas créée — l'index canonique est global et couvre les brouillons, une insertion lèverait 23505 (cas réel : « Numb »)

**Given** une exécution réelle
**When** les entrées sont créées
**Then** elles le sont avec `publishedAt = NULL` (décision A), `title` et `artist` seuls renseignés, et **aucun** autre champ inventé

**Given** un script relancé une seconde fois
**When** il s'exécute
**Then** il ne crée **rien** de nouveau et le rapporte — l'idempotence est vérifiée, pas supposée

**And** aucune migration, aucun changement de modèle, aucun endpoint ; le script vit dans `scripts/` et n'est **pas** branché au déploiement
`[scripts/seed-catalog.js (nouveau), backend/models/catalogsong.js (lecture seule)]`

### Story 23.2: Script de rattachement — brancher les Songs existantes sur leur entrée

En tant qu'**utilisateur beta**,
je veux que les chansons que j'ai déjà saisies soient reconnues comme venant du Catalog,
afin de bénéficier des enrichissements du curateur sans rien perdre de ma donnée.

**Acceptance Criteria:**

**Given** les Songs de **toute la base** (pas les lignes du CSV — invariant 4)
**When** le script rapproche par le fold SQL de l'app (`lower` + `f_unaccent`, invariant 3)
**Then** chaque Song dont le fold correspond exactement à une entrée Catalog reçoit `source_catalog_uid` **et** `source_catalog_synced_at = catalog.updatedAt` (décision B)

**Given** une Song qui a **déjà** un `sourceCatalogUid`
**When** le script s'exécute
**Then** elle n'est **pas** touchée (invariant 2)

**Given** l'exécution complète
**When** on compare la base avant et après
**Then** `COUNT(*) FROM "Songs"` est **inchangé**, et les compteurs de `SongPlays`, `SessionItems` et `playlist_songs` sont **inchangés** — aucune Song n'a été recréée, aucun `title`/`artist` réécrit (invariant 1)

**Given** `--dry-run`
**When** le script est lancé
**Then** il rapporte le nombre de Songs qui seraient rattachées, **par user**, sans rien écrire

**And** cette phase est **exact-fold uniquement** ; les 9 saisies que le nettoyage a fait diverger sont traitées en 23.3 par la table d'alias, et les rapprochements réellement approximatifs (`Beatles` ≠ `The Beatles` chez un futur user) restent hors périmètre — ils relèvent des candidates « identité artiste »
`[backend/scripts/seed-catalog.js, backend/models/song.js (lecture seule)]`

### Story 23.3: Alias — rattacher les saisies divergentes et corriger l'orthographe

En tant qu'**utilisateur beta dont la saisie contenait une faute**,
je veux que ma chanson soit quand même reliée au Catalog, et son orthographe corrigée,
afin de ne pas être pénalisé parce que j'avais tapé « AC DC ».

**Acceptance Criteria:**

**Given** `backend/scripts/seed/catalog-seed-aliases.csv` (colonnes `aliasArtist,aliasTitle,artist,title`, **9 lignes**, générées depuis l'export d'origine)
**When** la phase alias s'exécute après le rattachement exact-fold
**Then** toute Song dont le fold correspond à un **alias** est rattachée à l'entrée canonique correspondante, avec le même `source_catalog_synced_at` que la phase exacte

**Given** une Song rattachée par alias
**When** la correction orthographique s'applique
**Then** son `title` et son `artist` sont réécrits vers la forme canonique — **et rien d'autre** : ni `instrument`, ni `notes`, ni `lastPlayed`, ni aucun champ intrinsèque

**Given** une renommée qui entrerait en collision avec une autre chanson **du même utilisateur** (`songs_user_uid_title_artist_ci`)
**When** le script la rencontre
**Then** il **ne renomme pas**, rattache quand même, et le **signale nommément** dans le rapport — une collision se règle à la main, jamais en écrasant

**Given** `--dry-run`
**When** la phase alias est simulée
**Then** elle liste, par utilisateur, les rattachements et les renommées prévues, **avant/après**, sans rien écrire

**And** l'historique des sessions n'est **pas** réécrit : `SessionItems.label` est un snapshot FR4 volontaire, les anciennes entrées gardent l'orthographe d'alors — comportement attendu, à mentionner dans le rapport pour qu'il ne soit pas pris pour un bug
`[backend/scripts/seed-catalog.js, backend/scripts/seed/catalog-seed-aliases.csv]`

### Story 23.4: Répétition sur dump prod, garde-fous chiffrés, puis exécution

En tant que **northwood**,
je veux répéter l'opération sur une copie de la prod et vérifier des compteurs avant de toucher aux vraies données,
afin que le seed ne soit jamais un pari.

**Acceptance Criteria:**

**Given** la séquence imposée (décision C)
**When** l'opération est préparée
**Then** elle est jouée dans l'ordre : `make db-backup-prod` → `make db-restore` en local → `--dry-run` → exécution locale → **vérification navigateur** sur une fiche rattachée (bannière absente tant que la fiche est brouillon) → exécution prod

**Given** l'exécution locale sur le dump prod
**When** le rapport de vérification est produit
**Then** il compare **avant/après** : `COUNT(*)` de `Songs`, `SongPlays`, `SessionItems`, `playlist_songs` (tous **inchangés**), N entrées Catalog créées = N attendu, M Songs rattachées = M attendu

**Given** un écart entre attendu et constaté
**When** la vérification échoue
**Then** l'exécution en prod **ne se fait pas** — le dump est le filet, pas la consolation

**And** le rapport est archivé dans `_bmad-output/implementation-artifacts/` ; ⚠️ `make db-restore` exige un client **pg17** (cf. `deferred-work`, section db-restore)
`[Makefile (existant), _bmad-output/implementation-artifacts/epic-23-seed-report-*.md]`
