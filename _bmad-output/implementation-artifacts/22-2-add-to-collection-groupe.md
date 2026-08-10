---
baseline_commit: b193dff10ec087c4abee6f750c88d47e4214c8ac
---

# Story 22.2: Ajouter une sélection d'entrées à une collection (curateur)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curateur**,
I want **pousser plusieurs entrées sélectionnées dans une collection en une action**,
so that **je n'aie plus à ouvrir la collection et à retrouver chaque entrée une par une au typeahead**.

## Contexte / origine

Relevé de QA prod du 2026-08-08 (`deferred-work` L339) : sur `/catalog/manage?tab=entries`, la barre « N selected » n'offre que *Delete selected*. Le seul chemin pour peupler une collection est l'inverse — ouvrir la collection et chercher les entrées **une par une** au typeahead (`CatalogCollectionCompose.addEntry`), inutilisable pour un lot.

**Première story d'Epic 22 qui ajoute une fonctionnalité** : 22.1 (fondation) et 22.5 (chrome) étaient des refactos iso-fonctionnelles. Elle consomme `<BulkActionBar>` sans le modifier.

**Dépend de 22.1** (`done`). Parallélisable avec 22.3 et 22.4.

## Découverte de cadrage — À LIRE EN PREMIER

**Le backend distingue déjà « ajouté » de « déjà membre », le front jette l'information.**

`backend/controllers/catalogcontroller.js` `addSongToCollection` (L565-571) fait un `findOrCreate` sur la contrainte composite unique et répond :
```js
res.status(created ? 201 : 200).json({ message: created ? 'Added to collection' : 'Already in collection' });
```
Mais `catalogService.addSongToCollection` (L372-386) est typé `Promise<void>` et **ignore le status**. Le récap segmenté « X added · Y already in » exigé par l'AC3 est donc **impossible en l'état**.

**Correctif : côté front uniquement** — le service retourne l'issue, déduite du status `201`. **Aucun backend, aucune migration.** C'est le seul changement de contrat de la story.

## Décisions de cadrage

