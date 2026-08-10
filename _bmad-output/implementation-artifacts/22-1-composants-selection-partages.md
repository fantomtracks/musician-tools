---
baseline_commit: b193dff10ec087c4abee6f750c88d47e4214c8ac
---

# Story 22.1: Barre d'actions groupées + cases à cocher partagées

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer du produit**,
I want **une barre « N selected » et des cases à cocher de ligne partagées entre la Songlist et le Catalog**,
so that **les écrans de liste cessent de diverger à chaque nouvelle surface**.

## Contexte / origine

Première story d'**Epic 22** (« Unification des listes de chansons du Catalog », cadré 2026-08-10, sans ADR : front-only). Fil rouge : *« dès qu'on affiche une liste de chansons, c'est l'affichage Songlist »* — tableau + case à cocher à gauche + barre d'actions groupées.

**Ordre IMPOSÉ : 22.1 → {22.2, 22.3, 22.4}.** 22.1 d'abord, sinon les trois suivantes redupliquent ce qu'elles sont censées unifier. Cette story est donc une **fondation** : elle n'ajoute **aucune fonctionnalité utilisateur**, elle crée les deux briques que 22.2/22.3/22.4 consommeront.

Suite logique du cluster DRY d'Epic 19 : `useAutosave` (19.7), `useRowSelection` (19.9), `StickyActionBar` (19.10). **Même régime : refacto iso-fonctionnel, on hisse un markup existant, on ne le réinvente pas.**

## Objectif NON négociable

**Zéro nouveau comportement.** Côté Songlist : **iso-visuel et iso-fonctionnel**, aucune assertion de test réécrite. Côté Catalog : le **seul** changement autorisé est visuel (adoption du style Songlist, décision D) + le libellé de la barre qui gagne son nom d'objet. Front vert (**baseline mesurée : 485 tests / 55 suites**), `tsc -b` et ESLint propres. Aucun backend, aucune migration, aucun service touché.

## Acceptance Criteria

