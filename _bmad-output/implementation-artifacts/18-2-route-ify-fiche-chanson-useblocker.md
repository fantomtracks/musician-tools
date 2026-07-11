---
baseline_commit: b1db853
arch_decision: "Route-ify la fiche chanson : /songs (liste) · /songs/new (add) · /songs/:uid (edit). editingUid + mode DÉRIVÉS de l'URL (useParams) au lieu de useState page/editingUid. Auto-création → navigate('/songs/:uid', {replace}) (bascule invisible). SUPPRIMER le guard maison 17.2 (LeaveGuardContext.ts + LeaveGuardProvider.tsx supprimés ; App sans LeaveGuardProvider ; Header GuardedLink→Link ; SessionHistoryCard state.editUid → /songs/:uid) → REMPLACER par useBlocker (dispo depuis 18.1 data-router), en réutilisant isFreshSong/deleteEditingSong/ConfirmDialog/beforeunload de 17.2. 404 scopé deep-link (invariant 7.5). ⚠️ Révise du code shippé (guard 17.2, prod v1.13.0) : préserver l'UX validée QA 17.2. Prérequis : 18.1 (data-router) commité d'abord. Cadré ADR architecture-song-route-2026-07-11.md."
---

# Story 18.2: Route-ify la fiche chanson + remplacer le guard maison par `useBlocker`

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui édite une chanson,
I want que l'URL reflète la chanson ouverte (`/songs/:uid`),
so that rafraîchir reste sur la chanson, le bouton back du navigateur soit géré, et l'app n'ait plus de guard de navigation maison à maintenir.

## Contexte & pourquoi

**S'appuie sur 18.1** (data-router en place → `useBlocker` disponible). Ferme les 3 symptômes de l'Epic 18 : **refresh sur une chanson → reste sur la chanson**, **back-button navigateur gardé**, **suppression du guard maison 17.2** (dette nette réduite).

**⚠️ Révise du code shippé (guard 17.2, prod v1.13.0) :** le remplacement par `useBlocker` doit **préserver l'UX validée en QA 17.2** — popup titre-vide (fresh → DELETE silencieux ; à valeur → « Delete / Continue editing »), symétrie du blocage doublon, auto-save 13.1. Seuls le **transport** (état local → URL) et le **mécanisme du guard** (maison → `useBlocker`) changent.

**⚠️ Prérequis git :** commiter **18.1** sur la branche `feat/epic-18-song-route` **avant** de démarrer 18.2 (sinon le diff 18.2 embarque la migration data-router). Même branche.

## Carte du code actuel (post-17.2 + 18.1 — surfaces à réécrire)

### `src/pages/Songs.tsx` — l'état `page`/`editingUid` et le guard maison
- `const [editingUid, setEditingUid] = useState<string | null>(null)` (`:48`) et `const [page, setPage] = useState<'list' | 'form'>('list')` (`:75`) → **à dériver de l'URL**.
- `const navigate = useNavigate()` (`:275`) déjà là ; `const { registerLeaveGuard } = useLeaveGuard()` (`:276`) → **à supprimer**.
- **Guard maison 17.2 à SUPPRIMER** : `import { useLeaveGuard }` (`:15`), `registerLeaveGuard` (`:276,1034-1036`), `attemptLeave`/`attemptLeaveRef` (`:1014,1031-1032`), `formActiveRef` (`:836`), `pendingLeaveRef` (`:1013`).
- **À CONSERVER (réutilisés par `useBlocker`)** : `isFreshSong` (`:984`), `deleteEditingSong` (`:998`), `emptyTitleDialogOpen` + le `ConfirmDialog` titre-vide (`:93,1787-1804`), l'effet `beforeunload` (`:1039-1044`).
- **Transitions** (toutes à convertir en `navigate`) :
  - `onAddNew` (`:1924-1936`) : `setEditingUid(null); setPage('form'); …` → **`navigate('/songs/new')`**.
  - `openSongForEdit` (`:1380-1400`) : `setEditingUid(song.uid); setPage('form'); …` → **`navigate('/songs/' + song.uid)`**.
  - **auto-création** dans `autoSaveSong` (`:883-889`) : aujourd'hui `if (!formActiveRef.current) return; setEditingUid(created.uid)` → **`navigate('/songs/' + created.uid, { replace: true })`** (bascule invisible, zéro spam d'historique). ⚠️ garder la garde anti-race (cf. « pièges »).
  - `backToList` (`:1050-1058`) / `returnToList` (`:970-978`) : `setPage('list'); setEditingUid(null); …` → **`navigate('/songs')`**.
