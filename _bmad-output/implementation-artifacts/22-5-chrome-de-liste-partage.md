---
baseline_commit: b193dff10ec087c4abee6f750c88d47e4214c8ac
---

# Story 22.5: Chrome de liste partagé (toast, skeleton, pagination)

Status: done

## Story

As a **developer du produit**,
I want **le toast, les placeholders de chargement et la pagination factorisés en composants partagés**,
so that **les écrans de liste — Songlist comprise — cessent de recopier le même chrome à chaque nouvelle surface**.

## Contexte / origine

Demandé par northwood le 2026-08-10, juste après 22.1 : *« que la Songlist utilise les mêmes composants que les nouvelles pages »*. Prolonge la fondation 22.1 (`<BulkActionBar>` + primitives de case à cocher) au reste du chrome de liste.

**Périmètre arbitré par northwood** (3 options présentées) : **« chrome partagé, tableau intact »** — zéro changement visuel, aucune décision UX rouverte.

## Décisions de cadrage

- **A — La coquille de tableau n'est PAS partagée.** Le Catalog (`CatalogList` + `CatalogManage`) plafonne son tableau à `max-h-[65vh]` avec `thead sticky top-0` ; la Songlist non. Ce n'est **pas** une négligence : la story 14.3 avait donné exactement cette coquille à la Songlist (Task 5 : `overflow-auto max-h-[65vh]` + `tabIndex={0}` + `thead sticky`), et **la QA device de l'Epic 14 l'a fait retirer** (« décision UX à prouver sur device, D2 retirée en QA » — rétro Epic 14). Unifier les coquilles réintroduirait silencieusement une UX rejetée à l'œil. La divergence est **volontaire et tracée ici**.
- **B — Pas de système de toast global.** La convention maison (`project-context.md`) est le couple manuel `setToastMessage` + `setTimeout(2500)` possédé par chaque page. Inchangé : **seul le markup** est partagé, pas la mécanique ni un provider.
- **C — Un seul delta visuel assumé** : le toast de la Songlist (AC4). S'y ajoute une déviation mineure non voulue au départ et conservée en connaissance de cause : le `z-50` des toasts Catalog (cf. Completion Notes).

## Acceptance Criteria

