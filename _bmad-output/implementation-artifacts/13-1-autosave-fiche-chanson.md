---
baseline_commit: 95c8594
arch_decision: "Auto-save de la fiche chanson (atelier vivant) : persistance débouncée + flush blur/départ via le saveur découplé existant `saveSongEdits`, suppression du bouton Save, découplage save↔navigation (rester sur la chanson), sticky « Back to songlist » en haut, indicateur ambiant Saving/Saved/Not-saved. CORRECTION du brainstorm : le backend n'a AUCUNE unicité de titre → le doublon est 100% client (`liveDuplicate`) → pas de question PUT-global-vs-partiel serveur ; la vraie décision est : que fait l'auto-save sur un titre transitoirement dupliqué."
---

# Story 13.1: Auto-save de la fiche chanson (« atelier vivant »)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui ajuste une chanson **pendant qu'il la joue**,
I want que la fiche d'édition **se sauve toute seule** et que je reste dessus (avec un « Back to songlist » explicite en haut),
so that je ne pense plus jamais à cliquer Save, je ne suis plus ré-éjecté vers la liste, et je ne perds rien.

## Contexte & pourquoi

Issu du **brainstorm 2026-06-29** (`_bmad-output/brainstorming/brainstorming-session-2026-06-29-1434.md`), item deferred-work **prio 3**. Reframe clé de northwood : **la fiche d'édition n'est pas un formulaire à soumettre, c'est un atelier vivant qu'on bidouille en jouant**. Les 2 irritants : le bouton Save **tout en bas**, et le Save qui **ré-éjecte vers la songlist** alors qu'on est en train de jouer.

Décisions actées au brainstorm : auto-save (debounce + flush blur + flush au départ) · plus de bouton Save · sticky « Back to songlist » en haut · indicateur ambiant `Saving…/Saved ✓/⚠️ Not saved — retry` · erreur de save non bloquante par champ (✗ discret) · la garde « modifs non enregistrées » du Mark-as-Played devient **caduque** · course 2-appareils **reportée** (assumé beta).

**Périmètre :** frontend, **`src/pages/Songs.tsx`** + `SongForm.tsx` (gros morceau). Pas de migration. Backend probablement **intact** (cf. décision doublon ci-dessous).

## ⚠️ Décision d'architecture à confirmer (corrigée vs brainstorm) — gestion du doublon de titre

**Le brainstorm posait « PUT global tolérant vs save partiel » en supposant qu'un titre dupliqué fait échouer le PUT. C'EST FAUX** : `backend/controllers/songcontroller.js:155-208` n'a **aucune** détection de doublon, `song.js:21-24` n'a **pas** de contrainte `unique` sur `title`. Le seul garde-fou est **client** : `liveDuplicate` (`Songs.tsx:1183-1192`) bloque **les deux** chemins de save (`handleSubmit:1213` et `saveSongEdits:786`).

**Donc la vraie question :** que fait l'auto-save quand le titre/artiste **collide transitoirement** (ex. en cours de frappe, le titre égale momentanément une autre chanson) ?

- **🅰️ (RECOMMANDÉE) — sauver le reste, geler les champs d'identité, ✗ discret.** Tant que `liveDuplicate` est actif : **exclure `title` (+`artist`) du payload d'auto-save** (on garde la valeur serveur de ces champs), **auto-sauver tous les autres champs**, afficher un **✗ discret à côté du titre** (« already in your songlist »). Quand la collision se résout → le titre repart en auto-save. Honore exactement le point 5 du brainstorm (« le reste continue »), 100% client, pas de touche backend.
- **🅱️ — bloquer l'auto-save tant que doublon** (l'actuel comportement des gardes) : simple mais gèle TOUTE la fiche sur une collision transitoire → frustrant (« je change le BPM mais ça sauve pas parce que mon titre ressemble à une autre chanson »).
- **🅲️ — unicité serveur (409)** : poser une vraie contrainte + 409 (façon playlists 10.1). Plus lourd, hors esprit confort, et change le modèle. _Non retenue ici._

**➡️ À confirmer avec northwood au dev.** Le reste de la story est écrit pour **🅰️**.