1. **`<BulkActionBar>` créé** — `src/components/BulkActionBar.tsx` rend la coquille de barre d'actions groupées : le libellé « N {noun} selected » à gauche, les actions passées en `children` à droite. Il rend **`null` quand `count === 0`** — la garde est **centralisée dans le composant**, plus dans chaque page. Le nom d'objet est un prop (`noun` + `nounPlural?`), pas une constante interne.
2. **Primitives de case à cocher créées** — `src/components/SelectionCheckbox.tsx` exporte `SelectAllCheckbox` (case d'en-tête « tout sélectionner ») et `RowSelectionCheckbox` (case de ligne). Les **trois** garanties sont portées par les primitives, plus recopiées par page : (a) `aria-label` explicite (`Select all` / `Deselect all` ; `Select {label}` en ligne), (b) zone de clic élargie à la cellule entière, (c) `stopPropagation` — cocher une case ne déclenche **jamais** la navigation de ligne.
3. **`SongsList.tsx` migré (référence visuelle, décision D)** — la barre inline (L254-347) devient `<BulkActionBar>` et les deux `<input type="checkbox">` de tableau (L360-368 en-tête, L390-396 ligne) deviennent les primitives. Rendu **iso-visuel** ; comportement inchangé (playlist picker, `Mark as played on …`, `Delete selected`, ligne surlignée en bleu, `disabled={loading}`). **Les tests Songlist existants passent sans modification d'assertion.**
4. **`CatalogManage.tsx` (onglet Entries) migré** — la barre inline (L260-272) et les deux checkboxes (L318-325 en-tête, L344-352 ligne) passent sur les briques partagées. Le style Songlist est **adopté** : changement visuel **assumé** (D). Comportement inchangé (`Delete selected` + `ConfirmDialog` + tolérance 404 + clamp de page + `removeMany`). Le libellé passe de « N selected » à « N entr(y|ies) selected » — **6 assertions de `CatalogManage.test.tsx` sont mises à jour** (seul fichier de test existant à toucher) : 2 libellés de barre + 4 requêtes `getByLabelText` devenues nécessaires par le libellé qualifié `Select {titre} by {artiste}`, **ratifié par northwood le 2026-08-10** au vu de la review (deux titres homonymes donnaient deux noms accessibles identiques). L'AC disait initialement 3 assertions et la Task 3 déclarait les requêtes intouchables : amendé ici plutôt que contourné.
5. **Décision C inscrite** — **aucun** `<MultiSelectTable>` générique n'est créé. Un commentaire dans `BulkActionBar.tsx` explique pourquoi (les colonnes diffèrent légitimement par surface : la Songlist porte instrument/tuning/lastPlayed, le Catalog porte key/mode/timeSignature) pour que la prochaine surface ne re-tente pas l'abstraction. Ferme le descope non tracé de 19.9.
6. **API forward-compatible** — les deux composants sont utilisables tels quels par 22.2 (2ᵉ bouton dans la barre), 22.3 (`CatalogCollectionCompose`, tableau + `Remove selected`) et 22.4 (`CatalogList` browse + `CatalogCollection`) **sans nouveau prop** : la barre accepte N actions en `children`, la case de ligne accepte n'importe quel libellé.
7. **Aucune régression** — front **≥ 485** vert (les nouveaux tests s'ajoutent), `tsc -b` + ESLint propres. Aucun changement backend, aucun service, aucune migration. Aucun `<input type="checkbox">` de sélection de ligne ni de barre « selected » inline ne subsiste dans `SongsList.tsx` / `CatalogManage.tsx`.

## Tasks / Subtasks

- [x] **Task 1 — Créer `<BulkActionBar>`** (AC: 1, 5)
  - [x] `src/components/BulkActionBar.tsx` : props `{ count: number; noun: string; nounPlural?: string; children: ReactNode; className?: string }`. `if (count === 0) return null;` **en premier**. Coquille = la barre Songlist byte-identique (cf. § *Markup de référence*). Libellé = `` `${count} ${count === 1 ? noun : (nounPlural ?? noun)} selected` ``.
  - [x] Commentaire d'ancrage en tête : rôle du composant + **décision C** (pas de `<MultiSelectTable>` générique, et pourquoi) + « la garde `count === 0` vit ICI ».
  - [x] `src/components/BulkActionBar.test.tsx` (`StrictMode`) : rend `null` à 0 ; rend le libellé + les children à 1 ; `noun` seul → « 1 song(s) selected » **et** « 2 song(s) selected » (pas de pluralisation inventée) ; `noun`+`nounPlural` → « 1 entry selected » / « 2 entries selected » ; classes de coquille (`card-base`, `glass-effect`).
- [x] **Task 2 — Créer les primitives de case à cocher** (AC: 2)
  - [x] `src/components/SelectionCheckbox.tsx` : `SelectAllCheckbox({ allSelected, onToggle, disabled? })` et `RowSelectionCheckbox({ checked, onChange, label, disabled? })`. Les deux utilisent la **même** className d'input (celle de la Songlist, cf. § *Markup de référence*).
  - [x] `RowSelectionCheckbox` porte le `stopPropagation` (`onClick` **et** `onKeyDown`) sur son wrapper, et le wrapper remplit la cellule (cf. § *Zone de clic*). `SelectAllCheckbox` est dans un `<th>` non cliquable : pas de `stopPropagation` nécessaire, mais il porte l'`aria-label` **et** le `title` (superset des deux usages actuels).
  - [x] `src/components/SelectionCheckbox.test.tsx` (`StrictMode`) : `aria-label` `Select Zombie` en ligne ; `Select all` ↔ `Deselect all` selon `allSelected` ; `onChange` appelé au clic ; **test clé de non-régression** : dans un `<tr onClick={spy}>`, cocher la case appelle `onChange` et **pas** `spy` ; `disabled` respecté (pas d'`onChange`).
- [x] **Task 3 — Migrer `CatalogManage.tsx`** (AC: 4) — *migrer le Catalog d'abord (moins de surface, mêmes conventions que 19.7)*
  - [x] Barre L260-272 → `<BulkActionBar count={selected.size} noun="entry" nounPlural="entries">` avec le bouton `Delete selected` en children. Supprimer la garde `{selected.size > 0 && …}` (elle vit dans le composant).
  - [x] Checkboxes L318-325 / L344-352 → primitives ; retirer le `onClick={e => e.stopPropagation()}` du `<td>` (porté par la primitive).
  - [x] `src/__tests__/CatalogManage.test.tsx` : `'1 selected'` → `'1 entry selected'` (L81), `'2 selected'` → `'2 entries selected'` (L106). **Ne toucher à rien d'autre** — `getByLabelText('Select Zombie')` et `getByLabelText('Select all')` doivent continuer à passer tels quels (c'est le contrat des primitives).
- [x] **Task 4 — Migrer `SongsList.tsx`** (AC: 3)
  - [x] Barre L254-347 → `<BulkActionBar count={props.selectedSongs.size} noun="song(s)">` ; children = les 3 blocs d'actions **inchangés** (dropdown playlist + `Mark as played on …` conditionnel + `Delete selected`). Supprimer la garde `{props.selectedSongs.size > 0 && …}` et le `<div className="flex flex-wrap gap-2">` (rendu par la barre).
  - [x] Checkboxes L360-368 / L390-396 → primitives ; `disabled={props.loading}` conservé sur les deux ; retirer `onClick`/`onKeyDown`/`tabIndex={-1}` du `<td>` (portés par la primitive).
  - [x] Lancer la suite Songs* : **0 assertion modifiée** attendue. Si une assertion casse, c'est le refacto qui a un bug — corriger le composant, pas le test.
- [x] **Task 5 — Validation globale** (AC: 7)
  - [x] `npx jest` → **≥ 485** vert ; `npx tsc -b` ; `npm run lint`.
  - [x] `grep` de contrôle : plus aucun `type="checkbox"` de sélection de ligne ni de `<div>` « selected » inline dans `SongsList.tsx` / `CatalogManage.tsx` (les checkboxes du **playlist picker** de `SongsList` restent inline — voir § *Périmètre*).
  - [x] Vérification visuelle — **NON exécutée par l'agent** (aucun navigateur ouvert), **déléguée au gate QA de la branche epic** (convention 14-3/14-4). À regarder : hauteur de ligne des 2 tableaux (la cellule de case n'a plus de contenu en flux), position de la case, barre Catalog au style Songlist, light **et** dark.

### Review Findings

Code review 2026-08-10, 3 couches (Blind Hunter / Edge Case Hunter / Acceptance Auditor). 20 findings : **9 patchés**, **1 décision**, **3 deferred**, **7 dismiss**. Détail des dismiss et de la traçabilité ci-dessous.

- [x] [Review][Patch] **Zone de clic ne couvrant pas la cellule verticalement — clic à 2px du bord = ouverture de la ligne** (`blind+edge`, Med, les 2 couches indépendamment) — le wrapper en flux avait une hauteur intrinsèque (16px + padding = 32px) dans une ligne de ~36px, et le `stopPropagation` du `<td>` qui couvrait la bande résiduelle avait été retiré. `<label>` désormais étiré (`absolute inset-0`) sur toute la cellule. [`src/components/SelectionCheckbox.tsx`]
- [x] [Review][Patch] **`cellPadding` = chaîne magique couplée aux classes d'un autre fichier, sans test ni type** (`blind`, Med) — supprimée par le correctif ci-dessus ; un `px-4` sur le tableau Catalog aurait créé une bande morte de 8px sans faire rougir un seul test. [`src/pages/CatalogManage.tsx`]
- [x] [Review][Patch] **`onKeyDown: stop` mangeait les raccourcis clavier de la page** (`blind+edge`, Low) — la ligne n'a aucun handler clavier : l'isolation ne protégeait rien et tuait l'Échap `window` du `Header` quand le focus était sur une case (nouveau côté Catalog). Retiré, avec test de non-régression. **Écart assumé vs Task 2** qui demandait `onClick` **et** `onKeyDown`. [`src/components/SelectionCheckbox.tsx`]
- [x] [Review][Patch] **Test « zone padded » qui ne prouvait rien** (`blind`, Med) — jsdom n'a pas de layout : le test cliquait le même nœud que le test précédent et n'assertait aucun `onChange`. Il assert maintenant que le clic sur le wrapper coche réellement. [`src/components/SelectionCheckbox.test.tsx`]
- [x] [Review][Patch] **Test clavier qui passait pour une mauvaise raison** (`blind`, Med) — il assertait qu'un `keyDown` n'atteignait pas la ligne… qui n'a pas de handler clavier ; supprimer le code testé n'aurait pas fait rougir le test. Remplacé par un test qui verrouille l'inverse (les touches DOIVENT remonter). [`src/components/SelectionCheckbox.test.tsx`]
- [x] [Review][Patch] **Test `className` n'assertant pas `p-4` dans la branche qu'il couvre** (`blind`, Low) — un `className` qui aurait écrasé la coquille au lieu de s'y ajouter serait passé vert. [`src/components/BulkActionBar.test.tsx`]
- [x] [Review][Patch] **Contrat « la cellule doit être positionnée » non outillé** (`auditor`, Med) — le nouvel overlay n'a de sens que si la cellule hôte est `relative`. Extrait dans `selectionCell()` (`src/utils/`, ESLint interdisant l'export non-composant depuis un fichier de composant) + test structurel. ⚠️ **C'est une obligation côté page** : 22.3 (`<ul>/<li>`) et 22.4 devront l'appliquer à leur conteneur de ligne. [`src/utils/selectionCell.ts`]
- [x] [Review][Patch] **Completion Notes décrivant une implémentation abandonnée** (`auditor`, High) — les notes parlaient de marges négatives, de `cellPadding`, d'un `CELL_PADDING` dans le File List et d'un `onKeyDown` : plus rien de tout ça n'existe. Réécrites d'après le code réel. *(Récidive exacte de la leçon #5 de la rétro Epic 21.)*
- [x] [Review][Patch] **Chiffres faux dans les notes et le Change Log** (`auditor`, Med) — annoncés « 7/7 », « 12 tests », « 497/57, +12 » ; réels **9** tests `SelectionCheckbox`, **14** nouveaux, **499/57**. Corrigés.
- [x] [Review][Decision] **RÉSOLU (northwood, 2026-08-10) : libellé qualifié CONSERVÉ, les 4 réécritures de requêtes sont ratifiées et l'AC4 amendé.** Libellé de case qualifié par l'artiste (`blind+edge+auditor`, Low défaut / High procédure) — l'unicité est sur (titre, artiste) : deux « Hurt » donnaient deux noms accessibles identiques (et un `getByLabelText` qui lève « found multiple »). Patché en `Select {titre} by {artiste}`, **mais** cela réécrit 4 requêtes `getByLabelText('Select Zombie')` que la Task 3 déclarait intouchables, et change la chaîne annoncée dans les Dev Notes. À trancher : garder (et ratifier les 4 réécritures) ou revenir au titre nu. [`src/components/SongsList.tsx`, `src/pages/CatalogManage.tsx`, `src/__tests__/CatalogManage.test.tsx`]
- [x] [Review][Defer] **Suppression groupée vidant la page 1 → cul-de-sac sans refetch** (`edge`, Med) — pré-existant (19.5), code identique avant 22.1. [`src/pages/CatalogManage.tsx`] → deferred-work 2026-08-10
- [x] [Review][Defer] **Picker de playlists gardant coches et état ouvert après disparition de la barre** (`edge`, Low) — pré-existant, byte-identique avant 22.1 (seule la garde a déménagé). [`src/pages/Songs.tsx`] → deferred-work 2026-08-10
- [x] [Review][Defer] **Nom accessible de « tout sélectionner » qui change avec l'état** (`blind`, Low) — hérité de 19.5, propagé à la Songlist ; le corriger = choisir une convention stable pour les 4 surfaces → décision transverse. [`src/components/SelectionCheckbox.tsx`] → deferred-work 2026-08-10
- [x] [Review][Patch] **Vérification visuelle cochée sans avoir été faite** (`auditor`, Med) — la sous-tâche de Task 5 était `[x]` alors qu'aucun navigateur n'a été ouvert, et l'argument d'iso-visuel écrit dans les notes portait sur le design abandonné. Case **décochée**, argument réécrit, gate QA explicitement rendu à northwood.

**Dismiss (7, avec la raison)** : ① `nounPlural` optionnel permet « 3 song selected » si un futur appelant passe `noun="song"` — trap réel mais l'API est documentée et les 2 sites d'appel servent de référence ; en faire un prop requis imposerait `noun="song(s)" nounPlural="song(s)"`, pire. ② `className` appendé ≠ override CSS (l'ordre des classes ne décide pas de la précédence) — vrai, mais c'est le pattern maison de `StickyActionBar` et l'unique usage est `mt-4`, sans conflit. ③ `isolate` non exposé en prop sur `SelectAllCheckbox` — YAGNI, aucun en-tête cliquable aujourd'hui. ④ Export défaut de `BulkActionBar` sans appelant — conforme à `StickyActionBar` (nommé + défaut). ⑤ `title` gagné par la case « tout sélectionner » du Catalog — superset volontaire, inscrit dans les Dev Notes. ⑥ `cursor-pointer` sur une case désactivée — pré-existant (l'input de la Songlist l'avait déjà pendant `loading`), le retirer serait un écart iso-visuel. ⑦ Lint rouge + « diff périmé » relevés par l'Auditor — artefacts d'un audit lancé pendant l'application des correctifs (il a lu un état intermédiaire) ; `npm run lint` est propre sur l'arbre final.

## Dev Notes

### Périmètre — ce qui est DANS, ce qui est DEHORS

**DANS** : la coquille de barre + les 2 primitives de case à cocher, branchées sur **2 surfaces** (`SongsList`, `CatalogManage` onglet Entries).

**DEHORS, explicitement** :
- **Pas de `<MultiSelectTable>`** (décision C) — on partage la barre et les cases, **pas le tableau**.
- **Pas de nouvelle action** : « Add to collection » = 22.2, « Remove selected » = 22.3, « Add selected to my songlist » = 22.4.
- **Pas de branchement sur les 3 autres surfaces** (`CatalogList`, `CatalogCollection`, `CatalogCollectionCompose`) : c'est le travail de 22.3/22.4. On garantit seulement que l'API le permet (AC6).
- **Pas de refonte de `useRowSelection`** (19.9) : le hook est bon, il reste tel quel. On ne touche ni à ses sémantiques `selectOnly` (Songlist, *replace*) ni `addMany`/`removeMany` (Catalog, *within-page*).
- **Les checkboxes du playlist picker** de `SongsList` (L293-298, cocher une *playlist* dans le dropdown) ne sont **pas** des cases de sélection de ligne : elles restent inline, elles n'ont ni ligne cliquable ni select-all.
- **Pas de `role="status"` / `aria-live` sur la coquille** : la barre est un conteneur d'actions, pas une annonce. Les récaps `role="status"` arrivent en 22.2/22.3/22.4, **dans les children**.

### Markup de référence (source de vérité : la Songlist, décision D)

**Barre** — `src/components/SongsList.tsx` L254-258 + L344-347. La coquille à hisser, byte-identique :
```
<div className="card-base glass-effect p-4">
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</span>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
</div>
```
Le `<div className="flex flex-wrap gap-2">` **fait partie de la coquille** (les children y sont déposés) — ne pas le laisser dans les pages, sinon on obtient un wrapper en double.

**Input** — className de la Songlist (celle qui gagne, D) :
`h-4 w-4 cursor-pointer accent-brand-500 dark:accent-brand-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded`

Le Catalog utilise aujourd'hui la version courte (`h-4 w-4 cursor-pointer accent-brand-500 dark:accent-brand-400`, sans `bg`/`border`/`rounded`) : il **gagne** le fond/bordure — micro-changement visuel **assumé** (D).

**Ce que la barre Catalog perd** (assumé, D) : `rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3` + `mt-4`. La `card-base glass-effect p-4` de la Songlist n'a **pas** de marge propre : `CatalogManage` doit conserver un espacement équivalent en enveloppant l'appel (`<div className="mt-4">`) **ou** via le prop `className="mt-4"` de la barre — préférer le prop, c'est à ça qu'il sert (même pattern que `StickyActionBar`). ⚠️ Le prop `className` doit être **appendé** à la coquille, pas la remplacer (cf. `StickyActionBar.tsx` L18).

### Zone de clic et `stopPropagation` (le point le plus délicat)

État actuel — **les deux pages** mettent le `stopPropagation` sur le `<td>`, pas sur l'input :
- `SongsList` L384-389 : `<td className="p-2 text-center w-12" onClick={stop} onKeyDown={stop} tabIndex={-1}>`
- `CatalogManage` L344 : `<td className="px-3 py-2 w-12 text-center" onClick={stop}>`

Cible : le `stopPropagation` **descend dans la primitive**, et pour ne pas perdre la zone neutralisée du padding de cellule, le wrapper de la primitive **couvre le padding** par marge négative compensée :
```
<label className={`flex items-center justify-center cursor-pointer ${padClassName}`} onClick={stop} onKeyDown={stop}>
```
avec `padClassName` par défaut `-m-2 p-2` (Songlist, `p-2`) et `-mx-3 -my-2 px-3 py-2` passé par `CatalogManage` (`px-3 py-2`). Marge négative + padding égal = **zéro changement de layout**, et le clic sur tout le pavé de la cellule est neutralisé exactement comme aujourd'hui.

**Décision « ≥44px » — lire attentivement.** La cible horizontale est déjà à **48px** (`w-12` sur les deux `<th>`/`<td>`). Verticalement, la hauteur de ligne fait ~33-36px : la porter à 44px **grossirait toutes les lignes des deux tableaux** (casse l'iso-visuel de l'AC3) et, si on l'obtenait par un pseudo-élément débordant (`before:-inset-y-…`), la zone invisible d'une ligne **recouvrirait la ligne voisine** et détournerait ses clics. **Décision : la zone de clic = la cellule entière (48px × hauteur de ligne), pas d'inflation verticale.** On reste au-dessus du minimum WCAG 2.5.8 (24×24). Inscrire ce raisonnement en commentaire dans `SelectionCheckbox.tsx` pour qu'une review ne le rouvre pas. *(Point remonté à northwood en fin de story — s'il veut le 44px vertical strict, c'est un changement de hauteur de ligne à assumer sur les deux tableaux, donc une décision produit, pas un détail d'implémentation.)*

### Différences à absorber sans les gommer

| | Songlist | Catalog Manage | Cible 22.1 |
|---|---|---|---|
| Libellé barre | `{n} song(s) selected` | `{n} selected` | `noun`/`nounPlural` en prop → `song(s)` / `entry`+`entries` |
| Case en-tête | `title` seul, `disabled={loading}` | `aria-label` seul, pas de `disabled` | primitive : `aria-label` **et** `title`, `disabled?` optionnel |
| Case de ligne | pas d'`aria-label`, `disabled={loading}` | `aria-label="Select {title}"` | primitive : `aria-label` toujours (`label` requis), `disabled?` |
| Sémantique select-all | *replace* (`clear`/`selectOnly`) | *within-page* (`addMany`/`removeMany`) | **inchangée** — reste dans les pages (19.9 l'a déjà tranché) |
| Persistance | `persistKey: 'songsSelectedUids'` | éphémère | **inchangée** |

La colonne « cible » ne fait qu'**unir les deux besoins** : personne ne perd une garantie. Le `label` de `RowSelectionCheckbox` est **requis** (pas de case anonyme) — la Songlist en gagne une (progrès a11y sans effet visuel).

### Pièges (leçons des épics 18→21)

- **La garde déménage.** En sortant `{count > 0 && …}` des pages, les `children` de la barre sont **construits** même à 0 (React ne les monte pas, mais l'expression JSX est évaluée). Vérifier qu'aucun children ne contient d'appel coûteux ou à effet de bord. Aujourd'hui : le dropdown playlist est déjà gardé par `bulkPlaylistOpen`, `Mark as played` par `instrumentFilter` — rien à faire, mais ne pas introduire d'appel de service dans les children.
- **`space-y-4` intact.** La barre Songlist est un enfant direct de `<div className="w-full lg:flex-1 min-w-0 space-y-4">` : rendre `null` ne crée pas de nœud DOM, l'espacement reste identique à la condition d'aujourd'hui. Ne **pas** rendre un `<div hidden>` ou un fragment vide à la place de `null`.
- **StrictMode par défaut** (leçon rétro 18/19, action item A) : les nouveaux tests de composants montent en `<StrictMode>`, comme `CatalogManage.test.tsx` L31-42.
- **Ne pas réécrire une assertion pour faire passer un refacto** (leçon 19.10). La seule exception autorisée ici est le libellé Catalog (AC4), qui est un changement **voulu** par le cadrage — et elle se limite à 2 chaînes.
- **QA visuelle** : 4 épics d'affilée (18/19/20/21) où la QA navigateur a trouvé ce que la review verte ratait. Ici le risque n°1 est un **décalage de hauteur de ligne** dû aux marges négatives : regarder les deux tableaux dans le navigateur, light **et** dark.
- **`.glass-effect` = `backdrop-filter` = containing block** (piège documenté 19.10 / rétro 21) : la barre Songlist utilise `card-base glass-effect`. Elle n'est **pas** `sticky` et ne contient **pas** de portail — rien à faire ici, mais si 22.2 y met un dropdown de collections, il devra être portailé ou rester en `absolute` local (le dropdown playlist actuel est `absolute` dans un parent `relative`, donc OK).

### Anchors code (lus, non devinés)

- `src/components/SongsList.tsx` — L254-347 barre bulk (garde + coquille + 3 actions) ; L360-368 checkbox en-tête (`title`, `disabled`) ; L376-397 `<tr onClick={onEdit}>` + `<td>` stop-propagation + checkbox de ligne ; L379 surlignage bleu de la ligne sélectionnée (**à ne pas toucher**).
- `src/pages/CatalogManage.tsx` — L34-35 `useRowSelection()` éphémère ; L131-138 `allDisplayedSelected` + `toggleSelectAll` *within-page* ; L140-168 `handleDeleteSelected` (404 toléré, clamp de page, `removeMany`) ; L260-272 barre inline ; L318-325 / L344-352 checkboxes ; L382-391 `ConfirmDialog`.
- `src/pages/Songs.tsx` — L97-98 `useRowSelection({ persistKey: 'songsSelectedUids' })` ; L1630-1636 `toggleSelectSong` / `toggleSelectAll` (*replace*) ; L1753 `allDisplayedSelected` ; L1897-1955 passage des props à `<SongsList>`. **Aucun changement attendu dans `Songs.tsx`** : la migration est entièrement dans `SongsList.tsx` (composant de présentation). Si vous vous surprenez à modifier `Songs.tsx`, c'est que le périmètre dérape.
- `src/hooks/useRowSelection.ts` — le hook partagé (19.9) et son commentaire de frontière : **à lire avant de coder**, il explique déjà pourquoi les sémantiques de select-all restent dans les pages.
- `src/components/StickyActionBar.tsx` — **le modèle exact** de ce qu'on écrit ici : const `SHELL`, `className?` appendée, commentaire de frontière, export nommé **et** défaut, test colocalisé.
- Futurs consommateurs (à ne PAS toucher, mais dont l'API doit tenir) : `src/components/CatalogList.tsx` L24-52 (tableau browse, `<td>` Add déjà en `stopPropagation`) ; `src/pages/CatalogCollectionCompose.tsx` L299-320 (`<ul>/<li>` membres, `Remove` par ligne) ; `src/pages/CatalogCollection.tsx` (vue publique).

### Project Structure Notes

- **NEW** : `src/components/BulkActionBar.tsx`, `src/components/BulkActionBar.test.tsx`, `src/components/SelectionCheckbox.tsx`, `src/components/SelectionCheckbox.test.tsx`.
- **UPDATE** : `src/components/SongsList.tsx`, `src/pages/CatalogManage.tsx`, `src/__tests__/CatalogManage.test.tsx` (2 chaînes).
- **Aucun** changement backend, service, modèle, migration, route.
- Tests **colocalisés** dans `src/components/` pour les composants partagés (convention 19.10 `StickyActionBar.test.tsx` / 19.9 `src/hooks/useRowSelection.test.ts`) ; les tests de page restent dans `src/__tests__/`. Les deux emplacements sont couverts par `roots: ["<rootDir>/src"]`.
- Conventions obligatoires (project-context) : TypeScript `strict` + `verbatimModuleSyntax` (**`import type { ReactNode }`**), pas d'alias de paths (imports relatifs), Tailwind uniquement (pas de CSS custom), **UI et commentaires en anglais**, `dark:` sur chaque élément stylé.
- Pas de nouvelle dépendance — React 19.1 / Tailwind 3.4 / Jest 29 + RTL déjà en place. Rien à rechercher côté versions : la story n'introduit aucune lib.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` § Epic 22 + Story 22.1 — décisions A/B/C/D et ordre imposé]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` L296 (dette multi-select 19.9, archivée) + L339 / L343 (relevés QA prod 2026-08-08 → 22.2 / 22.4)]
- [Source: `_bmad-output/implementation-artifacts/19-10-sticky-action-bar.md` — modèle de refacto iso-fonctionnel (coquille partagée + children)]
- [Source: `src/hooks/useRowSelection.ts` (19.9) — frontière hook/pages déjà tranchée, ne pas la rejouer]
- [Source: `_bmad-output/implementation-artifacts/epic-21-retro-2026-08-10.md` — QA navigateur trouve ce que la review verte rate (4ᵉ épic) ; factory de mock partagée non tenue]
- [Source: `_bmad-output/project-context.md` — règles TS/React/Tailwind/tests, langue anglaise, deux suites Jest]

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev-story)

### Debug Log References

- Branche epic créée : `feat/epic-22-unification-listes-catalog` (jamais de travail direct sur `main`).
- TDD par brique : `npx jest BulkActionBar` → RED (module absent) → **5/5** ; `npx jest SelectionCheckbox` → RED → **7/7**.
- `npx jest CatalogManage` → **12/12** (2 suites : CatalogManage + CatalogManageCollections).
- `npx jest Songs` → **9 suites / 61 tests** verts, **0 assertion modifiée**.
- Après les correctifs de review — suite complète : **499/499 (57 suites)** — baseline 485/55, soit **+14** tests (5 `BulkActionBar` + 9 `SelectionCheckbox`), **0 régression**. `npx tsc -b --force` clean. `npm run lint` clean (le helper `selectionCell` a dû sortir du fichier de composant : ESLint `react-refresh/only-export-components` interdit d'y exporter autre chose qu'un composant).
- Greps de contrôle : plus aucune barre « selected » inline ni garde `size > 0 &&` dans les deux fichiers ; le seul `type="checkbox"` restant dans `SongsList.tsx` (L293) est celui du **playlist picker**, hors périmètre par construction.

### Completion Notes List

- **`<BulkActionBar>`** — coquille `card-base glass-effect p-4` (référence Songlist, décision D) + libellé « N {noun} selected » + le `flex flex-wrap gap-2` qui reçoit les children. La garde `count === 0 → return null` est **centralisée** : les deux pages ont perdu leur `{n > 0 && …}`. `noun` est utilisé verbatim quand `nounPlural` est absent (la Songlist garde son « song(s) » littéral) ; le Catalog passe `entry`/`entries`. Prop `className` **appendée** (pattern `StickyActionBar`), utilisée par le Catalog pour conserver son `mt-4`.
- **Décision C inscrite dans le code** — commentaire en tête de `BulkActionBar.tsx` : pas de `<MultiSelectTable>` générique, avec la raison (colonnes légitimement différentes par surface). Ferme le descope non tracé de 19.9.
- **`SelectionCheckbox.tsx`** — `SelectAllCheckbox` + `RowSelectionCheckbox` partagent un `CheckboxCell` interne. Les garanties portées par la primitive : `aria-label` (la Songlist en gagne un par ligne, elle n'en avait aucun) ; **zone de clic = la cellule entière**, obtenue en étirant le `<label>` (`absolute inset-0 flex items-center justify-center`) ; `stopPropagation` du **clic** sur la case de **ligne** uniquement — l'en-tête vit dans un `<th>` non cliquable, l'isolation y serait du bruit (et gênerait un futur tri de colonne).
- **Le clavier n'est PAS isolé** (écart assumé vs Task 2, issu de la review) : la ligne est un `<tr onClick>` sans handler clavier, donc avaler `keydown` ne protégeait rien — et tuait l'Échap écouté sur `window` par le `Header` dès que le focus était sur une case. Un test verrouille que les touches remontent.
- **Zone de clic — pourquoi cette forme, et pas une autre.** Un wrapper **en flux** ne peut pas tenir la promesse : sa hauteur est intrinsèque (16px + padding = 32px) et un `<td>` ne l'étire pas à la hauteur de ligne (~36px, davantage avec le badge `Draft` ou un titre sur 2 lignes) — il laisse une bande vivante en haut et en bas, où le clic tombe sur le `<tr>` et **ouvre la fiche**. C'est précisément le bug qu'avait introduit la première version (retrait du `stopPropagation` du `<td>` + wrapper en flux) et que la review a attrapé. L'overlay étiré supprime la bande. Contrepartie : la cellule hôte doit être positionnée → helper `selectionCell()` **obligatoire côté page** (`src/utils/selectionCell.ts`), à appliquer aussi par 22.3 (`<ul>/<li>`) et 22.4.
- **Pas d'inflation verticale à 44px** (décision de cadrage tenue) : cible = 48px (`w-12`) × hauteur de ligne. La forcer à 44px grossirait toutes les lignes des deux tableaux (casse l'iso-visuel AC3) ; l'obtenir par un débordement ferait recouvrir la ligne voisine et détournerait ses clics. Au-dessus du minimum WCAG 2.5.8 (24×24). **À confirmer par northwood** — décision produit (hauteur de ligne), pas détail d'implémentation.
- **Iso-visuel : argument, pas preuve.** Les paddings de cellule étant symétriques (`p-2`, `px-3 py-2`), un overlay `inset-0` centre la case au même pixel qu'un input centré par `text-center` + `vertical-align: middle`. **Mais** la cellule ne porte plus de contenu en flux (l'overlay est hors flux) : la hauteur de ligne repose désormais entièrement sur les cellules de texte voisines. jsdom n'a pas de layout, aucun test ne peut le prouver → **la vérification navigateur n'a pas été faite et reste le gate QA de la branche epic** (Songlist et Catalog, light + dark, hauteur de ligne + position de la case).
- **Catalog : 6 assertions modifiées au total.** Deux libellés de barre — `'1 selected'` → `'1 entry selected'`, `'2 selected'` → `'2 entries selected'` (l'AC4 en anticipait 3, il n'y en avait que deux) — **plus 4 requêtes** `getByLabelText('Select Zombie')` → `'Select Zombie by The Cranberries'`, conséquence du libellé qualifié par l'artiste appliqué en review. Ces 4 réécritures **contredisent la Task 3** qui les déclarait intouchables : elles sont **en attente de ratification** (cf. Review Findings, finding 10), pas passées en douce.
- **Deux tests `disabled` reformulés** (les seuls écarts au plan de test de la story) : `fireEvent.click` de jsdom ne reproduit pas le blocage d'activation d'un input `disabled` — il déclenche quand même le `change`. Asserter « `onChange` non appelé » testerait jsdom, pas le composant. Les tests assertent donc ce que le composant contrôle réellement (`toBeDisabled()`), et pour la case de ligne, qu'un clic sur une case désactivée **n'ouvre toujours pas la ligne**. Aucune garantie perdue.
- **Périmètre tenu** : aucune action nouvelle (22.2/22.3/22.4), aucune autre surface branchée, `useRowSelection` **non modifié** (sémantiques *replace* Songlist / *within-page* Catalog inchangées), `Songs.tsx` **non touché**, aucun backend/service/migration.

### File List

- **NEW** `src/components/BulkActionBar.tsx` — coquille de barre d'actions groupées + garde `count === 0` + décision C.
- **NEW** `src/components/BulkActionBar.test.tsx` — 5 tests (StrictMode).
- **NEW** `src/components/SelectionCheckbox.tsx` — `SelectAllCheckbox` + `RowSelectionCheckbox` (aria-label, overlay `absolute inset-0`, stopPropagation du clic).
- **NEW** `src/components/SelectionCheckbox.test.tsx` — 9 tests (StrictMode).
- **NEW** `src/utils/selectionCell.ts` — helper `selectionCell(className)` : la cellule hôte doit être `relative` (sorti du fichier de composant pour ESLint `react-refresh/only-export-components`).
- **UPDATE** `src/components/SongsList.tsx` — barre inline → `<BulkActionBar>` ; 2 checkboxes → primitives ; `<td>`/`<th>` via `selectionCell()`, handlers retirés.
- **UPDATE** `src/pages/CatalogManage.tsx` — idem ; style Songlist adopté.
- **UPDATE** `src/__tests__/CatalogManage.test.tsx` — 2 libellés de barre + 4 requêtes `getByLabelText` (cf. finding 10).
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml` — epic-22 in-progress ; 22-1 ready-for-dev → in-progress → review.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 1.1 | code review 3 couches — 20 findings : 9 patchés (dont la régression de zone de clic trouvée par 2 couches indépendantes : wrapper en flux → overlay `absolute inset-0` + helper `selectionCell`), 1 décision en attente (libellé qualifié par l'artiste + 4 requêtes de test réécrites), 3 deferred, 7 dismiss. Completion Notes réalignées sur le code (elles décrivaient le design abandonné — récidive de la leçon #5 rétro Epic 21). Front **499/57** (+14), tsc + ESLint clean. QA navigateur toujours à faire. | northwood |
| 2026-08-10 | 1.0 | dev-story — `<BulkActionBar>` + primitives `SelectionCheckbox` créés en TDD, `SongsList` migré iso-visuel (0 assertion Songs touchée) et `CatalogManage` migré au style Songlist. | northwood |
| 2026-08-10 | 0.1 | Story créée (create-story) — fondation Epic 22 : `<BulkActionBar>` + primitives `SelectionCheckbox`, branchées sur SongsList (iso-visuel) et CatalogManage (style Songlist assumé). Décision C inscrite (pas de `<MultiSelectTable>`). Zone de clic = cellule entière, inflation verticale 44px refusée et argumentée. Baseline front 485/55 suites. | northwood |
