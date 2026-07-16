---
baseline_commit: 4bdc7fa9d3f11e10491529b1a5ef1b32c789c601
---

# Story 19.9: Hook `useRowSelection` partagé (multi-select Songlist ↔ Catalog)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want **the row-selection Set mechanics factored into ONE shared `useRowSelection` hook used by both the Songlist table and the Catalog manage table**,
so that **the byte-identical selection boilerplate (toggle / isSelected / select-all / clear / count / localStorage) lives in one tested place and can't drift, exactly as story 19.7 did for autosave**.

## Contexte / origine

2ᵉ story du **cluster refacto DRY** promu à la revue `deferred-work.md` du 2026-07-16 (dette *multi-select* [MED]). Le cluster est développé sur la branche epic **`feat/epic-19-composants-partages`** (19-7 `useAutosave` déjà mergé dessus). Même philosophie que 19-7 : **extraire le noyau générique SÛR**, laisser le **domaine divergent** dans les pages via des primitives — ne rien unifier de force.

## Découpage du cluster (rappel)

- **19-7** ✅ done : `useAutosave` partagé.
- **19-9 (celle-ci)** : `useRowSelection` partagé (Songlist ↔ Catalog).
- **19-10** : `<StickyActionBar>` + combobox artiste/album partagé + endpoint check exact `(title, artist)`.
- **19-8** : normalisation saisie (`normalizeInt`/`normalizeLanguage`).

## Objectif NON négociable

**Zéro changement de comportement** utilisateur (Songlist ET Catalog identiques). **Tous les tests verts des deux côtés** (front **422** actuellement) **sans réécrire une seule assertion**. Refacto **iso-fonctionnel**.

## Périmètre — décision (lire avant de coder)

