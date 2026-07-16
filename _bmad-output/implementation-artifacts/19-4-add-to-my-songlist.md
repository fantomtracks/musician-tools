---
baseline_commit: fee9761
---

<!-- Story créée 2026-07-15 via bmad-create-story ; Epic 19 (Catalog) ; source epics.md § Epic 19 story 19.4 + architecture-catalog-2026-07-12.md + ux (DL-8/11/13) -->

# Story 19.4: Add to my songlist — copie snapshot en un geste

Status: done

## Story

En tant qu'**utilisateur**,
je veux ajouter une fiche Catalog à ma Songlist en un clic,
afin qu'elle atterrisse complète sans aucune saisie (climax UJ-1).

## Contexte & pourquoi

Le Catalog se **browse** (19-3) mais on ne peut pas encore **copier** une fiche vers sa Songlist. Cette story livre le **geste central** : `Add to my songlist` = copie **snapshot + provenance**. C'est la **dernière story d'Epic 19** (elle ferme la boucle « trouver → ajouter »).

- **Réutilise l'existant** : `Song.create` + la garde d'unicité **per-user** d'Epic 17 (index `(user_uid, lower(title), COALESCE(lower(artist),''))` → 23505 → 409) ; `SongConflictError` + `findDuplicateSong` (`src/utils/songDuplicate.ts`) côté front.
- **S'appuie sur 19-3** : greffe le bouton Add sur les rows de `CatalogList` (cellule d'action) et sur la fiche `CatalogEntry`.

