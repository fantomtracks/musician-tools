---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-07-15'
inputDocuments:
  - '_bmad-output/planning-artifacts/prds/prd-musician-tools-2026-07-12/prd.md'
  - '_bmad-output/planning-artifacts/prds/prd-musician-tools-2026-07-12/addendum.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-musician-tools-2026-07-12/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-musician-tools-2026-07-12/EXPERIENCE.md'
  - '_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-12.md'
  - '_bmad-output/project-context.md'
workflowType: 'architecture'
project_name: 'musician-tools'
user_name: 'northwood'
date: '2026-07-12'
scope: 'Catalog — pool partagé de chansons (Browse/Add snapshot+provenance, Collections, curation isCurator)'
---

# Architecture Decision Document — Catalog

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

**Scope :** Le **Catalog** — pool **partagé** de fiches chansons canoniques (première donnée non-scopée `userUid` de l'app). Browse/search/filter, **Add to my songlist** (copie snapshot + provenance), **Catalog Collections** (import en lot + Playlist perso miroir), et **curation** via rôle `isCurator`. Source : PRD + addendum du 2026-07-12, UX (DESIGN + EXPERIENCE) du 2026-07-12, sur socle existant (React 19 / Express / Sequelize / PostgreSQL).

## Project Context Analysis

### 1. Requirements Overview

**Functional Requirements (13 FR, PRD Catalog 2026-07-12) :**
- **Browse/search/filter (FR-1→3)** : surface connectée, liste paginée/virtualisée, filtres **intrinsèques** `key · mode · timeSignature · genre` + recherche texte (titre/artiste, insensible casse/accents).
- **Add snapshot+provenance (FR-4→7)** : copie deep-clone éditable et **indépendante**, garde de doublon per-user (réutilise l'unicité Epic 17 → 409), garde-fou **unidirectionnel** (aucun write-back).
- **Collections (FR-8→9)** : import lot **best-effort** + **Playlist perso miroir** (réutilise Epic 10).
- **Curation (FR-10→13)** : rôle `isCurator`, admin role-gated, unicité canonique **GLOBALE** (409).
- **Features futures modèle-aware (§4.5/4.6/4.7)** : re-sync, contribution, popularité — **non construites v1**, mais provenance posée pour ne pas fermer la porte.

**Non-Functional Requirements (drivers architecturaux) :**
- **NFR-1** — Première donnée **PARTAGÉE non-scopée `userUid`** : rupture du pattern app-wide. Lecture ouverte aux connectés, écriture Curator.
- **NFR-2** — Scalabilité : pagination/virtualisation, index sur clé canonique + axes de filtre, pas de chargement intégral client.
- **NFR-3** — Autorisation `isCurator` : écriture Catalog → **403 franc** (exception nommée au 404 anti-oracle 7.5).
- **NFR-4** — Découplage snapshot : `Song.sourceCatalogUid` en **référence souple** (pas de FK vive).
- **NFR-5** — Cohérence UI : réutilise le design system (aucune primitive de style neuve).
- **NFR-6** — Contenu i18n : strings UI en anglais.

**Scale & Complexity :**
- Primary domain : full-stack web (React 19 SPA + Express/Sequelize/PostgreSQL).
- Complexity level : **moyenne-haute** — le risque n'est pas le volume de code mais les **3 ruptures structurelles** qui touchent les invariants sécurité de l'app.
- Composants architecturaux estimés : ~5 (modèle de données, autorisation curateur, mécanique Add/Import, surface API Catalog, routing + surfaces front).
- **Pas d'epics/stories Catalog encore** : cette architecture les précède.

### 2. Technical Constraints & Dependencies

**Socle imposé :** Sequelize 6 (`field: 'snake_case'`, pattern `Songs`), Express 4, PostgreSQL, sessions cookie, data-router Epic 18 (`createBrowserRouter`). Migrations **idempotentes** obligatoires (toute migration part en prod au merge).

**Réutilisations imposées — étendre par APPEL, jamais modifier le comportement existant (additif strict) :**
- Garde d'unicité `findDuplicateSong` + index fonctionnel (Epic 17, 23505 → 409 typé).
- Playlists `lower(name)` unique + `createPlaylist` / `PlaylistConflictError` (Epic 10).
- Auto-fill SongBPM (`fetchFromSongBpm` / `songService.lookupMetadata`, story 8.1) — **comportement exact** « ne pas écraser une saisie » (FR-11).
- `ConfirmDialog.tsx` + pattern `setToastMessage` / `setTimeout(2500)` ; `comboboxKeyboard.ts`.

**Ancrages hérités à copier tels quels (ne pas réinventer) :**
- **Epic 17** — l'index canonique Catalog suit la MÊME discipline : index fonctionnel créé par **migration**, volontairement **ABSENT du modèle** Sequelize (`sync()` ne le crée ni le droppe), mapping `23505 → 409` côté contrôleur. Seule différence : **PAS de `user_uid`** (clé globale) — faux-ami à surface de collision radicalement différente.
- **Epic 18** — réutiliser `RequireAuth` + 404 scopé du data-router ; ajouter un **`requireCurator` séparé** pour `/catalog/admin` ; **pas de guard maison** (le 17.2 a été supprimé exprès).
- **Epic 7** — NE PAS ajouter une simple exception à `project-context.md` : **reformuler la règle avec le principe** (cf. §3) sinon chaque `bmad-code-review` re-flagge le Catalog en régression 7.5.

**Exigences de lisibilité de l'intention (issu du steelmanning) :**
- L'absence de scoping `userUid` en lecture Catalog DOIT être rendue **visuellement intentionnelle** (contrôleur/helper nommé `catalog*`, commentaire d'ancrage au principe) — pour qu'un reviewer ne la confonde jamais avec une régression IDOR copiable ailleurs.
- Le « pas de FK vive » est justifié **positivement** (cf. §4), pas subi — pour qu'un futur dev ne « corrige » pas en ajoutant une contrainte.

### 3. Authorization Model — principe unificateur & cohérence

**LE principe (reformulation first-principles) :** la règle app-wide n'est PAS « tout scopé `userUid` → 404 » mais **« une réponse ne doit jamais révéler l'existence d'une ressource dont l'existence est confidentielle »**.
- **Données perso** (existence secrète) → le principe **impose** scoping `userUid` + 404 anti-oracle.
- **Catalog** (existence publique-aux-connectés) → le même principe **autorise** la lecture non-scopée et **impose** le **403** en écriture (le seul secret restant = le privilège `isCurator`, qui n'est pas une ressource). Les « exceptions » sont l'application **correcte** du principe à un modèle différent, pas des dérogations.

**Système cohérent (analyse morphologique) :** les décisions P1 (lecture non-scopée, auth requise), P2 (écriture → 403 `isCurator`), P4 (unicité canonique globale) ne sont **pas indépendantes** — elles forment un système cohérent sous **UNE condition invariante** : « la fiche est lisible par tout connecté ET l'écriture est fermée aux non-curateurs ». Casser l'une invalide les autres :
- P2=403 n'est correct QUE parce que P1 garantit la lisibilité (le 403 ne divulgue rien de secret). → P2 = **fonction** de P1.
- **Bonus sécu** : le 409 d'unicité globale n'est reçu QUE par le curateur (écriture fermée) → **aucun user standard ne peut sonder l'existence d'une fiche via un conflit d'écriture** (canal d'énumération fermé).

**Deux gardes primitifs invariants :** (1) lecture Catalog **toujours derrière l'auth** (jamais anonyme en v1) ; (2) le 403 n'est correct QUE parce que la ressource visée est déjà lisible.

### 4. Integrity & Provenance

- **Référence souple `Song.sourceCatalogUid` = dangling DÉLIBÉRÉ**, pas simple découplage : le crochet popularité (§4.7) compte les adds via une provenance qui doit **survivre** à la suppression de la fiche. Aucune sémantique de FK vive ne satisfait à la fois NFR-4 et ce crochet (`SET NULL` efface le lien ; `CASCADE` viole NFR-4 ; `RESTRICT` bloque la suppression curateur).
- **Deux régimes de référence OPPOSÉS à ne pas confondre** : jointure `CatalogCollectionSongs` = nettoyage **DUR** (pas de référence morte, FR-12) ; `Song.sourceCatalogUid` = référence **SOUPLE** (dangling voulu). Choisir la référence souple engage à **gérer le dangling en lecture** des deux côtés : deep-link `/catalog/:uid` périmé = **404 calme** (jamais crash), et futur agrégat popularité tolère une cible absente.
- **Dérive du snapshot = conséquence INÉVITABLE** (pas un risque à mitiger) du couple {édition curateur} × {copie indépendante} : les copies antérieures à une correction divergent sans signal (provenance invisible v1). Justifie structurellement de **persister `sourceCatalogUid` dès v1** (crochet re-sync §4.5) même sans UX — donc **non optionnel**.

### 5. Risks & Systemic Invariants (impact prod)

Classés par probabilité × impact (toute migration part en prod) :
- **[ÉLEVÉ] Idempotence de l'import Collection = invariant MULTI-NIVEAUX (FR-9)** : playlist réutilisée (`lower(name)`, Epic 10) ET entrées `playlist_songs` dédupliquées sur `(playlist_uid, song_uid)`. Un réimport ne duplique NI chanson NI lien de playlist.
- **[ÉLEVÉ] Idempotence DDL par objet** : `CatalogSong`, `CatalogCollection`, jointure, colonne `sourceCatalogUid`, index unique fonctionnel global — chacun gardé (`showAllTables`/`describeTable` ; `CREATE INDEX IF NOT EXISTS`). **Ordre inter-migrations explicite** (table → index, table → jointure). L'index fonctionnel n'est pas ré-entrant par défaut.
- **[ÉLEVÉ produit] SEED = PORTE DE LANCEMENT**, pas une feature parallèle : le code Catalog ne délivre aucune valeur sans contenu ; livré vide, il DÉGRADE SM-2 (détour vers un mur). Séquencement de mise en prod : **curation opérationnelle → seed (~50-100 fiches, 3-5 Collections) → exposition** aux users.
- **[ÉLEVÉ produit] CURATION = versant offre LOAD-BEARING sur UN seul humain (v1)** : la friction de curation asphyxie l'offre → l'auto-fill exact, la structure SongForm, l'absence de drag et l'outillage CSV optionnel sont des réducteurs de friction **critiques** (pas « admin utilitaire secondaire »).
- **[MOYEN] NFR-2 (pagination/virtualisation + index de filtre `key/mode/genre/timeSignature`)** = exigence **v1 jour-1**, pas une optimisation différée.
- **[MOYEN] Deux régimes de référence** (cf. §4) à ne pas confondre.
- **[Transverse] ADDITIF STRICT / zéro régression** sur l'existant (Songs/Songlist/Playlists) : seule surface existante modifiée = crochet Songlist-vide (DL-13), qui doit **dégrader proprement** (fetch KO → CTA seul). L'inline Add optimiste (UJ-1) est un invariant produit à ne pas régresser.
- **[FAIBLE] Auto-fill curateur** : réutiliser le **comportement** exact « ne pas écraser une saisie » (FR-11), pas seulement l'appel réseau.

### 6. Future Frontiers — dette de conception datée (2026-07-12)

Non construites v1, mais à écrire comme frontières pour ne pas les découvrir en prod :
- **État de publication (draft) [contribution v2]** : rerend l'existence secrète → **réactive le 404 anti-oracle** sur la sous-ressource ; **rouvre le canal 409** (un contributeur apprend qu'une fiche/draft existe) ; entre en **tension avec l'unicité globale** (deux drafts de même titre). À re-décider le jour venu.
- **Popularité [§4.7 v2]** : agrégation par fiche via jointure `SongPlay → Song → sourceCatalogUid` (`SongPlay` **n'a pas de `userUid`**). Le refus de FK `ON DELETE SET NULL` préserve les compteurs d'adds sur fiches supprimées — chemin à ne pas casser.
- **Variantes (studio/live/drop-D) [v2]** : l'unicité **globale** `(title, artist)` les verrouille pour tous dès la 1ʳᵉ fiche ; y passer = **changer la clé unique** sur table partagée en prod avec provenances distribuées → **dette de conception datée**, choix v1 assumé.

### Zones de décision ouvertes → step-04

- **Playlist miroir × playlist perso homonyme** : la réutilisation `lower(name)` (Epic 10) fusionne SILENCIEUSEMENT le lot importé dans une playlist perso préexistante de même nom (sans lien avec la Collection) ; le ConfirmDialog « will be created » devient faux. → microcopie honnête (« created or reused »), suffixe, ou fusion assumée.
- **Unicité canonique = garde de TOUTE écriture**, pas seulement de la création : l'édition in-place curateur (rename) peut heurter l'index global **sur UPDATE** → le mapping `23505 → 409` doit couvrir create ET rename, avec microcopie « another entry already uses this title/artist » (FR-11 × FR-13).

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web — **brownfield**. Le Catalog est une extension d'une application existante et mature ; il n'y a AUCUN starter template à évaluer ni initialisation de projet à faire. La fondation technique est déjà en place et fait autorité (cf. `project-context.md`).

### Decision: No starter — extend the established stack

**Stack imposée (non négociable, héritée) :**
- **Frontend** : React 19.1 + react-router-dom 6.28 (data-router, Epic 18), TypeScript ~5.8 strict + `verbatimModuleSyntax`, Vite 7, Tailwind 3.4 (`darkMode:'class'`), Jest 29 + Testing Library.
- **Backend** : Node 22, Express ~4.16, Sequelize 6 + sequelize-cli, PostgreSQL (pg), express-session + connect-pg-simple, winston. CommonJS (pas de TypeScript backend).
- **Déploiement** : push `main` → GitHub Action → `flyctl deploy` ; migrations via `release_command` puis `sync({alter:false})` ; both.Dockerfile (Express sert le SPA).

**Conséquence pour le Catalog :** aucune brique de fondation nouvelle *au sens socle*. Le travail est additif sur les patterns existants (contrôleurs/routes/modèles Sequelize, services frontend `fetch`, composants React + Tailwind). Les décisions d'architecture (step-04) portent sur le MODÈLE et les MÉCANIQUES, pas sur le choix d'un socle.

### Foundation decisions NOT settled by "reuse the stack" (à trancher au step-04)

« Extension additive » vaut pour l'UI et les briques métier (unicité, playlists, auto-fill), MAIS la **couche données de la liste Catalog diverge frontalement de la Songlist** — à acter explicitement :

- **Songlist = load-all + filtre client + localStorage** : `getAllSongs()` charge TOUT (`GET /api/songs` sans pagination), filtre/tri en `useMemo`, ~30 clés localStorage `songs*`. Viable car collection perso PETITE.
- **Catalog = conçu pour GROSSIR (NFR-1/2)** → ce pattern ne se réutilise PAS. Deux fondations neuves, absentes de l'app aujourd'hui :
  1. **Recherche/filtre/PAGINATION côté SERVEUR** (SQL indexé sur `key/mode/genre/timeSignature` + clé canonique) — PREMIER endpoint paginé de l'app. La table VISUELLE (composant Tailwind) se réutilise ; la mécanique de données est nouvelle. → élimine le besoin de virtualisation (on ne rend jamais la liste entière).
  2. **État de liste dans l'URL** (`useSearchParams` / query params, DL-10) — PREMIER écran « URL-as-state » (back/deep-link/partage, cohérent data-router Epic 18), là où la Songlist utilise localStorage. Ne pas copier le pattern localStorage de la Songlist ici.

### Occam — forme minimale suffisante (zéro dépendance nouvelle)

- **AUCUNE lib tierce** : `catalogService` en `fetch` brut (comme `songService`) + `useEffect` re-clé sur `searchParams` ; `useSearchParams` (react-router, déjà là) pour l'URL-state ; `<table>` Tailwind + boutons page / « Load more » (ou `IntersectionObserver` natif). Pas de TanStack Query/Table, pas de lib de virtualisation, pas de lib d'URL-state. « Extension additive » confirmée AU NIVEAU DÉPENDANCES même si la couche données est neuve.
- **Pagination = `LIMIT/OFFSET` + total count, PAS cursor/keyset** : à l'échelle v1 (mono-curateur = quasi zéro écriture concurrente, volume centaines→milliers) le drift d'offset est négligeable ; le cursor est une optim prématurée qui complique le tri artiste→titre + filtres. Passage au keyset = frontière future si volume ET concurrence d'écriture le justifient.

### Second-order du choix pagination-serveur (décisions pour step-04)

- **État « Already in your songlist » à l'affichage (DL-11/FR-6) calculé CÔTÉ CLIENT** contre les clés canoniques de la Songlist perso (petite, load-all — SEUL endroit où le pattern Songlist se réutilise), PAS par annotation serveur. Conséquence : la requête Catalog reste PUREMENT partagée (aucun `userUid`) — le principe §3 tient GRÂCE à ce choix. Serveur = vérité (409 à l'Add) ; client = affichage optimiste. (Rejeté : `LEFT JOIN` d'annotation serveur — recouple la lecture au `userUid` et grossit avec le Catalog.)
- **Import Collection = NON-ATOMIQUE par contrat** (best-effort FR-9) : PAS de transaction englobante (elle annulerait tout au 1er échec). Structure imposée : playlist miroir créée/réutilisée d'abord (idempotent), puis chaque fiche = unité autonome (skip/échec isolé), puis agrégat `{added, skipped, failed}`. À poser explicitement pour ne pas « corriger » en atomique.
- (Validés) Add unitaire = lecture PK + insert, coût constant indépendant de la taille Catalog ; garde de doublon = index per-user Epic 17, non affecté par l'échelle Catalog.

### Inversion — pièges de fondation invisibles (à éviter dès le step-04)

- **Liste paginée = PREMIER endpoint À ENVELOPPE de l'app** : `{ items, total, page/limit }`. Elle ROMPT délibérément la convention « entité brute, pas d'enveloppe » (sinon pas de `total` → pas de « Results (n) »/pagination). Exception NOMMÉE à documenter ; les endpoints unitaires (fiche, Add) gardent l'entité brute.
- **Type `CatalogSong` DISTINCT côté front** (sous-ensemble intrinsèque), JAMAIS un alias de `Song` ; `catalogService` séparé de `songService`. Le calque de COLONNES DB ne devient pas un couplage de TYPES (sinon accès à des champs perso inexistants + fuite des évolutions de `Song`).
- **Recherche serveur : debounce (~250-300ms) + annulation des requêtes périmées (`AbortController`)** posés explicitement (`fetch` brut ne les fournit pas). Sans ça : réponses hors-ordre = résultats fantômes en prod.
- **Pagination offset : `ORDER BY` se termine TOUJOURS par un tiebreaker unique (`uid`)** — `ORDER BY artist, title, uid` — sinon lignes dupliquées/sautées entre pages (invisible à petit volume).
- **URL = SOURCE UNIQUE de l'état liste** : le fetch se cale sur `searchParams`, pas de `useState` miroir.

**Note :** pas de story d'initialisation de projet — la première story Catalog sera directement la **migration du modèle de données**.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical (bloquent l'implémentation) :** modèle `CatalogSong` + index canonique global, référence souple `sourceCatalogUid`, autorisation `isCurator`/403, endpoint liste paginé à enveloppe, mécanique Add (endpoint dédié), mécanique Import (non-atomique + playlist miroir).
**Important (façonnent l'archi) :** tables Collections + jointure, flag doublon client-side, URL-as-state, mapping d'erreurs, ordre de migration.
**Différées (post-MVP / v2) :** rate-limiting écritures curateur, re-sync provenance (§4.5), popularité (§4.7), variantes, browse public — cf. Future Frontiers.

### Data Architecture

**Table `CatalogSong` (partagée, sans `userUid`)** — sous-ensemble INTRINSÈQUE des colonnes de `Song` (parité de noms/formes pour une copie 1:1) : `title` (NOT NULL), `artist`, `album`, `key`, `bpm`, `mode`, `timeSignature`, `durationSeconds`, `language` (JSONB), `genre` (JSONB), `streamingLinks` (JSONB, même forme que `Song.streamingLinks`), `pitchStandard`. PK `uid` UUID v4, `timestamps` (le `updatedAt` tient lieu de « version » de provenance). Convention `field: 'snake_case'` (pattern `Songs`).
**Exclus (perso/instrument, jamais au Catalog) :** `userUid`, `capo`, `notes`, `instrument`, `instrumentLinks`, `instrumentDifficulty`, `instrumentTuning`, `technique`, `myInstrumentUid`, `lastPlayed`.

**Index unique canonique GLOBAL** `(lower(title), COALESCE(lower(artist), ''))` :
- Créé par MIGRATION (fonctionnel, non exprimable en DSL Sequelize), VOLONTAIREMENT ABSENT du modèle — `sync()` ne le crée ni ne le droppe (discipline exacte Epic 17, mais SANS `user_uid`).
- Violation `23505` → 409 typé (create ET rename curateur, cf. Second-order).

**Extension `Songs`** : ajout `sourceCatalogUid` (nullable UUID, `field: 'source_catalog_uid'`). RÉFÉRENCE SOUPLE — AUCUNE FK vive (ni CASCADE/SET NULL/RESTRICT). Dangling délibéré (crochet popularité). Une seule colonne ajoutée → migration minimale. Pas de `sourceCatalogVersion` (v1).

**Tables Collections :**
- `CatalogCollection` : `uid`, `name`, `description` (nullable), `timestamps`.
- Jointure `CatalogCollectionSongs` `(collection_uid, catalog_song_uid)` — composite UNIQUE. Suppression d'une `CatalogSong` → NETTOYAGE DUR des lignes de jointure (FR-12, pas de référence morte) — régime OPPOSÉ à `Song.sourceCatalogUid` (souple).

**Migrations (idempotentes, ordre explicite) :** (1) `CatalogSong` + son index canonique, (2) `CatalogCollection`, (3) `CatalogCollectionSongs`, (4) colonne `Songs.sourceCatalogUid`, (5) colonne `Users.isCurator`. Chaque objet gardé (`showAllTables`/`describeTable`, index ré-entrant). Toute migration part en prod → testée en local (`make migrate`).

### Authentication & Security

- **`isCurator`** booléen sur `User` (défaut `false`, migration idempotente). Posé à la main en base pour northwood en v1 (pas d'UI de gestion des rôles).
- **Middleware `requireCurator`** sur TOUTES les écritures Catalog (fiches + Collections) → **403 franc** si absent (`You don't have curator access.`). PAS de 404 anti-oracle : la ressource est lisible par tout connecté, aucun secret d'énumération (exception NOMMÉE, §3).
- **Lecture** : `authsess` seul, requête NON-SCOPÉE `userUid`. Contrôleur `catalogcontroller.js` nommé + commentaire d'ancrage au principe §3 (intention lisible, anti-régression IDOR).
- **À inscrire dans `project-context.md`** : le PRINCIPE (confidentialité d'existence) + les deux exceptions, pour ne pas faire re-flagger le Catalog en régression 7.5.

### API & Communication Patterns

**Liste (premier endpoint À ENVELOPPE de l'app) :** `GET /api/catalog?search=&key=&mode=&timeSignature=&genre=&sort=&page=&limit=` → `{ items: CatalogSong[], total, page, limit }` (rompt délibérément la convention « entité brute » — exception NOMMÉE, sinon pas de `total`). Filtrage/tri/pagination SQL (indexé). `ORDER BY artist, title, uid` (tiebreaker unique obligatoire). Tri défaut artiste→titre (DL-15).

**Détail :** `GET /api/catalog/:uid` → entité brute (convention normale). `uid` inconnu/invalide → 404 CALME (deep-link périmé, provenance dangling tolérée).

**Add to my songlist (Fork 1 — endpoint dédié) :** `POST /api/catalog/:uid/add-to-songlist` dans `catalogcontroller` :
1. Lire la `CatalogSong` par `uid` (404 calme si absente).
2. Composer le payload Song : champs intrinsèques copiés + **DEEP-CLONE** des JSON (`language`, `genre`, `streamingLinks` — aucun partage de référence) + `userUid` courant + `sourceCatalogUid = catalog.uid`. Champs perso vierges (`lastPlayed = null`, etc.).
3. `Song.create(...)` — le doublon per-user est enforce par l'index Epic 17 : `23505` → RÉUTILISER `respondDuplicateSong` → **409** typé (`{error:'duplicate_song', song: existing}`), l'UI affiche « Already in your songlist » + pointe l'existante (FR-6). Aucune insertion.
4. Succès → 201, entité Song brute (convention). Routes `/api/songs` INCHANGÉES (additif strict).

**Collections :** `GET /api/catalog/collections` (liste), `GET /api/catalog/collections/:uid` (détail + fiches, 404 calme), `POST /api/catalog/collections/:uid/add-to-songlist` (import).

**Import (Fork 2 + non-atomique) :** `POST .../add-to-songlist` :
1. Créer OU RÉUTILISER une Playlist perso du nom de la Collection (`lower(name)`, brique Epic 10, `PlaylistConflictError` → réutilise si existe). Microcopie honnête « created or reused ».
2. PAS de transaction englobante (best-effort FR-9) : itérer les fiches, chaque add = unité autonome (mécanique Add ci-dessus) ; un skip (doublon 409) / échec n'annule pas le lot.
3. Rattacher TOUTES les chansons du lot (y compris déjà présentes, skippées à l'insert) à la Playlist miroir — attache idempotente sur `(playlist_uid, song_uid)` (pas de lien dupliqué).
4. Agréger `{ added, skipped, failed }` → toast récap. Idempotent (ré-import ne duplique rien).

**Écritures curateur :** `POST /api/catalog` (create fiche, 400 si titre absent, 409 si clé canonique existe), `PUT /api/catalog/:uid` (édition IN-PLACE, uid préservé ; 409 si rename heurte l'index global), `DELETE /api/catalog/:uid` (nettoie les jointures, laisse les `sourceCatalogUid` pendre). Mêmes routes pour Collections (`POST/PUT/DELETE`). Auto-fill curateur = réutiliser `songService.lookupMetadata` / `/api/songs/lookup` SANS écraser une saisie.

**Mapping erreurs :** 409 (doublon Add + unicité canonique create/rename), 403 (non-curateur), 404 calme (fiche/collection inconnue), 400 (titre requis), 401 (non connecté).

### Frontend Architecture

- **`catalogService`** séparé de `songService` (`fetch` brut, `API_BASE='/api'`, `credentials:'include'`). Type **`CatalogSong` DISTINCT** (sous-ensemble intrinsèque), JAMAIS alias de `Song`.
- **Liste** : `useSearchParams` = SOURCE UNIQUE de l'état (search + filtres), fetch calé dessus, debounce ~250-300ms + `AbortController` (annulation des requêtes périmées). Pas de `useState` miroir. Pagination LIMIT/OFFSET + total (« Load more » ou pages, natif).
- **Flag « Already in your songlist » CLIENT-SIDE** : le client charge une fois les clés canoniques de SA Songlist et calcule le badge par ligne visible (la requête Catalog reste purement partagée). Serveur = vérité (409 à l'Add), client = affichage optimiste.
- **Routes** : `/catalog`, `/catalog/:uid`, `/catalog/collections/:uid`, `/catalog/admin` — data-router Epic 18, `RequireAuth` hérité + guard `requireCurator` (front) pour l'admin ; 404 scopé Epic 18 pour deep-links périmés. Entrée admin dans le dropdown compte si `isCurator`.
- **Réutilisation UI (sans modif)** : table Songlist + delta responsive, cartes/rails (DESIGN), `ConfirmDialog` (import), pattern toast `setToastMessage`/2500ms, `comboboxKeyboard` (filtres + composer). Aucune primitive de style neuve. Stretched-link (a11y) partout.
- **Crochet Songlist-vide (DL-13)** : seule surface existante modifiée ; dégrade proprement (fetch Catalog KO → CTA seul).

### Infrastructure & Deployment

- Inchangé (push `main` → `flyctl` ; migrations `release_command` puis `sync({alter:false})`).
- **Séquencement de lancement (invariant produit)** : curation opérationnelle → seed (~50-100 fiches, 3-5 Collections) → exposition du Catalog aux users. Le seed est une PORTE, pas un backlog (livré vide, le Catalog dégrade SM-2).

### Decision Impact Analysis

**Séquence d'implémentation (dérive les stories) :**
1. Migrations : `CatalogSong` + index canonique, Collections + jointure, `Songs.sourceCatalogUid`, `Users.isCurator` (+ modèles Sequelize).
2. Backend lecture : `catalogcontroller` (liste paginée à enveloppe + détail), routes `authsess`.
3. Backend Add : `POST /api/catalog/:uid/add-to-songlist` (réutilise `Song.create` + `respondDuplicateSong`).
4. Backend curation : `requireCurator` + CRUD fiches (409 canonique) + auto-fill.
5. Backend Collections : CRUD Collections + import non-atomique + playlist miroir.
6. Frontend : `catalogService` + Browse (URL-state, debounce/abort, flag client-side) + détail + Add inline + Collections + admin curateur + crochet Songlist-vide.
7. Seed + doc `project-context` (principe + exceptions).

**Dépendances croisées :** l'index canonique (1) conditionne le 409 de l'Add (3) et du create curateur (4) ; la mécanique Add (3) est réutilisée par l'import (5) ; le flag client-side (6) dépend du chargement des clés Songlist perso (existant) ; les exceptions `project-context` (7) doivent être écrites AVANT la première code-review Catalog.

## Implementation Patterns & Consistency Rules

> **Préambule.** Le Catalog HÉRITE de toutes les conventions de `project-context.md` (contrôleurs minuscules, `field:'snake_case'`, services `fetch` brut, tests double-suite, migrations idempotentes, etc.). Cette section ne code QUE les patterns NEUFS où deux agents pourraient diverger sur le Catalog. ~11 points de conflit identifiés.

### Naming Patterns

**Backend :**
- Contrôleur : `catalogcontroller.js` (fiches + Add + lecture Collections + import) ; middleware `middleware/requirecurator.js` (nommage à plat, comme `authsess.js`).
- Modèles (fichiers minuscules) : `catalogsong.js` → `CatalogSong`, `catalogcollection.js` → `CatalogCollection`, `catalogcollectionsong.js` → `CatalogCollectionSong` (jointure).
- Tables (`tableName` explicite) : `CatalogSongs`, `CatalogCollections`, `CatalogCollectionSongs`.
- Colonnes `field:'snake_case'` : `source_catalog_uid`, `is_curator`, `catalog_song_uid`, `collection_uid`. PK `uid` UUID v4 partout.
- Route file `routes/catalog.js`, monté sur **`/api/catalog`** (singulier — « catalog » est un nom de masse/pool ; s'écarte volontairement du `/api/songs` pluriel). Sous-ressource énumérable au pluriel : `/api/catalog/collections`.

**Frontend :**
- `catalogService.ts` (SÉPARÉ de `songService`), types `CatalogSong` / `CatalogCollection` DISTINCTS (jamais alias de `Song`).
- Pages : `Catalog.tsx` (Browse), `CatalogEntry.tsx` (détail `/catalog/:uid`), `CatalogCollection.tsx` (`/catalog/collections/:uid`), `CatalogAdmin.tsx` (`/catalog/admin`).

**Query params (contrat front↔back — noms EXACTS, sinon filtres muets) :** `search`, `key`, `mode`, `timeSignature`, `genre`, `sort`, `page`, `limit`. `timeSignature` en camelCase (miroir du champ JS). Le front les construit, le back les parse — une seule casse.

### Format Patterns (shapes de réponse — verrouillées)

- **Liste** (SEULE enveloppe de l'app) : `{ items: CatalogSong[], total, page, limit }`.
- **Détail / Add succès** : entité brute (convention normale, pas d'enveloppe).
- **409 doublon Add** : RÉUTILISER le shape existant `{ error:'duplicate_song', message, song }` (via `respondDuplicateSong`).
- **409 unicité canonique curateur** : shape typé DÉDIÉ `{ error:'duplicate_catalog_entry', message, entry }` (miroir du précédent, pour create ET rename).
- **Import récap** : `{ added: number, skipped: number, failed: number, playlistUid: string }`.
- **403 curateur** : `createError(403, "You don't have curator access.")`.
- Codes : 409 (doublon), 403 (curateur), 404 calme (fiche/collection inconnue), 400 (titre requis), 401 (non connecté).

### Process Patterns

**① Normalisation canonique — LA règle à ne jamais confondre (point de conflit n°1) :**
- **Clé d'unicité / doublon = casse-insensible, accents GARDÉS distincts** (« Beyoncé » ≠ « Beyonce »). Serveur = index DB `lower(title)` + `COALESCE(lower(artist),'')` (Epic 17, sans `user_uid`). Front = RÉUTILISER `norm`/`findDuplicateSong` de `src/utils/songDuplicate.ts` (NFC + lowercase + collapse whitespace + trim). Badge « Already in your songlist » et 409 serveur PARTAGENT cette normalisation → jamais de désaccord.
- **Recherche (FR-2) = casse ET accents pliés** (accent-INsensible, `unaccent` serveur, miroir du folding topics/sessions). C'est une normalisation DIFFÉRENTE. NE JAMAIS appliquer le folding d'accents à la clé canonique, ni l'inverse. Deux fonctions distinctes, deux usages distincts.

**② Lecture partagée non-scopée (point de conflit n°2 — anti « correction » IDOR) :**
- Pattern lecture Catalog : `CatalogSong.findAll({ where: <filtres>, order, limit, offset })` — AUCUN `userUid` dans le `where`. Contrôleur nommé `catalog*` + commentaire d'ancrage : `// SHARED read (principe §3) : Catalog non scopé userUid — NE PAS rescoper (voir project-context).`
- Contraste : les données perso GARDENT le pattern scopé `findOne({ where:{ uid, userUid } })` → 404. Un agent ne doit jamais copier l'un pour l'autre.

**③ requireCurator (écriture) :** après `authsess`, charge le User de session, exige `isCurator === true`, sinon `createError(403, ...)`. Jamais de 404 anti-oracle ici (ressource lisible). Appliqué UNIQUEMENT aux routes d'écriture Catalog.

**④ Deep-clone à l'Add (point de conflit n°3) :** copier les JSON (`language`, `genre`, `streamingLinks`) via `structuredClone(value)` (natif Node 22) — JAMAIS passer la référence de la `CatalogSong` à `Song.create` (partage de référence = mutation croisée). Champs perso laissés à vide (`lastPlayed:null`, etc.).

**⑤ Import idempotent :** attache playlist via garde `(playlist_uid, song_uid)` (existence avant insert, ou `ON CONFLICT DO NOTHING`) ; playlist réutilisée par `lower(name)` (Epic 10). Best-effort : chaque fiche est une unité (try/catch par fiche), agrégat `{added,skipped,failed}`. PAS de transaction englobante.

**⑥ Migrations Catalog :** un fichier par objet, préfixe timestamp `YYYYMMDDHHMMSS-catalog-*.js`, idempotence obligatoire (`showAllTables` pour tables, `CREATE UNIQUE INDEX IF NOT EXISTS` pour l'index canonique — `lower`/`COALESCE` IMMUTABLE, pas d'extension, comme Epic 17 ; `describeTable` pour `addColumn`). Ordre par timestamp (tables → index → jointure → colonnes).

**⑦ États UI (réutilisation, pas de neuf) :** skeleton de rangées (chargement liste), 404 calme (data-router Epic 18), `Retry` sur erreur fetch, empty-states doux (copie EN d'EXPERIENCE), `ConfirmDialog` (import), toast `setToastMessage`/2500ms. Debounce ~250-300ms + `AbortController` sur la recherche serveur.

### Enforcement Guidelines

**Tout agent dev DOIT :**
- Réutiliser `findDuplicateSong`/`norm` pour le flag doublon (jamais réécrire la normalisation).
- Réutiliser `respondDuplicateSong`, `createPlaylist`/`PlaylistConflictError`, l'auto-fill `/api/songs/lookup` — SANS modifier leur comportement (additif strict).
- Ancrer par commentaire toute lecture non-scopée et le 403 curateur (renvoi au principe §3).
- `structuredClone` pour toute copie JSON à l'Add.
- Écrire les exceptions dans `project-context.md` AVANT la 1ʳᵉ code-review Catalog.

**Anti-patterns (à rejeter en review) :**
- Rescoper la lecture Catalog par `userUid`, ou renvoyer 404 sur l'écriture curateur.
- Ajouter une FK vive sur `source_catalog_uid`.
- Aliaser `Song` pour `CatalogSong` (front ou back).
- Renvoyer un tableau nu pour la liste (perte du `total`) ou une enveloppe pour les endpoints unitaires.
- Plier les accents dans la clé canonique, ou l'oublier dans la recherche.
- Wrapper l'import dans une transaction unique.
- `ORDER BY` sans tiebreaker `uid`.

## Project Structure & Boundaries

> Brownfield : la structure existe. Ci-dessous UNIQUEMENT les fichiers que le Catalog AJOUTE (➕) ou TOUCHE (✎). Tout le reste est inchangé (additif strict).

### Complete Project Directory Structure (delta Catalog)

```
musician-tools/
├── backend/
│   ├── controllers/
│   │   ➕ catalogcontroller.js         # liste paginée, détail, Add, CRUD fiches, CRUD+import Collections
│   ├── middleware/
│   │   ➕ requirecurator.js            # 403 si !isCurator (après authsess) ; hérite CSRF app-wide sur les writes
│   ├── models/
│   │   ➕ catalogsong.js               # CatalogSong (sous-ensemble intrinsèque, sans userUid)
│   │   ➕ catalogcollection.js         # CatalogCollection
│   │   ➕ catalogcollectionsong.js     # jointure CatalogCollectionSong (composite unique)
│   │   ✎ song.js                       # + champ sourceCatalogUid (référence souple, pas d'association FK)
│   │   ✎ user.js                       # + champ isCurator (bool, défaut false)
│   ├── routes/
│   │   ➕ catalog.js                    # monté /api/catalog (+ /api/catalog/collections) ; authsess lecture, requireCurator writes
│   │   ✎ (index routes/server)         # mount du router catalog
│   ├── migrations/                      # ordre par timestamp
│   │   ➕ 2026071x000000-create-catalog-songs.js         # table + INDEX unique canonique global (lower/COALESCE)
│   │   ➕ 2026071x000100-create-catalog-collections.js
│   │   ➕ 2026071x000200-create-catalog-collection-songs.js
│   │   ➕ 2026071x000300-add-source-catalog-uid-to-songs.js
│   │   ➕ 2026071x000400-add-is-curator-to-users.js
│   └── __tests__/
│       ➕ catalogcontroller.test.js     # lecture non-scopée, pagination/enveloppe, Add (409 dup), import best-effort
│       ➕ requirecurator.test.js        # 403 non-curateur / passe curateur
│       ➕ catalogAddMechanic.test.js    # deep-clone JSON, sourceCatalogUid, champs perso vierges
├── src/
│   ├── pages/
│   │   ➕ Catalog.tsx                   # Browse (URL-state, debounce/abort, rails, liste paginée)
│   │   ➕ CatalogEntry.tsx              # détail /catalog/:uid (lecture seule + Add 3 états)
│   │   ➕ CatalogCollection.tsx         # /catalog/collections/:uid (liste + import + ConfirmDialog)
│   │   ➕ CatalogAdmin.tsx              # /catalog/admin (entry form SongForm-like + composer)
│   │   ✎ Songs.tsx                      # crochet Songlist-vide (DL-13) : CTA + aperçu Collections
│   ├── components/
│   │   ➕ CatalogAddButton.tsx          # bouton Add 3 états (default/added/already), stretched-link sibling
│   │   ➕ CollectionCard.tsx            # tuile gradient marque (rail + grille)
│   │   ➕ RecentlyAddedCard.tsx         # carte strip (artiste d'abord)
│   │   ➕ CatalogList.tsx               # liste filtrable (réutilise table Songlist + delta responsive)
│   │   ✎ Header.tsx                     # 7e lien nav « Catalog » ; entrée « Curate » dans dropdown compte si isCurator
│   ├── services/
│   │   ➕ catalogService.ts             # fetch brut : listCatalog (enveloppe), getEntry, addToSonglist, collections, admin CRUD
│   ├── utils/
│   │   ✎ (réutilise songDuplicate.ts)   # norm/findDuplicateSong pour le flag doublon client-side (PAS de nouveau fichier)
│   ├── router.tsx  ✎                    # routes /catalog, /catalog/:uid, /catalog/collections/:uid, /catalog/admin (+ guard curator)
│   └── __tests__/
│       ➕ Catalog.test.tsx              # URL-state, search-to-collapse, flag doublon, pagination
│       ➕ CatalogAddButton.test.tsx     # 3 états, a11y (sibling, ≥44px)
│       ➕ CatalogCollection.test.tsx    # import : confirm, récap, idempotence
│       ➕ CatalogAdmin.test.tsx         # role-gate, auto-fill sans écrasement, 409 canonique
└── _bmad-output/
    ✎ project-context.md                 # + principe §3 & 2 exceptions (AVANT 1ʳᵉ code-review Catalog)
```

### Architectural Boundaries

**API :** nouveau namespace `/api/catalog` (lecture `authsess` non-scopée) et `/api/catalog/**` (écriture `requireCurator` → 403). Frontière nette avec `/api/songs` (perso, scopé) — aucune route existante modifiée. L'Add écrit dans le domaine `Songs` (via `Song.create`) mais est exposé côté `catalog` (le Catalog possède la copie).

**Composants (front) :** `catalogService` ↔ pages Catalog ↔ composants Catalog. Communication par props + URL (`useSearchParams` source unique). Aucun état global neuf (pas de Context) ; `AuthContext` réutilisé pour `isCurator` côté guard.

**Données :** `CatalogSong` (partagée) — frontière stricte : jamais de `userUid`. `Song.sourceCatalogUid` = pont SOUPLE (pas de FK). Jointure Collections = frontière DURE (nettoyage). Le flag doublon franchit la frontière côté CLIENT (clés Songlist perso), jamais par jointure serveur.

### Requirements → Structure Mapping

- **FR-1/2/3 (Browse/search/detail)** → `catalogcontroller` (list+detail) · `routes/catalog.js` · `Catalog.tsx` · `CatalogEntry.tsx` · `CatalogList.tsx` · `catalogService.ts` · migration `create-catalog-songs` (+ index canonique).
- **FR-4/5/6/7 (Add snapshot+provenance)** → `catalogcontroller.addToSonglist` · migration `add-source-catalog-uid-to-songs` · réutilise `songDuplicate.ts` + `respondDuplicateSong` · `CatalogAddButton.tsx`.
- **FR-8/9 (Collections)** → `catalogcontroller` (collections + import) · migrations `create-catalog-collections` + `create-catalog-collection-songs` · `CollectionCard.tsx` · `CatalogCollection.tsx` · réutilise `createPlaylist` (Epic 10).
- **FR-10/11/12/13 (Curation)** → `requirecurator.js` · `catalogcontroller` (CRUD fiches/collections, 409 canonique) · migration `add-is-curator-to-users` · `CatalogAdmin.tsx` · réutilise auto-fill `/api/songs/lookup`.
- **DL-13 (crochet Songlist-vide)** → ✎ `Songs.tsx` (seule surface existante modifiée, dégrade proprement).

### Integration Points

- **Interne** : Add réutilise `Song.create` + `respondDuplicateSong` (domaine Songs) ; import réutilise `createPlaylist`/`PlaylistConflictError` (Epic 10) ; curation réutilise l'auto-fill SongBPM (`/api/songs/lookup`, story 8.1). Flag doublon réutilise `songDuplicate.ts`.
- **Externe** : aucun nouveau service tiers (SongBPM déjà branché). Pas de nouvelle dépendance npm.
- **Data flow (Add)** : `CatalogEntry`/`CatalogList` → `catalogService.addToSonglist` → `POST /api/catalog/:uid/add-to-songlist` → lire `CatalogSong` → deep-clone → `Song.create` (+`sourceCatalogUid`) → 201 Song | 409 dup → toast/badge.

### File Organization / Workflow

- **Config** : inchangé (`.sequelizerc`, `both.Dockerfile`, `docker-compose`, CI). Migrations détectées automatiquement (dossier), modèles chargés par lecture du dossier `models/`.
- **Tests** : double-suite respectée — backend `backend/__tests__/*.test.js` (modèles mockés `jest.mock('../models')`), frontend `src/__tests__/*.test.tsx` (Testing Library). Le hook pre-commit lance les deux.
- **Déploiement** : inchangé (push `main` → `flyctl`). Migrations Catalog partent en prod au merge → idempotentes + testées local. Seed post-migration (curation → seed → exposition).

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility :** aucune décision contradictoire. Le système d'autorisation P1/P2/P4 (lecture non-scopée / 403 isCurator / unicité globale) est cohérent sous sa condition invariante. Les deux régimes de référence (jointure DURE / `sourceCatalogUid` SOUPLE) sont explicitement distincts. La pagination serveur, l'URL-state et le flag doublon client-side se renforcent (la lecture reste purement partagée GRÂCE au flag client).

**Pattern Consistency :** les patterns (normalisation canonique vs folding recherche, lecture non-scopée ancrée, deep-clone, import non-atomique) servent directement les décisions. Nommage cohérent avec l'existant (contrôleurs minuscules, `field` snake_case, services séparés).

**Structure Alignment :** l'arbo delta respecte les conventions (`models/` auto-chargés, double-suite de tests, migrations dossier). Frontières API (`/api/catalog` vs `/api/songs`) nettes ; aucune route existante modifiée hors crochet Songlist-vide.

### Requirements Coverage Validation ✅

**Functional Requirements (13/13) :**
- FR-1 Browse → liste paginée `authsess` (non connecté → 401). FR-2 search/filter → query params + folding. FR-3 détail → CatalogEntry + liens externes.
- FR-4 snapshot+provenance → `addToSonglist` (deep-clone + `sourceCatalogUid`). FR-5 éditable/indépendant → Song séparée. FR-6 doublon → 409 + badge. FR-7 unidirectionnel → écriture Catalog gated `requireCurator`.
- FR-8 browse collections → liste/détail. FR-9 import → best-effort + playlist miroir idempotente.
- FR-10 rôle curateur → `isCurator`/403. FR-11 gérer fiches → édition in-place uid stable + auto-fill. FR-12 composer → jointure multi-collection + nettoyage. FR-13 unicité canonique → index global 409.

**Non-Functional (6/6) :** NFR-1 partagé non-scopé (principe §3) · NFR-2 pagination serveur + index · NFR-3 403 isCurator · NFR-4 référence souple sans FK · NFR-5 design system réutilisé · NFR-6 UI EN.

**UX / parcours :** UJ-1 (Add 10s inline), UJ-2 (import Collection + playlist), UJ-3 (curation zéro-SQL) tous supportés ; états (empty / 404 calme / erreur / doublon) mappés.

### Implementation Readiness Validation ✅

**Decision Completeness :** décisions critiques documentées (modèle, index, autorisation, Add, import). Les 2 forks tranchés (endpoint dédié, playlist réutilisée). **Structure Completeness :** arbo delta concrète (fichiers neufs/touchés). **Pattern Completeness :** ~11 points de conflit adressés + anti-patterns listés.

### Gap Analysis Results

**Gaps critiques :** aucun.
**Gaps importants (à fermer story 1-2, non-bloquants) :**
1. Whitelist du param `sort` (anti-injection ORDER BY) dans `catalogcontroller`.
2. Cap de pagination : `limit` défaut + max (anti `limit=∞`).
3. Confirmer que la CSRF app-wide (`middleware/csrf.js`) couvre les routes mutantes Catalog (Add + writes curateur).
4. Recherche accent-insensible serveur = réutiliser le folding `unaccent` des topics (extension déjà présente, migration `20260625…-topics-name-ci-unaccent`).

**Gaps nice-to-have :** outillage CSV de seed (optionnel, non-bloquant) ; harnais de tests e2e Catalog.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented (brownfield : stack établie, pas de versions à re-choisir)
- [x] Technology stack fully specified (hérité, listé step-03)
- [x] Integration patterns defined
- [x] Performance considerations addressed (pagination serveur + index + cap)

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined (delta Catalog concret)
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status :** READY WITH MINOR GAPS — les 16 items sont [x], aucun gap critique, mais 4 gaps importants (whitelist sort, cap limit, confirmation CSRF, folding unaccent) sont à fermer en story 1-2.
**Confidence Level :** high — l'addendum pré-cadrait fortement, la validation n'a trouvé que des détails d'implémentation bien circonscrits.

**Key Strengths :** principe d'autorisation reformulé (non une exception mais l'application correcte) ; découplage snapshot rigoureux ; additif strict (zéro régression) ; réutilisation maximale de l'existant ; frontières futures écrites comme dette datée.
**Areas for Future Enhancement :** re-sync provenance (§4.5), popularité (§4.7), variantes, browse public, contribution communautaire — toutes modèle-aware, crochets déjà posés.

### Implementation Handoff

**AI Agent Guidelines :** suivre les décisions et patterns à la lettre ; réutiliser l'existant sans le modifier (additif strict) ; ancrer par commentaire les exceptions §3 ; écrire les exceptions dans `project-context.md` AVANT la 1ʳᵉ code-review.
**First Implementation Priority :** migration `create-catalog-songs` + index canonique global (idempotent), puis modèle `CatalogSong` — la fondation dont dépendent le 409 de l'Add et de la curation.
