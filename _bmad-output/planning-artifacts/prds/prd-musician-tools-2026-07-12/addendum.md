# Addendum — PRD Catalog (musician-tools)

> Profondeur technique et « comment » sortis du contrat PRD. Destiné aux workflows aval (architecture, epics). Les décisions ici sont des **pistes fortes issues du cadrage**, à valider en `bmad-create-architecture`.

## Esquisse de modèle de données

**Nouvelle table `CatalogSong` (partagée, sans `userUid`)**
- `uid` (PK, UUID v4), `timestamps: true`. Le `updatedAt` **est** la « version » de provenance (décision 2026-07-12 : pas de colonne de version dédiée en v1 ; le futur diff de re-sync relit `updatedAt`).
- **Sous-ensemble intrinsèque des colonnes de `Song`** (décision 2026-07-12 — parité de noms/formes pour que `Add` soit une copie 1:1 sans couche de transformation ; **corrigé DL-17** : seulement les champs **intrinsèques à la chanson**, pas les attributs liés à l'instrument) : `title` (requis), `artist`, `album`, `key`, `bpm`, `mode`, `timeSignature`, `durationSeconds`, `language` (JSONB), `genre` (JSONB), `streamingLinks` (JSONB — liens YouTube/Spotify, **même forme que `Song.streamingLinks`** ; **pas** de colonnes `youtubeUrl`/`spotifyUrl` séparées), `pitchStandard`. **Exclus** (perso-only, jamais au Catalog) : `userUid`, `myInstrumentUid`, `lastPlayed`, `notes`, historique/playlists, **+ tous les attributs liés à l'utilisateur/son instrument** (DL-17) : `instrument`, `instrumentDifficulty` (difficulté), `instrumentTuning` (accordage), `capo`, `technique`, `instrumentLinks` — le Catalog est **une fiche canonique par chanson (titre+artiste)** ; ces attributs n'ont de sens qu'au niveau perso, réglés après l'`Add`. **Filtres Browse** = `key · mode · timeSignature · genre` + recherche texte (titre/artiste).
- La copie `Add` doit **cloner en profondeur** les structures JSON (arrays/objets) — pas de partage de référence — et respecter la convention colonnes (`field: 'snake_case'`).
- **Index unique** sur la clé canonique `(lower(title), COALESCE(lower(artist),''))` — **global** (pas de `user_uid`, contrairement à `Songs`). ⚠️ **Faux-ami** : c'est la *même mécanique* que l'index per-user d'Epic 17, mais **global** — surface de collision radicalement différente (la 1ʳᵉ fiche verrouille la clé pour **tous**). Choix v1 assumé : une entrée canonique, pas de variantes (studio/live/drop-D) ; passer aux variantes en v2 exigera de **changer la clé unique** (migration sur donnée partagée en prod).
- **Stabilité de l'uid par contrat** (décision 2026-07-12) : la correction d'une fiche est un `UPDATE` in-place ; **jamais** delete+recreate d'une fiche potentiellement référencée → les `sourceCatalogUid` distribués ne pendent pas.
- Convention colonnes : suivre le pattern majoritaire `Songs` (camelCase JS + `field: 'snake_case'` en DB). Migration idempotente obligatoire (garde `showAllTables`/`describeTable`).

**Extension de la table `Songs` (perso, existante)**
- Ajouter `sourceCatalogUid` (nullable, UUID). **Référence souple** — PAS de FK vive `ON DELETE`. Objectif NFR-4 : la suppression d'une `CatalogSong` ne doit pas cascader ni casser la `Song` perso. Le champ est un pointeur de provenance, potentiellement « pendant » (dangling) **uniquement** si le curateur supprime volontairement la fiche source (jamais sur une simple correction, cf. uid stable) — c'est **voulu**.
- **Pas de colonne `sourceCatalogVersion` en v1** (décision 2026-07-12) : le futur diff de re-sync (§4.5) comparera à `CatalogSong.updatedAt`. Une seule colonne ajoutée à `Songs` (`sourceCatalogUid`) → migration minimale.

**Tables Collections**
- `CatalogCollection` : `uid`, `name`, `description`, `timestamps`.
- Jointure `CatalogCollectionSongs` `(collection_uid, catalog_song_uid)` — composite unique. Suppression d'une `CatalogSong` → nettoyer les lignes de jointure (FR-12 : pas de référence morte **dans les Collections**, contrairement à `Song.sourceCatalogUid` qui reste souple).

## Mécanique « Add to my songlist » (snapshot + provenance)

1. Lire la `CatalogSong` par `uid`.
2. Vérifier la garde de doublon per-user : réutiliser `findDuplicateSong` / l'index unique `Songs (user_uid, lower(title), COALESCE(lower(artist),''))` (Epic 17). Collision → **409 typé** (`SongConflictError`), l'UI affiche « Already in your songlist » + pointe l'existante (FR-6). Pas d'insertion.
3. Sinon, `INSERT` une `Song` avec les champs canoniques copiés (**deep-clone** des structures JSON) + `userUid` courant + `sourceCatalogUid = catalog.uid`. Champs perso vierges (`lastPlayed = null`, aucun `SongPlay`, aucune playlist).
4. Retour de la `Song` créée (entité JSON brute, pas d'enveloppe — convention existante).

- **Import de Collection (FR-9)** : (a) créer **ou réutiliser** une Playlist perso du **nom de la Collection** — réutiliser la brique Epic 10 (`createPlaylist` + `PlaylistConflictError`/unicité `lower(name)` → si elle existe déjà, la réutiliser) ; (b) itérer les fiches, appliquer l'étape 2-3 par fiche ; (c) rattacher **toutes** les chansons du lot (y compris celles déjà présentes dans la Songlist, skippées à l'insert mais quand même ajoutées à la Playlist) au `playlist_songs` (FK 5.7) ; (d) agréger `{added, skipped, failed}`. **Best-effort** (un skip/échec n'annule pas le lot) ; **idempotent** (ré-importer la même Collection ne duplique ni chansons ni entrées de playlist).

## Autorisation curateur (NFR-3)

- **Décidé (2026-07-12)** : attribut `isCurator` (booléen) sur `User`, `false` par défaut ; middleware `requireCurator` sur les routes d'**écriture** Catalog. Pas de table de rôles (surdimensionné pour un seul curateur v1).
- **Refus = 403 explicite** (décidé 2026-07-12). Les routes de **lecture** Catalog exigent seulement l'auth (connectés). Le pattern durci 7.5 (404 anti-oracle) protège l'**existence de ressources d'autrui** ; ici la fiche est **publiquement lisible par tout connecté**, donc aucun secret d'énumération à protéger sur la route d'écriture → un `403` franc est le bon code (privilège manquant, pas ressource cachée). C'est une **exception nommée** au réflexe 404 de l'app, à inscrire **aussi** dans `project-context.md` (cf. rupture structurelle) pour ne pas la re-débattre à chaque story.
- Le rôle `isCurator` se pose à la main en base pour northwood en v1 (pas d'UI de gestion des rôles — hors périmètre). Le narratif « zéro SQL » d'UJ-3 concerne la **saisie des fiches**, pas l'attribution initiale du rôle.

## Réutilisation de l'existant (ne pas réinventer)

- **Auto-fill** : `fetchFromSongBpm` / `fetchSongMetadata` / `songService.lookupMetadata` (déjà branchés sur la Songlist perso, story 8.1) — réutiliser tel quel dans l'écran de curation (FR-11), sans écraser une saisie.
- **Garde de doublon** : ne pas réécrire — étendre `findDuplicateSong` + l'index unique + `SongConflictError` d'Epic 17.
- **Combobox / filtres** : `comboboxKeyboard.ts` + les patterns de filtres Songlist (Epic 9/14) pour le browse Catalog.
- **Confirmations / toasts** : `ConfirmDialog.tsx` + pattern `setToastMessage`/`setTimeout(2500)` (project-context) — pas de lib.
- **Routing** : l'app est passée au **data-router** (Epic 18, `createBrowserRouter`) — les nouvelles surfaces Catalog s'ajoutent comme routes (`/catalog`, `/catalog/:uid`, `/catalog/collections`, admin scopé) avec le même `RequireAuth`, et un `requireCurator` pour l'admin.

## Notes techniques / pièges (rappel project-context)

- **Toute migration part en prod au merge** → idempotente + testée localement (create-table gardée par `showAllTables`).
- **NODE_ENV** défaut `production` en local si non exporté ; Postgres dev sur **5433**.
- Pattern contrôleur obligatoire : `req.session.user` → requête scopée → 404. Pour le Catalog en **lecture**, la requête n'est **pas** scopée `userUid` (donnée partagée) — c'est l'exception assumée ; bien la documenter pour ne pas déclencher les gardes anti-IDOR par réflexe.
- `Song.lastPlayed` dénormalisé/global : à laisser **null** à la copie ; ne pas y propager quoi que ce soit du Catalog.

## Rupture structurelle — à acter en architecture

Le Catalog introduit **la première donnée partagée non-scopée par utilisateur**. Conséquences à cadrer en `bmad-create-architecture` :
1. Le pattern « tout est scopé `userUid` → 404 » ne s'applique **pas** à la lecture Catalog (donnée partagée), **ni** le 404 anti-oracle à l'écriture admin (→ **403**, cf. Autorisation). **Inscrire ces deux exceptions dans `project-context.md` lui-même** (pas seulement ici) : sinon chaque agent dev / reviewer / `bmad-code-review` les flaggera comme régressions 7.5 à chaque story Catalog.
2. Nouveau vecteur d'autorisation (rôle `isCurator`) à côté de l'ownership.
3. Référence souple `Song.sourceCatalogUid` (pas de FK vive) — choix délibéré de découplage, à ne pas « corriger » en ajoutant une contrainte FK.
