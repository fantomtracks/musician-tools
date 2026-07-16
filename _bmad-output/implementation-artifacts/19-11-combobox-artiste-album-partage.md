---
baseline_commit: c770afc67fab29af8878641a4853a78beaf98b58
---

# Story 19.11: Composant `<AutocompleteInput>` partagé (combobox artiste/album)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want **the bespoke artist/album autocomplete combobox factored out of `SongForm` into ONE shared `<AutocompleteInput>` component, and the Catalog form's native `<datalist>` replaced by it**,
so that **the single hand-rolled combobox (open-policy, keyboard, a11y, filtering) lives in one place, the Catalog form gains the same real combobox as the Song form (retiring the 19.6 `<datalist>` stopgap), and the two never drift**.

## Contexte / origine

**Volet B** du triptyque re-scopé le 2026-07-16 (19-10 sticky ✅ / **19-11 combobox** / 19-12 check-exact). Le **plus invasif** des trois. Cluster refacto DRY sur la branche epic **`feat/epic-19-composants-partages`** (19-7/19-9/19-10 déjà mergés). La dette « datalist Catalog temporaire » a été explicitement notée en 19.6.

## Objectif & nature du changement (à lire — ce n'est PAS un pur iso-fonctionnel)

- **Côté `SongForm` (fiche chanson) = STRICTEMENT iso-fonctionnel.** L'extraction ne doit RIEN changer : même politique d'ouverture (ouvre si match ET pas un unique match exact), même clavier (↓/↑/Enter/Escape/Tab), même souris (survol = highlight, clic = sélection), même a11y (`role=combobox`/`listbox`/`option` + `aria-activedescendant`), même `onBlur` 200 ms, même filtrage. **Les 16 tests `SongForm.test.tsx` restent verts sans réécriture** (dont « hides artist/album suggestions when exact single match »).
- **Côté `CatalogAdmin` (fiche catalog) = UPGRADE UX ASSUMÉ.** On remplace le `<datalist>` natif par le vrai combobox partagé (suggestions = `facets.artist`/`facets.album`). C'est un **changement d'UX volontaire** (léger, positif : parité avec la fiche chanson), **PAS une régression** — à noter explicitement dans les notes et le commit. Les tests Catalog existants ne doivent pas casser (adapter le câblage si un test visait spécifiquement le `<datalist>`, mais **pas** une assertion de comportement du dup-check).

## Acceptance Criteria

1. **Composant créé** — `src/components/AutocompleteInput.tsx` encapsule le combobox éditable réutilisable : un `<div className="relative">` + `<input>` + un dropdown `role="listbox"` d'options filtrées. Il **possède** : l'état `open` + `activeIndex` (internes), la **politique d'ouverture** (à la frappe : ouvre si `filtered.length > 0` ET pas `filtered.length===1 && filtered[0]===value` ; au focus : idem ; à `ArrowDown` : ouvre ; ferme sur Escape/Tab/sélection/`onBlur` après 200 ms), la **navigation clavier** (réutiliser `handleComboKeyDown` de `src/utils/comboboxKeyboard.ts`), le **filtrage** (`suggestions.filter(s => !value || s.toLowerCase().includes(value.toLowerCase()))` — la MÊME liste indexée par le clavier et rendue), la **souris** (`onMouseEnter`=highlight, `onClick`=select), l'**a11y** via `comboboxInputAria`/`comboboxOptionAria` + `useScrollHighlightIntoView` (refs internes). La **frontière domaine passe en props** : `{ id, value, onValueChange(value), suggestions, inputClassName, disabled?, placeholder?, name?, autoComplete? }`. Le `<label>` reste chez l'appelant (hors composant). `src/components/AutocompleteInput.test.tsx` : rend les suggestions filtrées, ouvre/masque selon la politique (dont le cas single-exact-match), ↓/Enter sélectionne, Escape ferme, clic sélectionne, a11y (`aria-activedescendant`).
2. **`SongForm` migré (iso-fonctionnel)** — les DEUX blocs combobox artiste (~L189-283) et album (~L406-490) de `src/components/SongForm.tsx` sont remplacés par `<AutocompleteInput>` :
   - artiste : `id="song-artist"`, `value={form.artist}`, `suggestions={suggestedArtists}`, `inputClassName="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"`, `onValueChange={v => onChange({ target: { name: 'artist', value: v } } as React.ChangeEvent<HTMLInputElement>)}`, `disabled={loading}`, `autoComplete="off"`.
   - album : idem avec `id="song-album"`, `name='album'`, `suggestions={suggestedAlbums}`.
   - Les états locaux devenus inutiles (`artistSearchOpen`/`selectedArtistIndex`/`albumSearchOpen`/`selectedAlbumIndex`/`artistListRef`/`albumListRef` + leurs `useScrollHighlightIntoView`) sont retirés. **`liveDuplicate`/`duplicate` + la `DuplicateBanner` restent dans SongForm** (hors composant). Les 16 tests `SongForm.test.tsx` verts, **zéro assertion réécrite**.