## Acceptance Criteria

### Auto-save (cœur)

1. **Persistance automatique** — Given je suis en **mode édition** d'une chanson (`editingUid !== null`) et je modifie un champ, When je marque une pause de frappe (**debounce ~1–1.5 s**) **ou** quand un champ perd le focus (**blur**), Then la chanson est persistée via `songService.updateSong` **sans** action manuelle ; aucun rechargement, aucun changement de page.
2. **Flush au départ** — Given une modification en attente (debounce non écoulé), When je clique « Back to songlist » (ou quitte l'écran d'édition par tout chemin), Then le save en attente est **flushé avant** de naviguer (rien n'est perdu).
3. **Plus de bouton Save** — Given la fiche en mode édition, Then le bouton **« Save » est retiré** (le save est automatique). _(Le bouton « Add » du mode **création** reste — cf. AC11.)_
4. **Découpler save ↔ navigation** — Given un auto-save réussi, Then je **reste sur la chanson** (`page='form'`, `editingUid` conservé, `form` **non** réinitialisé) — fini le `setPage('list')` + `setForm(initialSong)` post-save de l'édition.

### Navigation & feedback

5. **Sticky « Back to songlist » en haut** — Given la fiche en édition, Then un bouton **« ← Back to songlist » fixe en haut** (sticky) permet de revenir explicitement à la liste ; il **flushe** d'abord l'auto-save (AC2). _(Remplace/upgrade le bouton « ← Songlist » actuel `Songs.tsx:1757-1770`, non sticky.)_
6. **Indicateur de statut ambiant** — Given l'auto-save, Then un **indicateur discret non intrusif** reflète l'état : `Saving…` (en vol) / `Saved ✓` (succès, peut s'estomper) / **`⚠️ Not saved — retry`** (échec réseau/serveur, avec moyen de relancer). Jamais de modale, jamais de vol de focus (l'user joue).
7. **Échec de save visible & récupérable** — Given un `updateSong` qui échoue (réseau/serveur), Then le statut passe à **`⚠️ Not saved`** (pas un simple toast qui disparaît) et un **retry** est possible (auto au prochain changement, ou bouton). Pas de perte silencieuse (corrige le risque ① du pre-mortem).

### Doublon (décision 🅰️)

8. **Doublon non bloquant** — Given le titre/artiste collide avec une chanson existante (`liveDuplicate`), When l'auto-save tourne, Then **les autres champs continuent de se sauver** ; **`title`/`artist` sont gelés** (exclus du payload, valeur serveur conservée) ; un **✗ discret** signale le titre (« already in your songlist ») ; à résolution, le titre repart en auto-save.

### Dette résolue

9. **`isDirty` fiabilisé / caduc** — Given l'auto-save, Then la détection `isDirty` fragile (`JSON.stringify(form)` vs `editBaselineJson`, `Songs.tsx:777-780`) est **résolue** : soit supprimée (plus de notion modifié-vs-sauvé), soit dérivée proprement de « save en attente / en vol », sans comparaison `JSON.stringify` fragile.
10. **Garde Mark-as-Played caduque** — Given la fiche toujours persistée, Then la garde « Unsaved changes / Save & mark as played » (`ConfirmDialog` `:1613-1621`, `handleMarkAsPlayedNow` `:836-843`) **disparaît** : « Mark as played » marque **directement** (la fiche est déjà sauvée). Le test `SongsMarkAsPlayedDirty.test.tsx` est mis à jour en conséquence.

### Non-régression

11. **Mode création inchangé** — Given l'ajout d'une **nouvelle** chanson (`editingUid === null`), Then le flux reste **explicite** (bouton « Add », validation, redirection vers la liste) — l'auto-save ne s'applique **qu'en mode édition** (pas de chanson sans `uid` à PUT).
12. **Playlists & autres** — Given les memberships de playlists (diff on-Save actuel `:1224-1240`) et les actions `Mark as played` (PUT `{lastPlayed}` `:820`), Then ils restent cohérents avec l'auto-save (cf. Dev Notes — membership auto-persistée ou commit explicite à trancher ; éviter les races de PUT concurrents).
13. **Suites vertes** — front + back au vert, `tsc -b` + ESLint clean.

## Tasks / Subtasks

> **Gros morceau front, surtout `src/pages/Songs.tsx`. LIRE les zones citées avant de coder.** Un saveur découplé **existe déjà** : `saveSongEdits` (`:784-803`) — il persiste + met à jour la liste + re-baseline, **sans** toucher `page/form/editingUid`. C'est le socle de l'auto-save (mais il **n'inclut pas** le diff de playlists — cf. Task 5).

- [x] **Task 1 — Hook d'auto-save (AC1, AC2)** : créer un mécanisme (effet + ref de timer) qui, en mode édition, déclenche `saveSongEdits` (ou un dérivé) **en debounce ~1–1.5 s** sur changement de `form`, **+ au blur** (le champ duration commit déjà au blur, `SongForm.tsx:124-136`), **+ flush impératif** sur démontage / navigation (AC2). Annuler le timer en attente quand un save part. Pas de save en mode création.
- [x] **Task 2 — Découpler save/navigation + retirer Save (AC3, AC4)** : dans `handleSubmit` (`:1194-1272`), le **branche édition** ne doit plus `setEditingUid(null)`/`setForm(initialSong)`/`setPage('list')` (ce flux disparaît avec le bouton Save). Retirer le bouton **« Save »** de `SongForm` en mode édition (`SongForm.tsx:842-848`) ; garder « Add » en création. Centraliser la normalisation du payload (dupliquée `:1197-1205` et `:790-798`).
- [x] **Task 3 — Sticky Back + indicateur de statut (AC5, AC6, AC7)** : rendre le « ← Back to songlist » **sticky en haut** (upgrade de `:1757-1770`) avec flush (AC2). Ajouter un **indicateur de statut** (`Saving…/Saved ✓/⚠️ Not saved`) — nouvel état (ex. `saveStatus: 'idle'|'saving'|'saved'|'error'`), rendu discret (pas le toast bottom-right ni l'error banner ; un badge ambiant près du titre / du Back). Sur échec `updateSong` → `error` + retry (auto au prochain changement).
- [x] **Task 4 — Doublon non bloquant (AC8, décision 🅰️)** : relâcher les gardes `liveDuplicate` qui **bloquent le save** (`saveSongEdits:786-789`, `handleSubmit:1213-1217`) → en auto-save, **exclure `title`/`artist` du payload** tant que `liveDuplicate`, sauver le reste, garder le **✗ discret** sur le titre (le warning `SongForm.tsx:353-371` existe déjà via la prop `duplicate`). Confirmer 🅰️ avant de coder.
- [x] **Task 5 — isDirty + Mark-as-Played + playlists (AC9, AC10, AC12)** : (a) résoudre `isDirty` (`:777-780`) — supprimer ou dériver de « save pending/in-flight » ; (b) retirer la garde Mark-as-Played : `handleMarkAsPlayedNow` marque directement (plus de `pendingMarkInstrument`/`ConfirmDialog` « Unsaved changes » `:1613-1621`/`confirmSaveAndMark`) ; (c) **trancher les playlists** : le diff membership (`:1224-1240`) ne vit que dans `handleSubmit` — décider de l'**auto-persister** (l'inclure dans le saveur découplé, ou persister au toggle comme la création inline `:757-774`) pour rester cohérent sans bouton Save. Attention aux **PUT concurrents** (`performMarkAsPlayed:820` `{lastPlayed}` vs auto-save whole-form) — sérialiser / accepter last-write (beta).
- [x] **Task 6 — Tests (AC1–AC13)** :
  - Mettre à jour `src/__tests__/SongsMarkAsPlayedDirty.test.tsx` : le cas « unsaved → dialog Save & mark » disparaît (auto-save) → « Mark as played » marque directement ; vérifier que l'auto-save a persisté la durée.
  - Nouveau test auto-save : éditer un champ → `updateSong` appelé après debounce/blur, **sans** quitter la page (reste en mode form) ; flush au « Back » ; statut `Saved`. Échec `updateSong` → statut `Not saved`. Doublon → titre gelé + ✗, autres champs sauvés.
  - Vérifs : `npm test` (front) + `cd backend && npm test` verts ; `tsc -b` + `eslint .` clean.

## Dev Notes

### Carte du flux actuel (lue 2026-06-29 — à respecter)
- **Modèle de page** : `page: 'list'|'form'` (`:71`) + `editingUid: string|null` (`:47`). « Rester sur la chanson » = garder `page='form'` + `editingUid`. Entrées en édition : `openSongForEdit` (`:1141-1158`, set editingUid/form/baseline/page), row click (`SongsList.tsx:366` → `:1737`), router `location.state.editUid` (`:1164-1173`).
- **`handleSubmit`** (`:1194-1272`) : payload normalisé (`:1197-1205`) ; garde `liveDuplicate` **avant** réseau (`:1213-1217`) ; édition → `updateSong` (`:1220`) + replace liste (`:1221`) + diff playlists (`:1224-1240`) + `setEditingUid(null)` (`:1242`) ; post-save commun `setForm(initialSong)`+`setPage('list')` (`:1262-1265`). **C'est ce trio à découpler.**
- **`saveSongEdits`** (`:784-803`) : **saveur découplé déjà là** — `updateSong` + replace liste + `setEditBaselineJson(JSON.stringify(form))`, **sans** toucher page/form/editingUid. **Socle de l'auto-save.** ⚠️ ne fait **pas** le diff playlists.
- **`isDirty`** (`:777-780`) : `JSON.stringify(form) !== editBaselineJson`. Fragile (key-order ; et le PUT envoie le **payload normalisé**, pas `form` → divergence possible → re-baseline depuis `form` comme `saveSongEdits:801`). Seul consommateur : `handleMarkAsPlayedNow` (`:836-843`).
- **Garde Mark-as-Played** : `pendingMarkInstrument` (`:53`) → `ConfirmDialog` « Unsaved changes / Save & mark as played » (`:1613-1621`) → `confirmSaveAndMark` (`:846-862`) = `saveSongEdits()` puis `performMarkAsPlayed`. `performMarkAsPlayed` (`:807-831`) fait son **propre** `updateSong({lastPlayed})` (`:820`). Sous auto-save : fiche toujours sauvée → garde inutile.
- **`updateSong`** (`songService.ts:74-87`) : PUT whole-song, **renvoie le Song**, mais **jette le status/body** sur erreur (`Error('Failed to update song')`) → l'indicateur `⚠️ Not saved` n'a pas besoin de distinguer la cause (juste « échec → Not saved + retry »). Pas besoin de changer le service pour l'indicateur de base.
- **Doublon** : **aucune unicité backend** (`songcontroller.js:155-208`, `song.js:21-24`). `liveDuplicate` (`:1183-1192`) via `findDuplicateSong` (`utils/songDuplicate.ts`) — bloque les 2 saves. Warning UI déjà présent (`SongForm.tsx:353-371`, prop `duplicate`).
- **Feedback** : toast bottom-right `setToastMessage`+`setTimeout(2500)` (`:84`,`:1636-1640`) ; error banner top dismissible (`error` `:77`, `:1623-1634`) ; `loading` (`:76`) désactive **tout** le form (`disabled={loading}` partout dans `SongForm`) — **ne pas** réutiliser `loading` global pour l'auto-save (ça gèlerait la saisie pendant qu'il joue). Prévoir un état de statut **séparé** et non désactivant.
- **Champ duration** : buffer local dans `SongForm`, commit au **blur** (`SongForm.tsx:124-136,640-660`) → l'auto-save sur `form` le voit au blur (cohérent avec AC1 « flush au blur »).
- **Reload liste** (`:568-599`) : refetch au retour en `list`. En restant sur la fiche, la liste reste à jour via `setSongs(... updatedSong ...)` (`:800`/`:1221`).

### Ce qui doit être préservé (ne pas casser)
- **Mode création** (`editingUid === null`) : flux explicite **Add** + validation + redirection — l'auto-save ne s'applique **qu'en édition**.
- Le **warning de doublon** UI (`SongForm.tsx:353-371`) + `findDuplicateSong` (logique inchangée).
- Le diff de playlists (cohérence membership) et `performMarkAsPlayed`'s `{lastPlayed}` PUT (attention aux races).
- Pas de modale / vol de focus pendant l'édition (il joue).

### Conventions (cf. project-context.md)
- Front **TS strict** + `verbatimModuleSyntax` (`import type`), imports relatifs, `noUnusedLocals/Parameters`. **Tout en anglais** (UI + commentaires) : « Saving… », « Saved », « Not saved — retry », « Back to songlist ».
- **Tailwind only** + `dark:` ; pas de lib (debounce maison via `setTimeout`/`useRef`, pas de lodash). Tests Testing Library, mock `songService`. Nouveaux tests `*.test.tsx` dans `src/__tests__/`.

### Garde-fous workflow
- **Jamais sur `main`** : branche `feat/epic-13-autosave-fiche-chanson` (déjà créée). Merge = prod ; northwood **merge à la main**. UI sensible (cœur d'édition) → **smoke test manuel** avant merge (taper un champ, voir Saved, Back, doublon, Mark-as-played).
- Commits Conventional (`feat(songs): ...`). Hook pre-commit front+back+ESLint — jamais `--no-verify`.

### Project Structure Notes
- **EDIT** : `src/pages/Songs.tsx` (gros), `src/components/SongForm.tsx` (retrait bouton Save édition, ✗ titre, sticky Back si le bouton y vit). Tests : `SongsMarkAsPlayedDirty.test.tsx` (maj) + nouveau fichier auto-save.
- **Pas de** migration ni dépendance npm. Backend a priori intact (décision 🅰️ = 100% client).

### References
- [Source: _bmad-output/brainstorming/brainstorming-session-2026-06-29-1434.md] — concept « atelier vivant », décisions, pre-mortem
- [Source: src/pages/Songs.tsx:1194-1272] — `handleSubmit` (trio save-then-leave à découpler)
- [Source: src/pages/Songs.tsx:784-803] — `saveSongEdits` (saveur découplé, socle auto-save)
- [Source: src/pages/Songs.tsx:777-780,836-862,1613-1621] — `isDirty` fragile + garde Mark-as-Played caduque
- [Source: src/pages/Songs.tsx:1183-1192,1213-1217] — `liveDuplicate` + gardes de save (relâcher pour 🅰️)
- [Source: src/pages/Songs.tsx:1757-1770] — bouton « ← Songlist » actuel (à rendre sticky)
- [Source: src/components/SongForm.tsx:188,353-371,842-848,124-136] — form onSubmit, warning doublon, bouton Save, duration blur
- [Source: src/services/songService.ts:74-87] — `updateSong` (PUT whole-song, status jeté)
- [Source: backend/controllers/songcontroller.js:155-208 ; backend/models/song.js:21-24] — **aucune unicité titre** (corrige l'hypothèse du brainstorm)
- [Source: src/__tests__/SongsMarkAsPlayedDirty.test.tsx] — test de la garde (à mettre à jour)
- [Source: _bmad-output/project-context.md] — conventions front/tests, garde-fous

## Review Findings

_Code review adversariale 3 couches (Blind / Edge / Auditor) — 2026-06-29. Les 13 AC satisfaites, mais le mécanisme d'auto-save neuf demandait du durcissement. 1 HIGH (régression), 5 Med corrigés ; 3 reports._

- [x] [Review][Patch→Fixed] **HIGH — l'auto-save écrase `lastPlayed`** [src/pages/Songs.tsx autoSaveSong] — `form.lastPlayed` (figé à l'ouverture, jamais rafraîchi par `performMarkAsPlayed` qui n'update pas `form`) repart dans le PUT whole-form → annule le `lastPlayed=now` du « Mark as played » (le tri « last played » revient en arrière). **Fix** : exclure `lastPlayed` du payload d'auto-save (`delete payload.lastPlayed`) — champ géré serveur, jamais édité dans le form.
- [x] [Review][Patch→Fixed] **Med — sorties sans flush → édition sub-1.2 s perdue** [Songs.tsx] — seuls Back/Cancel/Enter flushent ; le lien « Musician Tools » (header édition), la nav « Songlist » (effet `resetToList`) et tout unmount ne flushent pas (cleanup = `clearTimeout` seul). **Fix** : effet de flush au **démontage** (ref-based) + flush dans le handler `resetToList`.
- [x] [Review][Patch→Fixed] **Med — « Saved ✓ » menteur pendant un titre gelé** [autoSaveSong] — sur `liveDuplicate`, le payload exclut title/artist mais on affiche « Saved ✓ ». **Fix** : ne pas montrer « Saved ✓ » quand `liveDuplicate` (statut neutre ; la bannière doublon porte le message).
- [x] [Review][Patch→Fixed] **Med — timer/save sans cancel-lock partagé** [debounce effect + flush + mark] — chevauchements possibles (flush double-fire, mark race, frappes concurrentes). **Fix** : timer en **ref** (annulé par `flushAutoSave`) + garde **in-flight** (`savingRef`) dans `autoSaveSong`.
- [x] [Review][Patch→Fixed] **Med — toggle playlist non rollback sur erreur** [handleTogglePlaylist] — `setSelectedPlaylistUids` optimiste, `catch` ne restaure pas → UI diverge du serveur. **Fix** : restaurer la sélection précédente sur erreur.
- [x] [Review][Patch→Fixed] **Med — Back pendant un échec de save** [backToList] — flushe (échoue), part quand même, remet `saveStatus` à idle → édition perdue sans signal. **Fix** : `flushAutoSave` renvoie un booléen ; toast « Some changes could not be saved » si échec ; `editBaselineJson` remis à `null` au départ (Low, contrat).
- [x] [Review][Patch→Fixed] **Test gap AC12 — persist playlist au toggle non testé** [SongsAutoSave.test.tsx] — ajouter un test : toggle en édition → `addSongToPlaylist`/`removeSongFromPlaylist` appelé.
- [x] [Review][Defer] **Doublon résolu sans édition du form → titre jamais réécrit** [Songs.tsx] — si le jumeau est supprimé ailleurs, `liveDuplicate` repasse à null mais l'effet (deps `[form,...]`) ne re-tourne pas → le titre corrigé n'est pas sauvé. Rarissime (mono-user). — deferred, edge beta.
- [x] [Review][Defer] **AC8 cosmétique — bannière au lieu d'un ✗ discret** [SongForm] — le warning doublon existe (bannière ambre), mais pas le « ✗ discret sur le champ titre » du mot du spec. — deferred, cosmétique.
- [x] [Review][Defer] **Seed playlist vs toggle avant chargement** [Songs.tsx seededPlaylistsForEditRef] — toggle avant que `playlists` charge → re-seed peut clobber (pré-existant Epic 10). — deferred, rare.

### Findings écartés
- **`autoSaveRef.current = …` assigné en render** — pattern « latest ref » standard, risque pratique nul. Écarté.
- **Saves out-of-order résiduels** — largement couverts par la garde in-flight. Écarté.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow)

### Décisions confirmées (northwood, 2026-06-29)
- **Doublon = 🅰️** : geler `title`/`artist` (exclus du payload) tant que `liveDuplicate`, auto-sauver le reste.
- **Playlists = auto-persistées au toggle** (mode édition), comme la création inline 10.2.

### Debug Log References
- **Front** `npm test` **307/307** (+4 `SongsAutoSave.test.tsx` ; `SongsMarkAsPlayedDirty` réécrit pour l'auto-save) ; `tsc -b` 0 ; `eslint .` clean. Backend **non touché** (décision 🅰️ = 100% client).
- Tests auto-save validés **contre le vrai composant** : debounce (~1.2 s) → `updateSong` + reste sur la fiche + « Saved » ; « Back » flushe le save en attente puis retourne à la liste ; titre dupliqué → payload **sans** `title`/`artist` ; échec `updateSong` → statut « Not saved ».

### Completion Notes List
- **Auto-save (AC1/2/4)** : `autoSaveSong` (dérivé de l'ancien `saveSongEdits`) + effet débouncé (~1.2 s) sur changement de `form` en mode édition (skip si `form === editBaselineJson`), `autoSaveRef` pour appeler la dernière version sans re-souscrire, `flushAutoSave` (Back/Cancel/Enter). Le trio « save-then-leave » de `handleSubmit` (édition) retiré → on **reste sur la chanson**.
- **Plus de Save / sticky Back / statut (AC3/5/6/7)** : bouton Save retiré en mode édition (`SongForm` — Add gardé en création) ; header **sticky** avec **« ← Back to songlist »** (flush via `backToList`) + indicateur ambiant `Saving…/Saved ✓/⚠️ Not saved — retry` (état `saveStatus` séparé, **pas** le `loading` global désactivant). `handleSubmit` édition = Enter → flush, pas de redirection.
- **Doublon 🅰️ (AC8)** : `autoSaveSong` supprime `title`/`artist` du payload tant que `liveDuplicate` ; le warning UI (`SongForm` prop `duplicate`) reste. Gardes bloquantes de save retirées en édition.
- **Dette (AC9/10)** : `isDirty` memo supprimé (`editBaselineJson` conservé comme baseline form-to-form, **stable**) ; garde Mark-as-Played retirée (`pendingMarkInstrument`/`confirmSaveAndMark`/`ConfirmDialog` « Unsaved changes » supprimés) → `handleMarkAsPlayedNow` flushe puis marque direct.
- **Playlists (AC12)** : `handleTogglePlaylist` persiste au toggle en édition (`addSongToPlaylist`/`removeSongFromPlaylist`) ; le diff on-Save de `handleSubmit` (édition) supprimé. Création inchangée.
- **Non-régression (AC11/13)** : mode création (Add) intact ; 307 front verts, tsc/lint clean.
- ⚠️ **Smoke test manuel requis avant merge** (cœur du flux d'édition) : taper un champ → Saved, Back, doublon, Mark-as-played, playlists.

### File List
- `src/pages/Songs.tsx` (EDIT — auto-save: `autoSaveSong`/effet débouncé/`flushAutoSave`/`backToList`/`saveStatus` ; `handleSubmit` édition→flush ; `handleTogglePlaylist` persist au toggle ; `handleMarkAsPlayedNow` direct ; header sticky + statut ; retrait isDirty/ConfirmDialog ; import `UpdateSongDTO`)
- `src/components/SongForm.tsx` (EDIT — retrait Save/Cancel en mode édition, Add gardé en création)
- `src/__tests__/SongsMarkAsPlayedDirty.test.tsx` (EDIT — réécrit pour l'auto-save, plus de dialog)
- `src/__tests__/SongsAutoSave.test.tsx` (NEW — 4 tests : debounce, Back-flush, doublon gelé, statut Not-saved)
- `CHANGELOG.md` (EDIT — entrée `[Unreleased]`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (EDIT — statut 13-1 → review)

## Change Log

| Date       | Version | Description                                                                 |
|------------|---------|-----------------------------------------------------------------------------|
| 2026-06-29 | 0.2     | Code review 3 couches : **1 HIGH** corrigé (auto-save n'envoie plus `lastPlayed` → plus d'écrasement du « dernier joué ») + 5 Med (flush au démontage + `resetToList` ; pas de « Saved ✓ » si titre gelé ; timer en ref + garde in-flight ; rollback toggle playlist ; Back→toast si échec) + test toggle-playlist (AC12). 3 reports. Front 308 ✓, tsc/lint clean. Statut → done. |
| 2026-06-29 | 0.1     | Story 13.1 — auto-save fiche chanson (« atelier vivant »). Auto-save débouncé + flush blur/départ, suppression du bouton Save (édition), reste sur la chanson, sticky « Back to songlist » + indicateur `Saving/Saved/Not-saved`, doublon gèle title/artist (🅰️), playlists auto-persistées au toggle. Résout `isDirty` fragile + retire la garde Mark-as-Played. Backend non touché. Front 307 ✓ (+4), tsc/lint clean. ⚠️ smoke test manuel avant merge. Statut → review. |