- **DANS le périmètre** : extraire un hook **`src/hooks/useRowSelection.ts`** = l'état `Set<string>` + les primitives **byte-identiques** entre les deux pages (`toggle`, `isSelected`, `clear`, `size`, `allDisplayedSelected(uids)`, `selectOnly(uids)`, `addMany(uids)`, `removeMany(uids)`) + **persistance localStorage optionnelle** (`persistKey`).
- **HORS périmètre (ne PAS faire ici)** : un `<MultiSelectTable>` générique. Le **rendu** des deux tables diverge trop (colonnes instrument/last-played + barres bulk *playlists*/*mark-as-played* côté Songlist ; colonnes artist/title/key/mode/timeSig + badge *Draft* côté Catalog) — l'unifier serait une abstraction lourde à faible garantie iso-fonctionnelle. Le titre backlog mentionnait « et/ou `<MultiSelectTable>` » : **on tranche pour le hook seul.** (Un éventuel `<RowCheckboxCell>`/`<SelectAllCheckbox>` minuscule reste possible plus tard, hors scope ici.)

## Acceptance Criteria

1. **Hook créé** — `src/hooks/useRowSelection.ts` encapsule l'état `Set<string>` + les primitives génériques identiques aux deux implémentations actuelles : `toggle(uid)` (add/delete immuable), `isSelected(uid)`, `clear()`, `size`, `allDisplayedSelected(uids: string[])` (`uids.length > 0 && uids.every(has)`), `selectOnly(uids)` (= `new Set(uids)`), `addMany(uids)`, `removeMany(uids)`. **Persistance localStorage optionnelle** via une option `persistKey?: string` : si fournie, init lazy depuis `localStorage[persistKey]` (JSON array) ET effet d'écriture `[selected]` (try/catch silencieux) — reproduisant EXACTEMENT le comportement Songs actuel (`songsSelectedUids`). Sans `persistKey` : pas de localStorage (comportement Catalog). `src/hooks/useRowSelection.test.ts` (unitaire) : toggle add/remove, clear, allDisplayedSelected (vide → false), selectOnly remplace, addMany/removeMany, persistance round-trip (avec `persistKey`) vs aucune écriture (sans).
2. **CatalogManage migré** — `src/pages/CatalogManage.tsx` utilise `useRowSelection` (sans `persistKey`). `toggleSelect` → `toggle`, `allDisplayedSelected` depuis le hook. `toggleSelectAll` **composé dans la page** depuis les primitives (sémantique **« within »** : union/retrait des `displayedUids` DANS le set existant → **préserve les sélections des autres pages** — la table est paginée). Le `handleDeleteSelected` **reste dans la page** (Promise.allSettled + tolérance 404 + step-back pagination + toast d'échec partiel + splice `setData`) ; seule la maj de sélection post-delete passe par `removeMany(removed)`. Tests `CatalogManage.test.tsx` (9) verts, aucune assertion changée.
3. **Songs (Songlist) migré** — `src/pages/Songs.tsx` utilise `useRowSelection({ persistKey: 'songsSelectedUids' })`. `toggleSelectSong` → `toggle`. La **persistance localStorage** (init `songsSelectedUids` + effet d'écriture) est désormais **dans le hook** (retirer l'état local + l'effet L730-734). `toggleSelectAll` **composé dans la page** (sémantique **« replace »** : `allDisplayedSelected ? clear() : selectOnly(displayedSongs.map(uid))` — reproduit `new Set(displayed)`, qui **remplace** la sélection). Les nettoyages de sélection restent pilotés par la page : single-delete → `removeMany([uid])` (L1484), bulk-delete + mark-as-played → `clear()` (L1537, L1256). Les actions bulk **spécifiques Songlist** (`handleConfirmDeleteSelected`, `handleMarkSelectedAsPlayedNow`, `handleApplySelectedToPlaylists`, `bulkPlaylistSelection`) **restent dans la page** — hors du hook. `SongsList.tsx` (présentationnel) **inchangé** : il reçoit toujours `selectedSongs`/`toggleSelectSong`/`toggleSelectAll`/`allDisplayedSelected` en props. Tous les tests Songs verts, aucune assertion changée.
4. **Aucune régression** — front (422) vert, tsc + eslint propres. Aucun changement backend. Aucun changement visuel/UX. Aucune assertion de test réécrite (nouveau fichier de test hook OK).

## Tasks / Subtasks

- [x] **Task 1 — Concevoir + créer `useRowSelection`** (AC: 1)
  - [x] Relire les deux implémentations : Songs.tsx (`selectedSongs` state + init localStorage L92-95, effet persistance L730-734, `toggleSelectSong` L1622-1632, `selectAllSongs`/`deselectAllSongs`/`toggleSelectAll` L1634-1648, `allDisplayedSelected` L1764, retraits L1484 & L1537 & L1256) ET CatalogManage.tsx (`selected` state L29, `toggleSelect` L89-93, `toggleSelectAll` L95-100, `allDisplayedSelected` L87, retrait post-delete L127). Frontière confirmée : primitives identiques vs 3 divergences (toggleAll replace-vs-within, persistance, flux delete).
  - [x] Écrire `src/hooks/useRowSelection.ts` (générique + `persistKey` optionnel) + `src/hooks/useRowSelection.test.ts`. **→ 8 tests unitaires verts.**
- [x] **Task 2 — Migrer CatalogManage** (AC: 2)
  - [x] Remplacé l'état/primitives par `useRowSelection()` ; `toggleSelectAll` (within) composé dans la page via `addMany`/`removeMany` ; `removeMany(removed)` branché dans `handleDeleteSelected` (reste inchangé). **→ 9 tests Catalog verts, 0 assertion changée.**
- [x] **Task 3 — Migrer Songs** (AC: 3)
  - [x] Remplacé l'état/init/effet-persistance par `useRowSelection({ persistKey: 'songsSelectedUids' })` ; `toggleSelectAll` (replace) composé via `clear`/`selectOnly` ; `removeMany([uid])` (single-delete) + `clear()` (bulk-delete, mark) branchés. Bulk actions Songlist-only + `SongsList` props inchangés. **→ 83 tests Songs verts, 0 assertion modifiée.**
- [x] **Task 4 — Validation globale** (AC: 4)
  - [x] Front **430** (422 + 8) + tsc + eslint clean. Aucun changement backend. Filet = CatalogManage.test (9) + SongDeletion + suite Songs* complète, tous verts sans réécriture.

## Dev Notes

### Frontière générique ↔ domaine (le cœur du design)

**Générique (le hook) — byte-identique aujourd'hui dans les deux pages :**
- `toggle(uid)` : `new Set(prev)` puis add/delete. Identique (Songs L1622-1632 ≡ Catalog L89-93).
- `isSelected(uid)` = `selected.has(uid)`.
- `clear()` = `setSelected(new Set())` (Songs post-bulk L1537 / mark L1256 ; utile Catalog aussi).
- `size` = `selected.size`.
- `allDisplayedSelected(uids)` = `uids.length > 0 && uids.every(u => selected.has(u))` (Songs L1764 ≡ Catalog L87).
- `selectOnly(uids)` = `new Set(uids)` ; `addMany(uids)` / `removeMany(uids)` = union/retrait immuables.
- **Persistance optionnelle** (`persistKey`) : init lazy `JSON.parse(localStorage[key])` (Songs L92-95) + effet `[selected]` `localStorage.setItem(key, JSON.stringify([...selected]))` en try/catch (Songs L730-734).

**Domaine (dans la page) — les 3 divergences à NE PAS unifier :**
1. **toggleAll** : Songlist = **replace** (`selectAllSongs` fait `new Set(displayed)`, qui DROP une sélection filtrée hors vue) ; Catalog = **within** (union/retrait des seuls `displayedUids`, PRÉSERVE les sélections d'autres pages — table paginée). → chaque page compose son `toggleSelectAll` depuis les primitives ; le hook ne fournit PAS un `toggleAll` unique.
2. **persistance** : Songlist oui (`songsSelectedUids`), Catalog non. → `persistKey` optionnel.
3. **flux delete** : Songlist (`handleConfirmDeleteSelected` : `Promise.all` + `setSongs` filter + `clear()`) vs Catalog (`handleDeleteSelected` : `Promise.allSettled` + tolérance `CatalogNotFoundError` + step-back pagination + toast échec partiel + splice `setData` + `removeMany`). 100 % domaine — seul le nettoyage du Set (`clear`/`removeMany`) vient du hook.

### Anchors code (lus)
- **Songs.tsx** : `selectedSongs` L92-95 (init localStorage), effet persistance L730-734, `toggleSelectSong` L1622-1632, `selectAllSongs`/`deselectAllSongs`/`toggleSelectAll` L1634-1648, `allDisplayedSelected` L1764, retrait single-delete L1484-1488, `clear` post-bulk L1537 + post-mark L1256. Passe le tout en props à `<SongsList>` L1906-1964. Bulk playlists/mark = Songlist-only (L1222-1310).
- **CatalogManage.tsx** : `selected` L29, `allDisplayedSelected` L87, `toggleSelect` L89-93, `toggleSelectAll` (within) L95-100, `handleDeleteSelected` L102-130 (retrait `removeMany` L127).
- **SongsList.tsx** : purement présentationnel (checkbox header L362-367, ligne + `stopPropagation` L379-395) — **ne pas toucher**, il consomme les props.

### Pièges (leçons)
- **Zéro changement de comportement** : si un test casse, c'est le refacto qui a un bug, pas le test — ne pas « ajuster » un test.
- **Ne pas unifier toggleAll** : replace (Songlist) ≠ within (Catalog). Les composer dans les pages.
- **Persistance = option** : ne jamais persister côté Catalog (aucune clé), toujours côté Songlist (`songsSelectedUids`).
- **Immutabilité** : toujours `new Set(prev)` (jamais muter en place) — les deux originaux le font, React s'appuie dessus.
- **Périmètre serré** : hook de sélection uniquement. Pas de `<MultiSelectTable>`, pas de sticky/combobox (19-10), pas de normalisation (19-8).

### Project Structure Notes
- **NEW** : `src/hooks/useRowSelection.ts`, `src/hooks/useRowSelection.test.ts`.
- **UPDATE** : `src/pages/CatalogManage.tsx`, `src/pages/Songs.tsx` (branchement + retrait des copies locales). `src/components/SongsList.tsx` **inchangé**.
- **Aucun** changement backend.

### References
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — cluster composants partagés, dette multi-select [MED], promu 2026-07-16]
- [Source: `src/pages/Songs.tsx` + `src/pages/CatalogManage.tsx` — les deux implémentations (source de vérité)]
- [Source: `_bmad-output/implementation-artifacts/19-7-composants-partages-catalog-songlist.md` — le modèle de refacto iso-fonctionnel (frontière générique/domaine, `'block'`/`unmount` = préserver les écarts au lieu de les gommer)]
- [Filet de tests : `src/__tests__/CatalogManage.test.tsx` (9, dont select/select-all/delete-selected/pagination/échec partiel) + `src/__tests__/SongDeletion.test.tsx` (bulk delete Songlist) + suite Songs* complète]

### Review Findings

Code review 2026-07-16 (3 couches : Blind Hunter / Edge Case Hunter / Acceptance Auditor). Convergence : **aucune régression, aucune violation d'AC, périmètre tenu, aucune assertion de test modifiée** (front 430 / tsc / eslint verts confirmés indépendamment ; `SongsList.tsx` bien absent du diff). 1 durcissement retenu.

- [x] [Review][Patch] Init persistance robuste au non-array — `new Set(JSON.parse(saved))` : une valeur stockée qui parse en string/number (pas un tableau) produit une sélection garbage (une string s'itère en caractères) sans lever. Le try/catch ne couvre pas ce cas. Ajouter un garde `Array.isArray(parsed) ? parsed : []`. [src/hooks/useRowSelection.ts]

**Écartés (dismiss)** : (a) try/catch à l'init (crash-sur-localStorage-corrompu → reset vide) = durcissement volontaire déjà disclosé dans les Completion Notes, direction sûre ; (b) Catalog `toggleSelectAll` décide sur la closure de rendu au lieu de l'updater fonctionnel → inobservable (un clic = une action, pas de mutation same-tick sans re-render) ; Songs non concerné (l'original lisait déjà l'état en closure).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `npx jest src/hooks/useRowSelection.test.ts` → 8/8.
- `npx jest CatalogManage` → 9/9. `npx jest Songs SongForm SongDeletion` → 83/83.
- Front complet `npx jest` → **430/430** (47 suites). `tsc --noEmit` clean. `eslint` (fichiers touchés) clean. Aucun changement backend.

### Completion Notes List

- **Frontière générique↔domaine.** Le hook `useRowSelection` possède l'état `Set<string>` + primitives byte-identiques (`toggle`, `isSelected`, `size`, `clear`, `allDisplayedSelected(uids)`, `selectOnly`, `addMany`, `removeMany`) + persistance localStorage optionnelle (`persistKey`). Les pages gardent l'alias `const selected = selection.selected` (le Set live), donc `selected.size`/`.has`/`Array.from` restent inchangés → diff minimal.
- **3 divergences préservées dans les pages** (composées depuis les primitives, jamais unifiées) : (1) **toggleAll** — Songlist `clear`/`selectOnly` (replace : drop la sélection filtrée hors vue) vs Catalog `addMany`/`removeMany` des `displayedUids` (within : préserve les autres pages paginées) ; (2) **persistance** — Songlist `persistKey: 'songsSelectedUids'`, Catalog aucun ; (3) **flux delete** 100 % domaine (Songlist `Promise.all`+`setSongs` ; Catalog `Promise.allSettled`+404-tolérance+step-back pagination+toast partiel) — seul le nettoyage du Set passe par `clear()`/`removeMany()`.
- **`SongsList.tsx` inchangé** (présentationnel — reçoit toujours `selectedSongs`/`toggleSelectSong`/`toggleSelectAll`/`allDisplayedSelected` en props). Bulk actions Songlist-only (`handleMarkSelectedAsPlayedNow`, `handleApplySelectedToPlaylists`, `bulkPlaylistSelection`) hors du hook.
- **Périmètre tenu** : hook de sélection uniquement ; PAS de `<MultiSelectTable>` (rendu trop divergent). Iso-fonctionnel : 0 assertion réécrite, 0 changement UX/visuel/backend.
- **Note durcissement** : l'init localStorage du hook ajoute un try/catch (l'original Songs n'en avait pas au read) → strictement plus robuste (localStorage corrompu ne crashe plus), aucun test impacté.

### File List

- **NEW** `src/hooks/useRowSelection.ts` — moteur de sélection partagé (générique + `persistKey`).
- **NEW** `src/hooks/useRowSelection.test.ts` — 8 tests unitaires.
- **UPDATE** `src/pages/CatalogManage.tsx` — migré sur `useRowSelection` (sans persistKey).
- **UPDATE** `src/pages/Songs.tsx` — migré sur `useRowSelection({ persistKey })` ; état/init/effet-persistance locaux retirés.
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml` — 19-9 in-progress → review.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-16 | 0.1 | Story créée (create-story) — extraction `useRowSelection` partagé (Songlist+Catalog), refacto iso-fonctionnel ; périmètre tranché = hook seul (pas de `<MultiSelectTable>`) ; 3 divergences (toggleAll replace/within, persistance, flux delete) gardées dans les pages | northwood |
| 2026-07-16 | 1.0 | dev-story — hook `useRowSelection` créé (8 tests) + CatalogManage & Songs migrés. Iso-fonctionnel : front 430, tsc+eslint clean, 0 assertion touchée, SongsList inchangé. | northwood |