3. **`CatalogAdmin` migré (UX upgrade)** — les deux `<input list=…>` + `<datalist>` (artiste ~L451-454, album ~L492-495) de `src/pages/CatalogAdmin.tsx` sont remplacés par `<AutocompleteInput>` : `value={form.artist ?? ''}`, `onValueChange={v => setField('artist', v)}`, `suggestions={facets?.artist ?? []}` (album : `facets?.album`), `inputClassName="input-base"`, `id="cat-artist"`/`"cat-album"`. Le `<label>` reste. Comportement dup-check (`dupRef`/autosave) **inchangé**. Tests `CatalogAdmin.test.tsx` verts (adapter uniquement un éventuel ciblage `datalist`, jamais une assertion de dup-check/autosave).
4. **Aucune régression** — front vert (actuel **434** + nouveaux tests du composant), tsc + eslint propres. Aucun changement backend. Côté Song : zéro changement visuel/comportement. Côté Catalog : datalist→combobox = seul changement UX, assumé.

## Tasks / Subtasks

- [x] **Task 1 — Concevoir + créer `<AutocompleteInput>`** (AC: 1)
  - [x] Combobox artiste SongForm + album (copie) + `comboboxKeyboard.ts` relus ; frontière établie. Constat clé : le clavier bespoke ≈ `handleComboKeyDown` (réutilisé) ; la politique d'ouverture single-exact-match est la partie propre au composant.
  - [x] `src/components/AutocompleteInput.tsx` écrit (réutilise les 4 utils partagés) + `src/components/AutocompleteInput.test.tsx`. **→ 8 tests unitaires verts.**
- [x] **Task 2 — Migrer `SongForm` (iso-fonctionnel, le plus risqué)** (AC: 2)
  - [x] 2 blocs (artiste + album) → `<AutocompleteInput>` ; états/refs (`artistSearchOpen`/`selectedArtistIndex`/`albumSearchOpen`/`selectedAlbumIndex`/`artistListRef`/`albumListRef` + 2 `useScrollHighlightIntoView`) retirés ; `liveDuplicate`/`DuplicateBanner` gardés. `onValueChange` wrappe en `onChange({target:{name,value}})`. **→ 22 tests SongForm(+Instruments) verts, 0 assertion modifiée** (dont les 2 « hides suggestions when exact single match »).
- [x] **Task 3 — Migrer `CatalogAdmin` (UX upgrade)** (AC: 3)
  - [x] 2 `<input list>`+`<datalist>` → `<AutocompleteInput>` (suggestions = `facets.artist`/`facets.album`, `inputClassName="input-base"`). Dup-check/autosave inchangé. **→ tests Catalog verts. Plus aucun `<datalist>`.**
- [x] **Task 4 — Validation globale** (AC: 4)
  - [x] Front **442** (434 + 8) + tsc + eslint clean. Aucun backend. Song iso-fonctionnel ; Catalog datalist→combobox = seul changement (UX upgrade assumé).

## Dev Notes

