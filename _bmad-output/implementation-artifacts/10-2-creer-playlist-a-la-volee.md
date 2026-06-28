---
baseline_commit: 1fcbf56
depends_on: 10-1-unicite-nom-playlist-serveur
arch_decision: "Création à la volée côté front, consommant le 409 serveur posé par 10.1. Détection d'exact-match côté client (UX immédiate, .toLowerCase() comme le picker) + 409 comme backstop : si une création passe la garde client mais collide côté serveur, sélectionner la playlist existante renvoyée dans le 409 (façon 8.2 AC10). Mirror du « create topic on the fly » (8.2)."
---

# Story 10.2: Créer une playlist à la volée depuis l'édition d'une chanson

Status: backlog

<!-- Backlog : à finaliser via create-story une fois 10.1 done (incorporer ses apprentissages — forme exacte du 409, du corps `{ message, playlist }`). Le gros du cadrage front est déjà ici. -->
<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui édite une chanson,
I want créer une **nouvelle** playlist et y ajouter la chanson en cours **sans quitter l'écran** (taper un nom inexistant → « Create playlist "…" » → créée + chanson ajoutée),
so that ranger une chanson dans une nouvelle playlist reste un seul geste, sans détour par la page Playlists.

## Contexte & pourquoi

Story de **confort** (Epic 10), issue de la revue `deferred-work.md` (planifiée 2026-06-26). Aujourd'hui, le picker de playlists de la fiche chanson ne permet d'ajouter la chanson qu'à des playlists **existantes** : pour une nouvelle playlist, il faut quitter vers `/my-playlists`, la créer, revenir, rouvrir la chanson, l'ajouter. Le « créer un sujet à la volée » du sélecteur d'entrée (story **8.2**) a déjà résolu exactement ce frottement pour les topics ; on **mirrore ce pattern UX** sur le picker de playlists.

**Prérequis : story 10.1** (unicité de nom de playlist côté serveur + 409 renvoyant la playlist existante). Cette story **consomme** ce 409.

**Périmètre :** **frontend** (`src/pages/Songs.tsx` — le picker y vit, injecté dans `SongForm` via `playlistSlot`) + un petit ajout au service (`PlaylistConflictError` + parse 409). **Aucun changement backend** (posé par 10.1).

## Décision d'architecture (héritée de 10.1)

10.1 a posé l'unicité serveur `(user_uid, lower(name))` + le **409** `{ message: 'Playlist already exists', playlist: <existante> }`. Cette story s'appuie dessus avec **deux niveaux** (mirror 8.2) :
- **Garde client (UX immédiate)** : l'option « Create playlist "X" » n'apparaît que si **aucune** playlist chargée n'a ce nom (`.toLowerCase()`, **même folding que le serveur** `lower(name)` → parité exacte, pas de 409 surprise en pratique).
- **409 backstop (course catalogue périmé)** : si une création passe la garde client mais collide côté serveur, on **sélectionne la playlist existante** renvoyée dans le 409 au lieu d'afficher une erreur (façon 8.2 AC10).

## Acceptance Criteria

### Proposer la création quand rien ne matche (cœur de la story)

1. **Option « Create playlist » conditionnelle** — Given le picker de playlists de la fiche chanson en **mode édition**, When la recherche est **non vide** et qu'**aucune playlist existante** n'a un nom égal (insensible à la casse, `.toLowerCase()`) au texte saisi, Then une option **« Create playlist "&lt;texte&gt;" »** apparaît **en bas** de la liste déroulante (après les playlists filtrées).
2. **Pas de doublon proposé** — Given le texte saisi correspond (à la casse près) à une playlist **existante** (sélectionnée ou non), Then l'option « Create playlist » **n'apparaît pas**.
3. **Pas de création vide** — Given une recherche vide ou réduite à des espaces, Then l'option « Create playlist » **n'apparaît pas**.

### Créer + ajouter sans quitter l'écran

