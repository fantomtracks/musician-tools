---
baseline_commit: 1c3c69c
arch_decision: "Pur ajout de deux entrées curées dans `instrumentTuningsMap.Bass` (`src/constants/instrumentTypes.ts`) : `EbAbDbGb (Half-step down 4-string)` et `BbEbAbDbGb (Half-step down 5-string)`, placées après `DADG (Drop D)` et avant `Other` (même ordre que le bloc Guitar : standards → altérés → Other). `instrumentTuning` est une **string libre** persistée telle quelle — aucune migration, aucun changement de modèle, aucun schéma. Le map n'alimente que l'affichage : dropdown du form (`SongFormInstruments.tsx:45`) + valeurs de filtre (`Songs.tsx:465/1660`). Additif et rétro-compatible : les chansons existantes gardent leur tuning, les nouvelles valeurs deviennent simplement sélectionnables/filtrables."
---

# Story 16.2: Tuning basse « Half-step down » (4 et 5 cordes)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a bassiste qui accorde un demi-ton plus bas,
I want pouvoir sélectionner le tuning `EbAbDbGb` (4 cordes) et `BbEbAbDbGb` (5 cordes) sur mes chansons,
so that j'aie la parité avec la guitare (qui a déjà son demi-ton) et que mon accordage réel soit renseignable.

## Contexte & pourquoi

Deuxième et dernière story de l'**Epic 16**. Issue de `deferred-work.md § À brainstormer` (demandé northwood 2026-07-05). **Front pur, quick-win, indépendante de 16.1.** Aucun FR/NFR. Baseline : branche `feat/epic-16-fix-doublons-tunings` (16.1 `done`, commit `1c3c69c`).

**Le manque (vérifié dans le code).** `instrumentTuningsMap.Bass` (`src/constants/instrumentTypes.ts:45-51`) n'expose que `EADG` / `BEADG` / `BEADGC` / `DADG` / `Other`. La **guitare** a déjà son demi-ton (`EbAbDbGbBbEb (Half-step down)`, l.40), pas la basse. Décision northwood : ajouter **les deux** (4 et 5 cordes), par parité.

## Décision d'architecture (déjà tranchée — à implémenter telle quelle)

Dans le tableau `'Bass'` de `instrumentTuningsMap`, insérer après `{ value: 'DADG', … }` (l.49) et avant `{ value: 'Other', … }` (l.50) :

```ts
{ value: 'EbAbDbGb', label: 'EbAbDbGb (Half-step down 4-string)' },
{ value: 'BbEbAbDbGb', label: 'BbEbAbDbGb (Half-step down 5-string)' },
```

**Hors périmètre (à NE PAS toucher) :** les autres instruments (Guitar/Ukulele/Violin/Other), le type `TuningOption`, le modèle `Song`, toute migration, la logique de filtre/rendu (elle consomme le map telle quelle). Ne pas « harmoniser » ou réordonner les autres blocs.

## Acceptance Criteria

1. **Deux entrées Bass « Half-step down »** — Given le sélecteur de tuning d'une chanson en **Bass** (`SongFormInstruments`), When j'ouvre la liste, Then `EbAbDbGb (Half-step down 4-string)` et `BbEbAbDbGb (Half-step down 5-string)` sont disponibles, en plus des accordages existants.
2. **Placement cohérent** — les deux entrées sont dans le bloc `Bass`, après `DADG (Drop D 4-string)` et avant `Other` (aligné sur l'ordre du bloc Guitar : standards → altérés → Other).
3. **Rien d'autre touché** — aucun autre instrument, aucun changement de type/modèle/migration ; les valeurs `value` sont brutes (pas d'espaces) et les `label` en anglais, dans le style des entrées existantes.
4. **Qualité** — `tsc -b` (typecheck strict) OK ; suites front vertes (`npm test`) ; lint front OK. Le hook pre-commit lance front + back — commit vert obligatoire.

## Tasks / Subtasks

- [x] **T1 — Ajouter les deux tunings** (AC: 1, 2, 3)
  - [x] `src/constants/instrumentTypes.ts` : `EbAbDbGb` puis `BbEbAbDbGb` insérés dans le bloc `Bass`, après `DADG`, avant `Other`. Labels EN alignés sur le style existant.
- [x] **T2 — Test** (AC: 1)
  - [x] `src/__tests__/SongFormInstruments.test.tsx` : test d'assertion sur `instrumentTuningsMap.Bass` (présence des 2 `value`, labels exacts, placement après DADG / avant Other).
- [x] **T3 — Validation** (AC: 4)
  - [x] `npx tsc -b` exit 0 · `npm run lint` exit 0 · `npm test` → **36 suites / 328 tests** verts (327 → +1).

### Review Findings

_Code review — 2026-07-09. Surface trivialement additive (2 constantes curées + test) : passe unique proportionnée couvrant correctness / edge / acceptance (spawn 3 couches non justifié). **Clean review — 0 finding, 0 patch, 0 defer, 1 cosmétique écarté.**_