1. **`<Toast>` partagé** — `src/components/Toast.tsx`. La **région live reste montée en permanence** (`role="status" aria-live="polite" aria-label="Notification"`, motif déjà en place dans `MySessionsPage` : une région montée en même temps que son texte n'est pas annoncée de façon fiable) ; seule la **bulle visible** est conditionnelle, donc rien n'est peint au repos et les pages n'ont plus de garde `{toastMessage && …}`. Branché sur `CatalogAdmin`, `CatalogManage`, `CatalogCollectionCompose` : markup de la bulle identique à ce qu'ils avaient **à une classe près, `z-50`, ajoutée** (écart assumé, cf. Completion Notes — l'empilement face à `ConfirmDialog` a été vérifié).
2. **`<ListSkeleton>` / `<DetailPageSkeleton>` partagés** — `src/components/ListSkeleton.tsx`. Le placeholder de liste prend le nombre de lignes en prop (`rows`) et une classe d'espacement optionnelle ; celui de page de détail est fixe. Branchés sur les **5** emplacements Catalog (`Catalog` 6, `CatalogManage` 4 et 6, `CatalogCollectionCompose` 5 + `mt-4`, `CatalogCollection` et `CatalogEntry` en détail). `aria-hidden` conservé.
3. **`<Pagination>` partagée** — `src/components/Pagination.tsx` (Previous / « Page X of Y » / Next), garde **centralisée** et écrite `!(totalPages > 1) → null`, strictement équivalente au `{totalPages > 1 && …}` d'origine (y compris sur `NaN`, où `<= 1` aurait divergé). Branchée sur `Catalog` et `CatalogManage`, qui pilotent tous deux la page par l'URL (`patchParams`). Markup byte-identique.
4. **Songlist alignée sur le toast partagé** — `Songs.tsx` avait un toast **divergent** et surtout **sans `role="status"`** : il n'était jamais annoncé aux lecteurs d'écran. Il adopte le composant partagé. **C'est le seul changement visible de la story**, et le diff exact (mesuré, pas estimé) est : `bottom-4 right-4` → `bottom-6 left-1/2 -translate-x-1/2` (coin bas-droit → bas-centre), `bg-gray-800` → `bg-gray-900` (légèrement plus sombre), `rounded` → `rounded-lg`, **ajout de `text-sm`** (texte plus petit), **perte de `animate-fade-in`**, **gain de `role="status"`**. Delta **assumé**, à valider en QA.
5. **Aucune régression** — front vert, `tsc -b` + ESLint propres. Aucun backend, service, migration. Plus aucun toast, skeleton ou pagination inline dans `src/pages`.

## Tasks / Subtasks

- [x] **Task 1 — Créer les trois briques** (AC: 1, 2, 3)
  - [x] `src/components/Toast.tsx` + `Toast.test.tsx` (4 tests : région montée et vide sans message, chaîne vide, message annoncé, classes de la bulle verrouillées).
  - [x] `src/components/ListSkeleton.tsx` + `ListSkeleton.test.tsx` (4 tests : nombre de lignes, défaut, `aria-hidden` + classe composable, placeholder de détail).
  - [x] `src/components/Pagination.tsx` + `Pagination.test.tsx` (6 tests : garde 1 page, `NaN`, `0`, position + pas à pas, bornes désactivées aux deux extrémités).
- [x] **Task 2 — Brancher les surfaces Catalog** (AC: 1, 2, 3)
  - [x] `CatalogManage` (toast + 2 skeletons + pagination), `Catalog` (skeleton + pagination), `CatalogAdmin` (toast), `CatalogCollectionCompose` (toast + skeleton), `CatalogCollection` et `CatalogEntry` (skeleton de détail).
- [x] **Task 3 — Brancher la Songlist** (AC: 4)
  - [x] `Songs.tsx` : toast inline divergent → `<Toast>`.
- [x] **Task 4 — Validation** (AC: 5)
  - [x] Front **513/513 (60 suites)** — 499 avant, **+14** tests (dont 3 ajoutés en review). `npx tsc -b --force` clean. `npm run lint` clean.
  - [x] Greps de contrôle : plus aucun `fixed bottom-6 left-1/2` / `fixed bottom-4 right-4`, plus aucun `animate-pulse` de skeleton, plus aucun `Page {page} of` inline dans `src/pages`.
  - [x] QA navigateur — **NON exécutée par l'agent** (aucun navigateur ouvert), **déléguée au gate QA de la branche epic** (convention 14-3/14-4). À regarder : le toast de la Songlist à sa nouvelle place (bas-centre, texte plus petit, sans fade-in) ; les skeletons et la pagination du Catalog **strictement identiques** ; light **et** dark.

### Review Findings

Code review 2026-08-10 — **PARTIELLE** : Blind Hunter rendu ; Edge Case Hunter et Acceptance Auditor plantés puis tués (le contrôle d'identité du markup a été refait mécaniquement à la place). 5 patchés, 1 deferred, 7 dismiss.

- [x] [Review][Patch] **Garde de pagination non équivalente à celle qu'elle remplace** (`blind`, Med) — `totalPages <= 1` n'est pas la négation de `totalPages > 1` : sur `NaN` les deux comparaisons sont fausses, donc l'ancienne version n'affichait rien et la nouvelle affichait « Page 1 of NaN » avec **Next actif** (`1 >= NaN` est faux) — un clic écrivait un `?page=` toujours croissant. Réécrit en `!(totalPages > 1)` + 2 tests (`NaN`, `0`). [`src/components/Pagination.tsx`]
- [x] [Review][Patch] **La région live était montée en même temps que son texte — l'annonce promise pouvait ne jamais se produire** (`blind`, Med) — un `role="status"` doit préexister à la mutation de son contenu pour être lu de façon fiable. Le projet avait **déjà** résolu ça (`MySessionsPage`, commentaire à l'appui) : motif repris — la région reste montée avec `aria-label="Notification"`, seule la bulle visible est conditionnelle. C'était précisément la garantie vendue par l'AC4. [`src/components/Toast.tsx`]
- [x] [Review][Patch] **Commentaire faux dans le composant** (`blind`, Low) — il décrivait le toast Songlist comme « plus sombre » alors que `bg-gray-800` est plus **clair** que `bg-gray-900`, et omettait deux différences réelles (`text-sm`, `rounded-lg`). Corrigé ici et dans l'AC4, après mesure. [`src/components/Toast.tsx`]
- [x] [Review][Patch] **`message: string | null` rejette `useState<string>()`** (`blind`, Low) — une page en `string | undefined` ne compilait pas contre la prop. Passée en `message?: string | null`. [`src/components/Toast.tsx`]
- [x] [Review][Patch] **Rien n'assertait le style que la story existe pour unifier** (`blind`, Low) — aucun test ne verrouillait les classes du toast, celles-là mêmes qui changent sur la Songlist. Ajout d'un `toHaveClass` sur les 12 classes de la bulle. [`src/components/Toast.test.tsx`]
- [x] [Review][Defer] **Pas d'échappatoire `motion-reduce` sur les animations** (`blind`, Low) — pré-existant et app-wide (pulse, fade, transitions) ; centraliser les skeletons rend le correctif trivial pour eux mais le sujet se traite d'un bloc. → deferred-work 2026-08-10

**Dismiss (7, avec la raison)** : ① et ② les deux **High** du Blind Hunter portent sur des hunks de **22.1** visibles dans le diff (propagation du clic dans la cellule, libellé « N selected », `aria-label` qualifié) — déjà revus, corrigés et ratifiés en 22.1 ; il ne pouvait pas lire `SelectionCheckbox.tsx`/`BulkActionBar.tsx`, exclus du diff. ③ « le toast recouvre la sticky bar de la Songlist » — prémisse fausse : `StickyActionBar` est ancrée **en haut** (`sticky top-16`), un toast bas-centre ne peut pas la couvrir. ④ `className` de `<ListSkeleton>` concaténé sans résolution de conflit Tailwind — vrai en théorie, mais c'est le pattern maison (`StickyActionBar`, `BulkActionBar`) et l'unique usage est `mt-4`, sans conflit. ⑤ `<Pagination>` sans prop `className` — YAGNI, ses 2 appelants veulent le même `mt-4`. ⑥ Conventions d'export hétérogènes entre les 3 fichiers — conforme à l'existant (`StickyActionBar` exporte nommé + défaut ; `ListSkeleton` exporte 2 composants, donc pas de défaut naturel). ⑦ `page` hors bornes accepté par `<Pagination>` (« Page 99 of 3 ») — inatteignable : sur les deux surfaces le pager est rendu **dans** la branche « il y a des résultats », et une page hors bornes bascule sur l'écran « This page is empty ».


## Dev Notes

### Ce qui n'a PAS été partagé, et pourquoi

- **La coquille de tableau** — cf. décision A (le cap 65vh a été retiré de la Songlist en QA device Epic 14). Une `<ListTableShell>` paramétrée par le mode de scroll avait été proposée et **écartée** par northwood au profit du périmètre le plus sûr.
- **Le mécanisme du toast** (état + `setTimeout`) reste dans chaque page : convention `project-context.md` explicite, et la partager imposerait un provider global.
- **Le `<div>Loading...</div>` de `SongsList`** : la Songlist n'a **pas** de skeleton, elle affiche un texte. Lui en donner un serait un changement d'UX, hors périmètre arbitré.

### Faux positif corrigé au cadrage

Le premier relevé annonçait « skeleton dupliqué dans 6 fichiers **dont `Songs.tsx`** ». Faux : l'`animate-pulse` de `Songs.tsx` est le **point pulsé du statut de sauvegarde** (barre d'autosave), pas un placeholder. Les 5 vrais emplacements sont tous côté Catalog.

### Project Structure Notes

- **NEW** : `src/components/Toast.tsx` + `.test.tsx`, `src/components/ListSkeleton.tsx` + `.test.tsx`, `src/components/Pagination.tsx` + `.test.tsx`.
- **UPDATE** : `src/pages/Songs.tsx`, `Catalog.tsx`, `CatalogManage.tsx`, `CatalogAdmin.tsx`, `CatalogCollection.tsx`, `CatalogCollectionCompose.tsx`, `CatalogEntry.tsx`.
- **Aucun** changement backend, service, modèle, migration, route. Aucun test existant modifié.

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev, hors workflow dev-story — demande directe de northwood)

