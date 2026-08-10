---
baseline_commit: b193dff10ec087c4abee6f750c88d47e4214c8ac
---

# Story 22.3: Fiche collection (admin) en tableau sélectionnable

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curateur**,
I want **voir les membres d'une collection dans le même tableau que partout ailleurs et en retirer plusieurs d'un coup**,
so that **l'écran de composition cesse d'être une liste à part**.

## Contexte / origine

Dernière surface Catalog encore en `<ul>/<li>` côté curateur. `/catalog/manage/collections/:uid` affiche ses membres en liste avec un bouton *Remove* par ligne — pas de case à cocher, donc **aucun retrait groupé possible**.

Consomme la fondation 22.1 (`<BulkActionBar>`, primitives de case à cocher, `selectionCell`) et l'outillage de 22.2 (`runBounded`, forme du récap segmenté). **Dépend de 22.1** (`done`). Parallélisable avec 22.4.

## Découverte de cadrage — À LIRE EN PREMIER

**L'AC de l'epic demande de gérer un cas que le backend ne peut pas produire.**

L'epic dit : « un membre déjà retiré (404) compte comme **retiré**, pas comme une erreur ». Or `backend/controllers/catalogcontroller.js` `removeSongFromCollection` (L578-593) est **inconditionnellement idempotent** :
```js
if (!isUuid(collectionUid) || !isUuid(catalogSongUid)) return next(createError(404, ...));
await CatalogCollectionSong.destroy({ where: { collectionUid, catalogSongUid } });
res.json({ message: 'Removed from collection' });   // toujours 200
```
Il ne vérifie **ni** l'existence de la collection **ni** celle du lien : retirer un membre déjà retiré répond `200`. Le seul `404` possible vient d'un uid **non-UUID**, que l'application n'émet jamais. Symétriquement, `catalogService.removeSongFromCollection` n'a **aucune branche 404** (contrairement à `addSongToCollection`) : tout `!ok` lève une `Error` générique.

**Conséquence pour l'implémentation** : ne **pas** écrire de tolérance 404 « déjà retiré » — ce serait du code mort qui ment sur le comportement du système. Le retrait concurrent par un autre curateur est **déjà** un succès (200). Un rejet = une vraie erreur (réseau, 500, session expirée). Le récap se simplifie donc en **« X removed · Y failed »**, sans troisième segment. L'AC1 ci-dessous acte cette correction de l'epic.

## Décisions de cadrage