- Correctness : valeurs `EbAbDbGb`/`BbEbAbDbGb` justes (EADG/BEADG abaissés d'un demi-ton), sans espaces, sans doublon ; labels EN cohérents.
- Edge : additif pur (string libre persistée) → chansons existantes intactes, valeurs sélectionnables + filtrables sans collision.
- Acceptance : 4/4 ACs SATISFIED (test asserte présence + labels exacts + placement DADG→…→Other).
- Écarté (cosmétique) : `\ No newline at end of file` sur le test — pré-existant, lint clean.

## Dev Notes

### État actuel (lu)

- `instrumentTuningsMap` (`src/constants/instrumentTypes.ts:36-64`) : `Record<string, TuningOption[]>`. `TuningOption` = `{ value: string; label: string }` (l.31). Bloc `Bass` l.45-51.
- Consommateurs (inchangés) : `src/components/SongFormInstruments.tsx:45` (`instrumentTuningsMap[instrumentType] || []` → options du dropdown) ; `src/pages/Songs.tsx:465` (`allowedTunings` set pour le filtre) et `:1660` (`availableTuningFilters` pour l'UI de filtre). L'ajout d'options est **additif** : nouvelles valeurs sélectionnables et filtrables, zéro régression sur les chansons existantes (tuning = string libre persistée).

### Conventions (project-context.md)

- **TypeScript strict** + `verbatimModuleSyntax` : rien à importer ici (édition d'un objet littéral existant). Pas de variable morte.
- UI/labels **en anglais** (règle stricte du repo).
- **Tailwind only**, mais ici aucun style — pure donnée.
- Deux suites Jest séparées ; ici **front uniquement** (`npm test` racine). Le pre-commit lance les deux.

### Previous story intelligence (16.1, `done`)

- 16.1 (back : trim + migration) est indépendante ; aucun couplage. 16.2 ne touche que le front constants.
- Après 16.2 → Epic 16 complet (16.1 + 16.2 `done`) : QA rapide + merge `main` (rétro Epic 16 `optional`).

### Project Structure Notes

- 1 fichier modifié (`src/constants/instrumentTypes.ts`) + éventuellement 1 test. Aucune dépendance, aucune migration, aucun back.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 16.2] — ACs, décision « les deux (4+5 cordes) ».
- [Source: src/constants/instrumentTypes.ts:36-64] — `instrumentTuningsMap` ; bloc `Bass` l.45-51 ; modèle Guitar Half-step l.40.
- [Source: src/components/SongFormInstruments.tsx:45] · [src/pages/Songs.tsx:465, 1660] — consommateurs (inchangés).
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] (§ À brainstormer) — demande northwood 2026-07-05, décision 4+5 cordes.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Debug Log References

- `npx tsc -b` → exit 0 (strict). `npm run lint` → exit 0.
- `npm test` (front) → **36 suites / 328 tests** verts (327 → +1). Test ciblé `SongFormInstruments` : 6/6 dont le nouveau `Bass tunings … (16.2)`.

### Completion Notes List

- Deux entrées ajoutées au bloc `Bass` de `instrumentTuningsMap` : `EbAbDbGb (Half-step down 4-string)` et `BbEbAbDbGb (Half-step down 5-string)`, après `DADG (Drop D)` et avant `Other` (ordre aligné sur le bloc Guitar : standards → altérés → Other).
- **Additif pur** : `instrumentTuning` est une string libre persistée telle quelle → aucune migration, aucun changement de modèle. Les consommateurs (dropdown `SongFormInstruments.tsx:45`, filtres `Songs.tsx:465/1660`) lisent le map inchangé → nouvelles valeurs simplement sélectionnables/filtrables, zéro régression.
- Test constant-level (pas de sur-test de rendu) : présence des 2 `value`, labels exacts, placement.

### File List

**Modifié — front**
- `src/constants/instrumentTypes.ts` — 2 tunings basse « Half-step down » (4c + 5c) ajoutés au bloc `Bass`.

**Modifié — tests front**
- `src/__tests__/SongFormInstruments.test.tsx` — import `instrumentTuningsMap` + test d'assertion du bloc Bass.

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-07-09 | 0.1 | Création story 16.2 — ajout tunings basse `EbAbDbGb` (4c) + `BbEbAbDbGb` (5c) « Half-step down ». Front pur, quick-win. Status → ready-for-dev. |
| 2026-07-09 | 0.2 | Implémentation : 2 tunings ajoutés au bloc `Bass` (après DADG, avant Other) + test d'assertion. Additif pur (aucune migration/modèle). tsc✓ lint✓ front 328✓. Status → review. |
| 2026-07-09 | 1.0 | Code review (passe proportionnée, surface additive) : 4/4 ACs OK, correctness/edge/acceptance clean, 0 finding. Status → done. |
