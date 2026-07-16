---
baseline_commit: 5f35325813fdc2f90a7acadc5e36d0c5bd286d50
---

# Story 19.10: Composant `<StickyActionBar>` partagé (fiche chanson ↔ fiche catalog)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want **the sticky "Back / status / action" bar shell factored into ONE shared `<StickyActionBar>` component used by the Song form and the Catalog form**,
so that **the byte-identical sticky shell (the `top-16` under-header offset, the backdrop-blur-outside-the-glass-card gotcha) lives in one place and can't drift, like 19.7/19.9 did for autosave/selection**.

## Contexte / origine

**Volet A** du triptyque `19-10-sticky-combobox-check-exact` re-scopé le 2026-07-16 en **3 stories distinctes** (natures/tailles trop différentes) :
- **19-10 (celle-ci)** : `<StickyActionBar>` — front-only, petit, iso-fonctionnel.
- **19-11** : combobox artiste/album partagé (extrait de SongForm, remplace le `<datalist>` Catalog) — le plus invasif.
- **19-12** : endpoint check EXACT `(title, artist)` — backend + front.

Cluster refacto DRY sur la branche epic **`feat/epic-19-composants-partages`** (19-7 `useAutosave` + 19-9 `useRowSelection` déjà mergés).

## Objectif NON négociable

**Zéro changement de comportement** utilisateur (fiche chanson ET fiche catalog identiques au pixel). **Tous les tests verts** (front **430**) **sans réécrire une seule assertion**. Refacto **iso-fonctionnel** (on hisse un markup identique dans un composant, on ne le modifie pas).

## Acceptance Criteria

1. **Composant créé** — `src/components/StickyActionBar.tsx` rend la **coquille sticky partagée** : un `<div>` avec la className EXACTE aujourd'hui dupliquée — `sticky top-16 z-20 mb-4 px-4 py-3 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between gap-3` — et `children` pour le contenu (bouton Back à gauche, statut/actions à droite ; le `justify-between` gère la disposition). Le commentaire-gotcha (« la barre vit HORS de la glass-card car `backdrop-filter` casserait `position: sticky` d'un enfant ») est porté par le composant (JSDoc). Optionnel : prop `className?` appended pour souplesse future, sans rien changer par défaut.
2. **Fiche chanson migrée** — `src/pages/Songs.tsx` remplace son `<div className="sticky top-16 …">` inline (~L1951) par `<StickyActionBar>` en gardant EXACTEMENT ses children (bouton « ← Back to songlist » + le `<span role="status">` avec les 4 états Saving/Saved/error/conflict + `lastSavedAt`). La barre reste placée HORS de la `card-base glass-effect`. Aucun changement visuel.
3. **Fiche catalog migrée** — `src/pages/CatalogAdmin.tsx` remplace son `<div className="sticky top-16 …">` inline (~L436) par `<StickyActionBar>` en gardant EXACTEMENT ses children (bouton « ← Back to list » + le `<div>` statut Saving/Saved/error + le bouton Publish conditionnel `{isDraft && !dupMessage && …}`). Aucun changement visuel.
4. **Aucune régression** — front (430) vert, tsc + eslint propres. Aucun changement backend. Aucun changement visuel/UX. Aucune assertion de test réécrite (un test de rendu du composant est le bienvenu, nouveau fichier).

## Tasks / Subtasks

- [x] **Task 1 — Créer `<StickyActionBar>`** (AC: 1)
  - [x] `src/components/StickyActionBar.tsx` : `({ children, className })` → `<div className={className ? `${SHELL} ${className}` : SHELL}>{children}</div>`, `SHELL` = la className partagée. JSDoc avec le gotcha glass-card + note `top-16`.
  - [x] `src/components/StickyActionBar.test.tsx` : rend les children, applique la shell (`sticky`/`top-16`/`z-20`/`justify-between`), append la className optionnelle. **→ 3 tests verts.**
- [x] **Task 2 — Migrer la fiche catalog** (AC: 3)
  - [x] `<div sticky>` de `CatalogAdmin.tsx` remplacé par `<StickyActionBar>` (children inchangés : Back + statut + Publish). **→ 9 tests Catalog verts, 0 assertion changée.**
- [x] **Task 3 — Migrer la fiche chanson** (AC: 2)
  - [x] `<div sticky>` de `Songs.tsx` remplacé par `<StickyActionBar>` (children inchangés : Back + statut 4-états + `lastSavedAt` ; barre toujours hors glass-card). **→ suite Songs* verte, 0 assertion modifiée.**
- [x] **Task 4 — Validation globale** (AC: 4)
  - [x] Front **434** (431 + 3) + tsc + eslint clean. Aucun `<div sticky>` inline restant. Aucun changement backend/visuel.

## Dev Notes

### Frontière (le composant ne porte QUE la coquille)
La className de la coquille est **identique** aux deux endroits (vérifié) :
`sticky top-16 z-20 mb-4 px-4 py-3 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between gap-3`.
Ce qui **diffère reste en children** (donc dans les pages) : le libellé + le `onClick` du bouton Back (« Back to songlist »→`backToList()` vs « Back to list »→`navigate('/catalog/manage')`), et le bloc de droite (statut riche 4-états + `lastSavedAt` côté Song ; statut 3-états + bouton Publish côté Catalog). **Ne PAS** essayer d'unifier le rendu du statut ni le bouton Publish ici — hors périmètre (le statut Song a un point pulsé + fade-in + `conflict` que le Catalog n'a pas ; les unifier changerait une UX).

