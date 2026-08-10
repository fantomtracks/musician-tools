---
baseline_commit: b193dff10ec087c4abee6f750c88d47e4214c8ac
---

# Story 22.4: Ajouter une sélection à ma songlist (lecteur)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **cocher plusieurs chansons dans le Catalog — au browse comme dans une collection — et les ajouter d'un coup à ma songlist**,
so that **je ne les ajoute plus une par une, sans avoir à tout prendre ou rien**.

## Contexte / origine

**Dernière story d'Epic 22**, et la seule côté **lecteur** (22.1/22.2/22.3 étaient développeur ou curateur). Relevé de QA prod 2026-08-08 (`deferred-work` L343) : `CatalogList` est déjà un tableau, il lui manque la colonne de cases et l'action groupée ; `/catalog/collections/:uid` n'offre que le tout-ou-rien.

Consomme 22.1 (`<BulkActionBar>`, primitives, `selectionCell`) et 22.2 (`runBounded`, forme du récap). **Dépend de 22.1** (`done`).

## Découverte de cadrage — À LIRE EN PREMIER

**Contrairement à 22.2 et 22.3, ici les erreurs SONT typées — il faut s'en servir.**

`catalogService.addToSonglist(uid)` (L194-216) ne renvoie pas un simple booléen :
- **201** → retourne la **`Song` créée** ;
- **409** → lève `SongConflictError` **portant la `Song` existante** (`existingSong`) ;
- **404** → lève `CatalogNotFoundError`, et le commentaire du service le qualifie de *« permanent failure, not a retryable one »* (la fiche a été supprimée du Catalog).

Trois conséquences pour l'implémentation :
1. Le récap a **quatre** issues, pas trois : `added` / `already in your songlist` (409) / **`no longer in the catalog`** (404, **permanent**) / `failed` (le reste, réessayable). Ne pas noyer le 404 dans « failed » : proposer de réessayer une fiche supprimée est un mensonge (leçon du « collection gone » de 22.2).
2. **Les entrées en 404 ne doivent PAS rester sélectionnées** — réessayer ne peut pas marcher. Seules les vraies erreurs réessayables restent cochées. C'est une divergence assumée avec 22.2/22.3, justifiée par le typage.
3. **La cohérence du flag doublon est gratuite** : `useSonglistMatcher.addToCache(song)` accepte une `Song`. On l'alimente avec la `Song` retournée par un 201 **et** avec `err.existingSong` d'un 409 — après le lot, les lignes affichent « Already in your songlist » sans le moindre refetch.

## Décisions de cadrage

