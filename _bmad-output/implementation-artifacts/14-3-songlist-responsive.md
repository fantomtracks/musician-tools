---
baseline_commit: 45bcf36353439fa7de98dfcdcf9869183bfa01dc
---

# Story 14.3: Songlist responsive — tableau scrollable + filtres repliables

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui cherche une chanson au téléphone,
I want une liste qui tient dans l'écran (tableau qui scrolle en interne, filtres repliés, pas de débordement latéral),
so that je vois mes chansons tout de suite au lieu de scroller un mur de filtres et une page infinie.

## Acceptance Criteria

1. **D2 — Tableau capé + scroll interne + header sticky.** **Given** la page Songs avec beaucoup de chansons **When** je la consulte (mobile ou desktop) **Then** la zone du tableau est **plafonnée à ~65vh** et **scrolle en interne** (la page hôte ne s'allonge plus) ; l'**en-tête de colonnes est `sticky top-0`** dans la zone de scroll, avec **fond opaque** (`bg-gray-50 dark:bg-gray-800`) et `z-10` (sous les dropdowns `z-50` et la save-bar `z-20`).
2. **D4 — Scroll horizontal + pas de débordement latéral.** **Given** un tableau plus large que l'écran **Then** il **scrolle horizontalement dans son conteneur** (toutes colonnes gardées, pas de reflow en cartes, pas de colonne masquée) ; le bloc contenu ne pousse plus ses voisins grâce à **`min-w-0`** sur la colonne `flex-1` (`SongsList.tsx:202`).
3. **D3 — Filtres en disclosure sous `lg`.** **Given** un écran **sous `lg` (1024px)** **When** j'arrive sur la page **Then** les filtres sont dans un **disclosure « Filters » replié par défaut** (les chansons sont visibles immédiatement) ; le bouton affiche le **compteur de filtres actifs** (« Filters · 2 ») même replié, et « Filters » seul si zéro filtre actif ; `aria-expanded` + `aria-controls` posés ; **au-dessus de `lg`, la sidebar reste statique** (comportement actuel strictement inchangé, y compris le collapse rail `«`/`»`).
4. **Décision produit (validée northwood 2026-07-04) :** sous `lg`, le disclosure « Filters » est le **seul contrôle** ; le rail `«`/`»` (`sidebarExpanded`) devient **desktop-only (`≥lg`)** et, sous `lg`, la sidebar affiche toujours son contenu complet (jamais le rail 48px). Le compteur `activeFilterCount` est calculé **dans `Songs.tsx`** (même source que `hasActiveFilters`) et passé en prop.
5. **And** zéro régression desktop (`≥lg` identique) ; dark mode sur les nouveaux éléments (bouton disclosure, fond sticky) ; conteneur de scroll **focalisable clavier** (`tabIndex={0}`) ; microcopie **EN** ; **état déplié non persisté** (D7 — pas de localStorage) ; les deux suites restent vertes.

## Tasks / Subtasks

- [x] **Task 1 — Compteur de filtres actifs (source unique dans Songs.tsx)** (AC: #3, #4)
  - [x] `countActiveFilters(...)` + type `ActiveFilterState` ajoutés dans `src/utils/songFilters.ts` — miroir exact des 16 conditions de `hasActiveFilters` (Set non vide = 1 ; `capoFilter !== ''`).
  - [x] `Songs.tsx` : `activeFilterCount = countActiveFilters({...})` ; `hasActiveFilters = activeFilterCount > 0` (remplace le `Boolean(...)`) ; `activeFilterCount` passé en prop à `SongsList`.
- [x] **Task 2 — État disclosure mobile (Songs.tsx, non persisté)** (AC: #3, #4, #5)
  - [x] `const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)` dans `Songs.tsx` (aucun localStorage — D7) ; `mobileFiltersOpen` + `setMobileFiltersOpen` passés à `SongsList`.
- [x] **Task 3 — Bouton disclosure « Filters » (composant testable)** (AC: #3, #4)
  - [x] `src/components/FiltersDisclosureButton.tsx` créé — `lg:hidden w-full card-base ... px-3 h-10`, libellé « Filters » / « Filters · N », chevron `▸`/`▾`, `aria-expanded`, `aria-controls="songs-sidebar"`, `aria-label` Show/Hide filters.
  - [x] Rendu dans `SongsList.tsx` avant `<SongsSidebar/>` ; 3 props ajoutées à `SongsListProps`.
- [x] **Task 4 — Sidebar : visible/masquée sous lg + rail desktop-only** (AC: #3, #4)
  - [x] Prop `mobileFiltersOpen` ajoutée à `SongsSidebarProps`.
  - [x] `<aside>` : `${mobileFiltersOpen ? '' : 'hidden'} lg:block` (masqué <lg quand fermé, toujours affiché ≥lg) ; width collapsed `w-12 lg:w-12` → `w-full lg:w-12`.
  - [x] Rail desktop-only : le rail `»` devient `hidden lg:flex` et n'est plus rendu que via `&&` ; le contenu est **toujours rendu**, avec `lg:hidden` quand `!sidebarExpanded` (donc masqué uniquement ≥lg en mode replié) ; bouton `«` passé `hidden lg:inline-flex`.
  - [x] `≥lg` inchangé (rail `«`/`»`, `lg:sticky lg:top-24`, w-80/w-12).
- [x] **Task 5 — Tableau : cap 65vh + scroll bidirectionnel + header sticky + min-w-0** (AC: #1, #2, #5)
  - [x] `SongsList.tsx` flex-1 → `flex-1 min-w-0` ; conteneur `overflow-x-auto` → `overflow-auto max-h-[65vh]` + `tabIndex={0}` ; `<thead>` → `+ sticky top-0 z-10` (fond opaque conservé).
  - [x] Aucune colonne masquée, pas de reflow ; empty-state inchangé.
- [x] **Task 6 — Tests** (AC: tous)
  - [x] `SongsFilters.test.ts` : `countActiveFilters` couvert (0 ; select ; Set ; capo 0 vs '' ; somme).
  - [x] `FiltersDisclosureButton.test.tsx` (nouveau) : « Filters » vs « Filters · 2 », `aria-expanded`/`aria-label`, `onToggle`, `aria-controls`.
  - [x] `SongsSidebar.test.tsx` : `makeProps` + `mobileFiltersOpen` ; test visibilité (`hidden`/`lg:block` fermé, pas de token `hidden` ouvert).
  - [x] `SongsSidebarPersistence.test.tsx` : assertion mise à jour (le contenu est désormais toujours dans le DOM, CSS-gated → discriminant = bouton `»` rendu seulement en replié).
- [x] **Task 7 — Vérifier** (AC: tous)
  - [x] `npm test` (front) : 36 suites / **323 tests** verts ; `cd backend && npm test` : 19 / 253 verts ; `npm run build` OK (tsc strict).
  - [x] Vérif visuelle : **déléguée au test manuel global de l'epic** (jsdom ne rend ni breakpoints ni `max-h-[65vh]`/`sticky`). À valider par northwood : 390px liste immédiate, « Filters » replié, scroll V+H interne, header collé, ≥lg inchangé, dark mode.

## Dev Notes

### Décisions de cadrage (validées northwood 2026-07-04)

1. **Compteur dans `Songs.tsx`** (source unique, pas de duplication) — via un helper `countActiveFilters` extrait dans `songFilters.ts` pour être unit-testable ; `hasActiveFilters` en dérive (`> 0`).
2. **Disclosure = seul contrôle mobile** ; le rail `«`/`»` (`sidebarExpanded`, persisté `songsSidebarExpanded`) reste mais devient **desktop-only** ; sous lg la sidebar montre toujours son contenu, le disclosure gère montrer/cacher. `≥lg` strictement inchangé.

### Fichiers à modifier (UPDATE) — état actuel

**`src/pages/Songs.tsx`** (1986 lignes) :
- `hasActiveFilters` = `Boolean(...)` de 16 conditions, lignes **268-285**. C'est le miroir exact du compteur à produire.
- `sidebarExpanded` : `useState` initialisé depuis `localStorage('songsSidebarExpanded')` (ligne 91) + persistance (ligne 406-408). **Ne pas** calquer cette persistance pour `mobileFiltersOpen` (D7 : éphémère).
- Rend `<SongsList ... sidebarExpanded={sidebarExpanded} hasActiveFilters={hasActiveFilters} .../>` (~ligne 1741-1787). Ajouter `activeFilterCount`, `mobileFiltersOpen`, `setMobileFiltersOpen`.

**`src/components/SongsList.tsx`** (399 lignes, composant présentationnel pur, ~110 props) :
- Ligne **123** : `<div className="flex flex-col lg:flex-row gap-6 items-start">` — sidebar empilée <lg, latérale ≥lg. Insérer le bouton disclosure avant `<SongsSidebar/>`.
- Ligne **202** : `<div className="flex-1 space-y-4">` → ajouter `min-w-0`.
- Lignes **338-393** : bloc tableau. **339** `card-base overflow-hidden` (garder), **340** `overflow-x-auto` (→ `overflow-auto max-h-[65vh]` + `tabIndex={0}`), **341** `<table className="w-full text-sm">`, **342** `<thead ...>` (→ + `sticky top-0 z-10`).
- `props.SortHeader` (rendu en `<th>`, défini dans Songs.tsx) : les `<th>` sont transparents, le fond opaque du `<thead>` couvre le sticky — ne pas y toucher.

**`src/components/SongsSidebar.tsx`** (744 lignes) :
- `<aside>` racine, lignes **91-95** : `id="songs-sidebar"` (ancre aria-controls déjà là), width `sidebarExpanded ? 'w-full lg:w-80' : 'w-12 lg:w-12'`, `shrink-0 min-w-[48px] overflow-hidden ... lg:sticky lg:top-24`.
- Ternaire `!sidebarExpanded ? <rail »> : <contenu>` (97-740). Rendre le **rail** `≥lg` seulement et le **contenu** toujours visible sous lg (cf. Task 4).

### Pièges & garde-fous (project-context + DESIGN.md)

- **`min-w-0` non négociable** (D4 / DESIGN Do's) : sans lui sur `flex-1`, le tableau large force la largeur et fait déborder la page latéralement. C'est LE bug que la story corrige.
- **`sticky` sur `<thead>`** : fonctionne sur navigateurs modernes (cible beta : Chrome/Safari/FF à jour). Le fond **doit rester opaque** (déjà `bg-gray-50 dark:bg-gray-800`) sinon les lignes transparaissent dessous. Si un navigateur cible ne stickait pas le `<thead>`, repli = poser `sticky top-0 z-10 bg-...` sur chaque `<th>` (SortHeader inclus) — non requis a priori.
- **Un seul cap de hauteur, sur le conteneur de scroll du tableau** — jamais `height:100vh` sur la page (DESIGN : lock plein écran rejeté, D2).
- **Aucun nouveau breakpoint** : tout se joue sur `lg` (déjà présent, `SongsList.tsx:123`). Pas de `md`/`xl` introduit.
- **Ne pas persister** l'état du disclosure (D7). Pas de `localStorage` pour `mobileFiltersOpen`.
- **Langue EN** partout (bouton « Filters », aria « Show/Hide filters »). **Dark mode** sur le bouton disclosure et le fond sticky.
- **`≥lg` = zéro régression** : la sidebar reste `lg:sticky lg:top-24`, le rail `«`/`»` marche encore, largeurs w-80/w-12 intactes. Garder l'`<aside>` comme **enfant direct du flex** (ne pas l'envelopper dans un div flex-child, sous peine de casser le sticky/les largeurs desktop) — la visibilité passe par des classes **sur l'aside**, pas par un wrapper.

### Testing standards summary

- Frontend Jest + Testing Library, tests dans `src/__tests__/`. `SongsSidebar.test.tsx` fournit un `makeProps(overrides)` réutilisable — l'étendre avec `mobileFiltersOpen`.
- jsdom ne calcule **pas** le CSS appliqué ni les breakpoints (`lg:hidden`, `max-h-[65vh]`, `sticky` sont inertes en test) → tester le **comportement/markup** (libellé, `aria-expanded`, présence de classes `hidden`, callbacks), **pas** le rendu visuel. Le visuel (cap 65vh, sticky, scroll H, bascule lg) relève du **test manuel global de l'epic** (northwood).
- `countActiveFilters` est de la **logique pure** → la vraie valeur testable ; couvrir dans `SongsFilters.test.ts` (piège `capoFilter: 0` actif vs `''` inactif).
- Nouveaux tests `*.test.ts(x)` à côté des existants. Ne pas mélanger les deux suites Jest.

### Previous story intelligence (Epic 14)

- **Branche d'epic** : `feat/epic-14-mobile-comfort` — committer 14.3 dessus (Conventional Commits, ex. `feat(songs): responsive Songlist — capped scroll table + collapsible filters`). Jamais sur `main`.
- 14.1 (favicon) et 14.2 (header overflow) sont `done` et committées sur la branche. Suite front à **313 tests** avant 14.3.
- 14.2 a montré le piège du nom accessible (title vs texte) — ici le bouton disclosure a un vrai libellé texte « Filters », donc `getByRole('button', { name: /filters/i })` marche ; l'`aria-label` « Show/Hide filters » double le libellé (préférer `getByRole` sur le texte visible pour le compteur).
- Pattern de découpe testable (composant présentationnel isolé) réutilisé : `FiltersDisclosureButton` comme `HomePage` exporté en 14.2.

### Project Structure Notes

- Nouveau composant `src/components/FiltersDisclosureButton.tsx` (PascalCase, fonction + props typées) — cohérent avec `SongsSidebar.tsx`/`SongsList.tsx`.
- Helper `countActiveFilters` dans `src/utils/songFilters.ts` (déjà l'emplacement de `NO_INSTRUMENT` et de la logique de filtres, testé par `SongsFilters.test.ts`).
- Breakpoints : `lg` (1024) pour la bascule liste, déjà en place. `sm` concerne 14.4 (form grid), pas cette story.
- Tokens DESIGN : `table_scroll_container: overflow-auto max-h-[65vh] min-w-0`, `table_header_sticky: sticky top-0 z-10 bg-<surface>`, `filters_disclosure: collapsed < lg ; static sidebar >= lg`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 14.3: Songlist responsive] — ACs D2/D3/D4, refs `SongsList.tsx:202`.
- [Source: ux-designs/ux-musician-tools-2026-07-04/DESIGN.md] — tokens (65vh, sticky, min-w-0), Do's & Don'ts, D2/D3/D4/D7.
- [Source: ux-designs/ux-musician-tools-2026-07-04/EXPERIENCE.md] — comportement disclosure, scroll interne, accessibilité (`tabindex=0`, `aria-expanded`/`aria-controls`, cibles ≥44px), microcopie EN (« Filters », « Filters · N », « Show/Hide filters »).
- [Source: src/pages/Songs.tsx:268-285] — `hasActiveFilters` (16 conditions à mirrorer) ; :91,406 — persistance `sidebarExpanded` (à NE PAS copier).
- [Source: src/components/SongsList.tsx:123,202,338-393] — flex layout, flex-1, bloc tableau.
- [Source: src/components/SongsSidebar.tsx:91-95,97-131] — aside racine, rail collapse.
- [Source: src/__tests__/SongsSidebar.test.tsx:4] — `makeProps` factory à étendre.
- [Source: _bmad-output/project-context.md] — EN, dark mode `dark:`, Tailwind only, localStorage lazy-init (mais D7 : pas de persistance ici), pas de dep.

### Review Findings

_Code review 2026-07-04 — 3 couches (Blind Hunter ∥ Edge Case Hunter ∥ Acceptance Auditor). Auditor : 5/5 ACs ✓ + décisions A/B honorées, D7 respecté. Edge : parité ≥lg et parité du compteur confirmées, aria-controls valide, aucun renderer cassé._

- [x] [Review][Patch] Assertion faible dans `SongsSidebar.test` (branche fermée) — `className.toContain('hidden')` est satisfait par le token `overflow-hidden`, donc ne prouve pas la présence du token `hidden` de masquage mobile (une régression passerait inaperçue). **Résolu 2026-07-04** : passage à un match par token (`split(/\s+/)` → `toContain('hidden')`), comme la branche ouverte. [src/__tests__/SongsSidebar.test.tsx]
- [x] [Review][Defer] En-tête sticky : le fond opaque est sur `<thead>`, pas sur les cellules `<th>` [src/components/SongsList.tsx:352] — deferred. OK sur navigateurs modernes (cible beta), mais Safari ancien + `border-collapse` peut laisser transparaître les lignes sous l'en-tête. Durcissement optionnel = porter `bg-gray-50 dark:bg-gray-800` sur chaque `<th>` (checkbox + SortHeader). Non bloquant.
- Dismissed : `aria-controls="songs-sidebar"` (Edge a vérifié que l'`id` existe bien sur l'`<aside>`) ; `aria-hidden={false}` codé en dur sur l'aside (pré-existant, inoffensif — display:none retire déjà du a11y tree).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `npx tsc -b` → OK (seule erreur transitoire : `makeProps` sans `mobileFiltersOpen`, corrigée).
- `npx jest SongsFilters FiltersDisclosureButton SongsSidebar` → 3 suites / 22 tests OK.
- `npm test` (front) → 36 suites / **323 tests** (était 313 : +10). 1 régression attendue rattrapée : `SongsSidebarPersistence` (assertion obsolète, cf. Completion Notes).
- `npm run build` → tsc strict + vite OK.
- `cd backend && npm test` → 19 / 253 OK.

### Completion Notes List

- **Compteur (décision A)** : `countActiveFilters` + `ActiveFilterState` extraits dans `songFilters.ts` (unit-testables), miroir exact des 16 conditions ; `Songs.tsx` dérive `hasActiveFilters = activeFilterCount > 0` → source unique, zéro duplication. Piège `capoFilter` respecté (`!== ''`, donc capo 0 actif).
- **Disclosure (décision B)** : bouton `FiltersDisclosureButton` (`lg:hidden`, « Filters · N ») rendu avant la sidebar ; état `mobileFiltersOpen` éphémère dans `Songs.tsx` (jamais persisté, D7). L'`<aside>` est `${mobileFiltersOpen ? '' : 'hidden'} lg:block` : masqué <lg quand fermé, **toujours affiché ≥lg**.
- **Rail desktop-only** : le rail replié `»` est passé `hidden lg:flex` (rendu seulement si `!sidebarExpanded`), et le **contenu de la sidebar est désormais toujours rendu** avec `lg:hidden` en mode replié (masqué uniquement ≥lg). Bouton `«` → `hidden lg:inline-flex`. Net : sous lg, la sidebar montre toujours son contenu complet, le disclosure gère montrer/cacher ; **≥lg strictement inchangé** (rail + sticky + largeurs).
- **Tableau (D2/D4)** : `flex-1 min-w-0` (anti-débordement latéral), conteneur `overflow-auto max-h-[65vh]` + `tabIndex={0}` (scroll V+H, focalisable clavier), `<thead>` `sticky top-0 z-10` (fond opaque déjà présent, sous combobox z-50 / save-bar z-20). Aucune colonne masquée, pas de reflow (D4).
- **Régression de test rattrapée** : `SongsSidebarPersistence` supposait qu'en mode replié le bouton `«` (contenu) n'était pas dans le DOM. Depuis 14.3 le contenu est **toujours** rendu (visibilité CSS par breakpoint), donc `«` est présent (jsdom ignore le CSS). Assertion réécrite : le discriminant replié/déplié est le bouton `»` (rendu uniquement en replié). Comportement produit inchangé — c'est une adaptation du test à la nouvelle structure (comme l'inversion du test Header en 14.2).
- **Limite jsdom assumée** : cap 65vh, sticky, scroll horizontal, bascule `lg` ne sont pas rendus en test → couverts par le **test manuel global de l'epic**. La logique testable (count, bouton, visibilité par classe) l'est.
- Zéro dépendance npm ; anglais partout ; dark mode (`dark:` + `btn/card`) ; aucun nouveau breakpoint (`lg` existant).

### File List

- `src/utils/songFilters.ts` (modified — `countActiveFilters` + `ActiveFilterState`)
- `src/pages/Songs.tsx` (modified — count-derived `hasActiveFilters`, `mobileFiltersOpen` state, 3 props)
- `src/components/SongsList.tsx` (modified — props, disclosure button, `min-w-0`, table scroll/sticky)
- `src/components/SongsSidebar.tsx` (modified — `mobileFiltersOpen` prop, aside visibility, rail desktop-only)
- `src/components/FiltersDisclosureButton.tsx` (new)
- `src/__tests__/SongsFilters.test.ts` (modified — `countActiveFilters` tests)
- `src/__tests__/FiltersDisclosureButton.test.tsx` (new)
- `src/__tests__/SongsSidebar.test.tsx` (modified — `mobileFiltersOpen` + visibility test)
- `src/__tests__/SongsSidebarPersistence.test.tsx` (modified — assertion adaptée à la nouvelle structure)

## Change Log

- 2026-07-04 — Story 14.3 implémentée : Songlist responsive — tableau capé `max-h-[65vh]` + scroll V/H interne + `<thead>` sticky (D2/D4), `min-w-0` anti-débordement, filtres en disclosure « Filters · N » sous `lg` (D3, `FiltersDisclosureButton`), rail `«`/`»` rendu desktop-only ; `countActiveFilters` extrait (source unique). ≥lg inchangé. Front 323 / back 253 verts, build strict OK. Aucune dépendance.
- 2026-07-04 (QA epic — amendements northwood sur la branche) : **D2 retirée** — le cap `max-h-[65vh]`, le scroll vertical interne et l'en-tête `sticky` sont supprimés (créaient un vide sous le tableau + un scroll imbriqué peu naturel sur mobile) ; le tableau ne scrolle plus qu'en **horizontal** (`overflow-x-auto`), la page scrolle verticalement normalement. **D4 conservée** (`min-w-0`). Autres correctifs QA : colonne de contenu **pleine largeur** sous `lg` (`w-full lg:flex-1`, `items-start` empêchait l'étirement) ; **dé-doublonnage du titre « Filters »** (le `<h3>` de la sidebar masqué sous `lg`, redondant avec le bouton disclosure) ; **micro-gap** de la ligne d'en-tête sidebar supprimé (masquée sur mobile quand vide) ; **label « Search »** ajouté au champ de recherche (a11y + clarté quand une valeur est persistée). Front 323 verts, build OK.
