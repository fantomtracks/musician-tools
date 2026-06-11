---
baseline_commit: 084f468
---

# Story 5.5: Libellé chanson « Artiste - Titre » cohérent partout

Status: done

## Contexte

Polish UI hors PRD (UI existante ; **CM2** : ne pas dégrader l'usage répertoire). Incohérence relevée par northwood (2026-06-11) : l'historique de session affiche les chansons en `Titre — Artiste` (tiret cadratin) alors que les playlists les affichent en `Artiste - Titre` (trait d'union). northwood veut **`Artiste - Titre` partout**, avec un **trait d'union `-`** comme séparateur unique.

## Story

As a musicien qui consulte son journal et ses playlists,
I want que les chansons s'affichent toujours sous la forme « Artiste - Titre »,
so that l'application est cohérente d'un écran à l'autre.

## Acceptance Criteria

1. **Historique de session aligné** — Given l'historique de session (`MySessionsPage`), When une entrée renvoie à une chanson avec un artiste, Then elle s'affiche `Artiste - Titre` (et non plus `Titre — Artiste`) — dans la combobox de saisie comme dans la liste des entrées et le groupe « Recent ».
2. **Séparateur unifié** — le séparateur est le **trait d'union ` - `** (comme les playlists), plus le tiret cadratin `—`.
3. **Chanson sans artiste** — Given une chanson sans artiste, Then seul le titre s'affiche (comportement actuel préservé, pas de séparateur orphelin).
4. **Playlists inchangées** — `MyPlaylistsPage` est déjà en `Artiste - Titre` : aucune régression d'affichage, de recherche ni de tri.
5. **Liste répertoire inchangée** — la Songlist principale (`SongsList`) affiche titre/artiste en colonnes séparées : hors périmètre, aucune modification.
6. **Aucune régression** — édition de session, résolution des libellés orphelins (FR4 snapshot) et recherche dans la combobox restent fonctionnelles.

## Tasks / Subtasks

- [x] `MySessionsPage.tsx` — helper `formatSongLabel` (l.25) : `${song.artist} - ${song.title}` quand artiste présent, sinon `song.title`
- [x] `MySessionsPage.tsx` — `labelByRef` des récents (l.326) : **réutilise `formatSongLabel`** (doublon de logique supprimé)
- [x] `MySessionsPage.tsx` — **affichage read-only de l'historique** (l.826-827, 3ᵉ site découvert au dev) : artiste muté d'abord + ` - ` puis titre `font-medium` ; sans artiste → titre seul
- [x] Tests — `MySessionsPage.test.tsx` : ordre `Artiste - Titre` + séparateur `-` dans l'historique (test renforcé) + dans l'option de la combobox (test ajouté) ; cas sans artiste (titre seul) conservé
- [x] Vérifs : typecheck (0) + tests frontend (179 ✓) + lint (0 nouvelle erreur)

### Review Findings

- [x] [Review][Decision→Fixed] Heatmap day-detail incohérent — `MyHeatmapPage.tsx` rendait les `session.items` en titre seul, sans artiste. **Résolu (choix northwood : étendre)** : la heatmap charge désormais le catalogue chansons au montage (`getAllSongs`, fetch optionnel/silencieux), résout l'artiste via `artistBySongUid` et rend le détail-jour **identique** à l'historique (« Artiste - Titre » + séparateur minutes aligné sur ` · `). Test ajouté.
- [x] [Review][Patch→Fixed] Test ajouté sur l'affichage *valeur sélectionnée* de la combobox (`labelForRef`) [src/__tests__/MySessionsPage.test.tsx] — sélection d'une chanson → le champ affiche « Artiste - Titre » au repos. AC1 « combobox de saisie » désormais couvert par un test.
- [x] [Review][Defer] Libellé « Frankenstein » chanson renommée [MySessionsPage.tsx:822-827] — titre = snapshot FR4 figé, artiste = catalogue live ; une chanson renommée affiche `ArtisteLive - AncienTitre`. Préexistant (l'artiste a toujours été live), l'ordre artiste-d'abord le rend juste plus visible. — deferred, pre-existing
- [x] [Review][Defer] `MyPlaylistsPage` non gardé sur artiste vide [MyPlaylistsPage.tsx:132,307-322] — construit `${artist} - ${title}` sans garde ; une chanson à artiste `""` y affiche un « - Titre » orphelin (alors que sessions/combobox sont gardés). Préexistant, hors diff. — deferred, pre-existing

## Dev Notes

Changement purement frontend, contenu dans `MySessionsPage.tsx` (les playlists sont déjà conformes). Attention au snapshot FR4 : l'item de session ne stocke que le titre — l'artiste est résolu depuis le catalogue live (`artistBySongUid`, l.354) ; ne pas régresser la résolution des entrées orphelines (qui n'ont pas d'artiste et gardent leur libellé snapshot). northwood plus à l'aise front → changement à faible risque.

## Dev Agent Record

### Debug Log

- Au dev, découverte d'un **3ᵉ site** non listé dans le scope initial : l'affichage read-only de l'historique (l.826-827) composait `{titre}` + ` — {artiste}` via deux `<span>` (et non via `formatSongLabel`). C'est précisément l'écran signalé par northwood. Tâche ajoutée et traitée ; AC1 (« la liste des entrées ») le couvrait déjà.
- Choix de rendu historique : artiste en gris muté + ` - ` puis titre en `font-medium` (le titre reste l'élément mis en avant, comme avant).

### Completion Notes

- Les 3 sites de libellé chanson de `MySessionsPage` passent en `Artiste - Titre` avec trait d'union `-`. Playlists déjà conformes (inchangées), Songlist hors périmètre (colonnes séparées).
- `labelByRef` réutilise désormais `formatSongLabel` → logique de format unique (plus de doublon).
- Tests : test d'historique renforcé pour verrouiller l'ordre + nouveau test sur l'option de la combobox. Cas « sans artiste » préservé (titre seul, pas de séparateur orphelin).

## File List

- `src/pages/MySessionsPage.tsx` (modifié)
- `src/__tests__/MySessionsPage.test.tsx` (modifié)
- `src/pages/MyHeatmapPage.tsx` (modifié — extension review : artiste dans le détail-jour)
- `src/__tests__/MyHeatmapPage.test.tsx` (modifié — mock songService + test « Artiste - Titre »)

## Change Log

- 2026-06-11 — Story 5.5 implémentée : libellé chanson `Artiste - Titre` (trait d'union) cohérent dans l'historique de session (combobox, groupe Recent, liste read-only). Statut → review.
- 2026-06-11 — Ajustement (retour northwood) : dans la liste read-only, l'artiste hérite désormais de la couleur du titre (`text-gray-700/300`) au lieu du gris atténué (`text-gray-500/400`) — couleur uniforme, le titre conserve `font-medium`.
- 2026-06-11 — Code review : extension (décision northwood) à `MyHeatmapPage` — le détail-jour affiche « Artiste - Titre » (catalogue chargé au montage, fetch optionnel) et aligne le séparateur minutes sur ` · `. 2 dettes préexistantes reportées dans `deferred-work.md`.
- 2026-06-11 — Code review : patch appliqué (test de la valeur sélectionnée de la combobox). Suite frontend **181/181**, typecheck 0, lint clean. Statut → done.
