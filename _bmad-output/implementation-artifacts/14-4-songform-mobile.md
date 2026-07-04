---
baseline_commit: aa92e3e5f0f0f9fab7c71a64e97091388fc5787b
---

# Story 14.4: Fiche d'édition (SongForm) lisible sur mobile

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui édite une chanson au téléphone,
I want des champs qui s'empilent lisiblement au lieu d'être écrasés,
so that je puisse corriger une méta sans zoomer.

## Acceptance Criteria

1. **D8 — Grilles de méta responsives.** **Given** le SongForm sur un écran **sous `sm` (640px)** **When** j'affiche les grilles de méta (`SongForm.tsx:624` et `:697`) **Then** elles passent de `grid-cols-3` à **`grid-cols-1 sm:grid-cols-3`** : une colonne empilée sous `sm`, trois colonnes dès `sm+`. Les deux grilles concernées (Duration/BPM/Time Signature et Key/…) sont traitées.
2. **Save-bar sticky non débordante.** **Given** la fiche en édition sur mobile **Then** la **save-bar sticky** (`Songs.tsx:1822`, posée en 13-1) ne déborde pas : « ← Back to songlist » et le statut « Saving…/Saved ✓/⚠️ » cohabitent via `flex items-center justify-between gap-3`, le statut **tronque/rétrécit** si besoin plutôt que de pousser le bouton hors écran. Aucun changement du comportement d'auto-save.
3. **Playlist picker utilisable.** **Given** le playlist picker de la fiche (`Songs.tsx`, dropdown de création à la volée story 10.2) **Then** il reste utilisable sur mobile (dropdown déjà `overflow-y-auto`, ne déborde pas la fiche).
4. **And** dark mode respecté ; UI en anglais ; **zéro régression desktop** (à `sm+` la grille reste 3 colonnes, identique à aujourd'hui) ; suites front vertes ; **aucun nouveau breakpoint** (`sm` déjà en place).

## Tasks / Subtasks

- [x] **Task 1 — Grilles de méta empilées sous `sm` (D8)** (AC: #1, #4)
  - [x] `SongForm.tsx:624` : `grid grid-cols-3 gap-4` → `grid grid-cols-1 sm:grid-cols-3 gap-4` (Duration / BPM / Time Signature).
  - [x] `SongForm.tsx:697` : idem (Key / …).
  - [x] Grep confirmé : **exactement 2** `grid-cols-3` dans `SongForm.tsx` (les deux grilles de méta) — aucune autre à traiter. Les `grid-cols-2` (plages min/max) sont laissées (déjà mobile-friendly).
- [x] **Task 2 — Audit save-bar + playlist picker (pas de régression)** (AC: #2, #3, #4)
  - [x] Save-bar (`Songs.tsx:1822`) : **audit → aucun changement nécessaire**. Structure déjà `flex items-center justify-between gap-3`. À la largeur de référence (iPhone 13, 390px), « ← Back to songlist » (~150px) + « Saved ✓ · HH:MM » (~110px) + `gap-3` + padding tiennent sans débordement → AC2 (« ne déborde pas ») satisfaite par l'existant. Pas de troncature ajoutée à l'aveugle (aurait été un changement CSS non vérifiable, risque de régression) ; si un device < 360px débordait, le repli documenté est `min-w-0`+`truncate` sur le statut (à trancher au test manuel). Logique d'auto-save **intacte**.
  - [x] Playlist picker (dropdown 10.2) : `overflow-y-auto` présent → utilisable. Audit visuel délégué au test manuel epic.
- [x] **Task 3 — Vérifier** (AC: tous)
  - [x] `npm test` (front) : 36 suites / **323 tests** verts (SongForm / SongsAutoSave inchangés au vert) ; `cd backend && npm test` : 19 / 253 verts ; `npm run build` OK (tsc strict).
  - [x] Vérif visuelle : **déléguée au test manuel global epic** (jsdom ne rend pas les breakpoints). À valider : sous `sm` champs empilés, save-bar sans débordement, picker utilisable, `sm+` inchangé, dark mode.

## Dev Notes

### Fichiers à modifier (UPDATE)

**`src/components/SongForm.tsx`** — deux grilles de méta identiques :
- **Ligne 624** : `<div className="grid grid-cols-3 gap-4">` contient **Duration (m:ss)** / **BPM** / **Time Signature**. Sous `sm`, trois colonnes écrasent ces champs (labels + inputs) → empiler.
- **Ligne 697** : `<div className="grid grid-cols-3 gap-4">` contient **Key** / … (2e triplet). Même traitement.
- **Changement minimal** : `grid-cols-3` → `grid-cols-1 sm:grid-cols-3` sur ces **deux** div. Rien d'autre dans SongForm (labels, inputs, handlers, validation `durationError`, `onBlur` de durée) ne change.
- **À préserver** : la logique de durée (parse `m:ss`, `onSetDurationSeconds`, canonicalisation `3:3 → 3:30`), les `id`/`htmlFor` (a11y), `disabled={loading}`. On ne touche qu'au conteneur `grid`.

**`src/pages/Songs.tsx`** — save-bar (audit) :
- **Ligne 1822** : `<div className="sticky top-16 z-20 mb-4 px-4 py-3 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur border ... shadow-sm flex items-center justify-between gap-3">`. Déjà `flex ... justify-between gap-3` (conforme EXPERIENCE.md). Le bouton `← Back to songlist` (`btn-secondary`) + le `<span role="status" aria-live="polite">` (Saving/Saved/error) cohabitent. Sur 390px, `justify-between` + `gap-3` gèrent l'espace ; renforcer avec `min-w-0` (conteneur) + `truncate` (statut) uniquement si sûr.
- **À préserver absolument** : `saveStatus` (`saving`/`saved`/`error`), `lastSavedAt`, `role="status" aria-live="polite"`, `key={lastSavedAt}` sur le blip « Saved ✓ », la sticky `top-16 z-20` (13-1). **Aucun changement de comportement d'auto-save.** Le commentaire (1820-1821) explique pourquoi le parent ne doit pas être `overflow` (casserait le sticky) — ne pas le violer.

**Playlist picker** (`Songs.tsx`, combobox de création à la volée, story 10.2) : dropdown déjà `overflow-y-auto`. Audit seulement.

### Conventions & garde-fous (project-context + DESIGN.md)

- **Aucun nouveau breakpoint** : `sm` (640px) est déjà le seuil projet pour la grille formulaire (DESIGN token `form_grid: "grid-cols-1 sm:grid-cols-3 gap-4"`). Ne PAS introduire `md`/`lg` ici.
- **Zéro régression desktop** : à `sm+` la grille est identique (`sm:grid-cols-3`). Le changement n'agit que sous 640px.
- **Langue EN** (labels déjà EN) ; **dark mode** déjà porté par les inputs (`dark:` présents) — rien à ajouter.
- **Tailwind only**, pas de CSS custom, pas de dépendance.
- **Pas de logique testable nouvelle** : le changement est purement des classes responsive (invisibles en jsdom). La garantie = suites existantes vertes (`SongForm.test.tsx`, `SongsAutoSave.test.tsx`) + vérif visuelle manuelle. Ne pas fabriquer de test de breakpoint bidon (jsdom ne calcule pas le CSS).

### Testing standards summary

- Frontend Jest + Testing Library. `SongForm.test.tsx` et `SongsAutoSave.test.tsx` existent — ils doivent rester verts (le changement de classe ne modifie ni le DOM logique ni le comportement).
- Ne pas ajouter de test de rendu de breakpoint (non calculable en jsdom). La couverture réelle de D8 est le **test manuel global de l'epic**.
- Hook husky pre-commit lance les deux suites — ne jamais `--no-verify`.

### Previous story intelligence (Epic 14)

- **Branche d'epic** : `feat/epic-14-mobile-comfort` (14.1/14.2/14.3 déjà `done` et committées). Committer 14.4 dessus (`feat(songs): stack SongForm meta grids on mobile` ou `fix(songs): ...`). Jamais sur `main`.
- Suite front à **323 tests** après 14.3.
- 14.2 et 14.3 ont montré que les stories « layout responsive » n'ont pas de test jsdom du visuel → assumer la vérif manuelle, ne pas gonfler de faux tests.
- La save-bar sticky vient de la story 13.1 (auto-save) : ne rien casser de ce flux.

### Project Structure Notes

- `SongForm.tsx` : composant présentationnel, PascalCase. Les grilles `grid-cols-3` visées sont les grilles de **méta** (Duration/BPM/TimeSig, Key/…). D'autres `grid-cols-2` (plages min/max BPM/pitch) sont déjà mobile-friendly — hors scope.
- Aucun nouveau fichier. Deux lignes de classe changent (Task 1), au plus un ajustement défensif save-bar (Task 2).
- Breakpoint `sm` déjà présent dans le projet (ex. `SongsList.tsx` header cards `sm:flex-row`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 14.4: Fiche d'édition (SongForm) lisible sur mobile] — D8, refs `SongForm.tsx:624/:697`, `Songs.tsx:1815/:1917`.
- [Source: ux-designs/ux-musician-tools-2026-07-04/DESIGN.md] — token `form_grid: "grid-cols-1 sm:grid-cols-3 gap-4"` ; § Components « Form grid (édition) ».
- [Source: ux-designs/ux-musician-tools-2026-07-04/EXPERIENCE.md#Component Patterns] — grille de champs `grid-cols-1 sm:grid-cols-3` ; save-bar « reste `sticky top-16 z-20`, contenu `flex items-center justify-between gap-3`, statut tronque si besoin, aucun changement d'auto-save ».
- [Source: src/components/SongForm.tsx:624,697] — les deux grilles à passer responsive.
- [Source: src/pages/Songs.tsx:1822] — save-bar sticky (audit) ; :1820-1821 — note « pas d'overflow sur le parent » à respecter.
- [Source: _bmad-output/project-context.md] — Tailwind only, EN, dark mode `dark:`, pas de dep, branche feature.

### Review Findings

_Code review 2026-07-04 — revue consolidée (adversarial + acceptance), dimensionnée à la trivialité du diff (2 changements de classe identiques). **Clean — aucun finding.** Vérifié : les 2 grilles converties (aucune autre `grid-cols-3` résiduelle), `sm` déjà utilisé projet-wide (pas de nouveau breakpoint), zéro régression desktop (`sm:grid-cols-3` reproduit l'existant ≥640px), save-bar « audit sans changement » défendable (tient à 390px, auto-save intact), conforme au token DESIGN `form_grid`._

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `grep grid-cols-3 SongForm.tsx` → 2 occurrences (624, 697), toutes deux traitées.
- `npx jest SongForm SongsAutoSave` → 2 suites / 21 tests OK.
- `npm test` (front) → 36 / **323** ; `npm run build` → OK ; `cd backend && npm test` → 19 / 253.

### Completion Notes List

- **D8 livré** : les deux grilles de méta du SongForm (`:624` Duration/BPM/Time Signature, `:697` Key/…) passent `grid-cols-3` → `grid-cols-1 sm:grid-cols-3` → empilées sous 640px, 3 colonnes dès `sm`. Changement purement responsive, aucune autre ligne touchée (labels, inputs, validation durée, handlers intacts).
- **Save-bar & picker : audit sans changement.** La save-bar (13-1) est déjà `flex items-center justify-between gap-3` et tient à 390px (référence UX) → pas de débordement, AC2 satisfaite par l'existant. Je n'ai **pas** ajouté de troncature à l'aveugle (non vérifiable en headless, risque de régresser un layout qui marche). Repli documenté si un très petit écran débordait au test manuel : `min-w-0`+`truncate` sur le statut. Auto-save (saveStatus/lastSavedAt/debounce/flush) non touché. Playlist picker déjà `overflow-y-auto`.
- **Pas de test unitaire ajouté** : le changement est 100% classes responsive, invisible en jsdom (pas de breakpoint calculé). Fabriquer un test de breakpoint serait un faux test. Garantie = suites existantes vertes (SongForm/SongsAutoSave inchangées) + vérif visuelle manuelle epic. (Cohérent avec 14.2/14.3.)
- Zéro dépendance ; EN ; dark mode déjà porté par les inputs ; aucun nouveau breakpoint (`sm` existant).

### File List

- `src/components/SongForm.tsx` (modified — 2 grilles de méta `grid-cols-1 sm:grid-cols-3`)

## Change Log

- 2026-07-04 — Story 14.4 implémentée : les deux grilles de méta du SongForm passent `grid-cols-1 sm:grid-cols-3` (D8) → champs empilés lisiblement sous 640px, 3 colonnes dès `sm`. Save-bar & playlist picker audités (déjà conformes, aucun changement). Front 323 / back 253 verts, build strict OK. Aucune dépendance.