- **A — N appels front, concurrence bornée** (décision A de l'epic) : pas d'endpoint bulk. Volumes petits (24 lignes/page max).
- **B — La confirmation, c'est le bouton *Add* du menu**, pas un `ConfirmDialog`. L'action est **additive et réversible** (le retrait existe), contrairement au *Delete selected* voisin qui, lui, garde sa modale. Calque exact du picker de playlists de la Songlist (liste + `Cancel`/`Add`).
- **C — Le récap vit HORS de `<BulkActionBar>`.** Voir le § *Piège n°1* : c'est contre-intuitif et c'est la seule façon de tenir « récap persistant ».
- **D — Pas de création de collection à la volée** (hors périmètre, dit par l'epic). Si aucune collection n'existe, le menu le dit et pointe vers l'onglet Collections.
- **E — Sélection simple** (une collection à la fois), pas multi comme le picker de playlists : le besoin relevé est « pousser ce lot **dans une** collection ». Multi-collections = surcoût d'UI pour un besoin non exprimé.

## Acceptance Criteria

1. **Le service rend l'issue de l'ajout** — `catalogService.addSongToCollection` retourne `'added'` (status `201`) ou `'already-in'` (status `200`) au lieu de `void`. `404` continue de lever `CollectionNotFoundError`, tout autre non-`ok` continue de lever. L'appelant existant (`CatalogCollectionCompose.addEntry`) ignore la valeur : **aucune régression**, aucun test à réécrire.
2. **2ᵉ bouton dans la barre** — sur `/catalog/manage?tab=entries`, la barre « N selected » porte **« Add to collection »** à côté de *Delete selected*, ouvrant un menu déroulant des collections existantes (`catalogService.listCollections`). Le menu est chargé **à la première ouverture** (pas au chargement de la page — l'onglet Entries n'a pas besoin des collections) ; état de chargement et d'erreur (avec *Retry*) gérés ; s'il n'y en a aucune, message clair + lien vers l'onglet Collections. **Aucune création à la volée.**
3. **L'ajout** — choisir une collection puis cliquer **Add** déclenche N appels `addSongToCollection` en **concurrence bornée** (best-effort, mirror 20.3 : un échec unitaire n'arrête pas le lot). Le bouton *Add* est désactivé pendant l'action, et une **double soumission est impossible** (garde `useRef` in-flight — le `disabled` de rendu ne suffit pas, cf. `creatingRef` de cette même page).
4. **Récap segmenté et persistant** — après l'action, un récap **inline** (jamais un toast fugace, leçon 20.4) affiche « X added · Y already in · Z failed ». Une entrée déjà membre compte comme **already in**, **jamais** comme un échec. `role="status"`, ou `role="alert"` s'il y a au moins un échec. Il **survit au vidage de la sélection** (cf. Piège n°1) et se referme sur une croix ou à la sélection suivante.
5. **Cas no-op** — un lot entièrement déjà-membre a **son propre message** (« All N entries were already in "X". ») et **pas** un « 0 added » dégradé (leçon rétro 20 #5).
6. **Échec partiel** — les entrées **en échec restent sélectionnées** (le lot est rejouable tel quel) ; les entrées réussies (`added` **et** `already-in`) **sortent** de la sélection via `selection.removeMany`.
7. **Aucun backend** — aucune migration, aucun contrôleur, aucune route. Tests (`StrictMode`) couvrant : succès, déjà-membre, échec partiel, no-op, double-clic. Front vert, `tsc -b` + ESLint propres.

## Tasks / Subtasks

- [x] **Task 1 — Le service rend l'issue** (AC: 1)
  - [x] `src/services/catalogService.ts` : `addSongToCollection(uid, catalogSongUid): Promise<'added' | 'already-in'>` — `return response.status === 201 ? 'added' : 'already-in';` après les gardes existantes (404 → `CollectionNotFoundError`, `!ok` → `throw`). Commenter le lien avec le `findOrCreate` du contrôleur.
  - [x] Test dans `src/__tests__/catalogService.test.ts` : `201 → 'added'`, `200 → 'already-in'`, `404 → CollectionNotFoundError`, `500 → throw`.
- [x] **Task 2 — Helper de concurrence bornée partagé** (AC: 3)
  - [x] `src/utils/runBounded.ts` : `runBounded<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]>` — résultats **dans l'ordre des items**, jamais de rejet global (sémantique `allSettled`), pool de `limit` workers.
  - [x] `src/utils/runBounded.test.ts` : ordre préservé, un rejet n'arrête pas les autres, la concurrence ne dépasse jamais `limit` (compteur d'appels simultanés), liste vide → `[]`.
  - [x] **Partagé exprès** : 22.3 (`Remove selected`) et 22.4 (`Add selected to my songlist`) le réutiliseront tel quel. Ne pas l'enfouir dans la page.
- [x] **Task 3 — Menu « Add to collection »** (AC: 2)
  - [x] `CatalogManage.tsx` : 2ᵉ bouton dans les children de `<BulkActionBar>`, dans un conteneur `relative` (calque du picker de playlists), menu en `absolute` — **jamais `fixed`** (cf. Piège n°2).
  - [x] Chargement paresseux à la première ouverture + `AbortController` au démontage ; états chargement / erreur+Retry / liste vide.
  - [x] Sélection simple d'une collection + pied `Cancel` / `Add` (Add désactivé tant qu'aucune collection n'est choisie).
- [x] **Task 4 — L'action groupée + le récap** (AC: 3, 4, 5, 6)
  - [x] `handleAddSelectedToCollection` : `runBounded(Array.from(selected), 4, uid => catalogService.addSongToCollection(collectionUid, uid))`, puis agrégation en `{ added, alreadyIn, failedUids }`.
  - [x] `selection.removeMany([...added, ...alreadyIn])` — les `failedUids` restent sélectionnés.
  - [x] Récap rendu **hors** de `<BulkActionBar>` (Piège n°1), `role` selon la présence d'échecs, message no-op dédié, bouton de fermeture.
  - [x] Garde `addingRef` + `disabled` pendant l'action.
- [x] **Task 5 — Tests** (AC: 7)
  - [x] `src/__tests__/CatalogManage.test.tsx` : **étendre le mock de service** (il ne déclare aujourd'hui que `listCatalog` et `deleteCatalogEntry` — voir Piège n°3) puis couvrir : ouverture du menu et chargement des collections ; succès (« 2 added ») + sélection vidée ; mélange added/already-in ; échec partiel (« 1 added · 1 failed ») + **l'entrée en échec reste cochée** ; no-op (message dédié) ; double-clic sur *Add* → un seul lot d'appels.
- [x] **Task 6 — Validation** (AC: 7)
  - [x] `npx jest`, `npx tsc -b --force`, `npm run lint`. Baseline avant cette story : **513 tests / 60 suites**.
  - [x] QA navigateur : **déléguée au gate de la branche epic** (light + dark ; menu qui ne déborde pas de la barre vitrée).

### Review Findings

Code review 2026-08-10, 3 couches — **les trois ont rendu cette fois**. 24 findings : **13 patchés**, **3 deferred**, **8 dismiss**. Convergence forte : 3 findings relevés indépendamment par 2 couches.

**Patchés — comportement**

- [x] [Review][Patch] **Le cache du menu que rien n'invalide depuis l'onglet Collections de la MÊME page** (`blind`, High) — supprimer une collection dans l'onglet voisin laissait le menu la proposer ; chaque POST unitaire 404ait et le récap accusait les entrées. Le cache est **supprimé** : la liste est refetchée à **chaque** ouverture (toujours pas au chargement de la page). Rend caduc l'`setMenuCollections(null)` post-ajout et le `menuLoading` inutilisé. **AC2 amendé** en conséquence.
- [x] [Review][Patch] **`Delete selected` restait actif pendant un ajout en vol** (`blind+edge`, High) — deux handlers de lot écrivant la même sélection : des entrées pouvaient être supprimées du Catalog pendant qu'un lot les ajoutait à une collection, et le récap parlait ensuite de lignes disparues. Gardes croisées `deleting || adding` sur les deux boutons **et** dans les deux handlers.
- [x] [Review][Patch] **Sélection fantôme impossible à décocher** (`edge`, High) — une entrée laissée cochée par un échec puis sortie de la page (recherche, pagination) n'a plus de case, `select-all` ne peut pas la soustraire, et la barre reste bloquée à « 1 entry selected » pour la session, les actions suivantes opérant sur un uid invisible. Ajout d'un bouton **« Clear selection »** dans la barre — il répare aussi le même trou côté *Delete selected*, antérieur à cette story.
- [x] [Review][Patch] **La sélection pouvait être modifiée pendant le lot** (`blind+edge`, Med) — cocher une ligne en cours de route la faisait rester sélectionnée sans figurer au récap ; tout décocher démontait la barre **et** le menu, supprimant tout retour visuel alors que N requêtes volaient encore. Les cases de ligne et « tout sélectionner » sont désormais **gelées** pendant un lot.
- [x] [Review][Patch] **Toutes les raisons d'échec étaient jetées** (`blind+edge`, Med) — 401, 404 et 500 donnaient le même « N failed … you can retry ». Une collection supprimée par un autre curateur fait échouer **tous** les items pour la même raison et le retry ne peut jamais marcher : ce cas a maintenant son message propre (« "X" no longer exists — nothing was added. Pick another collection. ») et **ne propose plus de réessayer**.
- [x] [Review][Patch] **`alreadyIn` calculé par soustraction** (`blind`, Med) — toute valeur *fulfilled* inattendue (backend qui répondrait 204, stub de test rendant `undefined`) était silencieusement comptée « already in ». Les deux issues sont maintenant comptées **explicitement**, et un résidu inattendu est rapporté à part (« N unclear ») plutôt que maquillé.
- [x] [Review][Patch] **`pickedCollection` jamais réconcilié avec la liste refetchée** (`blind`, Med) — après un refetch qui ne contient plus la collection choisie, aucune carte n'était surlignée mais *Add* restait actif : le clic ne faisait **rien du tout**. Le pick est purgé s'il a disparu de la liste.
- [x] [Review][Patch] **Aucune garde de démontage sur le lot** (`edge`, Med) — six `setState` atterrissaient sur un arbre démonté si l'on quittait la page en cours de lot. `mountedRef` posé (motif maison 21.2). *(L'absence d'annulation/timeout, elle, est deferred — c'est transverse.)*
- [x] [Review][Patch] **Récap périmé** (`blind+edge`, Low ×3) — il n'était effacé que par sa croix : il survivait à un nouveau lot (affichant les chiffres du précédent pendant toute sa durée), à un changement de recherche/page, et se **ré-annonçait** en `role="alert"` au retour sur l'onglet Entries. Effacé au démarrage d'un lot et sur changement de recherche/page/onglet. **Et l'AC4 exigeait « se referme à la sélection suivante » — clause que ma décomposition en tâches avait silencieusement perdue** : implémentée via une empreinte de sélection qui distingue un geste utilisateur du `removeMany` du lot lui-même.
- [x] [Review][Patch] **`role` muté sur un nœud monté** (`blind`, Low) — passer d'`alert` à `status` en place n'est pas re-annoncé de façon fiable ; le récap porte un `key` par sévérité, il remonte.
- [x] [Review][Patch] **Menu sans sémantique d'ouverture ni Échap** (`blind+edge`, Low) — `aria-haspopup`/`aria-expanded` + fermeture sur Échap. *(Le clic extérieur est deferred : le picker de playlists de la Songlist a le même trou, à traiter d'un bloc.)*
- [x] [Review][Patch] **Commentaire de `ADD_CONCURRENCY` faux** (`blind`, Med) — il justifiait la taille du pool par « une page fait au plus 24 lignes », alors que la sélection **survit à la pagination** (19.9) et qu'un lot peut donc dépasser une page. Corrigé.
- [x] [Review][Patch] **Ponctuation du récap** (`blind`, Low) — deux phrases collées sans point.