### Frontière générique ↔ domaine (le cœur du design)
**Le composant possède** : le markup (`relative` div + input + listbox dropdown), l'état `open`/`activeIndex`, la **politique d'ouverture** (frappe/focus : `open = filtered.length>0 && !(filtered.length===1 && filtered[0]===value)` ; `ArrowDown` ouvre ; Escape/Tab/select/blur-200ms ferment), le **filtrage** `suggestions.filter(s => !value || s.toLowerCase().includes(value.toLowerCase()))` (liste UNIQUE, indexée par clavier ET rendue), le **clavier** (`handleComboKeyDown` → onSelect = `onValueChange(option)` + close + reset), la **souris**, l'**a11y** (`comboboxInputAria`/`comboboxOptionAria` + scroll-into-view via refs internes).
**Le domaine (props)** : `id`, `value`, `onValueChange`, `suggestions`, `inputClassName` (⚠️ diffère : SongForm = classe tailwind complète ; Catalog = `input-base` → **prop obligatoire pour l'iso-fonctionnel**), `disabled`, `placeholder`, `name`, `autoComplete`. Le `<label>` reste chez l'appelant.

### Points de vigilance (pièges)
- **⚠️ Clavier artiste/album ≈ `handleComboKeyDown`** (↓ ouvre+incrémente capé, ↑ décrémente à -1, Enter sélectionne sans submit, Escape/Tab ferment) — le réutiliser tel quel ; l'`onSelect` fait `onValueChange(v)` + close + reset index. La partie NON couverte par l'util = la **politique d'ouverture à la frappe/focus** (single-exact-match) → à porter dans le composant.
- **`onChange` synthétique** : aujourd'hui SongForm passe l'événement brut à la frappe et un `{target:{name,value}}` à la sélection. Après extraction, `onValueChange(v)` uniformise → SongForm wrappe en `onChange({target:{name,value}})`. Vérifier que le parent (form + liveDuplicate) réagit à l'identique (il ne lit que name/value). **C'est le point iso-fonctionnel #1 à valider par les tests.**
- **`inputClassName` obligatoire** : sans elle, SongForm perdrait son style d'input → régression visuelle. SongForm passe sa classe exacte, Catalog passe `input-base`.
- **Ne PAS embarquer** : `liveDuplicate`/`DuplicateBanner` (SongForm), le dup-check/autosave (Catalog) — hors composant.
- **UX Catalog assumée** : datalist→combobox est un changement volontaire, à écrire dans le commit + Completion Notes (pas une régression silencieuse).
- **Périmètre serré** : combobox artiste/album uniquement. PAS les combobox genre/langue de SongForm (ils utilisent déjà `handleComboKeyDown` directement et ne sont pas dupliqués au Catalog — hors scope). PAS le check-exact (19-12).

### Anchors code (lus)
- **SongForm.tsx** : props `suggestedArtists`/`suggestedAlbums` (défaut `[]`, L38-39, L57). Artiste L189-283, album L406-490 (copie). Refs/états L89-94, `useScrollHighlightIntoView` L119-120.
- **comboboxKeyboard.ts** : `comboboxInputAria` (role=combobox + aria-expanded/controls/activedescendant), `comboboxOptionAria` (role=option + id `${listId}-opt-${i}` + aria-selected + tabIndex -1), `handleComboKeyDown` (↓/↑/Enter/Escape/Tab), `useScrollHighlightIntoView`. **Réutilisés tels quels.**
- **CatalogAdmin.tsx** : `facets` (L214, via `getFacets(…, true)`), artiste `<input list="cat-artist-list">`+`<datalist>` L451-454, album L492-495.
- **SongForm.test.tsx** (16 tests) : le FILET. Cas clés : « hides artist suggestions when exact single match » (L134), « hides album suggestions when exact single match » (L144), navigation clavier genre/langue (inchangée). `renderForm` fournit `suggestedArtists:['The Beatles']`, `suggestedAlbums:['Revolver']`.

### Project Structure Notes
- **NEW** : `src/components/AutocompleteInput.tsx`, `src/components/AutocompleteInput.test.tsx`.
- **UPDATE** : `src/components/SongForm.tsx` (2 blocs → composant, retrait états/refs), `src/pages/CatalogAdmin.tsx` (datalist → composant).
- **Aucun** changement backend. `src/utils/comboboxKeyboard.ts` inchangé (réutilisé).

### References
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — dette datalist Catalog [LOW/UX] + cluster composants partagés, promu 2026-07-16]
- [Source: `src/components/SongForm.tsx` L189-283 + L406-490 — le combobox à extraire (source de vérité)]
- [Source: `src/utils/comboboxKeyboard.ts` + `src/__tests__/comboboxKeyboard.test.tsx` — utils partagés réutilisés]
- [Source: `src/pages/CatalogAdmin.tsx` L451-495 — le datalist à remplacer ; `facets` comme source de suggestions]
- [Source: 19-7/19-9/19-10 — modèle de refacto du cluster (extraire le noyau, garder le spécifique en props/children)]

### Review Findings

Code review 2026-07-16 (3 couches). SongForm **iso-fonctionnel confirmé** (Edge Hunter a comparé au `git show c770afc` ligne à ligne ; `SongForm.test.tsx` byte-identique) ; Catalog datalist→combobox = upgrade assumé confirmé ; 0 violation d'AC. 1 durcissement retenu.