⚠️ **Le flag « Already in your songlist » se calcule CÔTÉ CLIENT** (architecture, second-order) : le client charge une fois **sa** Songlist (`songService.getAllSongs`) et compare via `findDuplicateSong` — la requête Catalog reste **purement partagée** (aucun `userUid`). Serveur = vérité (409 à l'Add) ; client = affichage optimiste.

⚠️ **`Song.sourceCatalogUid` = RÉFÉRENCE SOUPLE** — aucune FK vive (NFR-4 : supprimer une fiche Catalog ne doit jamais casser la Song copiée ; le dangling est délibéré, crochet popularité §4.7). Migration **part en prod** → idempotente + testée local.

## Décisions verrouillées (architecture + UX)

- **Endpoint dédié** `POST /api/catalog/:uid/add-to-songlist` (Fork 1, 19-1) — le Catalog possède la copie ; routes `/api/songs` **inchangées**.
- **Copie 1:1 des champs intrinsèques** + **DEEP-CLONE** des JSON (`language`, `genre`, `streamingLinks`) via `structuredClone` (Node 22) — jamais de partage de référence. Champs perso **vierges** (`lastPlayed = null`, aucun SongPlay/playlist). `sourceCatalogUid = catalog.uid`.
- **409 `duplicate_song`** : la garde per-user Epic 17 (23505) → 409 `{ error:'duplicate_song', message, song: existing }` (même shape que `createSong`). L'UI affiche « ✓ Already in your songlist » + lien vers la Song existante (FR-6). Aucune insertion.
- **Bouton Add — 3 états (DL-8/DL-11)** : `Add to my songlist` (`btn-primary`) → flash `✓ Added` (vert momentané) → `✓ Already in your songlist` (`badge-success`, **cliquable** vers la Song existante). État doublon connu **avant** clic (clé déjà en Songlist) → naît directement en « Already ». **Jamais rouge**, jamais désactivé-grisé.
- **a11y (stretched-link)** : le bouton Add est un **frère** du lien titre (pas imbriqué dans un `<a>`) ; cible **≥44px** même en cellule serrée (icône `+` avec `aria-label` complet si la place manque).
- **Crochet Songlist-vide (DL-13)** : quand la Songlist est vide → « Your songlist is empty — Browse the Catalog to fill it in seconds » + CTA `/catalog` ; **dégradation propre** (aucun crash). (L'aperçu de 2-3 Collections = Epic 20 ; ici CTA seul.)
- **Scope** : PAS de rails/Collections (Epic 20). Import de Collection = 20-3/20-4.

## Acceptance Criteria

1. **Migration** : `Songs.sourceCatalogUid` (nullable UUID, `field:'source_catalog_uid'`) ajoutée, **RÉFÉRENCE SOUPLE — aucune FK vive** (ni CASCADE/SET NULL/RESTRICT) ; migration **idempotente** (`describeTable`) et testée en local. Modèle `Song` déclare le champ.
2. **Add — création** : `POST /api/catalog/:uid/add-to-songlist` (auth) lit la `CatalogSong` (404 calme si absente) → crée une `Song` perso avec les champs intrinsèques **deep-clonés** (`structuredClone` des JSON) + `userUid` courant + `sourceCatalogUid = catalog.uid` ; champs perso vierges (`lastPlayed = null`) → **201** entité Song brute.
3. **Add — doublon** : si la **clé canonique** existe déjà dans la Songlist du user (index Epic 17, 23505) → **409** `{ error:'duplicate_song', message, song: existing }` ; **aucune** insertion.
4. **Découplage** : supprimer la `CatalogSong` source **après** l'Add laisse la `Song` perso **intacte** (référence souple ; vérifiable — pas de FK). Les routes `/api/songs` restent inchangées.
5. **catalogService.addToSonglist(uid)** : `POST …/add-to-songlist` ; 201 → `Song` ; **409 → throw `SongConflictError(body.song)`** (réutilise la classe existante de `songService`).
6. **Bouton Add 3 états** : `CatalogAddButton` — `Add to my songlist` (`btn-primary`) → clic → flash `✓ Added` → `✓ Already in your songlist` (`badge-success`, cliquable → `/songs/:uid` de la Song existante). Sur 409 → passe directement en « Already » (avec la Song du body). Sur erreur réseau → revient à `Add to my songlist` + toast, re-tentable.
7. **Doublon connu à l'affichage (FR-6)** : le bouton **naît** en « ✓ Already in your songlist » si la clé canonique est déjà dans la Songlist perso — calculé **CLIENT-SIDE** (`findDuplicateSong` contre `songService.getAllSongs`), la requête Catalog restant non-scopée.
8. **Intégration** : le bouton Add apparaît en **cellule d'action fin de ligne** dans `CatalogList` (frère du lien titre, a11y) **et** sur la fiche `CatalogEntry` (bloc Add). Cible ≥44px.
9. **Crochet Songlist-vide (DL-13)** : `Songs.tsx` — Songlist vide → message + CTA `Browse the Catalog` (`/catalog`) ; si `getAllSongs` échoue, dégradation propre (pas d'empty-state cassé).
10. **Qualité** : back tests (Add 201 deep-clone + sourceCatalogUid + champs perso vierges, 409 doublon, 404 fiche absente) + front tests (bouton 3 états, doublon connu, 409, crochet vide) ; tsc + lints clean ; UI EN, dark mode.

## Tasks / Subtasks

### Task 1 — Migration + modèle `Songs.sourceCatalogUid` (AC 1)
- [x] `backend/migrations/20260715000200-add-source-catalog-uid-to-songs.js` : `up` gardé `describeTable('Songs')` → `addColumn('Songs','source_catalog_uid', { type: UUID, allowNull:true })` — **AUCUNE** `references`/`onDelete` (référence souple). `down` gardé `removeColumn`.
- [x] `backend/models/song.js` : ajouter le champ `sourceCatalogUid` (`type: UUID, allowNull:true, field:'source_catalog_uid'`) après `mode`. **Pas d'`association`** (référence souple, pas de belongsTo).
- [x] Tester `make migrate` (up/down/up) en local.

### Task 2 — Endpoint Add (AC 2, 3, 4)
- [x] `backend/controllers/catalogcontroller.js` : `addToSonglist`.
  - [x] `isUuid(req.params.uid)` sinon 404 ; `CatalogSong.findByPk(uid)` → 404 calme si null.
  - [x] Construire le payload Song : champs intrinsèques copiés ; **deep-clone** `language`/`genre`/`streamingLinks` via `structuredClone` (jamais la référence de la CatalogSong) ; `userUid = req.session.user` ; `sourceCatalogUid = catalog.uid` ; champs perso vierges (`lastPlayed: null`).
  - [x] `Song.create(payload)` ; `catch` : mapper `SequelizeUniqueConstraintError` (23505, index per-user Epic 17) → **409** `{ error:'duplicate_song', message, song: existing }` où `existing` = lookup per-user `(userUid, lower(title), COALESCE(lower(artist),''))` (répliquer le pattern `findExistingByTitleArtist` **scopé userUid** — cf. songcontroller ; NE PAS modifier songcontroller). Sinon 500.
  - [x] Succès → **201** entité `Song` brute.
  - [x] `Song` importé depuis `../models` (ajouter à l'import existant).
- [x] `backend/routes/catalog.js` : `router.post('/:uid/add-to-songlist', authsess, catalogController.addToSonglist)` (auth seul — c'est une écriture dans SA Songlist, pas une écriture Catalog ; PAS `requireCurator`). CSRF app-wide couvre la mutation.
- [x] Tests backend : 201 (payload deep-cloné, `sourceCatalogUid` set, `lastPlayed:null`, pas de partage de réf JSON), 409 doublon (avec `song`), 404 fiche absente.

### Task 3 — Frontend service + bouton (AC 5, 6, 7, 8)
- [x] `src/services/catalogService.ts` : `addToSonglist(uid) → POST /api/catalog/:uid/add-to-songlist` ; 201 → `Song` (type de `songService`) ; **409 → throw `SongConflictError(body.song)`** (importer la classe existante depuis `songService`).
- [x] `src/components/CatalogAddButton.tsx` (nouveau) : props `{ entry: CatalogSong; existingSong: Song | null; onAdded?: (song: Song) => void }`.
  - [x] Si `existingSong` (doublon connu) → rendu « ✓ Already in your songlist » (`badge-success cursor-pointer`), `<Link to={/songs/${existingSong.uid}}>`, cible ≥44px.
  - [x] Sinon `Add to my songlist` (`btn-primary`) → clic → `catalogService.addToSonglist(entry.uid)` : succès → flash `✓ Added` (état transitoire ~1s) puis « Already » (stocke la Song créée, `onAdded`) ; `catch (SongConflictError)` → « Already » (avec `err.existingSong`) ; autre erreur → toast + revient à `Add`. Optimiste, re-tentable.
  - [x] a11y : le bouton est autonome (frère du lien titre, pas imbriqué) ; `+` icône seule + `aria-label` complet si place serrée ; ≥44px (`min-h`/`min-w`).
- [x] `src/components/CatalogList.tsx` : ajouter une **cellule d'action** en fin de ligne portant `CatalogAddButton` ; retirer le `onClick` navigate de la row **de cette cellule** (`stopPropagation` sur la cellule d'action pour ne pas naviguer en cliquant Add). Titre reste le lien détail.
- [x] `src/pages/CatalogEntry.tsx` : ajouter le bloc `CatalogAddButton` (fiche).

### Task 4 — Flag doublon client-side (AC 7)
- [x] Hook/util `useSonglistMatcher` (ou inline dans `Catalog.tsx`/`CatalogEntry.tsx`) : charge une fois `songService.getAllSongs()` → expose `findExisting(entry) => Song | null` en réutilisant `findDuplicateSong(songs, { title, artist })` (`src/utils/songDuplicate.ts`). Passer `existingSong` à `CatalogAddButton` par entrée. `onAdded` met à jour le cache local (la Song ajoutée) pour que les autres lignes reflètent l'ajout. **Dégradation** : si `getAllSongs` échoue, `findExisting` renvoie null (bouton en « Add » ; le serveur garde la vérité via 409).

### Task 5 — Crochet Songlist-vide (AC 9)
- [x] `src/pages/Songs.tsx` : quand `songs.length === 0` (après chargement, hors erreur) → bloc « Your songlist is empty — Browse the Catalog to fill it in seconds » + `<Link to="/catalog" className="btn-primary">Browse the Catalog</Link>`. Dégradation propre si le fetch échoue (message d'erreur existant, pas le crochet). Ne pas régresser le flux existant.

### Task 6 — Tests (AC 10)
- [x] Back (`catalogcontroller.test.js`) : Add 201 (mock `Song.create`, vérifier payload deep-cloné + `sourceCatalogUid` + `lastPlayed:null`), 409 doublon (`Song.create` rejette `SequelizeUniqueConstraintError` → 409 `duplicate_song` + `song`), 404 fiche absente.
- [x] Front : `CatalogAddButton.test.tsx` (3 états : Add→Added→Already ; doublon connu naît « Already » ; 409 → « Already » ; erreur → revient à Add + re-tentable), + un test du crochet Songlist-vide (`Songs` avec 0 song → CTA Browse).

## Dev Notes

### Backend — patterns exacts
- **`songcontroller.createSong`** (`backend/controllers/songcontroller.js` L.150-213) : forme du `Song.create({...})` à copier pour les champs intrinsèques (title, artist, album, key, bpm, mode, timeSignature, durationSeconds, language, genre, streamingLinks, pitchStandard) ; **NE PAS** copier les champs instrument/perso. `respondDuplicateSong` L.91-104 + `findExistingByTitleArtist(userUid,…)` L.79-89 : pattern 23505 → 409 `duplicate_song` scopé userUid **à répliquer** dans catalogcontroller (songcontroller non exporté/non modifié — additif strict, comme 19.1 a répliqué `normalizeText`).
- **`structuredClone`** natif Node 22 (project-context) : `structuredClone(catalog.language)` etc. Ne jamais passer `catalog.genre` directement à `Song.create` (partage de réf → mutation croisée).
- **Migration** : pattern `describeTable` (cf. `20260617000000-add-duration-to-songs.js`). **Aucune** `references` (contrairement à `Playlists.user_uid`) — la référence souple est le point de NFR-4.
- **Route** : l'Add est une écriture dans la Songlist du USER (pas dans le Catalog) → `authsess` seul, PAS `requireCurator`. CSRF app-wide (routes/index.js) couvre le POST.

### Frontend — patterns exacts
- **`SongConflictError`** : `src/services/songService.ts` L.36-43 (classe + `existingSong`). `catalogService.addToSonglist` la réutilise (import depuis songService), 409 lu par `response.status` (jamais le texte).
- **`findDuplicateSong`** : `src/utils/songDuplicate.ts` — `findDuplicateSong(songs, {title, artist})` (NFC + lower + collapse whitespace, **accents gardés** — même normalisation que l'index DB). Réutiliser tel quel pour le flag client.
- **Songlist chargée** : `songService.getAllSongs()` (`src/services/songService.ts` L.49) renvoie `Song[]`. La navigation vers une Song existante = `/songs/:uid` (data-router Epic 18).
- **CatalogList (19-3)** : `src/components/CatalogList.tsx` — la row a un `onClick` navigate (19-3) ; ajouter la cellule d'action avec `onClick={e => e.stopPropagation()}` pour que le clic sur Add ne déclenche pas la navigation de la row. Le titre reste le `<Link>`.
- **Songs.tsx** : `songs` state chargé L.399 (`getAllSongs`) ; empty-state à ajouter là où la liste se rend (chercher le rendu conditionnel de la table / `SongsList`). Ne pas casser 13.1/17.2/18.2 (auto-save, useBlocker, routes).
- **Toasts** : pattern `setToastMessage`/`setTimeout(2500)`.

### a11y (DL-8/DL-11, Accessibility Floor)
- Bouton Add = **frère** du lien titre (jamais un `<button>` dans un `<a>`). État doublon = **icône ✓ + texte** (pas que la couleur), cible **≥44px** (badge cliquable inclus). Toast succès annoncé (`role="status"`).

### Conventions (project-context)
- Back CommonJS, `field:'snake_case'`, réponses entité brute, `createError`→`next`, migration idempotente prod. Front TS strict + `verbatimModuleSyntax` (`import type`), Tailwind + dark mode, tests double-suite (front+back verts au pre-commit). ⚠️ **`main` = prod** : la migration part en prod au merge.

### Interim / clôture Epic 19
- 19-4 **ferme Epic 19** (rétro possible ensuite). Les Collections (Epic 20) réutiliseront la mécanique Add (20-3 import) et le crochet Songlist-vide (aperçu Collections en 20-4).

### Project Structure Notes
- NEW : `backend/migrations/20260715000200-add-source-catalog-uid-to-songs.js`, `src/components/CatalogAddButton.tsx`, `src/components/CatalogAddButton.test.tsx`.
- UPDATE : `backend/models/song.js` (+ `sourceCatalogUid`), `backend/controllers/catalogcontroller.js` (+ `addToSonglist`), `backend/routes/catalog.js` (+ route Add), `backend/__tests__/catalogcontroller.test.js` (+ tests Add), `src/services/catalogService.ts` (+ `addToSonglist`), `src/components/CatalogList.tsx` (+ cellule Add), `src/pages/CatalogEntry.tsx` (+ bloc Add), `src/pages/Catalog.tsx` + `src/pages/CatalogEntry.tsx` (flag doublon client-side), `src/pages/Songs.tsx` (crochet vide).

### References
- [Source: epics.md#Story 19.4] — user story + AC.
- [Source: architecture-catalog-2026-07-12.md#Data Architecture + API (Add Fork 1) + Second-order (flag client-side)] — sourceCatalogUid souple, endpoint dédié, deep-clone, flag client-side.
- [Source: ux-designs/…/EXPERIENCE.md + DESIGN.md] — DL-8 (Add 3 états), DL-11 (doublon vert calme), DL-13 (crochet Songlist-vide), stretched-link a11y, cibles ≥44px.
- [Source: backend/controllers/songcontroller.js#createSong,respondDuplicateSong] — pattern à répliquer.
- [Source: src/utils/songDuplicate.ts] — findDuplicateSong (flag client).
- [Source: src/services/songService.ts#SongConflictError] — 409 par status.
- [Source: _bmad-output/implementation-artifacts/19-3-browse-recherche-filtres-detail.md] — CatalogList/CatalogEntry à greffer.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (bmad-dev-story)

### Debug Log References

- Front **380/380** (42 suites, +5 CatalogAddButton/empty-hook) · Back **292/292** (+3 Add) · tsc `-b` clean · front+back eslint clean.
- **Migration validée base dev** : `Songs.source_catalog_uid` UUID nullable, **0 FK** (référence souple confirmée via `pg_constraint`), idempotente down→up.

### Completion Notes List

- **Backend** : migration `add-source-catalog-uid-to-songs` (souple, aucune `references`) + champ modèle `Song.sourceCatalogUid`. `addToSonglist` (catalogcontroller) : 401/404 gardés, `buildSongFromCatalog` copie les champs intrinsèques + **deep-clone `structuredClone`** des JSON (language/genre/streamingLinks), `sourceCatalogUid`, `lastPlayed:null`, aucun champ instrument/perso ; `Song.create` ; 23505 → **409 `duplicate_song`** avec la Song existante (lookup per-user répliqué `findExistingUserSong` — songcontroller NON modifié). Route POST `authsess` seul. Routes `/api/songs` inchangées.
- **Frontend** : `catalogService.addToSonglist` (409 → `SongConflictError` réutilisé) ; `CatalogAddButton` 3 états (Add → flash ✓ Added → ✓ Already in your songlist cliquable ; 409 → Already ; erreur → revient à Add + « Couldn't add »). Hook `useSonglistMatcher` (charge `getAllSongs` une fois, `findDuplicateSong` client-side, dégrade si KO). Greffé sur `CatalogList` (cellule action, `stopPropagation`) + `CatalogEntry`. Crochet Songlist-vide dans `Songs.tsx` (DL-13).
- **a11y** : bouton frère du lien titre (jamais imbriqué), cible ≥44px (`min-h-[44px]`), état doublon = icône ✓ + texte.
- **Régression corrigée** : `SongsSidebarPersistence.test` mockait `getAllSongs:[]` → tombait sur le nouveau crochet vide → mocké avec 1 song (le test vise le sidebar, pas l'empty-state).
- **Ferme Epic 19** (rétro possible). ⚠️ migration part en prod au merge.

### File List

**NEW**
- `backend/migrations/20260715000200-add-source-catalog-uid-to-songs.js`
- `src/components/CatalogAddButton.tsx`
- `src/hooks/useSonglistMatcher.ts`
- `src/__tests__/CatalogAddButton.test.tsx`
- `src/__tests__/SongsEmptyCatalogHook.test.tsx`

**UPDATE**
- `backend/models/song.js` (+ `sourceCatalogUid`)
- `backend/controllers/catalogcontroller.js` (+ `addToSonglist`, `buildSongFromCatalog`, `findExistingUserSong`)
- `backend/routes/catalog.js` (+ route Add)
- `backend/__tests__/catalogcontroller.test.js` (+ 3 tests Add)
- `src/services/catalogService.ts` (+ `addToSonglist`)
- `src/components/CatalogList.tsx` (+ cellule action Add)
- `src/pages/Catalog.tsx` (+ matcher wiring)
- `src/pages/CatalogEntry.tsx` (+ bloc Add + matcher)
- `src/pages/Songs.tsx` (+ crochet Songlist-vide DL-13)
- `src/__tests__/SongsSidebarPersistence.test.tsx` (songlist non-vide vs nouveau empty-state)

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-07-15 | 0.1 | Story créée (ready-for-dev) — Add snapshot+provenance (migration sourceCatalogUid souple, endpoint dédié deep-clone + 409, bouton 3 états, flag doublon client-side, crochet Songlist-vide) ; ferme Epic 19 |
| 2026-07-15 | 0.2 | Implémentée : migration Songs.sourceCatalogUid (souple, 0 FK validé base dev) + Add endpoint (deep-clone structuredClone + 409 duplicate_song) + CatalogAddButton 3 états + useSonglistMatcher + crochet Songlist-vide. Front 380✓ back 292✓ tsc✓ lints✓. Status → review. |
| 2026-07-15 | 0.3 | Code review 3 couches (Acceptance 10/10 AC) → 6 patch (P1 hoist catalog anti-refetch/badge cliquable ; P2 test anti-fuite durci ; P3 garde unmount+clear timeout+anti-double-clic ; P4 404 typé non-retryable ; P5 role=status a11y ; P6 empty-state lien add-manually) + tests ; 3 dismiss. Front 381✓ back 292✓ tsc✓ lints✓. Status → done. Ferme Epic 19 (code). |

## Review Findings

_Code review 3 couches (Acceptance 10/10 AC, 1 écart a11y), 2026-07-15. 6 patch, 3 dismiss. Aucun HIGH._

- [x] [Review][Patch] [MED] Le `catch` 409 **re-fetch** la CatalogSong (le `catalog` du `try` est hors scope) → requête DB redondante, et si un delete concurrent la supprime → `song: null` → badge « Already » **non cliquable**. **Hoister `catalog`** hors du `try`, réutiliser son title/artist pour `findExistingUserSong` (pas de refetch ; `existing` retrouvé via le même folding que l'index → cliquable). `[backend/controllers/catalogcontroller.js addToSonglist]` (blind+edge)
- [x] [Review][Patch] [MED] Test « no personal-field leak » **vacant** : la fixture `CATALOG` n'a aucun champ perso → l'assertion `toBeUndefined()` passe même sur un `{...catalog}` naïf. Ajouter des champs parasites (`instrument`, `capo`, `userUid`, `lastPlayed`) à la fixture et asserter qu'ils ne fuient pas. `[backend/__tests__/catalogcontroller.test.js]` (blind)
- [x] [Review][Patch] [LOW] `CatalogAddButton` : `setTimeout` du flash **non nettoyé** + pas de garde unmount (setState après démontage) + double-clic possible (closure `saving` périmée). Ajouter `isMountedRef` + clear du timeout + `savingRef` (garde synchrone). `[src/components/CatalogAddButton.tsx]` (blind+edge)
- [x] [Review][Patch] [LOW] Add sur une fiche **supprimée entre-temps** → 404 → `Error` générique → « Couldn't add — try again » (retry re-404 en boucle). Typer le 404 (`CatalogNotFoundError`) et afficher « This song is no longer in the Catalog. » (non re-tentable). `[src/services/catalogService.ts + CatalogAddButton.tsx]` (edge)
- [x] [Review][Patch] [LOW] a11y : l'issue de l'Add (`✓ Added`, `Already`, erreur) n'est **pas annoncée** (Dev Notes exigeaient `role="status"`). Ajouter `role="status" aria-live="polite"` sur le flash + l'erreur. `[src/components/CatalogAddButton.tsx]` (auditor)
- [x] [Review][Patch] [LOW] Le crochet Songlist-vide n'offre **que** « Browse the Catalog » → un user qui veut saisir à la main n'a plus de point d'entrée depuis l'empty-state. Ajouter un lien secondaire « or add a song manually » → `/songs/new`. `[src/pages/Songs.tsx]` (blind)

**Dismiss :**
- ❌ `findDuplicateSong` (client) plus strict que l'index DB (collapse whitespace + NFC) → montre « Already » sur variantes whitespace/encodage. **Voulu** : c'est la règle canonique « même chanson » de l'app (Epic 17), qui attrape les quasi-doublons (FR-6) ; le serveur 409 couvre l'autre sens. Pas un bug.
- ❌ `useSonglistMatcher` re-fetch toute la Songlist par montage — conforme à la décision archi (flag client-side contre la Songlist perso, petite). Un endpoint does-exist = optim future, hors scope.
- ❌ `structuredClone` Node<17 / import circulaire — Node 22 garanti (project-context), aucun cycle actuel.