**Patchés — tests et outillage**

- [x] [Review][Patch] **La factory de mock ne fermait pas le trou qu'elle visait** (`blind+edge`, Med) — le stub par défaut rendait `undefined`, donc le jour où la page appelle une méthode de plus, la suite meurt quand même, une ligne plus loin, sur `undefined.then`. Défaut passé à `jest.fn().mockResolvedValue(undefined)`.
- [x] [Review][Patch] **`runBounded` renvoyait un tableau à trous pour une limite non finie** (`edge`, Low latent) — `Math.min(NaN, n)` → `NaN` → pool vide → `results[i].status` sur `undefined`. Garde `Number.isFinite` + test. Pertinent car l'util est annoncé partagé pour 22.3/22.4.
- [x] [Review][Patch] **Deux tests ne testaient pas ce que leur nom annonçait** (`blind`, Med) — celui du « chargement à la première ouverture seulement » n'ouvrait le menu qu'une fois (l'assertion passait trivialement, et passait encore sans la garde de cache) ; celui de la liste vide n'exerçait jamais le lien « Create one ». Réécrits. **Le test de concurrence de `runBounded` n'assertait pas non plus que le lot s'était terminé** — corrigé.
- [x] [Review][Patch] **La branche erreur + Retry du menu était livrée sans test** (`auditor`, Low) — couverte.
- [x] [Review][Patch] **Note de complétion fausse : « ses 12 tests existants »** (`auditor`, Med) — `CatalogManage.test.tsx` en avait **9** (les 12 étaient le total deux suites de `npx jest CatalogManage`, or la seconde suite n'a **pas** été migrée). Corrigé, et la portée de « sans une assertion modifiée » précisée : c'est vrai **de la migration du mock**, pas du fichier, qui porte 6 assertions modifiées par 22.1.
- [x] [Review][Patch] **File List incomplète** (`auditor`, Low) — `sprint-status.yaml` et `deferred-work.md` manquaient.

**Deferred (3)** → `deferred-work.md` 2026-08-10

- [x] [Review][Defer] **Migrer les suites restantes vers la factory de mock** — exposition vive nommée par l'Auditor : `CatalogManageCollections.test.tsx` couvre la **même page** avec un mock partiel sans `addSongToCollection`, et ne passe que parce qu'il n'ouvre jamais le menu. 4ᵉ occurrence du motif.
- [x] [Review][Defer] **Aucun timeout ni annulation sur les requêtes** — une requête pendante fige la fonctionnalité jusqu'au rechargement. Trou app-wide (même *Delete selected*, même import 20.3), fix transverse dans `apiFetch`.
- [x] [Review][Defer] **Fermeture au clic extérieur des menus** — le picker de playlists de la Songlist a le même manque ; un hook partagé plutôt que surface par surface.

**Dismiss (8, avec la raison)** : ① redondance entre deux tests de service et capture de `originalFetch` à l'évaluation du `describe` — c'est la convention déjà en place dans ce fichier, la changer pour ces 4 tests seulement créerait l'incohérence. ② `menuLoading` inutilisé — disparu avec le refetch systématique. ③ « le lot n'a pas d'`AbortSignal` » en tant que finding de code — c'est le deferred transverse ci-dessus, pas un patch local. ④ ⑤ ⑥ trois observations du Blind Hunter portant sur des composants **hors diff** (`BulkActionBar`, primitives de sélection) déjà revus en 22.1. ⑦ Recap « unknown » jugé théorique — gardé quand même, coût nul, et le stub de test le rendait atteignable. ⑧ Suggestion de faire échouer bruyamment les stubs non configurés (throw) plutôt que résoudre `undefined` — écarté : ça casserait les suites qui appellent légitimement une méthode sans l'avoir stubée, et le `mockResolvedValue(undefined)` suffit à empêcher le crash en cascade.


## Dev Notes

### Piège n°1 — le récap ne peut PAS vivre dans la barre

`<BulkActionBar>` rend `null` dès que `count === 0` (garde centralisée, 22.1). Or l'AC6 vide la sélection des entrées réussies : **un lot 100 % réussi démonte la barre**, et un récap placé dans ses `children` disparaîtrait au moment précis où il doit s'afficher. Le rendre **au-dessus du tableau, en frère de la barre**, avec son propre état (`recap`), indépendant de `selected.size`.

### Piège n°2 — `.glass-effect` = containing block

La barre est `card-base glass-effect` : son `backdrop-filter` crée un **containing block**. Un menu en `position: absolute` s'ancre donc à la barre — c'est le comportement voulu, et c'est ce que fait déjà le picker de playlists de la Songlist. En revanche un `position: fixed` s'ancrerait **aussi** à la barre au lieu du viewport (piège documenté, rétro Epic 21). Rester en `absolute`, ne rien portailer.

### Piège n°3 — le mock de service partiel (3ᵉ récidive)

`src/__tests__/CatalogManage.test.tsx` mocke `catalogService: { listCatalog: jest.fn(), deleteCatalogEntry: jest.fn() }`. Appeler `listCollections` / `addSongToCollection` depuis la page fera un `TypeError: not a function` dans **tous** les tests existants du fichier dès que le menu s'ouvre. Étendre le mock **avant** de coder la page.

C'est exactement l'action item **#2 de la rétro Epic 20** (« factory de mock partagée »), **reporté deux fois** et explicitement marqué « dernière fois » dans la rétro Epic 21, qui a coûté 3 suites cassées. **Si le dev-story a le temps, c'est le moment de la créer** (`src/test/catalogServiceMock.ts` exposant un mock complet dérivé de `jest.requireActual`) plutôt que d'ajouter deux `jest.fn()` de plus.

### Piège n°4 — le compteur des collections devient périmé

Le menu affiche `songCount` (`CatalogCollection`). Après un ajout réussi, il est faux. Ne pas recalculer à la main : **invalider la liste en cache** après un lot réussi pour qu'elle soit refetchée à la prochaine ouverture.

### Anchors code (lus, non devinés)

- `src/pages/CatalogManage.tsx` — L37-38 `useRowSelection()` éphémère + `selected` ; L143-171 `handleDeleteSelected` (**le modèle exact** : `Promise.allSettled`, tolérance 404, `removeMany`, clamp de page) ; la barre `<BulkActionBar count={selected.size} noun="entry" nounPlural="entries" className="mt-4">` avec *Delete selected* en children ; L106-123 `handleCreateCollection` (**le modèle de la garde in-flight** `creatingRef` + `finally`) ; L96-104 effet de chargement des collections de l'onglet Collections (à ne PAS réutiliser tel quel : lui se déclenche sur `tab`, le menu doit charger à l'ouverture).
- `src/components/SongsList.tsx` — le picker de playlists dans les children de `<BulkActionBar>` : `<div className="relative">` + bouton + `<div className="absolute right-0 mt-2 w-72 … z-20 p-3">` avec liste scrollable `max-h-48` et pied `Cancel`/`Add`. **La référence visuelle du menu.**
- `src/services/catalogService.ts` — L302-308 `listCollections` (retourne `CatalogCollection[]` avec `songCount`) ; L372-386 `addSongToCollection` (à modifier) ; le type `CatalogCollection`.
- `backend/controllers/catalogcontroller.js` — L547-576 `addSongToCollection` : `findOrCreate` idempotent, `201` créé / `200` déjà là. **À ne pas toucher.**
- `src/components/BulkActionBar.tsx` — à **consommer**, pas à modifier : il accepte déjà N actions en `children` (c'était l'AC6 de 22.1).

### Project Structure Notes

- **NEW** : `src/utils/runBounded.ts` + `src/utils/runBounded.test.ts`.
- **UPDATE** : `src/services/catalogService.ts` (type de retour), `src/pages/CatalogManage.tsx`, `src/__tests__/CatalogManage.test.tsx`, `src/__tests__/catalogService.test.ts`.
- **Aucun** changement backend, modèle, migration, route.
- Conventions (project-context) : TS `strict` + `verbatimModuleSyntax` (`import type`), imports relatifs, Tailwind only, **UI et commentaires en anglais**, `dark:` sur chaque élément stylé, `credentials: 'include'` déjà porté par `apiFetch`.

### Testing Standards

- Frontend : config Jest dans `package.json` (jsdom), tests dans `src/__tests__/`, utils testés à côté (`src/utils/*.test.ts`) — les deux emplacements sont couverts par `roots: ["<rootDir>/src"]`.
- `StrictMode` par défaut sur les nouveaux rendus (leçon rétro 18/19).
- Le hook pre-commit lance les **deux** suites (front + back) ; jamais de `--no-verify`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` § Epic 22, Story 22.2 + décisions A/B/C/D]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` L339 — le relevé de QA prod à l'origine de la story]
- [Source: `_bmad-output/implementation-artifacts/22-1-composants-selection-partages.md` — `<BulkActionBar>` et son contrat `children`]
- [Source: `_bmad-output/implementation-artifacts/20-3-import-endpoint-non-atomique-playlist-miroir.md` — le régime best-effort non-atomique + la forme du récap `{added, skipped, failed}`]
- [Source: `_bmad-output/implementation-artifacts/epic-20-retro-2026-07-21.md` — leçon #5 (feedback des actions idempotentes) + action item #2 (factory de mock)]
- [Source: `_bmad-output/project-context.md` — conventions TS/React/Tailwind/tests]

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev-story)

### Debug Log References

- TDD par brique : `npx jest catalogService` → RED (2 tests) → vert ; `npx jest runBounded` → RED (suite absente) → 6/6 ; `npx jest CatalogManage` → RED (7 tests) → 19/19.
- Suite complète : **530/530 (61 suites)** — baseline 513/60, soit **+17** tests (4 service, 6 `runBounded`, 7 page) et **+1 suite**. `npx tsc -b --force` clean. `npm run lint` clean.

### Completion Notes List

- **Le service rend l'issue** (AC1) : `addSongToCollection` retourne `'added'` (201) / `'already-in'` (200). Le contrôleur backend n'a pas été touché — il renvoyait déjà les deux status, l'information était simplement jetée côté front.
- **⚠️ L'AC1 disait « aucun test à réécrire » — c'était faux, 2 assertions ont dû suivre le changement de contrat** : `catalogService.test.ts` assertait `resolves.toBeUndefined()`, et `CatalogCollectionCompose.test.tsx` faisait `mockResolvedValue(undefined)` (erreur `tsc`, pas seulement un test rouge). Aucune des deux ne teste un comportement perdu ; les deux disent maintenant `'added'`. J'avais vérifié l'appelant applicatif, pas les tests — c'est l'angle mort de mon cadrage.
- **`runBounded` en util partagé** (AC3) : sémantique `allSettled`, résultats **dans l'ordre des items** (indispensable pour savoir *lesquels* ont échoué), `await fn(...)` **dans** le `try` pour capturer aussi un throw synchrone. Pool de 4. 22.3 et 22.4 le consomment tel quel.
- **Factory de mock créée** (`src/test/catalogServiceMock.ts`) : le mock est dérivé de `Object.keys` du vrai service, donc une méthode ajoutée au service est stubée d'office. `CatalogManage.test.tsx` y est passé — ses **9** tests existants passent **sans une assertion modifiée par la migration** (le fichier en porte 6 modifiées, mais elles viennent de 22.1, pas d'ici). C'est l'action item #2 de la rétro Epic 20, reporté deux fois. **Les autres suites gardent leur mock partiel** : les migrer est un chantier à part, non fait ici.
- **Le récap vit hors de la barre** (AC4) et un test le verrouille explicitement : après un lot 100 % réussi, la barre a disparu (`Delete selected` absent) **et** le récap est toujours là. C'est le piège n°1 du cadrage, tenu.
- **Effet de bord de 22.5 rencontré en chemin** : le `<Toast>` garde une région `role="status"` montée en permanence, donc la page en a désormais **deux** et `getByRole('status')` devenait ambigu. Le récap porte un `aria-label="Bulk action result"` — meilleur pour les lecteurs d'écran, et adressable en test. À savoir pour 22.3/22.4 qui auront le même récap.
- **Menu** : chargement à la première ouverture seulement (test à l'appui : `listCollections` n'est pas appelé au chargement de la page), `AbortController` posé par ref et libéré au démontage (le fetch part d'un clic, aucun cleanup d'effet ne le couvre), cache invalidé après un lot réussi pour que `songCount` ne mente pas.
- **Périmètre tenu** : aucun backend, aucune migration, aucune route. `<BulkActionBar>` consommé sans modification (son contrat `children` de 22.1 a suffi). Rien de 22.3/22.4 n'a été anticipé hors `runBounded`, sorti en partagé exprès.