### Anchors code (lus)
- **Songs.tsx** ~L1947-1985 : commentaire-gotcha + `<div className="sticky top-16 …">` contenant le bouton « Back to songlist » (`backToList`) et le `<span role="status" aria-live="polite">` (Saving/Saved/error/conflict + `lastSavedAt`). La barre est immédiatement suivie de `<div className="card-base glass-effect p-6">` — elle est bien HORS de la card.
- **CatalogAdmin.tsx** ~L432-450 : même commentaire (« Lives outside any glass card so position:sticky works; top-16 sits under the app header ») + `<div className="sticky top-16 …">` contenant « Back to list » (`navigate('/catalog/manage')`) + un `<div className="flex items-center gap-3">` (statut + `{isDraft && !dupMessage && <button>Publish</button>}`).

### Pièges (leçons)
- **Zéro changement de comportement** : on déplace un markup identique dans un composant. Si un test casse, c'est le refacto qui a un bug.
- **Placement hors glass-card** : le composant NE gère PAS le placement — c'est au caller de le mettre hors de la `.glass-effect` (le `backdrop-filter` de la card ferait `sticky` coller à la card). Documenter dans le JSDoc mais ne pas l'imposer.
- **Périmètre serré** : coquille sticky uniquement. PAS le rendu du statut, PAS le bouton Publish, PAS le combobox (19-11), PAS le check-exact (19-12).

### Project Structure Notes
- **NEW** : `src/components/StickyActionBar.tsx`, `src/components/StickyActionBar.test.tsx`.
- **UPDATE** : `src/pages/Songs.tsx`, `src/pages/CatalogAdmin.tsx` (remplacement du `<div sticky>` par `<StickyActionBar>`).
- **Aucun** changement backend.

### References
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — dette *sticky* [LOW], promue 2026-07-16 (cluster composants partagés)]
- [Source: `src/pages/Songs.tsx` ~L1951 + `src/pages/CatalogAdmin.tsx` ~L436 — les deux coquilles (source de vérité)]
- [Source: 19-7 / 19-9 — le modèle de refacto iso-fonctionnel du cluster (extraire le noyau partagé, garder le spécifique dans les pages via children/callbacks)]

### Review Findings

Code review 2026-07-16 (3 couches : Blind Hunter / Edge Case Hunter / Acceptance Auditor). **✅ Clean review — 0 finding.** className `SHELL` byte-identique aux 2 originaux (20 tokens, même ordre) ; placement hors glass-card préservé (sœur avant la card) des 2 côtés ; children inchangés (statut 4-états + `lastSavedAt` + `role`/`aria-live` Song ; Publish conditionnel Catalog) ; périmètre tenu ; aucune assertion réécrite ; sortie visuelle identique.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `npx jest StickyActionBar` → 3/3. `npx jest` (front complet) → **434/434** (48 suites). `tsc --noEmit` clean. `eslint` clean. `grep` confirme zéro `<div className="sticky top-16 …">` inline restant. Aucun changement backend.

### Completion Notes List

- **Coquille seule extraite.** `<StickyActionBar>` = un `<div>` avec la className partagée byte-identique + `children` (le `flex justify-between` dispose les 2 groupes). Prop `className?` optionnelle appended (inutilisée aujourd'hui, souplesse future). Le gotcha « hors glass-card » (backdrop-filter casse `position: sticky` d'un enfant) est porté en commentaire du composant.
- **Contenu spécifique gardé dans les pages** (via children, non unifié) : côté Song, bouton « Back to songlist » (`backToList`) + statut riche 4-états (Saving avec point pulsé / Saved ✓ + `lastSavedAt` en fade-in / error / conflict) ; côté Catalog, bouton « Back to list » (`navigate('/catalog/manage')`) + statut 3-états + bouton Publish conditionnel. Non touchés — le rendu du statut et Publish restent hors périmètre.
- **Iso-fonctionnel** : markup identique hissé dans un composant ; 0 assertion réécrite, 0 changement visuel/UX/backend. Les deux barres restent placées HORS de la `card-base glass-effect`.
- **Périmètre tenu** : coquille sticky uniquement. Combobox → 19-11, check-exact → 19-12.

### File List

- **NEW** `src/components/StickyActionBar.tsx` — coquille sticky partagée.
- **NEW** `src/components/StickyActionBar.test.tsx` — 3 tests de rendu.
- **UPDATE** `src/pages/CatalogAdmin.tsx` — `<div sticky>` → `<StickyActionBar>`.
- **UPDATE** `src/pages/Songs.tsx` — `<div sticky>` → `<StickyActionBar>`.
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml` — triptyque re-scopé en 19-10/19-11/19-12 ; 19-10 in-progress → review.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-16 | 0.1 | Story créée (create-story) — volet A du triptyque re-scopé en 3 stories ; extraction `<StickyActionBar>` (coquille sticky partagée Song↔Catalog), front-only iso-fonctionnel ; 19-11 (combobox) + 19-12 (check-exact) sortis en stories séparées | northwood |
| 2026-07-16 | 1.0 | dev-story — `<StickyActionBar>` créé (3 tests) + CatalogAdmin & Songs migrés. Iso-fonctionnel : front 434, tsc+eslint clean, 0 assertion touchée. | northwood |