### Debug Log References

- `npx jest Toast Pagination ListSkeleton` → 16/16 (4 suites, `ToastNotifications` inclus par le motif).
- Suite complète : **510/510 (60 suites)**, `tsc` clean, ESLint clean.
- Remplacements faits par script avec assertion d'unicité sur chaque motif (aucun remplacement à l'aveugle).

### Completion Notes List

- **3 briques, 11 tests, 7 surfaces câblées.** Les trois composants portent leur garde de rendu vide (`message` absent, `totalPages <= 1`) comme `<BulkActionBar>` en 22.1 — les pages n'ont plus de `{x && ...}` autour.
- **Côté Catalog, une seule déviation, mesurée** : les skeletons (liste et détail) sont **identiques au caractère près** — vérifié mécaniquement en comparant les classes de `git show b193dff:` à celles des composants. Les toasts Catalog, eux, **gagnent `z-50`** qu'ils n'avaient pas : c'est un ajout de ma part, pas une extraction à l'identique. Conservé après vérification de l'empilement — `ConfirmDialog` est portalisé sur `document.body` avec un overlay `z-50` et se monte donc **après** la racine de l'app : à z-index égal il gagne par l'ordre du DOM, un toast ne peut pas passer devant une modale. La pagination est byte-identique.
- **Un seul delta visible, sur la Songlist** (AC4) : toast déplacé bas-droit → bas-centre, fade-in perdu, `role="status"` gagné. Réversible d'un prop si la QA le rejette.
- **Code review lancée, mais PARTIELLE** : seule la couche Blind Hunter a rendu. Les couches Edge Case Hunter et Acceptance Auditor ont **planté** (aucune écriture pendant 7 min, tuées). La vérification d'identité du markup que devait faire l'Auditor a été refaite **mécaniquement** (comparaison de classes contre `git show b193dff:`), ce qui est plus fiable qu'un jugement de modèle pour cette question précise ; en revanche **la couche edge-case manque** — relancer avant merge si on veut la couverture complète.

