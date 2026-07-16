---
baseline_commit: c5d325429d5802ac549caa3dd1f0628d918c2aed
---

# Story 19.7: Hook `useAutosave` partagé (Songlist ↔ Catalog)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want **the autosave mechanics factored into ONE shared `useAutosave` hook used by both the Song form and the Catalog form**,
so that **the two never drift again — the 19.6 QA proved a copied-then-diverged autosave loses guards silently (4 review patches: conflict surfacing, title-required, baseline, flush)**.

## Contexte / origine

Promu à la **revue `deferred-work.md` du 2026-07-16** (dette DRY Catalog↔Songlist). Le cluster « composants partagés » (autosave, multi-select, sticky bar, combobox) est **découpé** — cette story ne fait que **le hook autosave** (le plus à risque ET le plus utile). Les autres extractions sont des stories de suivi (cf. Découpage).

## Découpage du cluster (une story chacune)

- **19-7 (celle-ci)** : `useAutosave` hook partagé (Songs + CatalogAdmin).
- **19-9** : multi-select partagé (`useRowSelection`/`<MultiSelectTable>` : SongsList ↔ CatalogManage).
- **19-10** : `<StickyActionBar>` + combobox artiste/album partagé (remplace le `<datalist>` Catalog) + endpoint check **exact** `(title, artist)` (remplace le dup-check best-effort 19.6).
- **19-8** (déjà backlog) : normalisation saisie (`normalizeInt`/`normalizeLanguage`, Song + Catalog).

## Objectif NON négociable

**Zéro changement de comportement** côté utilisateur (Songlist ET Catalog restent identiques). **Tous les tests verts des deux côtés** (front 411 actuellement, dont ~100 sur `Songs.tsx`/autosave). C'est un refacto **iso-fonctionnel**.

## Acceptance Criteria