4. **Création + ajout en une action** — Given l'option « Create playlist "…" » affichée, When je la choisis, Then la playlist est créée via `playlistService.createPlaylist({ name, songUids: [<uid de la chanson éditée>] })` — donc **la chanson y est ajoutée immédiatement** — sans fermer ni soumettre `SongForm`.
5. **Reflet immédiat dans l'UI** — Given la playlist vient d'être créée, Then elle est ajoutée à l'état `playlists` **et** à `selectedPlaylistUids`, donc elle apparaît aussitôt comme **chip sélectionnée** ; la recherche est réinitialisée (champ vidé, liste fermée) comme pour une sélection normale.
6. **Cohérence avec la persistance on-Save existante** — Given le picker persiste la composition via le diff on-Save (`updatePlaylist({ songUids })`, `Songs.tsx:1154-1177`), Then la playlist créée à la volée (déjà porteuse de la chanson) s'intègre à ce diff **sans double-ajout ni retrait accidentel** : si je la dé-sélectionne avant Save, le diff retire la chanson comme pour toute autre playlist ; si je Save, aucun re-traitement destructif.
7. **Création possible même sans aucune playlist** — Given l'utilisateur n'a **encore aucune** playlist (`playlists.length === 0`), When il ouvre la section playlists de la fiche chanson, Then il peut **taper un nom et créer** la première playlist à la volée (le combobox est disponible) — l'actuel encart « No playlists found / Create one » vers `/my-playlists` ne doit plus être le seul chemin.

### 409 backstop & erreurs

8. **Collision serveur → sélection de l'existante (409)** — Given une création qui passe la garde client mais **collide côté serveur** (catalogue périmé), When `createPlaylist` rejette avec `PlaylistConflictError`, Then la **playlist existante** (portée par l'erreur, `existingPlaylist`) est **ajoutée à `selectedPlaylistUids`** (et à `playlists` si absente) — pas d'erreur bloquante, pas de doublon. (Mirror 8.2 AC10.)
9. **Échec de création non bloquant** — Given un échec réseau (hors 409), Then un toast d'erreur léger s'affiche (`setToastMessage` + `setTimeout(2500)`), `SongForm` n'est **ni fermé ni soumis**, aucune chip fantôme ajoutée.

### Non-régression

