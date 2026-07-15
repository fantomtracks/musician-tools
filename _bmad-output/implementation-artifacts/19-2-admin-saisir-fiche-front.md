<!-- Story créée 2026-07-15 via bmad-create-story ; Epic 19 (Catalog — Browse & Add) ; source epics.md § Epic 19 story 19.2 + architecture-catalog-2026-07-12.md + ux-musician-tools-2026-07-12 (DL-14, DL-17) -->

# Story 19.2: Écran d'administration — saisir une fiche (front)

Status: ready-for-dev

## Story

En tant que **curateur** (`isCurator`),
je veux un écran d'administration pour saisir une fiche Catalog avec auto-fill,
afin d'enrichir le Catalog sans toucher à la base (UJ-3).

## Contexte & pourquoi

Le **backend Catalog est déjà en place** (story 19.1 done) : modèle `CatalogSong`, `POST/PUT/DELETE /api/catalog` gardés par `requireCurator` (403), colonne `Users.isCurator`, 409 `duplicate_catalog_entry`. Cette story livre la **surface front de curation** : une page `/catalog/admin` réservée aux curateurs pour **créer** une fiche.

⚠️ **Prérequis découvert au cadrage — `isCurator` n'est exposé NULLE PART côté client.** Le front s'hydrate depuis `localStorage` (`authService.getStoredUser`, pas de `/me` au boot). Le type `User` (front) et les payloads d'auth backend exposent `isAdmin` mais **pas `isCurator`**. Il faut donc, dans cette story :
1. Backend : ajouter `isCurator: user.isCurator` aux réponses user d'auth (`usercontroller` login + verify-auto-login + register, `accountcontroller` profile GET).
2. Front : ajouter `isCurator?: boolean` au type `User` (`authService.ts`) → il transite ensuite automatiquement via `storeUser`/`AuthProvider`/`useAuth` (câblage identique à `isAdmin`).
- **Caveat de déploiement** : les users déjà connectés ont un `user` en `localStorage` **sans** `isCurator` → l'entrée admin n'apparaîtra qu'après une **reconnexion** (ou un refresh du profil). Acceptable en v1 (le seul curateur = northwood, se reconnectera). À mentionner dans la note de release.

⚠️ **`SongForm.tsx` N'EST PAS réutilisable tel quel** : il mélange champs intrinsèques et perso, son API `props` est lourde (~24 callbacks) et il n'a pas de bouton Save (auto-save débounce piloté par `Songs.tsx`). On **calque le markup** des champs intrinsèques dans un formulaire propre (état local + submit explicite), pas de réutilisation directe.

## Décisions verrouillées (architecture + UX)

- **Champs intrinsèques SEULEMENT** (DL-17) : `title` (requis), `artist`, `album`, `key`, `bpm`, `mode`, `timeSignature`, `durationSeconds`, `language`, `genre`, `streamingLinks`, `pitchStandard`. **JAMAIS** de instrument/difficulté/accordage/capo/technique/instrumentLinks/notes.
- **Auto-fill** : réutiliser `songService.lookupMetadata` (`GET /api/songs/lookup`) — **pas** de nouvel endpoint. Merge **non destructif** (ne jamais écraser une saisie).
- **Gate curateur** : route `/catalog/admin` sous `RequireAuth` (data-router Epic 18) + garde de rôle dans le composant (`<Navigate to="/" replace>` si `!user?.isCurator`). Entrée « Curate » dans le **dropdown compte** du Header, visible seulement si `isCurator` (DL-4).
- **409 typé** : lu par `response.status === 409` (jamais par le texte), body `{ error:'duplicate_catalog_entry', message, entry }` → classe `CatalogConflictError` calquée sur `SongConflictError` (attention : la clé est **`entry`**, pas `song`).
- **Scope = CRÉATION.** L'édition in-place d'une fiche existante (FR-11) a besoin d'une liste/recherche de fiches → arrive avec le browse (19-3). Le formulaire est construit pour **supporter un mode edit ultérieur** (accepter une fiche initiale optionnelle) mais 19-2 ne câble que la création.

## Acceptance Criteria