### File List

- **NEW** `src/components/Toast.tsx`, `src/components/Toast.test.tsx`
- **NEW** `src/components/ListSkeleton.tsx`, `src/components/ListSkeleton.test.tsx`
- **NEW** `src/components/Pagination.tsx`, `src/components/Pagination.test.tsx`
- **UPDATE** `src/pages/Songs.tsx` (toast), `src/pages/Catalog.tsx`, `src/pages/CatalogManage.tsx`, `src/pages/CatalogAdmin.tsx`, `src/pages/CatalogCollection.tsx`, `src/pages/CatalogCollectionCompose.tsx`, `src/pages/CatalogEntry.tsx`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 1.1 | code review (partielle : Blind Hunter seul, les 2 autres couches plantées) — 5 patch (garde NaN de la pagination, région live montée en permanence façon MySessionsPage, type de prop, commentaire faux, test verrouillant les classes du toast), 1 defer, 7 dismiss. Identité du markup revérifiée mécaniquement : skeletons identiques au caractère près, toasts Catalog +`z-50` (écart assumé, empilement vérifié), delta Songlist plus large qu'annoncé (texte + arrondi). Front **513/60** (+14). | northwood |
| 2026-08-10 | 1.0 | Story créée et implémentée dans la foulée (demande directe northwood après 22.1) — `<Toast>`, `<ListSkeleton>`/`<DetailPageSkeleton>`, `<Pagination>` extraits et branchés sur 7 surfaces dont la Songlist. Coquille de tableau volontairement non partagée (D2 retirée en QA device Epic 14). Front 510/60 (+11), tsc + ESLint clean. QA navigateur à faire. | northwood |