10. **Picker existant intact** — Given les comportements actuels (toggle de playlists existantes, chips retirables, filtre `filteredPlaylists` qui exclut les déjà-sélectionnées, persistance on-Save via `updatePlaylist`), Then ils restent inchangés ; l'option « Create » s'ajoute sans les casser.
11. **Navigation clavier** — Given la nav clavier du combobox (`handleComboKeyDown`, util partagé), Then l'option « Create playlist » est **navigable au clavier** (flèches + Entrée la sélectionne **sans soumettre** le formulaire, Échap/Tab ferment) — elle doit faire partie du **même tableau d'options** passé à `handleComboKeyDown` que celui rendu (alignement d'index).
12. **Périmètre mode édition** — Given le picker n'est rendu qu'en **mode édition** (`editingUid` truthy, `Songs.tsx:1752/1828`), Then la création à la volée suit le même périmètre (mode ajout d'une chanson neuve **hors scope** — pas d'`uid` de chanson à lier).
13. **Suites vertes** — Front au vert ; `tsc -b` + ESLint propres.

## Tasks / Subtasks

### Task 1 — Service : `PlaylistConflictError` + parse 409 (AC8)

> Mirror exact de `TopicConflictError` / `topicService.create` (`src/services/topicService.ts:23-30, 40-53`).

- [ ] `src/services/playlistService.ts` : ajouter `export class PlaylistConflictError extends Error { existingPlaylist?: Playlist; ... }` (mirror `TopicConflictError`). Dans `createPlaylist` (`:40-53`), si `res.status === 409` → `const body = await res.json().catch(() => ({})); throw new PlaylistConflictError(body.playlist ?? undefined);` **avant** le `if (!res.ok)`. (Optionnel : idem `updatePlaylist` pour le rename, si utile au front ailleurs.)

### Task 2 — Picker : détection exact-match + option Create (AC1–AC3, AC11)

> Le picker vit dans **`src/pages/Songs.tsx`** (markup `:1752-1828`), injecté via `playlistSlot`. **Lire `Songs.tsx:1752-1828` + l'état/handlers AVANT de coder.**

- [ ] À côté de `filteredPlaylists` (`:234-236`), dériver : `rawCreateText = playlistSearchQuery.trim()` ; `hasExactPlaylist = playlists.some(p => p.name.trim().toLowerCase() === rawCreateText.toLowerCase())` (**comparer à `playlists`, pas `filteredPlaylists`** qui exclut les sélectionnées) ; `showCreatePlaylist = playlistSearchOpen && rawCreateText !== '' && !hasExactPlaylist`.
- [ ] **Rendu** : après le `.map(filteredPlaylists)` (`:1783-1807` env.), rendre conditionnellement un dernier `<button>` « Create playlist "{rawCreateText}" » quand `showCreatePlaylist`, **dans le même conteneur** (`playlistListRef`), même style Tailwind + `dark:`, `onMouseEnter` pour l'état actif, `comboboxOptionAria('song-playlists-list', filteredPlaylists.length, selectedPlaylistIndex)`. Utiliser **`onMouseDown`** (pas `onClick`) si l'input blur — reproduire le détail du picker existant.

### Task 3 — Clavier unifié + handler de création (AC4–AC8, AC9, AC11)

- [ ] Construire l'array passé à `handleComboKeyDown` (`:1775-1778`) = `[...filteredPlaylists, ...(showCreatePlaylist ? [CREATE_SENTINEL] : [])]` (sentinelle distincte, ex. `{ __create: true }`). `onSelect` : sentinelle → `handleCreatePlaylist(rawCreateText)` ; sinon → `handleTogglePlaylist(option.uid)`. Borner `selectedPlaylistIndex` sur la longueur **incluant** l'option Create.
- [ ] `handleCreatePlaylist(rawText)` :
  1. `const name = rawText.trim();` (garde AC3, double-check).
  2. `try { const created = await playlistService.createPlaylist({ name, songUids: editingUid ? [editingUid] : [] }); setPlaylists(prev => [created, ...prev]); setSelectedPlaylistUids(prev => new Set(prev).add(created.uid)); }` puis reset `playlistSearchQuery`/`playlistSearchOpen`/`selectedPlaylistIndex`.
  3. `catch (e)` : `if (e instanceof PlaylistConflictError && e.existingPlaylist) { const ex = e.existingPlaylist; setPlaylists(prev => prev.some(p => p.uid === ex.uid) ? prev : [ex, ...prev]); setSelectedPlaylistUids(prev => new Set(prev).add(ex.uid)); /* reset recherche */ }` (AC8) ; **sinon** toast d'erreur (`setToastMessage('Could not create playlist')` + `setTimeout(2500)`), état/form intacts (AC9).
  - ⚠️ **Cohérence on-Save (AC6)** : la playlist est créée **avec la chanson dedans** ET ajoutée à `selectedPlaylistUids`. Le diff on-Save (`:1154-1177`) refetch + compare `hasSong` vs `shouldHaveSong` → `hasSong=true` & `shouldHaveSong=true` ⇒ **no-op** (pas de double-ajout). Vérifier ce chemin.

### Task 4 — État vide sans playlists (AC7)

- [ ] Dans la branche `playlists.length === 0` (`:1755-1764`), remplacer/compléter l'encart « No playlists found / Create one → /my-playlists » pour exposer **le combobox** permettant de taper un nom et créer la première playlist à la volée. Le lien `/my-playlists` peut rester en secours.

### Task 5 — Tests (AC1–AC11)

> Le picker n'a **aucune couverture** aujourd'hui (`SongForm.test.tsx` n'a aucun test playlist ; pas de `Songs.test.tsx` exerçant le picker). Créer un fichier dédié, ex. `src/__tests__/SongsPlaylistInlineCreate.test.tsx` (rendre `Songs` en mode édition, mocker `playlistService`).

- [ ] **AC1/2/3** : nom inexistant → « Create playlist "X" » ; nom (casse différente) d'une playlist existante → **pas** d'option Create ; saisie vide/espaces → pas d'option Create.
- [ ] **AC4/5** : choisir « Create playlist "X" » appelle `createPlaylist({ name:'X', songUids:[<editingUid>] })`, la playlist apparaît en **chip sélectionnée**, recherche réinitialisée, form non soumis.
- [ ] **AC7** : `playlists = []` → le combobox permet de taper + créer.
- [ ] **AC8** : `createPlaylist` rejette `PlaylistConflictError(existing)` → la playlist existante devient sélectionnée (chip), pas de toast d'erreur.
- [ ] **AC9** : `createPlaylist` rejette (autre erreur) → toast affiché, pas de chip, form intact.
- [ ] **AC11** : flèche bas jusqu'à l'option Create + Entrée la sélectionne **sans** soumettre (Entrée `preventDefault`).
- [ ] Vérifs : `npm test` (front) vert, `tsc -b` + `eslint .` propres.

## Dev Notes

### Architecture / périmètre
- **Front + petit service.** `playlistService.createPlaylist({ name, songUids })` **existe déjà** et accepte `songUids` à la création (`syncPlaylistSongs` garde uniquement les chansons du user, ordre/dédup). 10.1 a ajouté le **409**. Cette story ajoute le **parse 409** (`PlaylistConflictError`) + l'UI.
- Le picker est **dans `Songs.tsx`** (pas dans `SongForm.tsx`) : `SongForm` ne reçoit qu'un slot `playlistSlot?: React.ReactNode` (`SongForm.tsx:35,114,806`). **Tout le code UI va dans `Songs.tsx`.**

### État actuel du picker (à préserver — LIRE avant de coder) — `src/pages/Songs.tsx`
- Rendu **mode édition uniquement** : ternaire `editingUid ? (…combobox…) : undefined` (`:1752`/`:1828`). Si `playlists.length === 0` → encart « No playlists found / Create one » (`:1755-1764`).
- État : `playlists`/`setPlaylists` (`:177`, chargé par `loadPlaylists` `:358-367` via `getAllPlaylists()`), `selectedPlaylistUids: Set<string>` (`:228`), `playlistSearchOpen` (`:229`), `playlistSearchQuery` (`:230`), `selectedPlaylistIndex` (`:231`), `playlistListRef` (`:232`).
- `filteredPlaylists` (`:234-236`) = `playlists.filter(p => !selectedPlaylistUids.has(p.uid) && p.name.toLowerCase().includes(playlistSearchQuery.toLowerCase()))` → **exclut les déjà-sélectionnées** (d'où la garde AC2 contre `playlists` complet).
- `useScrollHighlightIntoView(playlistListRef, selectedPlaylistIndex, playlistSearchOpen)` (`:237`).
- Chargement composition à l'entrée en édition : effet `:671-696` (seed `selectedPlaylistUids` depuis les playlists contenant `editingUid`) ; reset à vide hors édition (`:675`).
- `handleTogglePlaylist(uid)` (`:701-709`) : toggle local du `Set`, **aucun appel réseau**.
- **Persistance on-Save (branche édition `:1154-1177`)** : après `updateSong`, refetch `getAllPlaylists()`, puis diff `hasSong` vs `shouldHaveSong` → `updatePlaylist(uid, { songUids })`. **N'utilise PAS `addSongToPlaylist`.** La playlist créée à la volée (déjà porteuse de la chanson + dans `selectedPlaylistUids`) → diff **no-op**.
- Combobox : `handleComboKeyDown` (`:1775-1778`), `comboboxInputAria('song-playlists-list', …)` (`:1780`), `comboboxOptionAria('song-playlists-list', index, …)` (`:1788`). Chips retirables `:1809-1823`.

### Pattern « create on the fly » à mirrorer — `src/pages/MySessionsPage.tsx` (story 8.2)
- `rawCreateText = searchText.trim()` (`:89`), `hasExactTopic = topics.some(t => foldForSearch(t.name) === query)` (`:90`), `showCreate = searching && rawCreateText !== '' && !hasExactTopic` (`:91`).
- Option sentinelle `value: \`create:${rawCreateText}\``, `label: \`Create topic "${rawCreateText}"\`` (`:103`), `idx` clavier (`:104-107`).
- `pick()` route la sentinelle (`:109-121`) ; parent `handleCreateTopic` (`:409-437`) : trim → `topicService.create` → prepend → sélection ; `catch TopicConflictError` → sélectionne `existingTopic` (`:417-432`). **Mirror direct** (remplacer topic→playlist, `existingTopic`→`existingPlaylist`).
- Détail à reproduire : **`onMouseDown` (pas `onClick`)** pour tirer avant le blur de l'input.

### Util combobox partagé — `src/utils/comboboxKeyboard.ts`
- `handleComboKeyDown(e, options, index, setIndex, setOpen, onSelect)` : `options` **DOIT** être exactement le tableau rendu → y inclure l'option Create en dernier quand `showCreatePlaylist`.
- `comboboxOptionAria(listId, index, activeIndex)` sur chaque option (Create comprise, index = `filteredPlaylists.length`) ; `comboboxInputAria` sur l'input — inchangé.

### Ce qui doit être préservé (ne pas casser)
- Contrat API **`songUids`** (5.7) : ne **pas** écrire la colonne legacy `Playlist.songUids`.
- Persistance **on-Save** du picker (diff `updatePlaylist`) : ne pas la remplacer par des `addSongToPlaylist` ; juste y insérer la playlist créée.
- Filtre `filteredPlaylists` (exclut les sélectionnées) : inchangé ; exact-match contre `playlists` complet.
- Nav clavier des 6 comboboxes (`comboboxKeyboard.ts`) : réutiliser l'util.

### Conventions (cf. project-context.md)
- **TS strict** + `verbatimModuleSyntax` (`import type`), pas d'alias, imports relatifs, `noUnusedLocals/Parameters`. **Tout en anglais** (« Create playlist "…" », « Could not create playlist »).
- **Tailwind only**, dark mode `dark:`, couleurs thème. Toasts `setToastMessage` + `setTimeout(2500)` (pas de lib).
- Service : mirror `topicService` (parse 409 + classe d'erreur). **Tests front** Jest + Testing Library, mocker `playlistService`, nouveaux tests dans `src/__tests__/`.

### Garde-fous workflow
- **Jamais sur `main`** : branche `feat/epic-10-confort-playlists` (partagée avec 10.1). Tout merge = prod (pas de staging) ; northwood **merge à la main**. Commits Conventional (`feat(playlists): ...`, `feat(songs): ...`). Hook pre-commit front+back+ESLint, **jamais `--no-verify`**.

### Project Structure Notes
- Pas de backend (posé par 10.1). Front : `src/pages/Songs.tsx` + `src/services/playlistService.ts` + test `src/__tests__/SongsPlaylistInlineCreate.test.tsx`.
- `formatSongLabel` (`MyPlaylistsPage.tsx:16-17`) reste la référence de libellé chanson — non touché.
- **Cadence BMad** : finaliser cette story via `create-story` une fois **10.1 done**, pour intégrer la forme exacte du 409 (`{ message, playlist }`) telle qu'implémentée.

### References
- [Source: _bmad-output/implementation-artifacts/10-1-unicite-nom-playlist-serveur.md] — prérequis : unicité serveur + 409 `{ message, playlist }`
- [Source: _bmad-output/implementation-artifacts/8-2-topic-systeme-free-practice-et-creation-a-la-volee.md] — pattern « create on the fly » (picker, sentinelle, onCreate, handler, 409→existante)
- [Source: src/pages/MySessionsPage.tsx:89-121,409-437] — `showCreate`/sentinelle/`handleCreateTopic` + `catch TopicConflictError` (gabarit exact)
- [Source: src/services/topicService.ts:23-30,40-53] — `TopicConflictError` + parse 409 (à mirrorer en `PlaylistConflictError`)
- [Source: src/pages/Songs.tsx:1752-1828,234-236,701-709,1154-1177,671-696] — picker actuel (markup, état, filtre, toggle, persistance on-Save, seed composition)
- [Source: src/components/SongForm.tsx:35,114,806] — `playlistSlot` (le picker n'est pas dans SongForm)
- [Source: src/utils/comboboxKeyboard.ts] — `handleComboKeyDown`, `comboboxInputAria`, `comboboxOptionAria`, `useScrollHighlightIntoView`
- [Source: src/services/playlistService.ts:40-53,83-92] — `createPlaylist` (accepte `songUids`), à doter du parse 409
- [Source: _bmad-output/implementation-artifacts/5-7-playlists-vrai-lien-base-fk.md] — modèle playlists (FK, contrat `songUids`)
- [Source: _bmad-output/project-context.md] — règles frontend/services/tests, conventions, garde-fous
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — entrée source « Créer une playlist à la volée » (planifiée 2026-06-26)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