- [x] [Review][Patch] Défaut `autoComplete='off'` dans `<AutocompleteInput>` — les instances Catalog ne le passaient pas (l'ancien `<datalist>` n'avait pas ce souci) → risque de double-dropdown (autofill navigateur natif par-dessus la listbox custom). Défaut `'off'` dans le composant : corrige Catalog, garde SongForm iso (déjà `off`), overridable. + test « Enter sans highlight ne submit pas » pour combler le trou de test (comble le doute du finding #1). [src/components/AutocompleteInput.tsx]

**Écartés (dismiss)** : (1) Enter submit sans highlight → faux positif : `handleComboKeyDown` fait `preventDefault()` inconditionnel sur Enter (vérifié `comboboxKeyboard.ts` + Edge Hunter), identique à l'original ; (3) dropdown artiste z-10→z-50 → prouvé invisible (rien ne chevauche, en haut du formulaire), déjà disclosé ; (4) event synthétique à la frappe → `Songs.tsx` `handleChange` ne lit que `{name,value}` et `liveDuplicate` recompute (Edge Hunter), équivalent.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `npx jest AutocompleteInput` → 8/8. `npx jest SongForm` → 22/22 (SongForm 16 + SongFormInstruments 6). Front complet `npx jest` → **442/442** (49 suites). `tsc --noEmit` clean. `eslint` clean. `grep` confirme zéro `<datalist>` restant. Aucun changement backend.

### Completion Notes List

- **Composant `<AutocompleteInput>`** = le combobox éditable bespoke de SongForm, généralisé : possède l'état `open`/`activeIndex`, la **politique d'ouverture** (frappe/focus : ouvre si match et pas single-exact-match ; ArrowDown ouvre ; Escape/Tab/select/blur-200ms ferment), le **filtrage** case-insensitive (liste unique indexée clavier + rendue), la **souris**, l'**a11y** — en **réutilisant** `handleComboKeyDown`/`comboboxInputAria`/`comboboxOptionAria`/`useScrollHighlightIntoView` (le clavier bespoke était équivalent à `handleComboKeyDown`). Domaine en props : `id`/`value`/`onValueChange`/`suggestions`/`inputClassName`/`wrapperClassName`/`disabled`/`name`/`autoComplete`.
- **Deux détails d'iso-fonctionnel préservés** : (1) `inputClassName` prop OBLIGATOIRE (SongForm = classe tailwind complète, Catalog = `input-base`) ; (2) `wrapperClassName` prop (défaut `relative`) — l'album passe `relative z-[25]` (stacking entre les dropdowns genre z-30/langue z-20 de l'accordéon). Seule **harmonisation cosmétique** : le dropdown passe à `z-50` des deux côtés (artiste était `z-10`) — invisible (rien ne chevauche le dropdown artiste, en haut du formulaire).
- **SongForm STRICTEMENT iso-fonctionnel** : `onValueChange(v)` wrappé en `onChange({target:{name,value}})` → le parent (form + liveDuplicate) réagit à l'identique. `liveDuplicate`/`DuplicateBanner` restés dans SongForm (hors composant). 22 tests verts sans réécriture (dont single-exact-match artist+album).
- **Catalog = UPGRADE UX ASSUMÉ** : le `<datalist>` natif (dette 19.6) est remplacé par le vrai combobox (suggestions = `facets`). Changement d'UX volontaire, positif (parité avec la fiche chanson), pas une régression. Dup-check/autosave inchangés.
- **Périmètre tenu** : combobox artiste/album uniquement (genre/langue de SongForm inchangés — ils utilisaient déjà `handleComboKeyDown`). Rien du backend, rien du check-exact (19-12).

### File List

- **NEW** `src/components/AutocompleteInput.tsx` — combobox éditable partagé.
- **NEW** `src/components/AutocompleteInput.test.tsx` — 8 tests unitaires.
- **UPDATE** `src/components/SongForm.tsx` — 2 blocs artiste/album → `<AutocompleteInput>` ; états/refs retirés.
- **UPDATE** `src/pages/CatalogAdmin.tsx` — 2 `<datalist>` → `<AutocompleteInput>` (UX upgrade).
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml` — 19-11 in-progress → review.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-16 | 0.1 | Story créée (create-story) — extraction `<AutocompleteInput>` (combobox artiste/album) depuis SongForm (iso-fonctionnel) + remplacement du datalist Catalog (UX upgrade assumé) ; volet B du triptyque | northwood |
| 2026-07-16 | 1.0 | dev-story — `<AutocompleteInput>` créé (8 tests, réutilise comboboxKeyboard) + SongForm migré iso-fonctionnel (22 verts) + Catalog datalist→combobox (UX upgrade). Front 442, tsc+eslint clean. | northwood |