- **A — Un sous-ensemble ne crée AUCUNE playlist miroir** (décision B de l'epic). Le bouton « toute la collection » (import 20.3) reste et **crée** la playlist. Le `ConfirmDialog` du sous-ensemble doit **dire explicitement** qu'aucune playlist ne sera créée, sinon les deux boutons voisins sont indiscernables.
- **B — `useSonglistMatcher` n'est PAS ajouté à la vue publique de collection.** Elle n'a pas de flag doublon aujourd'hui ; lui en donner un est une amélioration à part (un `getAllSongs` de plus au chargement). Le 409 reste la vérité côté serveur. **Ne pas l'ajouter par symétrie.**
- **C — `CatalogList` reçoit la sélection en props optionnels.** Elle n'a **qu'un seul** consommateur aujourd'hui (`Catalog.tsx` — vérifié), mais la garder utilisable sans sélection évite d'imposer la colonne à un futur écran. Colonne rendue **seulement** si les props sont fournis.
- **D — Le bouton *Add* par ligne RESTE** (décision de l'epic) — contrairement à 22.3 où le *Remove* par ligne a disparu. Ici l'action unitaire est le geste courant, la sélection est le raccourci ; et `CatalogAddButton` porte déjà ses trois états et son annonce.
- **E — Sélection non persistée** (pas de `persistKey`) et **survivant à la pagination** sur `/catalog` → sémantique `addMany`/`removeMany` comme `CatalogManage`, **pas** `selectOnly`. Corollaire imposé par la review de 22.2 : **un bouton « Clear selection » est obligatoire** (une entrée en échec sortie de la page n'a plus de case pour la décocher).

## Acceptance Criteria

1. **Récap à quatre issues** — « X added · Y already in your songlist · Z no longer in the catalog · W failed », segments omis quand nuls. Un lot entièrement déjà-présent a **son propre message**, pas un « 0 added » dégradé. `role="status"`, `role="alert"` s'il y a des échecs, **`aria-label="Bulk action result"`** (le `<Toast>` de 22.5 garde une région `role="status"` montée). Rendu **HORS** de `<BulkActionBar>`, fermé par ✕ **et** au prochain geste de sélection — piloté par les **handlers** (`userToggle`/`userSelectAll`), **pas** par une empreinte de sélection (voir Pièges).
2. **Colonne de cases sur `/catalog`** — `CatalogList` gagne une colonne de cases à cocher en **props optionnels** (décision C), via les primitives 22.1 + `selectionCell`. Le **clic-ligne qui ouvre la fiche** et le **bouton *Add* par ligne** sont préservés. La sélection **survit à la pagination** et n'est **pas** persistée (décision E).
3. **Vue publique de collection en tableau** — `/catalog/collections/:uid` : la `<ul>/<li>` devient un tableau (Artist · Title · Key · BPM) avec colonne de cases. Le bouton **« Add collection to my songlist »** reste **en raccourci**, inchangé (import total 20.3, playlist miroir incluse).
4. **« Add selected to my songlist »** — dans la barre « N selected » des deux surfaces. `ConfirmDialog` **disant explicitement qu'aucune playlist ne sera créée** (décision A), puis N appels `addToSonglist` via `runBounded` (pool de 4, best-effort).
5. **Le flag doublon reste cohérent** — sur `/catalog`, `addToCache` est alimenté par la `Song` d'un 201 **et** par `err.existingSong` d'un 409 : après le lot, les lignes concernées affichent l'état « déjà dans la songlist » sans refetch.
6. **Sélection après le lot** — sortent de la sélection : les `added`, les `already in` **et les 404** (permanents, décision de la Découverte). Restent cochées : **uniquement** les erreurs réessayables. Un **« Clear selection »** est présent dans la barre (décision E).
7. **Gardes de concurrence** — cases et boutons de la barre gelés pendant un lot ; garde `useRef` in-flight ; `mountedRef` avant les `setState` post-lot ; le bouton d'import total est gelé pendant un lot de sélection, et réciproquement (deux chemins d'écriture sur la songlist).
8. **Aucun backend** — aucune migration, aucun endpoint, **aucun changement de service**. UI en anglais, dark mode, cibles ≥44px. Tests (`StrictMode`) sur les **deux** surfaces : rendu + colonne de cases, succès, 409, 404, échec partiel, cohérence du flag après lot, `ConfirmDialog` mentionnant l'absence de playlist. Front vert, `tsc -b` + ESLint propres.

## Tasks / Subtasks

- [x] **Task 1 — `CatalogList` : colonne de cases optionnelle** (AC: 2)
  - [x] Props ajoutés : `selectedUids?: Set<string>`, `onToggle?: (uid: string) => void`, `allSelected?: boolean`, `onToggleAll?: () => void`, `disabled?: boolean`. La colonne (`<th>` + `<td>`) n'est rendue **que si** `onToggle` est fourni.
  - [x] `selectionCell()` sur `<th>`/`<td>` ; le clic-ligne (`navigate`) et la cellule *Add* (déjà en `stopPropagation`) restent intacts.
- [x] **Task 2 — `/catalog` : sélection + action groupée** (AC: 1, 4, 5, 6, 7)
  - [x] `Catalog.tsx` : `useRowSelection()` éphémère ; select-all **within-page** (`addMany`/`removeMany` sur les uids affichés) ; `<BulkActionBar>` avec *Add selected to my songlist* + **Clear selection**.
  - [x] `handleAddSelected` : `ConfirmDialog` → `runBounded(uids, 4, …)` → classement en 4 seaux par **type d'erreur** (`SongConflictError`, `CatalogNotFoundError`, autre) → `addToCache` pour les 201 **et** les 409 → `removeMany([...added, ...alreadyIn, ...gone])`.
  - [x] Récap hors barre (`aria-label`, `key` par sévérité), effacé au démarrage du lot et au geste de sélection suivant **via les handlers**.
- [x] **Task 3 — `/catalog/collections/:uid` : tableau + action groupée** (AC: 3, 4, 6, 7)
  - [x] `CatalogCollection.tsx` : `<ul>` → tableau (Artist · Title · Key · BPM) + colonne de cases (primitives + `selectionCell`) ; **pas** de clic-ligne (rien à ouvrir depuis cette vue) ; select-all en *replace* (pas de pagination).
  - [x] Même action groupée qu'en Task 2, **sans** `addToCache` (décision B : pas de matcher ici).
  - [x] Bouton d'import total **inchangé** ; les deux boutons se gèlent mutuellement (AC7). Le bandeau `result` existant de l'import total et le nouveau récap **ne doivent pas se superposer** : décider lequel s'efface quand l'autre s'affiche, et l'écrire.
- [x] **Task 4 — Tests** (AC: 8)
  - [x] **Migrer d'abord** les mocks partiels de `src/__tests__/Catalog.test.tsx` et `CatalogCollection.test.tsx` vers `makeCatalogServiceMock()` (reste du deferred 22.2), puis ajouter les tests.
  - [x] Couvrir sur `/catalog` : colonne de cases + clic-ligne toujours vivant + *Add* par ligne toujours là ; lot mixte 201/409/404/erreur → les 4 segments ; les 404 **sortent** de la sélection, l'erreur réessayable **reste** ; flag doublon cohérent après lot.
  - [x] Couvrir sur la vue collection : tableau, lot nominal, `ConfirmDialog` **mentionnant l'absence de playlist**, bouton d'import total toujours présent.
- [x] **Task 5 — Validation** (AC: 8)
  - [x] `npx jest`, `npx tsc -b --force`, `npm run lint`. Baseline avant cette story : **544 tests / 61 suites**.
  - [x] QA navigateur : **déléguée au gate de la branche epic** — et c'est la surface la plus exposée de l'epic (seule story visible par tous les utilisateurs).

### Review Findings

Code review 2026-08-10, 3 couches — **PARTIELLE** : Blind Hunter et Edge Case Hunter rendus ; l'Acceptance Auditor a **planté** (31 événements, 9 min sans écriture, tué) — **4ᵉ plantage sur 5 tentatives** de cette couche. Sa partie mécanique a été refaite à la main, et elle a **pris en défaut une de mes notes** (voir plus bas). 23 findings : **12 patchés**, **3 deferred**, **8 dismiss**.

**Patchés — comportement**

- [x] [Review][Patch] **La barre, le récap et « Clear selection » disparaissaient dès que le tableau se vidait** (`blind+edge`, Med) — les trois vivaient **dans** la branche « il y a des résultats » de `/catalog`. Un filtre sans correspondance (ou un refetch en erreur) les démontait alors que la sélection restait vivante : plus une case à décocher, plus de bouton pour vider — exactement l'échappatoire que la review de 22.2 avait rendue obligatoire. Barre et récap **hissés hors du ternaire**. Un test verrouille le cas.
- [x] [Review][Patch] **Le scénario le plus grave de la story : N chansons écrites sans le moindre retour** (`edge`, Med-High) — cocher 2 lignes, taper une recherche sans résultat, puis confirmer **dans les 280 ms du debounce**. La modale est portalisée sur `document.body` donc elle survit ; le récap, lui, était dans la branche démontée. Les 2 POST partaient, la sélection se vidait, et l'utilisateur restait devant « No songs match your search » sans jamais apprendre l'écriture. Le debounce est la seule interaction que le backdrop ne peut pas bloquer (le timer était déjà armé). **Corrigé par le même déplacement** que le point précédent.
- [x] [Review][Patch] **`describeAddRecap` produisait encore le « 0 added » dégradé dans 3 formes sur 4** (`blind+edge`, Med/Low) — ma garde ne couvrait que le lot entièrement déjà-présent. « 0 added · 2 failed », « 0 added · 2 no longer in the catalog » et « 0 added · 1 already in · 1 failed » passaient tous. C'est **exactement** la leçon que le commentaire au-dessus prétendait appliquer. Le segment n'est plus émis à zéro ; test dédié.
- [x] [Review][Patch] **Un lot entièrement délisté s'affichait comme un succès** (`blind`, Med) — gravité dérivée du seul seau `failed`, donc `{added:0, gone:5}` obtenait `role="status"` et le gris neutre, visuellement identique à un ajout réussi. Extrait en `isAddRecapNegative` : est négatif tout lot qui n'a **rien ajouté**, pas seulement celui qui a des échecs.
- [x] [Review][Patch] **Un 409 sans `song` désélectionnait la ligne en la laissant proposer *Add*** (`edge`, Low) — cas réel, pas seulement de test : le contrôleur tolère un échec de lookup et répond `song: null`. La ligne sortait de la sélection (correct : elle est déjà là) mais le flag ne pouvait plus être posé, donc elle continuait d'afficher un bouton qui re-409era. Le récap porte désormais `needsSonglistRefresh`, et `useSonglistMatcher` gagne un `refresh()` que la page appelle dans ce cas précis. Test dédié comptant les appels.
- [x] [Review][Patch] **Le récap survivait à un changement de page ou de filtre** (`blind+edge`, Low) — il n'était effacé que par les gestes de sélection. Après un changement de page il restait épinglé au-dessus d'un tableau ne contenant aucune des chansons décrites, avec un conseil « réessayez » inactionnable. Effet d'invalidation sur recherche/filtres/page.
- [x] [Review][Patch] **« Tout sélectionner » pendant un refetch banquait les uids de la page précédente** (`edge`) — la liste est `opacity-50 aria-busy` mais restait interactive, et `displayedUids` venait du `data` périmé. `selectionDisabled` inclut maintenant `loading`.
- [x] [Review][Patch] **L'exclusion mutuelle des deux chemins d'écriture était asymétrique** (`blind`, Med) — `handleImport` gardait `bulkAdd.running`, mais `handleAddSelected` n'avait aucune garde `importing` : la propriété ne tenait que par la couche vue. Les deux handlers la défendent maintenant, comme l'avait imposé la review de 22.3.
- [x] [Review][Patch] **25 lignes de bandeau dupliquées entre les deux pages** (`blind`, Low) — l'ironie de l'epic : le **moteur** avait été partagé, la **présentation** copiée-collée sur une troisième surface. Extrait en `<BulkRecap>`, qui porte aussi les deux règles qu'un appelant peut oublier (`aria-label` obligatoire à cause du `<Toast>` permanent, `key` par sévérité).
- [x] [Review][Patch] **`scope="col"` manquant sur le `<th>` de sélection** (`blind`, Low) — incohérent au sein d'un même `<tr>`.

**Patchés — tests et notes**

- [x] [Review][Patch] **Le test « l'import total est gelé pendant un lot » ne pouvait pas échouer pour la raison annoncée** (`blind`, Med) — au moment de l'assertion, `confirmAddOpen` valait encore `true` et suffisait à désactiver le bouton : supprimer `bulkAdd.running` de la garde n'aurait rien fait rougir. Réécrit pour passer par le **handler** (cliquer et vérifier qu'aucun import ne part), et le `releases` final est enveloppé dans `act`.
- [x] [Review][Patch] **Le test « Clear selection ... rows may be off-page » ne testait rien de tel** (`blind`, Low) — il sélectionnait puis vidait sur une page unique. Réécrit en ce qu'il prétendait couvrir : un filtre qui vide le tableau, et l'échappatoire qui doit survivre.
- [x] [Review][Patch] **Note de complétion FAUSSE : « les cinq suites Catalog y sont passées »** (vérif mécanique) — il y a **huit** suites qui mockent `catalogService`, et **quatre** seulement étaient migrées, dont pas `CatalogManageCollections.test.tsx` — précisément l'exposition que l'Auditor de 22.2 avait nommée. Plutôt que de corriger la phrase à la baisse, **les quatre restantes ont été migrées** : `CatalogAddButton`, `CatalogAdmin`, `CatalogEntry`, `CatalogManageCollections`. L'item deferred est maintenant **réellement** clos, 8/8.

**Deferred (3)** → `deferred-work.md` 2026-08-10 : un lot survivant au démontage écrit **en silence** (pire variante de l'item « pas d'annulation » de 22.2 — ici les écritures réussissent sans que personne ne le sache) ; une fiche délistée reste affichée avec un *Add* condamné ; deux fiches de même titre **et** même artiste donnent deux cases au nom accessible identique.

**Dismiss (8, avec la raison)** : ① « cliquer dans le padding de la cellule de case navigue vers la fiche » — **faux** depuis 22.1 : le `<label>` de la primitive est en `absolute inset-0`, il couvre toute la cellule ; le Blind Hunter n'avait pas la primitive dans son périmètre. ② « `runBounded` pourrait rendre ses résultats dans l'ordre d'achèvement » — **faux**, écriture par index + test dédié ; déjà réfuté et vérifié en review 22.3. ③ Couplage inter-module du `instanceof SongConflictError` — le service importe la classe depuis `songService`, même registre de modules ; un fallback par code HTTP dupliquerait la logique du service. ④ `run()` sans `catch` — `runBounded` capture toutes les rejections des appels, il ne rejette pas. ⑤ `getAllSongs toHaveBeenCalledTimes(1)` dépendrait de l'ordre des tests — `jest.clearAllMocks()` est dans le `beforeEach` du fichier. ⑥ Le nouveau `jest.mock('../services/songService')` change silencieusement les tests préexistants — vrai, mais dans le bon sens : ils s'appuyaient jusque-là sur un vrai appel qui échouait en silence. ⑦ Le bouton *Add* par ligne pourrait courir contre un lot — **vérifié par l'Edge Case Hunter comme inatteignable** (le backdrop reste monté pendant tout l'`await`). ⑧ Les deux bandeaux de la vue collection pourraient s'empiler — **vérifié inatteignable** : chaque handler annule l'état de l'autre avant de démarrer.

**Vérifications mécaniques faites à la main** (à la place de l'Auditor planté) : décision **A** — les deux modales contiennent bien « No playlist is created » ; décision **B** — `useSonglistMatcher` n'apparaît **pas** dans `CatalogCollection.tsx` ; décision **C** — colonne rendue seulement si `onToggle`, vérifié par construction et par test ; décision **D** — le bouton *Add* par ligne est asserté présent. Compteurs après correctifs : **555/61**.


## Dev Notes

### Le modèle, et les écarts assumés

`CatalogManage.tsx` (post-review 22.2) et `CatalogCollectionCompose.tsx` (post-review 22.3) sont les deux modèles. **Lire les deux avant de coder.** Écarts propres à 22.4 :

| | 22.2 / 22.3 | 22.4 (ici) |
|---|---|---|
| Erreurs | génériques | **typées** → 4 seaux au lieu de 2-3 |
| Échecs qui restent cochés | tous | **seulement les réessayables** (pas les 404) |
| Action unitaire par ligne | supprimée (22.3) | **conservée** (décision D) |
| Flag doublon | sans objet | alimenté par 201 **et** 409 (AC5) |
| Récap fermé au geste suivant | empreinte (22.2) / handlers (22.3) | **handlers** — la 22.3 a montré que l'empreinte tue le récap au moment de son affichage |

### Pièges

- **Ne PAS copier l'empreinte de sélection de 22.2** : la review de 22.3 a montré qu'une coche glissée avant le gel des cases détruit le récap sur la frame même où il apparaît. Piloter par `userToggle`/`userSelectAll`.
- **Le récap hors de la barre** : `<BulkActionBar>` rend `null` à sélection vide, et un lot 100 % réussi vide la sélection.
- **Deux régions `role="status"`** sur chaque page (le `<Toast>` partagé en garde une montée) → `aria-label` obligatoire sur le récap.
- **Sur la vue collection il y aura DEUX retours** : le bandeau `result` de l'import total (déjà là, `role=status`/`alert`) et le nouveau récap. Trois régions live qui parlent en même temps est déjà un item deferred — ne pas en ajouter une quatrième sans arbitrer.
- **Deux `ConfirmDialog`** sur la vue collection (import total + ajout de la sélection) : la review de 22.3 a montré qu'ils peuvent s'ouvrir simultanément (`ConfirmDialog` n'a **ni piège de focus ni prop `disabled`**) et que geler le bouton ne suffit pas — **geler aussi les handlers**.
- **Ne pas casser le clic-ligne ni le bouton *Add*** de `CatalogList` : sa cellule d'action stoppe déjà la propagation, la case à cocher aussi via la primitive.
- **`CatalogAddButton` a son propre cycle** (3 états, annonce). Le lot ne doit pas le contourner ni le dupliquer : après le lot, ce sont `addToCache` et le re-rendu qui mettent les boutons à jour.

### Anchors code (lus, non devinés)

- `src/components/CatalogList.tsx` — **entier** (61 lignes) : `<tr onClick={navigate}>`, cellule Add en `stopPropagation`, colonnes Artist · Title · Key · Mode · Time signature. Un seul consommateur : `Catalog.tsx:193`.
- `src/pages/Catalog.tsx` — L38 `data`, L193 le rendu de `CatalogList` avec `existingFor={findExisting}` / `onAdded={addToCache}`, pagination via `patchParams`.
- `src/pages/CatalogCollection.tsx` — **entier** (153 lignes) : `handleImport` (L44-68, le récap segmenté de l'import total, **modèle de phrasé**), le bandeau `result` (L109-120), le bouton d'import (L98-106), la `<ul>` des membres (L125-137, **la cible**), le `ConfirmDialog` (L141-149, celui de l'import total).
- `src/hooks/useSonglistMatcher.ts` — **entier** : `findExisting` + `addToCache(song)`. Dégradation propre si la songlist ne charge pas.
- `src/services/catalogService.ts` L194-216 — `addToSonglist` et ses trois issues typées.
- `src/services/songService.ts` L39-46 — `SongConflictError.existingSong`.
- `src/utils/runBounded.ts`, `src/utils/selectionCell.ts`, `src/components/BulkActionBar.tsx`, `src/components/SelectionCheckbox.tsx` — à consommer tels quels.
- `src/test/catalogServiceMock.ts` — la factory de mock.

### Project Structure Notes

- **UPDATE** : `src/components/CatalogList.tsx`, `src/pages/Catalog.tsx`, `src/pages/CatalogCollection.tsx`, `src/__tests__/Catalog.test.tsx`, `src/__tests__/CatalogCollection.test.tsx`.
- **Aucun** fichier nouveau attendu, **aucun** changement de service, backend, modèle, migration, route.
- Conventions (project-context) : TS `strict` + `verbatimModuleSyntax`, imports relatifs, Tailwind only, **UI et commentaires en anglais**, `dark:` partout.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` § Epic 22, Story 22.4 + décision B]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` L343 — le relevé de QA prod à l'origine de la story]
- [Source: `22-2-add-to-collection-groupe.md` § Review Findings — 13 correctifs, dont ceux qui s'appliquent ici mot pour mot]
- [Source: `22-3-fiche-collection-tableau-selectionnable.md` § Review Findings — les 2 modales, la purge de sélection, l'abandon de l'empreinte]
- [Source: `20-4-browse-importer-collections-front.md` — l'import total et son récap, à préserver]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev-story)

### Debug Log References

- Task 4 (migration des mocks) exécutée **en premier**, comme en 22.3 : `Catalog.test.tsx` et `CatalogCollection.test.tsx` passés à `makeCatalogServiceMock()`, 12 tests existants verts sans une assertion touchée.
- TDD : 6 tests rouges sur `/catalog` → vert ; 3 rouges sur la vue collection → vert.
- Suite complète : **553/553 (61 suites)** — baseline 544/61, soit **+9** tests. `npx tsc -b --force` clean. `npm run lint` clean.

### Completion Notes List

- **⚠️ Écart au périmètre déclaré : un fichier NEUF a été créé.** La story annonçait « aucun fichier nouveau attendu ». Les deux surfaces exécutent **exactement** la même action (mêmes 4 seaux, même récap, mêmes gardes) : la dupliquer aurait été le contraire de ce que cette epic corrige. D'où `src/hooks/useBulkAddToSonglist.ts`, qui porte le lot, le classement par type d'erreur, le récap et son phrasé (`describeAddRecap`). Les deux pages ne portent plus que leur UI.
- **Les trois issues typées sont exploitées** (AC1) : 201 → `added` ; `SongConflictError` → `already in your songlist` ; `CatalogNotFoundError` → `no longer in the catalog` ; le reste → `failed`. **Seul le dernier seau reste sélectionné** — un test vérifie qu'une fiche supprimée du Catalog **sort** de la sélection alors qu'une erreur réseau y **reste**.
- **Le flag doublon se met à jour sans refetch** (AC5) : `addToCache` est alimenté par la `Song` du 201 **et** par `err.existingSong` du 409. Le test le prouve en comptant les appels à `listCatalog` avant/après (inchangés) et à `getAllSongs` (1 seul).
- **Question laissée ouverte au cadrage, tranchée ici** : sur la vue collection, le bandeau de l'import total et le récap de sélection **s'excluent mutuellement** — chaque action efface le retour de l'autre. Ils décrivent des actions différentes ; les empiler aurait ajouté une quatrième région live à un écran qui en a déjà trop (item deferred).
- **Les deux chemins d'écriture se gèlent mutuellement** (AC7) : l'import total est désactivé pendant un lot de sélection **et** tant que la modale de sélection est ouverte (leçon de la review 22.3 : geler le bouton ne suffit pas si une modale est déjà ouverte) ; réciproquement `handleImport` refuse de partir si un lot tourne.
- **Pas d'empreinte de sélection** : pilotage par les handlers (`userToggle`/`userSelectAll`), comme en 22.3 — la review de cette story a montré que l'empreinte tue le récap au moment de son affichage.
- **`CatalogList` reste utilisable sans sélection** : la colonne n'est rendue que si `onToggle` est fourni. Le clic-ligne, le lien du titre et le bouton *Add* par ligne sont préservés — un test les vérifie tous les trois.
- **Le deferred « migrer les suites vers la factory de mock » est CLOS** — mais pas comme annoncé initialement : ma note disait « les cinq suites », il y en a **huit** qui mockent le service et seulement quatre l'étaient au moment du dev. Les quatre restantes (`CatalogAddButton`, `CatalogAdmin`, `CatalogEntry`, `CatalogManageCollections`) ont été migrées **en review**. 8/8.

### File List

- **NEW** `src/hooks/useBulkAddToSonglist.ts` — moteur partagé du lot lecteur (4 seaux typés, récap, gardes) + `describeAddRecap`.
- **UPDATE** `src/components/CatalogList.tsx` — colonne de cases **optionnelle** (rendue seulement si `onToggle`), clic-ligne et *Add* par ligne intacts.
- **UPDATE** `src/pages/Catalog.tsx` — sélection within-page, barre + *Clear selection*, récap hors barre, `ConfirmDialog` disant l'absence de playlist.
- **UPDATE** `src/pages/CatalogCollection.tsx` — membres en tableau sélectionnable, même action groupée, exclusion mutuelle avec l'import total.
- **UPDATE** `src/__tests__/Catalog.test.tsx` — mock migré + 6 tests.
- **UPDATE** `src/__tests__/CatalogCollection.test.tsx` — mock migré + 3 tests.
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml` — suivi de la story.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 1.1 | code review 3 couches, **partielle** (Auditor planté, 4ᵉ fois sur 5 ; partie mécanique refaite à la main, elle a pris en défaut une note de complétion) — 23 findings : 12 patch (dont le scénario « N chansons écrites sans aucun retour » via le debounce, la barre et l'échappatoire qui disparaissaient sur un filtre vide, le « 0 added » qui subsistait dans 3 formes sur 4, un lot délisté affiché comme un succès, le 409 sans song), 3 defer, 8 dismiss dont 2 accusations réfutées preuve à l'appui. Migration des mocks réellement terminée (8/8). Front **555/61**. | northwood |
| 2026-08-10 | 1.0 | dev-story — sélection lecteur sur les 2 surfaces, récap à 4 issues typées, 404 permanents sortis de la sélection, flag doublon cohérent sans refetch. Moteur extrait en hook partagé (**écart assumé** au « aucun fichier nouveau »). Migration des mocks terminée → deferred 22.2 CLOS. Front **553/61** (+9), puis **555/61** après les correctifs de review. | northwood |
| 2026-08-10 | 0.1 | Story créée (create-story). Découverte : `addToSonglist` a **trois issues typées** (201 → Song, 409 → SongConflictError portant la Song existante, 404 → CatalogNotFoundError qualifié de permanent) → récap à **4 segments** et les 404 **sortent** de la sélection (réessayer est impossible), divergence assumée avec 22.2/22.3. Le flag doublon devient cohérent gratuitement via `addToCache` alimenté par les 201 ET les 409. `CatalogList` n'a qu'un consommateur → sélection en props optionnels. | northwood |