### File List

- **NEW** `src/utils/runBounded.ts` — concurrence bornée, sémantique `allSettled`, ordre préservé.
- **NEW** `src/utils/runBounded.test.ts` — 6 tests (ordre, rejet isolé, throw synchrone, plafond de concurrence, liste vide, limite > liste).
- **NEW** `src/test/catalogServiceMock.ts` — factory de mock complète dérivée du vrai service.
- **UPDATE** `src/services/catalogService.ts` — `addSongToCollection` retourne `'added' | 'already-in'`.
- **UPDATE** `src/pages/CatalogManage.tsx` — bouton + menu « Add to collection », action groupée `runBounded`, récap segmenté hors barre, garde in-flight, abort au démontage.
- **UPDATE** `src/__tests__/CatalogManage.test.tsx` — mock via la factory + 7 tests 22.2.
- **UPDATE** `src/__tests__/catalogService.test.ts` — 4 tests `addSongToCollection` + 1 assertion existante réalignée.
- **UPDATE** `src/__tests__/CatalogCollectionCompose.test.tsx` — 1 `mockResolvedValue` réaligné sur le nouveau type.
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml`, `deferred-work.md` — suivi + 3 items deferred.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 1.1 | code review 3 couches (les 3 ont rendu) — 24 findings : 13 patch (3 High : cache de menu non invalidé, Delete actif pendant un ajout, sélection fantôme non décochable ; + clause AC4 « se referme à la sélection suivante » que la décomposition en tâches avait perdue), 3 defer, 8 dismiss. Front **536/61** (+6 tests de review). | northwood |
| 2026-08-10 | 1.0 | dev-story — service qui rend l'issue (201/200), `runBounded` partagé, menu « Add to collection » + récap segmenté hors barre, factory de mock enfin créée. Front **530/61** (+17, +1 suite), tsc + ESLint clean. 2 assertions existantes réalignées (l'AC1 les avait ratées). | northwood |
| 2026-08-10 | 0.1 | Story créée (create-story). Découverte de cadrage : le backend renvoie déjà 201/200 (added / already-in) mais le service front jette l'info — correctif front nécessaire pour rendre le récap segmenté possible. Helper `runBounded` sorti en util partagé pour 22.3/22.4. 4 pièges documentés dont le récap qui ne peut pas vivre dans la barre (elle se démonte à sélection vide). | northwood |