1. **Hook créé** — `src/hooks/useAutosave.ts` encapsule la **mécanique générique** : `saveStatus` (`'idle'|'saving'|'saved'|'error'|'conflict'`), garde de ré-entrance (`savingRef`), timer de débounce (~1200 ms, cancellable), **baseline anti-no-op** (skip si `JSON(form) === baseline`), **création lazy** (mode add → 1er save = create) et **flush** (annule le timer + persiste), avec **flush au démontage réservé à l'édition** (jamais de create au démontage — leçon 19.6 F2). La logique **domaine** passe par callbacks (voir AC2).
2. **API par callbacks** — le hook ne connaît NI l'API songService/catalogService, NI la transition add→edit, NI la réconciliation de liste. Il expose/consomme au minimum : `{ form, editingUid, baseline, canSave(form), onCreate(form)→created, onUpdate(uid,form)→updated, onSaved(snapshot,result), onConflict?(err), debounceMs }` → `{ saveStatus, flush(), savingRef }`. (Le nom exact des props est au dev ; l'important = la frontière générique/domaine.)
3. **CatalogAdmin migré** — `src/pages/CatalogAdmin.tsx` utilise `useAutosave` au lieu de sa copie locale. Comportement identique : create-lazy + `navigate(replace)`, PUT débounced, baseline, flush edit-only, statut « Saving… / Saved ✓ », **blocage doublon** (dupRef → `canSave` renvoie false) + Publish masqué. Les patches 19.6 (F1–F4) sont préservés **via le hook**. Tests `CatalogAdmin.test.tsx` verts sans réécriture de comportement.
4. **Songs migré** — `src/pages/Songs.tsx` utilise `useAutosave`. Les parties **spécifiques Songs restent dans la page** (réconciliation `setSongs`, `playlistFilter`, la **transition invisible add→edit** avec seed `editBaselineJson`/`loadedFormUidRef`/`navigate(replace)`, le `conflictKeyRef` + `liveDuplicate`, le min-500 ms « Saving » perceptible, l'exclusion `lastPlayed`) — branchées via les callbacks du hook. **Les ~100 tests de `Songs.tsx` (autosave, add→edit, conflit, flush, beforeunload) restent verts, sans modification de leurs assertions.**
5. **Aucune régression** — front (411) + back verts, tsc + eslint propres. Aucun changement backend. Aucun changement visuel/UX.

## Tasks / Subtasks

- [x] **Task 1 — Concevoir + créer `useAutosave`** (AC: 1, 2)
  - [x] Lire EXHAUSTIVEMENT l'autosave de `Songs.tsx` (`autoSaveSong` ~L936-1021, `autoSaveRef` L1024, effet débounce L1030-1040, `flushAutoSave` L1045+, refs `savingRef`/`saveTimerRef`/`conflictKeyRef`, `foldedTitleArtistKey`) ET la copie de `CatalogAdmin.tsx` (autoSave + effets débounce/flush/dup). Établir la **frontière générique↔domaine** (ce qui est identique vs spécifique).
  - [x] Écrire `src/hooks/useAutosave.ts` (générique) : refs, débounce, baseline, create-lazy, flush (edit-only au démontage), transitions de `saveStatus`. Domaine par callbacks. `src/hooks/useAutosave.test.ts` (unitaire, timers fake) : débounce déclenche 1 save ; baseline skip ; create-lazy 1 seule fois ; flush annule le timer + persiste ; démontage ne crée pas. **→ 11 tests unitaires verts.**
- [x] **Task 2 — Migrer CatalogAdmin (le plus simple d'abord)** (AC: 3)
  - [x] Remplacer la copie locale par `useAutosave` ; brancher onCreate/onUpdate/navigate/canSave (dupRef) ; garder Publish masqué sur doublon. Vérifier `CatalogAdmin.test.tsx` vert **sans changer les assertions**. **→ 11 tests Catalog verts, 0 assertion touchée.**
- [x] **Task 3 — Migrer Songs (le plus risqué)** (AC: 4)
  - [x] Remplacer `autoSaveSong`/effets par `useAutosave` ; garder dans la page la transition add→edit, la réconciliation liste, `playlistFilter`, `conflictKeyRef`/`liveDuplicate`, min-500 ms, `lastPlayed` exclu. **→ 92 tests Songs verts, 0 assertion modifiée.** Deux comportements Songs-only ajoutés PROPREMENT au hook plutôt que dupliqués : sentinel `'block'` (bloquer sans toucher le statut, écart Catalog vs Songs sur titre vide) + option `unmount: 'flush' | 'edit-only-save'` (Songs crée au démontage = quitter/garder ; Catalog jamais = F2).
- [x] **Task 4 — Validation globale** (AC: 5)
  - [x] Front **422** (411 + 11 hook) + back **305** verts, tsc + eslint clean. Diff comportemental = néant (les ~100 tests Songs autosave/add→edit/conflit/flush/beforeunload + les 11 Catalog sont le filet, tous verts sans réécriture).

## Dev Notes

### Frontière générique ↔ domaine (le cœur du design)
Le hook possède : `savingRef` (anti-réentrance), `saveTimerRef` (débounce annulable), `saveStatus`, la **baseline** (`JSON(form)` du dernier save / chargement) et son test d'égalité, la branche **create-lazy** (`editingUid === null` → onCreate au 1er save), le **flush** (clear timer + save), le **flush au démontage EDIT-only** (19.6 F2 : jamais de create au démontage → sinon brouillon/song fantôme + course navigate).
Le domaine (dans la page) : l'appel réseau réel (`onCreate`/`onUpdate` = songService/catalogService), la **réconciliation post-save** (`onSaved` : setSongs / setEditBaseline / navigate add→edit), le **gating** (`canSave` : titre non vide **et** pas de doublon), la **gestion conflit** (`onConflict` : Songs a `conflictKeyRef` + réconciliation liste + statut `conflict` ; Catalog a `dupRef` + message).

### Anchors code (lus)
- **Songs.tsx** `autoSaveSong` (L936-1021) : garde titre vide (L941), blocage doublon `liveDuplicate || conflictKeyRef` (L948), payload `lastPlayed` supprimé (L962), **snapshot baseline** (L963), create-lazy + **transition add→edit invisible** (L968-988 : `setEditBaselineJson`+`loadedFormUidRef`+`setFormReady`+`navigate(replace)` AVANT que l'effet build-form ne recharge → anti-clobber), update (L989-993), **min 500 ms** « Saving » (L995-996), catch `SongConflictError` → réconcilie + `conflictKeyRef` + statut `conflict` (L1004-1013). Effet débounce L1030-1040 (deps `[form, editingUid, editBaselineJson]`, skip baseline en edit, skip titre-vide en add). `flushAutoSave` L1045+.
- **CatalogAdmin.tsx** : version simplifiée du même motif (workingUid, justCreatedRef anti-clobber, baselineRef, dupRef, flush edit-only via workingUidRef). C'est la cible d'alignement.
- **⚠️ Songs.tsx est entangé** (~1800 lignes) : l'autosave touche `editingUid`, `editBaselineJson`, `formReady`, `loadedFormUidRef`, `pathnameRef`/`isMountedRef` (quitter=garder), `liveDuplicate`, `playlists`. Ne PAS casser ces couplages — les brancher via callbacks, pas les déplacer dans le hook.

### Pièges (leçons)
- **Zéro changement de comportement** : c'est un refacto. Si un test échoue, c'est le refacto qui a un bug, pas le test — ne PAS « corriger » un test pour le faire passer.
- **StrictMode** : le hook doit être StrictMode-safe (double-mount effets/timers) — déjà le cas des deux implémentations.
- **Flush au démontage** : edit-only (F2). Le create au démontage est interdit.
- **Migrer Catalog d'abord** (simple) puis Songs (complexe) — valider les tests à chaque étape, pas à la fin.
- **Ne pas élargir le périmètre** : multi-select / sticky / combobox / normalisation = stories 19-9 / 19-10 / 19-8. Ici : autosave uniquement.

### Project Structure Notes
- **NEW** : `src/hooks/useAutosave.ts`, `src/hooks/useAutosave.test.ts`.
- **UPDATE** : `src/pages/CatalogAdmin.tsx`, `src/pages/Songs.tsx` (branchement sur le hook ; retrait des copies locales). Tests existants inchangés dans leurs assertions.
- **Aucun** changement backend.

### References
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — cluster composants partagés, promu 2026-07-16]
- [Source: `src/pages/Songs.tsx` L915-1050 — autosave à extraire (source de vérité)]
- [Source: `src/pages/CatalogAdmin.tsx` — copie divergée à aligner (patches 19.6 F1-F4 à préserver via le hook)]
- [Source: `_bmad-output/implementation-artifacts/19-6-catalog-draft-publish-autosave.md` — Review Findings F1-F4 (les gardes que le hook doit porter)]

### Review Findings

Code review 2026-07-16 (3 couches adversariales : Blind Hunter / Edge Case Hunter / Acceptance Auditor). Convergence : **aucune régression de comportement, aucune violation d'AC, aucune assertion de test modifiée** (front 422 / back 305 / tsc / eslint verts confirmés indépendamment). 4 findings écartés comme non-atteignables/pré-existants, 1 durcissement retenu.

- [x] [Review][Patch] Invariant `baselineRef` ↔ setState non documenté — le hook lit `opts.baseline` au rendu ; Catalog passe `baselineRef.current` (ref mutée impérativement). Non-observable aujourd'hui (chaque écriture est appariée à un setState + garde `savingRef`), mais un futur write sans re-render casserait le no-op en silence. Ajouter un commentaire d'invariant près des écritures `baselineRef.current`. [src/pages/CatalogAdmin.tsx]

**Écartés (dismiss)** : (a) `savingRef` référencé ailleurs dans CatalogAdmin → faux positif, tsc exit 0 ; (b) reorder dup-vs-baseline Catalog → prouvé non-atteignable (dup ⇒ form≠baseline) par les 3 couches ; (c) `setState('saved')` post-démontage pendant le délai 500 ms → pré-existant + no-op React 18, non introduit ; (d) no-op baseline ajouté côté Songs → prouvé inerte (exclu en amont par `scheduleWhen`/`flushWhen`).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `npx jest src/hooks/useAutosave.test.ts` → 11/11.
- `npx jest CatalogAdmin catalogService` → 19/19.
- `npx jest Songs SongForm SongDeletion songDuplicate` → 92/92 (dont SongsAutoSave 21).
- Front complet `npx jest` → **422/422** (46 suites). Back `npm test` → **305/305**. `tsc --noEmit` clean. `eslint` (fichiers touchés) clean.

### Completion Notes List

- **Frontière générique↔domaine.** Le hook `useAutosave` possède le **cycle de vie** : `savingRef` (anti-réentrance), timer de débounce partagé + annulable, **baseline anti-no-op** (skip si `JSON(form)===baseline`), **dispatch create-lazy** (`editingUid===null` → `onCreate`, sinon `onUpdate`), **min-visible** optionnel, **flush** (annule le timer + persiste), **flush au démontage** paramétrable, et le **séquençage du statut** (`saving`→`saved`/`error`, gate de blocage). Le **domaine** est injecté par callbacks : `onCreate`/`onUpdate` (appel réseau + payload + transition add→edit + réconciliation liste + écriture baseline), `onError` (conflit/erreur → statut + effets), `blockedStatus` (titre vide / doublon), `scheduleWhen`/`flushWhen`, `setSaveStatus`, `onStatusSaved`. La page garde la **propriété** de son `saveStatus` (rendu) et de sa **baseline** (Songs = `editBaselineJson` state ; Catalog = `baselineRef`) — le hook les pilote/lit, il ne les stocke pas → aucun couplage page ne fuit dans le hook.
- **Deux écarts réels préservés sans les gommer** (ajoutés au hook, pas dupliqués) :
  1. `blockedStatus` peut renvoyer le sentinel **`'block'`** = bloquer SANS toucher le statut (Catalog laisse le statut tel quel sur titre vidé ; Songs met `'idle'`).
  2. **`unmount: 'flush' | 'edit-only-save' | 'none'`** : Songs = `'flush'` (le mode add PEUT créer au démontage — *quitter = garder*, la chanson créée est conservée) ; Catalog = `'edit-only-save'` (jamais de create au démontage — leçon 19.6 F2).
- **Patches 19.6 F1–F4 portés par le hook** : F1 (conflit surfacé) via `onError`/`blockedStatus` ; F2 (jamais de create au démontage côté Catalog) via `unmount:'edit-only-save'` ; F3 (baseline anti-no-op) dans le hook ; F4 (flush au démontage) dans le hook.
- **Iso-fonctionnel** : aucune assertion de test réécrite des deux côtés ; aucun changement backend, UX ou visuel. Les copies locales (`autoSaveSong`, `autoSave`, refs `savingRef`/`saveTimerRef`/`workingUidRef`, effets débounce + unmount, `flushAutoSave`) sont supprimées au profit d'un seul appel `useAutosave`.
- **Dette DRY 19.7 (autosave) soldée** ; restent 19-9 (multi-select), 19-10 (sticky + combobox + check exact), 19-8 (normalisation).

### File List

- **NEW** `src/hooks/useAutosave.ts` — moteur d'autosave partagé (générique + callbacks domaine).
- **NEW** `src/hooks/useAutosave.test.ts` — 11 tests unitaires (timers fake) du cycle de vie.
- **UPDATE** `src/pages/CatalogAdmin.tsx` — migré sur `useAutosave` (retrait de la copie locale) ; `saveStatus` élargi au type `SaveStatus`.
- **UPDATE** `src/pages/Songs.tsx` — migré sur `useAutosave` (retrait de `autoSaveSong`/effets/`flushAutoSave`/unmount) ; domaine conservé dans la page (transition add→edit, réconciliation, `conflictKeyRef`, payload/lastPlayed, min-500 ms).
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml` — 19-7 in-progress → review.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-16 | 0.1 | Story créée (create-story) — extraction `useAutosave` partagé (Songs+Catalog), refacto iso-fonctionnel ; cluster découpé (19-9 multi-select, 19-10 sticky+combobox+check-exact, 19-8 normalisation) | northwood |
| 2026-07-16 | 1.0 | dev-story — hook `useAutosave` créé (11 tests) + CatalogAdmin & Songs migrés. Iso-fonctionnel : front 422, back 305, tsc+eslint clean, 0 assertion touchée. Sentinel `'block'` + option `unmount` pour préserver les 2 écarts Songs↔Catalog. | northwood |