- **Effets à retirer** (remplacés par l'URL) : `resetToList` (`:353-365`) et `editUid` session-history (`:1407-1416`) — voir cross-file.
- **Render** : `{page === 'list' ? <SongsList .../> : <form…>}` (`:1825`) → piloté par l'URL (liste si `/songs`, form sinon).
- **Effet reload liste** `[page]` (`:588`) et **effet load-editing** `[editingUid, playlists]` (`:700-734`, plays + seed playlists) → re-câbler sur les valeurs dérivées de l'URL.

### Cross-file
- `src/components/Header.tsx` : `GuardedLink` → `<Link>` (revert 17.2) ; **retirer `state: { resetToList: true }`** du lien Songlist (`:11`) — naviguer vers `/songs` montre la liste, la mécanique `resetToList` disparaît. `useLeaveGuard`/`attemptLeave` retirés (logout redevient un `handleLogout` direct).
- `src/components/SessionHistoryCard.tsx:20-22` : `<Link to="/songs" state={{ editUid: item.songUid }}>` → **`<Link to={`/songs/${item.songUid}`}>`** (plus de state, l'URL ouvre l'édition).
- `src/App.tsx` : `RootLayout` **retire `<LeaveGuardProvider>`** (le guard maison n'existe plus).
- **SUPPRIMER** : `src/contexts/LeaveGuardContext.ts`, `src/contexts/LeaveGuardProvider.tsx`.
- `src/router.tsx` : sous `RequireAuth`, ajouter `{ path: 'songs/new', element: <Songs /> }` et `{ path: 'songs/:uid', element: <Songs /> }` (à côté de `songs`). Les 3 rendent `<Songs/>` ; `Songs` lit `useParams`.

### `useBlocker` (react-router 6.28, dispo depuis 18.1)
- `const blocker = useBlocker(({ currentLocation, nextLocation }) => shouldBlockLeave(...))`.
- Bloque quand : on quitte le form (`nextLocation` ≠ la route du form courant) **et** `editingUid !== null` **et** titre trimmé vide. Sinon `false` (laisse passer).
- `blocker.state === 'blocked'` → réutiliser la logique 17.2 : `isFreshSong()` → `deleteEditingSong()` puis `blocker.proceed()` ; sinon ouvrir le `ConfirmDialog` (Delete → `deleteEditingSong()` + `blocker.proceed()` ; Continue editing → `blocker.reset()`).
- Couvre **Back navigateur / popstate** (ce que le guard maison ne faisait pas).

## Acceptance Criteria

**Given** les routes `/songs` / `/songs/new` / `/songs/:uid` (volet **route-ify**)
**When** on navigue
**Then** `editingUid` et le mode sont **dérivés de l'URL** (`useParams`) et non plus de `useState` : `/songs` → liste ; `/songs/new` → add (`editingUid = null`, form vierge) ; `/songs/:uid` → édition (chanson chargée depuis `songs` en mémoire, sinon `getSong(uid)`) ; **refresh sur `/songs/:uid` reste sur la chanson** ; toute la machinerie 13.1/17.2 (auto-save débounce, verrou in-flight `savingRef`, `editBaselineJson`, blocage doublon symétrique, Seuil 1) est **conservée** — seul le transport (état local → URL) change ; `onAddNew` → `navigate('/songs/new')` ; ouvrir une chanson (liste, `SessionHistoryCard`) → `navigate('/songs/:uid')`

**Given** l'auto-création sur `/songs/new` (volet **bascule invisible**)
**When** la chanson naît au débounce
**Then** `navigate('/songs/' + newUid, { replace: true })` bascule vers l'édition — **zéro rechargement**, **zéro entrée d'historique** (le `replace` remplace `/songs/new`) ; ⚠️ si l'utilisateur a déjà quitté `/songs/new` avant que le CREATE résolve, **ne PAS le rapatrier de force** sur `/songs/:uid` (préserver le fix HIGH 17.2 « quitter en vol = garder la chanson mais ne pas ré-armer l'édition ») — garder la chanson dans `songs`, ne naviguer que si on est encore sur `/songs/new` ; le verrou in-flight `savingRef` prévient toujours la double-création

**Given** un titre vidé sur une chanson à valeur (volet **guard → `useBlocker`**)
**When** l'utilisateur tente de quitter — **y compris Back navigateur / popstate, liens header, logo, logout**
**Then** un **`useBlocker`** intercepte : `isFreshSong()` → **DELETE silencieux** + `blocker.proceed()` ; sinon **popup** « This song has no title » (Delete → `deleteEditingSong` + `blocker.proceed()` ; Continue editing → `blocker.reset()`) ; le **guard maison 17.2 est SUPPRIMÉ** — `LeaveGuardContext.ts` + `LeaveGuardProvider.tsx` **supprimés**, `App` sans `LeaveGuardProvider`, `Header` en `<Link>` simples (sans `resetToList`), `SessionHistoryCard` en `/songs/:uid` ; `beforeunload` (refresh/fermeture) **conservé** ; l'UX (popup, fresh-delete, symétrie doublon) **identique à 17.2**

**Given** un deep-link `/songs/:uid` inconnu ou appartenant à un autre user (volet **404 scopé**)
**When** la page charge la chanson
**Then** `getSong(uid)` renvoie **404 scopé** (invariant 7.5 : « pas à toi » indistinguable de « n'existe pas ») → écran **« Song not found »** + lien retour `/songs` ; aucun oracle d'existence

**And** ⚠️ **révise le guard 17.2 (prod v1.13.0)** — comportement préservé, validé par la QA nav app-wide (comme 17.2, cf. checklist QA 17.2 encore valable : bascule, popup, back-button en plus) ; UI/messages en anglais ; suites vertes (tests routing `/songs/new` + `/songs/:uid`, deep-link 404, `useBlocker` popup fresh vs à-valeur, auto-création `navigate(replace)`, back-button) ; tsc + lint clean ; mettre à jour `deferred-work.md` (les 2 defer nav de 17.2 → **fermés** ; l'item « fiche chanson = route » → livré). `[src/pages/Songs.tsx, src/router.tsx, src/App.tsx, src/components/Header.tsx, src/components/SessionHistoryCard.tsx, DELETE src/contexts/LeaveGuardContext.ts + LeaveGuardProvider.tsx]`

## Tasks / Subtasks

### Task 1 — Routes `/songs/new` + `/songs/:uid` (AC route-ify)
- [x] `src/router.tsx` : sous `RequireAuth`, ajouter `{ path: 'songs/new', element: <Songs /> }` et `{ path: 'songs/:uid', element: <Songs /> }` (après `{ path: 'songs' }`). Étendre `router.test.tsx` (les 3 chemins résolvent `<Songs/>` stubbé, gardés par RequireAuth).

### Task 2 — `Songs.tsx` : mode dérivé de l'URL (AC route-ify)
- [x] `useParams()` : `editingUid = params.uid ?? null` ; mode form si pathname = `/songs/new` OU param `:uid` présent ; liste si `/songs` nu. Remplacer `const [editingUid…]`/`const [page…]` (états supprimés) par ces valeurs dérivées.
- [x] Charger la chanson éditée : depuis `songs` si présente, sinon `getSong(uid)` → sur 404, état **« Song not found »** (+ lien `/songs`). Re-câbler l'effet load-editing (`plays` + seed playlists) et l'effet reload liste sur ces valeurs.
- [x] Convertir **toutes** les transitions en `navigate` : `onAddNew`→`/songs/new` ; `openSongForEdit`→`/songs/:uid` ; auto-création→`navigate('/songs/:uid',{replace})` (garde anti-race, cf. AC bascule) ; `backToList`→`/songs`.
- [x] Retirer les effets `resetToList` (`:353-365`) et `editUid` session-history (`:1407-1416`).

### Task 3 — Supprimer le guard maison 17.2 (AC guard)
- [x] `Songs.tsx` : retirer `useLeaveGuard`/`registerLeaveGuard`/`attemptLeave`/`attemptLeaveRef`/`formActiveRef`/`pendingLeaveRef` (garder `isFreshSong`/`deleteEditingSong`/`ConfirmDialog`/`beforeunload`).
- [x] **SUPPRIMER** `src/contexts/LeaveGuardContext.ts` + `src/contexts/LeaveGuardProvider.tsx`.
- [x] `src/App.tsx` : `RootLayout` retire `<LeaveGuardProvider>`.
- [x] `src/components/Header.tsx` : `GuardedLink` → `<Link>` (imports react-router), retirer `state: { resetToList }` du lien Songlist, retirer `useLeaveGuard`/`attemptLeave` (logout = `handleLogout` direct).
- [x] `src/components/SessionHistoryCard.tsx` : `to="/songs" state={{editUid}}` → `to={`/songs/${item.songUid}`}`.

### Task 4 — `useBlocker` (AC guard)
- [x] Dans `Songs.tsx` (form) : `useBlocker` qui bloque si on quitte le form avec `editingUid` set + titre vide ; `blocked` → `isFreshSong` ? delete + `proceed` : popup (Delete → delete + `proceed` ; Continue → `reset`). Couvre le back-button.
- [x] `beforeunload` conservé (refresh/fermeture — hors périmètre `useBlocker`).

### Task 5 — Tests (AC And)
- [x] Adapter `src/__tests__/SongsAutoSave.test.tsx` : les tests rendent `<Songs/>` dans `<MemoryRouter>` et cliquent « Add a song »/lignes → passer par les routes (`initialEntries` + un `<Routes>` incluant `/songs`, `/songs/new`, `/songs/:uid` → `<Songs/>`), et les assertions de bascule/pop via l'URL. Conserver la couverture (débounce-create, in-flight, Seuil 1, 409 create+edit, back).
- [x] Adapter `Header.test.tsx` (GuardedLink → Link) ; étendre `router.test.tsx` (`/songs/new`, `/songs/:uid`) ; nouveaux tests : deep-link `/songs/:uid` 404 → « Song not found » ; `useBlocker` popup.
- [x] `npm test` (front) + `cd backend && npm test` verts ; tsc + lint clean.
- [x] **QA manuelle** (checklist QA 17.2 encore valable + le nouveau) : refresh sur une chanson (reste) ; **back-button** sur draft titre-vide à valeur (popup) ; bascule add→edit (URL passe `/songs/new`→`/songs/:uid`, invisible) ; deep-link `/songs/<uid inconnu>` → Song not found ; tous les liens header/logo/logout OK.

### Task 6 — Doc (AC And)
- [x] `deferred-work.md` : item « fiche chanson = vraie route » → **LIVRÉ (Epic 18)** ; les 2 defer nav de 17.2 (back-button, beforeunload draft) → **fermés**. `CHANGELOG.md [Unreleased]` : entrée user-facing (refresh reste sur la chanson + back-button).

## Dev Notes

### Pièges (à NE PAS répéter / à préserver)
- **HIGH 17.2 « quitter en vol = garder » — désormais en forme URL** : à l'auto-création, si l'utilisateur a quitté `/songs/new` avant que le CREATE résolve, ne PAS `navigate('/songs/:uid')` de force (ça le rapatrierait). Garder la chanson dans `songs`, ne naviguer que si `location.pathname === '/songs/new'` au moment de la résolution. Équivalent du `formActiveRef` de 17.2 en version URL.
- **`useBlocker` un seul par app** : react-router n'autorise qu'un `useBlocker` actif ; il vit dans le composant de la route form (Songs). Vérifier qu'il ne bloque pas les navigations INTERNES légitimes (ex. `/songs/new` → `/songs/:uid` de la bascule invisible : le titre n'est pas vide à ce moment → pas bloqué).
- **StrictMode double-invoke** + `useBlocker` : vérifier pas de double-popup / double-navigation.
- **17.2 mocké dans les tests** : `SongsAutoSave.test.tsx` mocke `../services/songService` (spread requireActual pour `SongConflictError`). Les tests rendent `<Songs/>` — désormais via un `<MemoryRouter initialEntries>` + `<Routes>`.
- **Reseed-clobber 10.2 / load-editing** : l'effet `[editingUid, playlists]` (seed playlists once-per-edit via `seededPlaylistsForEditRef`) doit rester correct quand `editingUid` vient de l'URL (param change = nouvelle session d'édition).

### Conventions (project-context.md)
- `import type` ; pas de variable morte (`noUnusedLocals` — attention aux imports du guard retirés) ; imports relatifs ; Tailwind only ; toasts manuels + `ConfirmDialog` (pas de lib) ; **tout en anglais**.
- Pas de nouvelle dépendance (`useParams`/`useBlocker`/`useNavigate` déjà dans `react-router-dom@6.28`).

### Garde-fous workflow
- **Jamais sur `main`** : branche `feat/epic-18-song-route` (partagée avec 18.1). ⚠️ **Commiter 18.1 d'abord.** Merge `main` = prod ; northwood merge à la main. Front-only, **pas de migration DB**.
- Hook pre-commit lance front + back — **jamais `--no-verify`**. Commits Conventional (`feat(songs): ...`, `refactor(routing): ...`).

### Project Structure Notes
- **EDIT** : `src/router.tsx`, `src/pages/Songs.tsx` (le gros), `src/App.tsx`, `src/components/Header.tsx`, `src/components/SessionHistoryCard.tsx`.
- **DELETE** : `src/contexts/LeaveGuardContext.ts`, `src/contexts/LeaveGuardProvider.tsx`.
- **Tests** : `SongsAutoSave.test.tsx` (adapté routes), `Header.test.tsx` (Link), `router.test.tsx` (étendu), nouveaux (deep-link 404, useBlocker).
- **Pas de backend, pas de migration, pas de dépendance npm.**

### References
- [Source: _bmad-output/planning-artifacts/architecture-song-route-2026-07-11.md] — ADR (routes, useBlocker remplace le guard, 404 scopé, RequireAuth)
- [Source: _bmad-output/implementation-artifacts/18-1-migration-data-router.md] — data-router en place (prérequis) ; `routes` dans `src/router.tsx`
- [Source: _bmad-output/implementation-artifacts/17-2-auto-creation-front-blocage-doublon.md] — guard maison + isFreshSong/deleteEditingSong/ConfirmDialog/beforeunload à réutiliser ; le HIGH « quitter en vol » à préserver ; la checklist QA
- [Source: src/pages/Songs.tsx:15,48,75,276,353-365,700-734,836,883-889,970-978,984-1044,1050-1058,1380-1416,1787-1804,1825,1924-1936] — surfaces page/editingUid/guard/nav/render
- [Source: src/components/Header.tsx:10-11] — lien Songlist `state.resetToList` + GuardedLink à revert
- [Source: src/components/SessionHistoryCard.tsx:20-22] — `state.editUid` → `/songs/:uid`
- [Source: src/router.tsx] — arbre de routes 18.1 (ajouter songs/new + songs/:uid)
- [Source: react-router-dom@6.28] — `useParams`, `useBlocker` (data-router), `useNavigate`
- [Source: _bmad-output/project-context.md] — conventions front, pattern contrôleur 7.5 (404 scopé)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

- `useBlocker must be used within a data router` → les tests Songs (qui ont besoin de `useBlocker`) doivent monter via `createMemoryRouter`/`RouterProvider`, pas `<MemoryRouter>`. Résolu par un helper partagé `src/test/renderSongs.tsx`.
- `ReferenceError: Request is not defined` puis `Expected signal to be an instance of AbortSignal` → `createMemoryRouter` a besoin des primitives Fetch (Request/Response/Headers/AbortController/AbortSignal) absentes du global jsdom. Résolu **zéro-dépendance** par un environnement jest custom (`jest.jsdom.env.cjs`) qui bridge **toute** la famille fetch depuis le realm Node (une seule source, sinon l'`instanceof` AbortSignal casse).
- `@typescript-eslint/no-require-imports` (husky pre-commit) sur `router.test.tsx` → `jest.requireActual('react-router-dom')` au lieu de `require(...)` dans la factory `jest.mock`.
- Deep-link 404 clignotant : l'effet build-form se re-déclenchait quand `songs` chargeait → 2ᵉ `getSong` (non mocké) qui remettait `notFound` à false. Résolu en marquant `loadedFormUidRef.current = editingUid` **avant** le fetch (effet idempotent par uid).

### Completion Notes List

- **Mode dérivé de l'URL** : `editingUid = params.uid ?? null` ; `page = (editingUid !== null || pathname === '/songs/new') ? 'form' : 'list'`. Les `useState` `page`/`editingUid` sont supprimés. `loadedFormUidRef` évite qu'une bascule invisible add→edit (ou un changement de `songs`) ne réécrase le form vivant.
- **Bascule invisible préservée** : auto-création → `navigate('/songs/'+uid, {replace:true})` uniquement si `location.pathname === '/songs/new'` — le fix HIGH 17.2 « quitter en vol = garder mais ne pas ré-armer » est porté en version URL.
- **Guard maison supprimé** : `LeaveGuardContext.ts` + `LeaveGuardProvider.tsx` supprimés (`git rm`) ; `App`/`Header`/`SessionHistoryCard` déguardés ; remplacé par un `useBlocker` unique dans `Songs` qui couvre aussi le **back-button/popstate**. `isFreshSong`/`deleteEditingSong`/`ConfirmDialog`/`beforeunload` de 17.2 réutilisés tels quels.
- **404 scopé** : deep-link `/songs/:uid` inconnu/étranger → `getSong` 404 → écran « Song not found » + lien `/songs` (invariant 7.5, zéro oracle).
- **Tests** : suite Songs montée via `renderSongs` (data-router mémoire) ; 5 fichiers migrés vers le helper ; +6 tests (routes `/songs/new` + `/songs/:uid`, deep-link edit, deep-link 404, Add navigue, refresh-persistence). **Front 357✓ · Back 265✓ · tsc✓ · lint✓.**
- QA manuelle : à repasser par northwood (checklist 17.2 + refresh reste sur la chanson + back-button sur draft à-valeur + deep-link 404).

### File List

**EDIT**
- `src/router.tsx` — routes `songs/new` + `songs/:uid` sous `RequireAuth`
- `src/pages/Songs.tsx` — mode dérivé de l'URL, transitions en `navigate`, `useBlocker`, deep-link + 404, guard maison retiré
- `src/App.tsx` — `RootLayout` sans `LeaveGuardProvider`
- `src/components/Header.tsx` — `GuardedLink` → `Link`, `resetToList`/`useLeaveGuard` retirés
- `src/components/SessionHistoryCard.tsx` — `to={`/songs/${songUid}`}` (plus de `state`)
- `package.json` — `testEnvironment` → env jsdom custom
- `src/__tests__/router.test.tsx` — routes form + garde étendues
- `src/__tests__/SongsAutoSave.test.tsx` — mock `getSong`, tests routes/deep-link/404
- `src/__tests__/SessionHistoryCard.test.tsx` — href `/songs/:uid`
- `src/__tests__/SongsMarkAsPlayedDirty.test.tsx`, `SongsPlaylistInlineCreate.test.tsx`, `SongsLastPlayedSort.test.tsx`, `SongsSidebarPersistence.test.tsx` — via `renderSongs`

**NEW**
- `jest.jsdom.env.cjs` — env jest custom (bridge primitives Fetch Node, zéro dépendance)
- `src/test/renderSongs.tsx` — helper de rendu Songs sur data-router mémoire

**DELETE**
- `src/contexts/LeaveGuardContext.ts`
- `src/contexts/LeaveGuardProvider.tsx`

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-07-11 | 18.2 | Route-ify la fiche chanson (`/songs/new` · `/songs/:uid`, mode dérivé de l'URL) ; guard maison 17.2 remplacé par `useBlocker` (couvre back-button) ; deep-link 404 scopé ; env jest custom + helper `renderSongs` pour le data-router. Front 357✓ · Back 265✓. Status → review. |
| 2026-07-11 | 18.2 | Code-review 3 couches : 4 findings (1 HIGH data-loss + 2 MED + 1 LOW), tous corrigés. Gate `formReady` (form non-chargé/404 plus pris pour un draft frais → plus de `deleteSong` parasite), `pathnameRef`/`isMountedRef` (plus de yank-back), rollback `loadedFormUidRef` StrictMode (deep-link dev), toast save-fail restauré. +2 tests non-régression. Front 359✓ · tsc✓ · lint✓. Status → done. |

## Review Findings (code-review 2026-07-11, 3 couches)

**Résolution (2026-07-11) : les 4 patchs appliqués + 2 tests de non-régression (front 359✓, tsc✓, lint✓).**
- Fix #1 : nouvel état `formReady` (true seulement quand le form représente réellement la cible `/songs/:uid` chargée — record construit ou fetch résolu ; jamais pendant le chargement ni sur 404). Gate `useBlocker` + `beforeunload` dessus → un form non-chargé / 404 n'est plus pris pour un draft frais. Tests : « leaving the Song not found screen does not delete… », « leaving a deep-link form while still loading does not delete… ».
- Fix #2 : garde auto-création lit `pathnameRef`/`isMountedRef` (refs live) au lieu du `location` figé dans la closure → plus de yank-back en quittant `/songs/new` par lien header / back navigateur pendant un create en vol.
  - **Suivi QA manuelle (2026-07-11)** : le fix #2 avait introduit une régression StrictMode — `isMountedRef` posé en cleanup-only restait `false` après le remount dev, donc l'auto-création `return true` **avant** le navigate → form bloqué en mode add → la chanson créée matchait contre elle-même → « already exists » sur **n'importe quel titre**. Corrigé en posant `isMountedRef.current = true` dans le **setup** de l'effet. Test de non-régression sous `<StrictMode>` (nouveau param `renderSongs(path, { strict })`). Front 360✓.
  - **Suivi QA manuelle #2 (2026-07-11)** : supprimer (corbeille) une chanson dont le titre était vidé ouvrait **deux popups** — le « Delete song? » de confirmation, puis, après le `navigate('/songs')` de `handleConfirmDelete`, le `useBlocker` titre-vide re-déclenchait un 2ᵉ popup « This song has no title » (la sortie est pourtant délibérée). StrictMode-spécifique. Corrigé par un `deletingRef` posé avant le `navigate` de suppression et lu en live dans le prédicat du blocker (réinitialisé au retour liste). Test de non-régression sous `<StrictMode>` (vérifié qu'il échoue sur HEAD). Front 361✓.
- Fix #3 : deep-link — `loadedFormUidRef` remis à `undefined` dans le cleanup non-résolu (flag `settled`) → le 2ᵉ setup StrictMode refetch, le deep-link s'affiche en `npm run dev`.
- Fix #4 : `backToList` restaure le toast « Some changes could not be saved » sur échec réel (`!ok && !savingRef.current`).

- [x] [Review][Patch] **HIGH — Formulaire non-chargé / écran 404 traité comme draft frais → `deleteSong(uid)` parasite + data-loss** — CORRIGÉ (gate `formReady`) [src/pages/Songs.tsx:1036-1093]. Pendant le chargement d'un deep-link (`getSong` en vol) et sur l'écran « Song not found », `form` reste `initialSong` (titre vide) alors que `editingUid` vient de l'URL. Le `useBlocker` (`:1065`), l'effet `beforeunload` (`:1088`) et `isFreshSong` (`:1036`) traitent ça comme un draft titre-vide frais → à la sortie, `deleteEditingSong()` fire `deleteSong(editingUid)`. Deux scénarios : (1) **data-loss sur SA chanson** — deep-link `/songs/<sien>` chargement lent + clic « Back » avant résolution → `deleteSong` sur la vraie chanson ; en prime `getSong.catch` mappe **toute** erreur (blip réseau) → 404. (2) écran 404 `/songs/<inconnu>` : Back / lien header → `deleteSong('ghost')` (scopé no-op mais requête mutante non voulue + navigation piégée par le blocker) et `beforeunload` armé à tort. Détecté par blind + edge + auditor (auditor a reproduit `deleteSong` appelé avec l'uid). Fix : n'armer blocker/beforeunload/isFreshSong que sur une session d'édition réellement chargée (form construit pour `editingUid`, `!notFound`).
- [x] [Review][Patch] **MED — Garde auto-création lit un `location` périmé (stale closure) → yank-back dans la fiche** — CORRIGÉ (pathnameRef/isMountedRef) [src/pages/Songs.tsx:944]. La détection « l'utilisateur a quitté `/songs/new` pendant le create en vol » lit `location.pathname` capturé dans la closure `autoSaveSong` (gelée au moment où le timer a fait feu), là où la 17.2 utilisait `formActiveRef` (un ref, toujours à jour). Si on quitte `/songs/new` par un chemin **sans** `navigate('/songs')` postérieur (lien header, logo, bouton back navigateur) pendant que le create est en vol, la closure voit `pathname === '/songs/new'` (périmé) → `navigate('/songs/:uid',{replace})` **ramène de force** l'utilisateur dans la fiche. Régression de l'invariant HIGH 17.2. Le test « quit in flight » ne couvre que le chemin `backToList` (dont le `navigate('/songs')` postérieur masque le yank). Détecté par blind + edge. Fix : lire le pathname depuis un ref mis à jour à chaque render.
- [x] [Review][Patch] **MED (dev) — StrictMode double-invoke → le deep-link `/songs/:uid` n.affiche jamais la fiche en dev** — CORRIGÉ (rollback loadedFormUidRef en cleanup) [src/pages/Songs.tsx:753,763-769]. `main.tsx` monte en `<StrictMode>` (double setup→cleanup→setup des effets en dev). L'effet build-form pose `loadedFormUidRef.current = editingUid` **avant** le fetch ; le cleanup annule le 1er `getSong` ; le 2ᵉ setup voit `loadedFormUidRef === editingUid` et sort sans refetch → `buildFormFromSong`/`setNotFound` jamais appelés → fiche vide (heading « Edit song », ni contenu ni 404). Prod (pas de double-invoke) et tests (`renderSongs` sans StrictMode) OK → masqué, mais casse la QA manuelle `npm run dev` de la feature phare. Détecté par edge. Fix : ne verrouiller `loadedFormUidRef` qu'après résolution, ou le remettre à `undefined` dans le cleanup non résolu.
- [x] [Review][Patch] **LOW — `backToList` ignore l.échec de `flushAutoSave` → plus de toast « Some changes could not be saved »** [src/pages/Songs.tsx:1097-1100]. L'ancien `backToList` (17.2) toastait quand `flushAutoSave()` renvoyait `false` (`&& !savingRef.current`) ; le nouveau jette le retour. Un échec de save (réseau) au clic « Back to songlist » ramène à la liste sans avertir. Régression de comportement mineure. Détecté par blind + edge. Fix : restaurer le toast sur `!ok && !savingRef.current`.