- **A — Le *Remove* par ligne disparaît** (décision de l'epic, confirmée ici) : un seul chemin de retrait. Revisitable si la QA le conteste — c'est le genre de retrait d'affordance que la QA navigateur a déjà fait revenir sur d'autres épics.
- **B — `ConfirmDialog` OUI pour le retrait**, contrairement au *Add to collection* de 22.2 qui n'en a pas : retirer est **destructif du point de vue du curateur** (il perd son travail de composition), là où ajouter est additif et réversible. Aligné sur le *Delete selected* de `CatalogManage`.
- **C — Pas de pagination sur les membres** : `getCollection` renvoie tous les membres d'un coup. Donc **pas** de sélection hors écran, et le bouton « Clear selection » ajouté en 22.2 n'est **pas** nécessaire ici. Ne pas le copier par mimétisme.
- **D — Le typeahead d'ajout au-dessus reste strictement inchangé** (`comboboxKeyboard`, `addEntry`, dédoublonnage au rendu via `memberIds`). Ne pas y toucher.

## Acceptance Criteria

1. **Le récap n'a que deux segments** — « X removed · Y failed », **pas** de segment « already removed » : le backend rend le retrait idempotent en `200` (cf. Découverte). Un lot entièrement en échec, et un lot vide, ne doivent pas produire de phrase dégradée.
2. **Membres en tableau** — la `<ul>/<li>` devient un `<table>` : colonne de cases à cocher (primitives 22.1 + `selectionCell`), puis **Artist · Title · Key · BPM**, badge `Draft` conservé sur les entrées non publiées. En-tête « tout sélectionner ». Le tableau adopte les conventions des autres surfaces Catalog (`min-w-full text-sm`, `<thead>` opaque, lignes `border-t`).
3. **La ligne n'est PAS cliquable** — contrairement à `CatalogManage` et `CatalogList`, il n'y a pas de destination naturelle pour un clic de ligne sur cet écran de composition (la fiche s'édite depuis le hub). Ne pas inventer de navigation. Les primitives portent quand même leur `stopPropagation` (elles sont écrites comme ça), c'est sans effet ici.
4. **« Remove selected »** — la barre « N selected » propose *Remove selected* ; **le bouton *Remove* par ligne disparaît** (décision A). `ConfirmDialog` (`isDangerous`) nommant le nombre et la collection, puis N appels `removeSongFromCollection` via `runBounded` (best-effort, pool de 4, mirror 22.2).
5. **Récap segmenté et persistant** — même régime qu'en 22.2 : rendu **HORS** de `<BulkActionBar>` (elle se démonte à sélection vide), `role="status"` ou `role="alert"` s'il y a des échecs, **`aria-label` explicite** (le `<Toast>` de 22.5 garde une région `role="status"` montée en permanence — sans nom, la région serait ambiguë), fermeture par ✕ **et** au prochain geste de sélection.
6. **Après le retrait** — les membres réellement retirés disparaissent du tableau **et** de la sélection (`selection.removeMany`) ; les échecs restent en place et **restent cochés** (le lot est rejouable). Le compteur « Entries (N) » suit. Le typeahead redevient capable de re-proposer une entrée retirée (il exclut les membres **au rendu** via `memberIds`, donc c'est automatique — vérifier, ne pas recoder).
7. **Gardes de concurrence** — pendant un lot : cases de ligne, « tout sélectionner » et les boutons de la barre **désactivés** ; garde `useRef` in-flight contre la double soumission ; `mountedRef` avant les `setState` post-lot. Le bouton *Delete collection* de l'en-tête est lui aussi gelé pendant un lot (même raison qu'en 22.2 : deux chemins destructifs concurrents).
8. **Aucun backend** — aucune migration, aucun endpoint, **aucun changement de service**. Tests (`StrictMode`) : rendu du tableau + badge Draft, retrait groupé nominal, échec partiel (entrée en échec toujours cochée), annulation du `ConfirmDialog`, récap qui survit au vidage de la sélection. Front vert, `tsc -b` + ESLint propres.

## Tasks / Subtasks

- [x] **Task 1 — Le tableau des membres** (AC: 2, 3)
  - [x] `CatalogCollectionCompose.tsx` : remplacer le bloc `<ul>` (≈L298-321) par un `<table>` calqué sur `CatalogManage` (`<div className="overflow-auto … rounded-lg border">` + `<thead className="sticky top-0 …">`), colonnes checkbox / Artist / Title (+ `<DraftBadge/>`) / Key / BPM.
  - [x] `useRowSelection()` **éphémère** (pas de `persistKey`) + `selectionCell()` sur `<th>`/`<td>` de case.
  - [x] `toggleSelectAll` : ici la liste n'est **pas** paginée → sémantique *replace* (`selectOnly` / `clear`), pas `addMany`/`removeMany` façon `CatalogManage`.
- [x] **Task 2 — Retrait groupé** (AC: 1, 4, 6, 7)
  - [x] Supprimer le bouton *Remove* par ligne et la fonction `removeEntry` **si plus personne ne l'appelle** (vérifier : elle porte aussi la logique de revert-à-l'index, inutile pour un lot).
  - [x] `<BulkActionBar count={selection.size} noun="entry" nounPlural="entries">` avec *Remove selected* → `ConfirmDialog` → `runBounded(uids, 4, uid => catalogService.removeSongFromCollection(collection.uid, uid))`.
  - [x] Retirer du `collection.songs` local uniquement les uids **réellement** retirés ; `selection.removeMany(removed)` ; garde `removingRef` + `mountedRef`.
  - [x] Geler cases + boutons de la barre + *Delete collection* pendant le lot.
- [x] **Task 3 — Récap** (AC: 1, 5)
  - [x] Rendu en **frère** de `<BulkActionBar>`, `aria-label="Bulk action result"`, `key` par sévérité (un `role` muté sur place n'est pas ré-annoncé — leçon 22.2), effacé au démarrage d'un lot et au prochain geste de sélection (empreinte de sélection, cf. `recapSelectionRef` de `CatalogManage`).
- [x] **Task 4 — Tests** (AC: 8)
  - [x] `src/__tests__/CatalogCollectionCompose.test.tsx` : **migrer d'abord son mock partiel vers `makeCatalogServiceMock()`** (deferred de 22.2 ; ce fichier en fait partie) puis ajouter les tests listés en AC8.
  - [x] Vérifier qu'aucun test existant du fichier (rename, delete collection, typeahead, ajout) ne casse — s'ils cassent sur le *Remove* par ligne disparu, **c'est attendu** : mettre à jour ces assertions-là et **le dire** dans les notes.
- [x] **Task 5 — Validation** (AC: 8)
  - [x] `npx jest`, `npx tsc -b --force`, `npm run lint`. Baseline avant cette story : **536 tests / 61 suites**.
  - [x] QA navigateur : **déléguée au gate de la branche epic**.

### Review Findings

Code review 2026-08-10, 3 couches — **PARTIELLE** : Blind Hunter et Edge Case Hunter rendus ; l'Acceptance Auditor a **planté** (15 événements, 8 min sans écriture, tué) — 3ᵉ plantage de cette couche sur 4 tentatives. Sa partie **mécanique a été refaite à la main** (voir plus bas) ; son jugement sur l'esprit des AC manque. 22 findings : **10 patchés**, **4 deferred**, **8 dismiss**.

**Patchés**

- [x] [Review][Patch] **Les deux `ConfirmDialog` pouvaient être ouverts en même temps, et `handleDelete` n'avait aucune garde `removing`** (`blind+edge`, Med) — le gel ne couvrait que le **bouton** *Delete collection* ; une modale ouverte **avant** le début du lot restait pleinement active (`ConfirmDialog` n'a ni piège de focus ni prop `disabled`). On pouvait donc confirmer la suppression de la collection **pendant** que N retraits volaient, et se retrouver avec deux overlays empilés et deux boutons « Cancel » dans l'arbre d'accessibilité. Exclusion mutuelle des deux chemins, aux deux niveaux : boutons **et** handlers.
- [x] [Review][Patch] **La sélection n'était jamais purgée au changement de collection** (`blind` High, `edge` Med) — le composant n'est pas démonté quand seul `:uid` change : la sélection de la collection A survivait sur la collection B. Comme l'endpoint est idempotent, les `DELETE` sur des uids non-membres **réussissent tous** → le récap annonçait « 3 removed » sans que rien ne bouge. Et si B est vide, aucune case n'existe pour décocher : sélection **inéchappable**. Effet de purge sur `uid`.
- [x] [Review][Patch] **Une coche pendant le lot détruisait le récap au moment de son affichage** (`edge`, Low mais vicieux) — l'empreinte de sélection était calculée sur le **snapshot** de départ, alors que les cases ne sont gelées qu'au render suivant le clic. Une coche glissée dans cette fenêtre rendait `'C' !== ''` → récap annulé sur la frame même où il apparaissait, et le chemin groupé n'émet aucun toast : **zéro retour** utilisateur. **L'empreinte est supprimée** au profit d'un pilotage par les handlers (`userToggle`/`userSelectAll`) — le geste utilisateur est explicite, plus rien à deviner.
- [x] [Review][Patch] **Toutes les gardes sortaient sans refermer la modale** (`blind+edge`, Med/Low) — vider la sélection pendant que la modale est ouverte (les cases ne sont pas encore gelées) laissait un dialogue « Remove 0 entries » dont le bouton ne fait **rien** : cul-de-sac, sortie uniquement par Cancel. Les gardes referment désormais.
- [x] [Review][Patch] **Pas de `try/finally` autour du lot** (`blind`, Med) — un throw inattendu laissait `removing`/`removingRef` bloqués, et **tout** l'écran est conditionné à `removing`, y compris le Cancel de la modale. *(L'Edge Case Hunter a vérifié que `runBounded` ne rejette jamais : le trou n'est donc pas atteignable aujourd'hui. Ajouté quand même — le coût est nul, la conséquence serait un écran mort.)*
- [x] [Review][Patch] **Le typeahead restait actif pendant un lot** (`blind`, Low) — un membre pouvait entrer entre la résolution du lot et l'application du filtre, laissant le compteur, le récap et le titre de la modale calculés sur trois instantanés différents. Champ gelé pendant le lot.
- [x] [Review][Patch] **`test('there is no per-row Remove button')` ne prouvait rien** (`blind`, Med) — il attendait le **titre de la page** (pas le tableau) et cherchait l'**ancien** format de libellé : il passait même si le tableau ne rendait rien du tout, et même si on réintroduisait un bouton nommé autrement. Réécrit : ancré sur un membre, et assertion sur **tout** bouton dont le nom commence par « Remove ».
- [x] [Review][Patch] **Le test d'exclusion du typeahead passait pour une mauvaise raison** (`blind`, Med) — `waitFor(listCatalog appelé)` résout à l'**invocation**, avant que les résultats aient peint : l'assertion « aucune option » était trivialement vraie, et supprimer l'exclusion des membres n'aurait pas fait rougir le test. Le jeu de résultats contient maintenant un **non-membre** dont on attend l'apparition — la preuve que les résultats ont bien atterri — avant d'asserter l'absence du membre.
- [x] [Review][Patch] **Le test d'annulation n'assertait ni la fermeture ni la survie de la sélection** (`blind`, Low) — complété.
- [x] [Review][Patch] **`<th>` sans `scope="col"`** (`blind`, Low) — ajouté sur les 4 colonnes de données.
- [x] [Review][Patch] **Aucun test sur le comportement du récap** (`blind`, Med) — c'était le code le plus fragile du diff et il n'était couvert que par lecture immédiate. Trois tests ajoutés : le récap survit à la désélection provoquée par son propre lot, il disparaît au geste suivant, et *Delete collection* est bien inatteignable modale ouverte.