1. **`isCurator` exposé de bout en bout** : le backend renvoie `isCurator` dans les payloads user d'auth (login, verify-auto-login, register, profile GET) ; le type `User` front porte `isCurator?: boolean` ; `useAuth().user?.isCurator` est disponible. Aucune régression sur `isAdmin`/le reste du payload.
2. **Entrée « Curate » conditionnelle** : dans le dropdown compte du Header (desktop **et** section compte mobile), un lien `Curate` → `/catalog/admin` apparaît **si et seulement si** `user?.isCurator === true`. Absent pour un non-curateur.
3. **Route role-gated** : `/catalog/admin` sous `RequireAuth` ; un utilisateur **non-curateur** qui atteint l'URL est redirigé (`<Navigate to="/" replace>`), pas de rendu du form. Un curateur voit le form.
4. **Formulaire intrinsèque** : le form rend UNIQUEMENT les champs intrinsèques (DL-17) — aucun champ instrument/perso. `title` est requis (submit désactivé/refusé si vide).
5. **Auto-fill non destructif** : un bouton « Auto-fill metadata & links » (désactivé si `!title || !artist`) appelle `songService.lookupMetadata` et pré-remplit bpm/key/mode/timeSignature/album/durationSeconds/genre/streamingLinks **sans écraser** une valeur déjà saisie (merge type `prev.x ?? meta.x` / `prev.x || meta.x`).
6. **Création** : submit → `catalogService.createCatalogEntry(payload)` → `POST /api/catalog` ; succès → toast « Catalog entry created » + reset (ou vidage) du form.
7. **409 inline** : si la clé canonique existe déjà, le 409 est capté (`CatalogConflictError`) et affiché **inline** « A "{title}" by {artist} is already in the Catalog. » — pas d'erreur rouge générique, pas de crash.
8. **Design system** : réutilise `input-base`/`label-base`/`btn-primary`/`btn-secondary`, grilles `grid-cols-1 sm:grid-cols-3`, dark mode ; UI **en anglais** ; posture utilitaire (DL-14). tsc strict + lint clean.
9. **Tests front** : rendu curateur (form visible), non-curateur (redirigé), submit → create appelé, 409 → message inline, auto-fill n'écrase pas une saisie. Suite front verte.

## Tasks / Subtasks

### Task 1 — Exposer `isCurator` de bout en bout (AC 1)
- [ ] Backend : ajouter `isCurator: user.isCurator` aux réponses user de `backend/controllers/usercontroller.js` (login ~L.189, verify-auto-login ~L.262, register si applicable) et `backend/controllers/accountcontroller.js` (profile GET ~L.34). **Additif** — ne toucher à aucun autre champ.
- [ ] Front : ajouter `isCurator?: boolean;` au type `User` dans `src/services/authService.ts` (~L.4-16). Aucun autre câblage (transite via `storeUser`/`AuthProvider`/`useAuth` comme `isAdmin`).
- [ ] Tests backend : vérifier que login/profile renvoient `isCurator` (étendre les tests existants `usercontroller`/`accountcontroller` sans casser l'existant).

### Task 2 — `catalogService.ts` (AC 6, 7)
- [ ] `src/services/catalogService.ts` (nouveau), calqué sur `songService` : `apiFetch`, `credentials:'include'`, `API_BASE='/api'`.
  - [ ] Types : `CatalogSong` (uid + champs intrinsèques + timestamps) et `CreateCatalogDTO` (champs intrinsèques, sans uid). Réutiliser `type StreamingLink = { label: string; url: string }` (forme existante).
  - [ ] `class CatalogConflictError extends Error { existingEntry?: CatalogSong }` (calque `SongConflictError`).
  - [ ] `createCatalogEntry(dto) → POST /api/catalog` : 201 → json ; **409 → throw `CatalogConflictError(body.entry)`** (lu par `response.status`, body clé `entry`).
  - [ ] `updateCatalogEntry(uid, dto) → PUT /api/catalog/:uid` (pour le mode edit futur ; même bloc 409).
  - [ ] `import type` pour les types (règle `verbatimModuleSyntax`).

### Task 3 — Page `CatalogAdmin.tsx` — formulaire de création (AC 3, 4, 5, 6, 7, 8)
- [ ] `src/pages/CatalogAdmin.tsx` (nouveau).
  - [ ] **Garde de rôle** : `const { user } = useAuth(); if (!user?.isCurator) return <Navigate to="/" replace />;`.
  - [ ] État local `form: CreateCatalogDTO` (champs intrinsèques, defaults ; `pitchStandard` défaut 440).
  - [ ] Markup calqué sur les champs intrinsèques de `SongForm` (cf Dev Notes pour les lignes exactes) mais avec `input-base`/`label-base` : title (required), artist, album, genre (multi + chips), language (multi + chips), grille [durationSeconds (m:ss), bpm, timeSignature], grille [key, mode, pitchStandard], streamingLinks (chips). **Aucun champ instrument/perso.**
  - [ ] Bouton **Auto-fill** (`btn-secondary`, désactivé si `!form.title || !form.artist`) → `songService.lookupMetadata(title, artist)` + merge non destructif (copier la mécanique de `Songs.handleLookupMetadata`, cf Dev Notes) ; ligne d'état source ; toast si rien trouvé.
  - [ ] Submit (`btn-primary` « Save », désactivé si `!title`) → `catalogService.createCatalogEntry(form)` → toast succès + reset ; `catch (CatalogConflictError)` → message inline. Bouton `btn-secondary` « Cancel » (reset/retour).
  - [ ] Toasts : pattern `setToastMessage` + `setTimeout(2500)` (pas de lib). Dark mode partout.

### Task 4 — Route + entrée Header (AC 2, 3)
- [ ] `src/router.tsx` : importer `CatalogAdmin` ; ajouter `{ path: 'catalog/admin', element: <CatalogAdmin /> }` dans les `children` de `<RequireAuth />` (à côté de `profile`). Garder le catch-all en dernier.
- [ ] `src/components/Header.tsx` : ajouter `user` au `useAuth()` ; insérer `{user?.isCurator && <Link to="/catalog/admin" ...>Curate</Link>}` dans le dropdown compte **desktop** (~L.164-171, classes du Link Profile) **et** la section compte **mobile** (~L.205-211). `onClick` ferme le menu.

### Task 5 — Tests front (AC 9)
- [ ] `src/__tests__/CatalogAdmin.test.tsx` (gabarit `ProfilePage.test.tsx` + `MemoryRouter`) : mock `useAuth` (curateur), mock `catalogService`/`songService` :
  - curateur → form rendu ; non-curateur → `Navigate` (pas de form).
  - submit → `createCatalogEntry` appelé avec le payload ; succès → toast.
  - `createCatalogEntry` rejette `CatalogConflictError` → message inline (pas de throw non catché).
  - auto-fill : `lookupMetadata` renvoie bpm/key ; une valeur déjà saisie n'est PAS écrasée.
- [ ] (option) étendre `Header.test.tsx` : entrée Curate visible curateur / absente non-curateur.

## Dev Notes

### Carte d'implémentation (fichiers, lignes, patterns — lus au cadrage)

**Auth / rôle (`isCurator`)**
- Type `User` : `src/services/authService.ts` L.4-16 (a `isAdmin`, ajouter `isCurator?`). Hydratation `localStorage` via `getStoredUser`/`storeUser` L.138-146, réhydraté au boot par `AuthProvider` L.10-16 (PAS de `/me`).
- Payloads backend à enrichir : `usercontroller.js` login L.181-190 (`isAdmin` L.189), verify-auto-login L.253-262 (`isAdmin` L.262) ; `accountcontroller.js` profile GET L.26-35 (`isAdmin` L.34).
- Circuit : `useAuth().user.isCurator` une fois le type étendu + payload émis (aucun autre câblage).

**Formulaire (calquer, NE PAS réutiliser SongForm)**
- `src/components/SongForm.tsx` — champs intrinsèques et leurs lignes : artist L.246-338, title L.340-351 (required), genre L.396-460 (`genreOptions` L.50-86), album L.461-557, language L.558-622 (`languageOptions` L.88-104), grille [durationSeconds L.624-665 (input m:ss), bpm L.666-678, timeSignature L.679-694 (`timeSignatureOptions` L.48)] L.623, grille [key (`keyOptions` L.47), mode (`modeOptions` L.49), pitchStandard L.729-742 (number 400-500, défaut 440)] L.696, streamingLinks chips L.212-244.
- Utilitaires CSS : `src/index.css` — `.input-base` L.78, `.label-base` L.82, `.btn-primary` L.66, `.btn-secondary` L.70, `.card-base` L.62. (SongForm inline ses classes ; préférer les utilitaires ici.)
- Champs à EXCLURE (instrument/perso) : rendus par `<SongFormInstruments>` L.749-802, `notes` L.807-818, `instrumentLinks` L.152/189-211.

**Auto-fill (merge non destructif)**
- Mécanique de référence : `src/pages/Songs.tsx` `handleLookupMetadata` L.1591-1663. Merge L.1645-1655 : `bpm: prev.bpm ?? meta.bpm`, `key/mode/timeSignature/album: prev.x || meta.x || ''`, `durationSeconds: prev.durationSeconds ?? meta.durationSeconds`, `genre` gardé si non vide, `streamingLinks` fusion dédupliquée par URL.
- `songService.lookupMetadata` : `src/services/songService.ts` L.121-139 → `{ bpm, key, mode, timeSignature, genres[], album, durationSeconds, source }`.

**Service (409 par status)**
- `songService.createSong` L.71-88 : bloc 409 L.80-83 (`throw new SongConflictError(body.song)`). `SongConflictError` L.36-43. Détection par `response.status`, jamais par le texte (commentaire L.34-35). Le backend Catalog renvoie `{ error:'duplicate_catalog_entry', message, entry }` (`backend/controllers/catalogcontroller.js` L.68-72) — clé **`entry`**.

**Routing / Header**
- `src/router.tsx` : `createBrowserRouter` L.65-67 ; groupe `<RequireAuth/>` children L.34-47 (ajouter la route ici) ; catch-all L.60. `createMemoryRouter` évité en jsdom (commentaire L.22-26) → tests via `<MemoryRouter>`.
- `src/components/RequireAuth.tsx` L.8-11 : pattern de garde (n'a pas de gate rôle → gate curateur dans le composant).
- `src/components/Header.tsx` : `useAuth()` L.18 (ajouter `user`) ; dropdown desktop `role="menu"` L.159-181 (Profile L.164-171) ; section compte mobile L.204-219.

**Tests**
- Gabarit page protégée + mock auth/service : `src/__tests__/ProfilePage.test.tsx` (mock `useAuth` L.6/16, mock service L.7-14, user mocké L.28). Rendu router : `src/__tests__/Header.test.tsx` (`MemoryRouter` + mock `useAuth`).

### Conventions (cf. project-context.md)
- TS strict + `verbatimModuleSyntax` : **`import type`** pour tous les imports de types (sinon build cassé) ; `noUnusedLocals/Parameters`. Imports relatifs (pas d'alias).
- Services : un `xxxService` par domaine, `fetch`/`apiFetch`, `credentials:'include'`, erreurs `if (!res.ok) throw`. Composants PascalCase dans `src/pages`/`src/components`.
- Tailwind only, thème `brand/primary/accent/secondary`, dark mode `dark:` sur chaque élément stylé. Toasts manuels `setToastMessage`+`setTimeout(2500)`. UI EN.
- Tests front dans `src/__tests__/`, Testing Library (comportement visible). Le hook pre-commit lance front + back — commit vert obligatoire.

### Interim 19.2 → suite
- **19-3** (browse) ajoute la liste paginée + détail ; l'**édition** d'une fiche existante s'y branchera (le form de 19-2 est prévu pour un mode edit : `updateCatalogEntry` déjà exposé au service).
- Le crochet Songlist-vide et l'Add arrivent en 19-4 (indépendants de 19-2).

### Project Structure Notes
- NEW : `src/services/catalogService.ts`, `src/pages/CatalogAdmin.tsx`, `src/__tests__/CatalogAdmin.test.tsx`.
- UPDATE : `src/services/authService.ts` (type `User` + `isCurator`), `src/router.tsx` (route), `src/components/Header.tsx` (entrée Curate), `backend/controllers/usercontroller.js` + `backend/controllers/accountcontroller.js` (émettre `isCurator`), tests backend auth (assertion `isCurator`).

### References
- [Source: epics.md#Story 19.2] — user story + acceptance criteria.
- [Source: architecture-catalog-2026-07-12.md#Frontend Architecture] — catalogService séparé, type CatalogSong distinct, guard requireCurator front, réutilisation design system.
- [Source: ux-designs/ux-musician-tools-2026-07-12/DESIGN.md#Curator admin] + EXPERIENCE.md (DL-14 utilitaire, DL-17 champs intrinsèques, DL-4 entrée dropdown compte).
- [Source: _bmad-output/implementation-artifacts/19-1-fondation-catalog-curateur-fiches.md] — backend Catalog (endpoints, 409 `duplicate_catalog_entry`, `isCurator`).
- [Source: src/pages/Songs.tsx#handleLookupMetadata] — merge auto-fill non destructif à calquer.
- [Source: src/services/songService.ts#SongConflictError] — pattern 409 par status à calquer.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-07-15 | 0.1 | Story créée (ready-for-dev) — écran admin curateur (création de fiche), + exposition isCurator bout-en-bout |