**Deferred (4)** → `deferred-work.md` 2026-08-10 : alignement de `CatalogManage` sur le pilotage par handlers (il garde l'empreinte, structurellement fragile) ; état **indéterminé** de la case « tout sélectionner » (à faire dans la primitive, profite aux 3 surfaces + 22.4) ; **focus** laissé à la dérive après une action groupée (transverse aux 3 lots) ; **trois régions live** qui parlent en même temps.

**Dismiss (8, avec la raison)** : ① `runBounded` rendrait ses résultats dans l'ordre d'achèvement, corrompant l'attribution des succès — **faux**, et démontrable : l'implémentation écrit `results[index]` par index et un test verrouille l'ordre des items ; le Blind Hunter n'avait pas accès au fichier, l'Edge Case Hunter l'a vérifié et l'a innocenté. ② « le lot ne se réconcilie jamais avec le serveur / erreurs terminales présentées comme réessayables » — le scénario avancé (collection supprimée par un autre curateur) **ne produit pas d'erreur** sur cet endpoint : `destroy` sur des liens inexistants répond 200. ③ La factory de mock rend `undefined` en silence — déjà corrigé en review 22.2 (`mockResolvedValue`) et le résidu est déjà en deferred-work. ④ Le récap ne s'auto-efface pas — **c'est le contrat** (persistant, leçon 20.4), à l'inverse du toast. ⑤ `addEntry` pendant un lot — vérifié par l'Edge Case Hunter comme **géré** (mise à jour fonctionnelle filtrant `removedSet`). ⑥ Ambiguïté supposée de `getByRole('button', {name:'Remove'})` vs `'Remove selected'` — vérifiée : correspondance exacte, pas d'ambiguïté. ⑦ `runBounded` sans `AbortController` / requête pendante qui gèle l'écran — c'est l'item **déjà** deferred en 22.2 (timeout app-wide), pas un patch local. ⑧ `<table>` sans `aria-label`/`<caption>` — une seule table sur l'écran, `getByRole('table')` non ambigu ; à revoir le jour où il y en aura deux.

**Vérifications mécaniques faites à la main** (à la place de l'Auditor planté) : décision **D tenue** — `git diff` confirme que **zéro ligne** du bloc typeahead (`comboboxInputAria`, `handleComboKeyDown`, `visibleResults`, `memberIds`) n'a été touchée, hors le `disabled` ajouté en review. **AC8 tenu** — le seul changement de `src/services/` visible dans le diff vs baseline vient de **22.2**, pas d'ici. Compteurs revérifiés après correctifs : **544/61**.


## Dev Notes

### Ce qui est déjà écrit ailleurs — à copier, pas à réinventer

`CatalogManage.tsx` (post-22.2) est le **modèle complet** de cette story : il a déjà le tableau + primitives, la barre, `runBounded`, le récap hors barre avec `aria-label` et `key`, l'empreinte de sélection, les gardes croisées et `mountedRef`. **Lire ce fichier avant de coder** et transposer ; les différences légitimes sont listées ci-dessous.

| | `CatalogManage` | `CatalogCollectionCompose` (ici) |
|---|---|---|
| Pagination | oui | **non** (tous les membres d'un coup) |
| Select-all | *within-page* (`addMany`/`removeMany`) | **replace** (`selectOnly`/`clear`) |
| Clic de ligne | ouvre la fiche | **aucun** (AC3) |
| « Clear selection » | nécessaire (sélection hors écran possible) | **inutile** (décision C) |
| Confirmation | oui pour Delete, non pour Add | **oui** pour Remove (décision B) |
| Récap | 4 segments possibles | **2** (AC1) |

### Pièges

- **Le récap hors de la barre** (piège central de 22.2, re-vérifié ici) : `<BulkActionBar>` rend `null` à sélection vide, et un retrait 100 % réussi vide la sélection. Un récap dans ses `children` disparaîtrait à l'instant où il doit être lu. **Frère, pas enfant.**
- **Deux régions `role="status"` sur la page** : le `<Toast>` partagé (22.5) en garde une montée en permanence. Sans `aria-label`, `getByRole('status')` devient ambigu — et pour un lecteur d'écran aussi.
- **Le mock de ce fichier de test est partiel** (`{ getCollection, listCatalog, addSongToCollection, removeSongFromCollection, updateCollection, deleteCollection }`) : c'est nommément l'exposition inscrite en deferred-work par la review de 22.2. Le migrer vers la factory est dans le périmètre de la Task 4.
- **`entryLabel()` et `DraftBadge()` existent déjà** en haut du fichier — les réutiliser pour les libellés de case (`Select {titre} by {artiste}`, convention 22.1) et le badge.
- **Ne pas toucher au typeahead** (décision D) : son exclusion des membres se fait **au rendu** (`visibleResults = results.filter(r => !memberIds.has(r.uid))`), donc un membre retiré redevient proposable tout seul. Vérifier par un test, ne pas ajouter de code.
- **`removeEntry` porte un revert-à-l'index** (réinsertion à la position d'origine en cas d'échec) : élégant pour un retrait unitaire optimiste, **inutile ici** puisque le lot ne retire du state local que ce qui a réussi. Ne pas transposer cette complexité.

### Anchors code (lus, non devinés)

- `src/pages/CatalogCollectionCompose.tsx` — L26-36 `entryLabel` + `DraftBadge` ; L43-47 état `collection`/`loading`/`error`/`notFound` ; L90-94 `memberIds` + `visibleResults` (l'exclusion au rendu) ; L135-152 `removeEntry` (à supprimer si plus appelé) ; L174-185 `handleDelete` (collection entière) ; L248-287 typeahead (**à ne pas toucher**) ; L289-321 le bloc `<ul>` des membres (**la cible**) ; L325-334 `ConfirmDialog` existant (pour la suppression de collection — en ajouter un second, ou paramétrer, sans casser le premier).
- `src/pages/CatalogManage.tsx` — le modèle complet (tableau, barre, récap, gardes, `runBounded`).
- `src/utils/runBounded.ts` (22.2) et `src/utils/selectionCell.ts` (22.1) — à consommer tels quels.
- `src/test/catalogServiceMock.ts` (22.2) — la factory de mock.
- `backend/controllers/catalogcontroller.js` L578-593 — l'endpoint idempotent. **À ne pas toucher.**

### Project Structure Notes

- **UPDATE** : `src/pages/CatalogCollectionCompose.tsx`, `src/__tests__/CatalogCollectionCompose.test.tsx`.
- **Aucun** fichier nouveau attendu, **aucun** changement de service, backend, modèle, migration, route.
- Conventions (project-context) : TS `strict` + `verbatimModuleSyntax`, imports relatifs, Tailwind only, **UI et commentaires en anglais**, `dark:` partout.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` § Epic 22, Story 22.3 + décisions A/C]
- [Source: `_bmad-output/implementation-artifacts/22-2-add-to-collection-groupe.md` — `runBounded`, forme du récap, et **la section Review Findings** : 13 correctifs dont plusieurs s'appliquent mot pour mot ici (gardes de concurrence, récap effacé au geste suivant, `key` sur le récap, `aria-label`)]
- [Source: `_bmad-output/implementation-artifacts/22-1-composants-selection-partages.md` — primitives et contrat `selectionCell`]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` 2026-08-10 — la migration du mock de ce fichier précis]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev-story)

### Debug Log References

- Ordre inversé volontairement : **Task 4 (migration du mock) exécutée en premier**, avant toute ligne de code — sinon la suite serait tombée en cascade au premier appel de service nouveau. Migration seule : 6/6 verts, aucune assertion touchée.
- TDD ensuite : 6 tests rouges → implémentation → 11/11.
- Suite complète : **541/541 (61 suites)** — baseline 536/61, soit **+5** tests nets (6 ajoutés, 1 réécrit). `npx tsc -b --force` clean. `npm run lint` clean.

### Completion Notes List

- **Le récap n'a que deux segments** (AC1) : pas de « already removed ». Vérifié dans le contrôleur — `destroy` puis `200` sans aucune vérification d'existence : le retrait concurrent par un autre curateur est **déjà** un succès. Écrire une tolérance 404 aurait été du code mort décrivant un comportement que le système n'a pas.
- **Tableau** : colonnes Artist · Title (+ badge `Draft`) · Key · BPM, cases via les primitives 22.1 et `selectionCell`. **Select-all en *replace*** (`selectOnly`/`clear`), pas *within-page* : la liste n'est pas paginée, unir une « page » n'aurait aucun sens ici.
- **Pas de clic de ligne** (AC3) : cet écran n'a pas de destination naturelle. Je n'en ai pas inventé une.
- **Un seul chemin de retrait** : le bouton *Remove* par ligne et la fonction `removeEntry` (avec son revert-à-l'index) ont été **supprimés**. Le test existant qui cliquait ce bouton a été réécrit en « il n'y a plus de Remove par ligne » — **c'est le seul test existant modifié**, et c'était annoncé par la Task 4.
- **Tout ce que la review de 22.2 avait coûté est appliqué d'emblée** : récap hors barre avec `aria-label` et `key` par sévérité, effacement au démarrage du lot et au geste de sélection suivant (empreinte), `mountedRef`, garde in-flight, cases + boutons gelés pendant le lot, et le *Delete collection* de l'en-tête gelé aussi (deux chemins destructifs ne doivent pas s'entrelacer).
- **Le typeahead n'a pas été touché** (décision D) : son exclusion des membres se calcule au rendu, donc une entrée retirée redevient proposable toute seule. Un test le prouve plutôt qu'un commentaire l'affirme.
- **Migration du mock faite** : cette suite est nommément l'exposition inscrite en deferred-work par la review de 22.2. Il reste les autres suites Catalog — l'item deferred n'est donc que **partiellement** soldé, il reste ouvert.

### File List

- **UPDATE** `src/pages/CatalogCollectionCompose.tsx` — membres en tableau sélectionnable, `Remove selected` + `ConfirmDialog` + `runBounded`, récap hors barre, gardes de concurrence ; `removeEntry` et le *Remove* par ligne supprimés.
- **UPDATE** `src/__tests__/CatalogCollectionCompose.test.tsx` — mock migré vers la factory, 6 tests ajoutés, 1 réécrit.
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml` — suivi de la story.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 1.1 | code review 3 couches, **partielle** (Auditor planté, sa partie mécanique refaite à la main) — 22 findings : 10 patch (exclusion mutuelle des 2 modales + garde `removing` sur `handleDelete`, purge de la sélection au changement de collection, empreinte de récap remplacée par un pilotage par handlers, gardes qui referment la modale, try/finally, typeahead gelé, 4 tests réécrits ou ajoutés), 4 defer, 8 dismiss dont une accusation réfutée preuve à l'appui. Front **544/61**. | northwood |
| 2026-08-10 | 1.0 | dev-story — membres en tableau sélectionnable + retrait groupé (récap 2 segments, l'endpoint étant idempotent) ; mock de la suite migré vers la factory AVANT de coder ; tous les correctifs de la review 22.2 appliqués d'emblée. Front **541/61** (+5), puis **544/61** après les correctifs de review. 1 test existant réécrit (le Remove par ligne disparaît). | northwood |
| 2026-08-10 | 0.1 | Story créée (create-story). Découverte : l'endpoint de retrait est inconditionnellement idempotent (200 même sur un lien absent), donc le cas « 404 = déjà retiré » demandé par l'epic est **inatteignable** — récap à 2 segments, AC1 corrige l'epic. Modèle = `CatalogManage` post-22.2, avec 6 différences légitimes tabulées. Migration du mock de la suite ciblée incluse (deferred de 22.2). | northwood |
