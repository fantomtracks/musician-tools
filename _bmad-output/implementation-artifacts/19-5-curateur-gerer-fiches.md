---
baseline_commit: a328aeb0052ee5c3662145cc70376a1279eb1bc3
---
# Story 19.5: Curateur — gérer les fiches (lister / éditer / supprimer)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curator**,
I want **to see all Catalog entries and edit or delete any of them**,
so that **I can keep the shared Catalog accurate over time — fix a wrong BPM/key, rename a mistitled entry, or remove a bad one — without touching the songs users already copied into their own Songlist**.

## Contexte / origine

Découverte en **QA de l'Epic 19** : l'écran curateur de la story 19.2 (`CatalogAdmin`) est **création-only**. Or le **backend CRUD complet existe déjà depuis 19.1** (`updateCatalogEntry`, `deleteCatalogEntry` + routes `PUT`/`DELETE /api/catalog/:uid`, gated `requireCurator`). Il ne manque que le **front** pour lister/éditer/supprimer. Décision northwood : story de suivi 19.5. (cf. `sprint-status.yaml` L189)

## Acceptance Criteria

1. **Liste de gestion (curateur)** — Given un curateur connecté, When il ouvre `/catalog/manage`, Then toutes les fiches du Catalog sont listées (au minimum titre + artiste, colonnes clé/mode/time-signature comme le browse), chaque ligne exposant une action **Edit** et une action **Delete**. Un non-curateur qui atteint la route est redirigé vers `/` (gate privilège, **pas** un oracle 404 — même pattern que `CatalogAdmin`).
2. **Navigation hub** — L'entrée **« Curate »** du menu compte (desktop + mobile) mène désormais au **hub de gestion `/catalog/manage`** ; depuis ce hub, une action **« New entry »** mène au formulaire de création `/catalog/admin`. (La création reste inchangée.)
3. **Édition in-place** — Given un curateur sur l'édition d'une fiche (`/catalog/admin/:uid`), When il modifie des champs et enregistre, Then `PUT /api/catalog/:uid` met à jour **la même fiche (uid stable, jamais delete+recreate)**, un toast de succès s'affiche (« Catalog entry updated ») et la liste de gestion reflète le changement au retour.
4. **Pré-remplissage** — Le formulaire d'édition est **pré-rempli** avec les valeurs courantes de la fiche : tous les champs intrinsèques, y compris `genre`/`language` (tableaux → chips), `durationSeconds` affiché en **m:ss**, `bpm`, `pitchStandard`, et les `streamingLinks` existants.
5. **Conflit de renommage (409)** — Given un curateur qui édite le titre/artiste d'une fiche pour entrer en collision avec une **autre** fiche existante (clé canonique globale), When il enregistre, Then le service lève `CatalogConflictError`, un message ambre « A "…" by … is already in the Catalog. » s'affiche, aucune exception non gérée, la fiche n'est pas modifiée. (Éditer une fiche sans changer sa clé ne doit **jamais** déclencher un faux 409 — l'update exclut la fiche elle-même côté back.)
6. **Suppression avec confirmation** — Given un curateur sur la liste, When il clique **Delete** sur une ligne puis confirme le `ConfirmDialog` (variante **dangereuse**, bouton rouge), Then `DELETE /api/catalog/:uid` supprime la fiche et la ligne disparaît de la liste. **Annuler** ne fait rien. Le dialog est fermable via Escape / clic backdrop (comportement natif de `ConfirmDialog`).
7. **Découplage suppression ↔ Songlists (AC8 Epic 19)** — Supprimer une fiche **ne supprime ni n'altère** les `Song` que des utilisateurs ont déjà copiés depuis cette fiche : `Song.sourceCatalogUid` devient **dangling** (aucune FK, comportement assumé §4.7). La suppression ne renvoie donc aucune erreur liée aux Songs copiées.
8. **Not-found calme (deep-link / état périmé)** — Ouvrir la route d'édition pour un `uid` inexistant/supprimé → `getCatalogEntry` lève `CatalogNotFoundError` → écran « not found » calme avec un lien retour vers `/catalog/manage` (pas de crash). De même, supprimer une fiche déjà supprimée par ailleurs (404) est absorbé proprement (la ligne est retirée de la liste, pas d'erreur bloquante).
9. **Curateur bout-en-bout** — Toutes les mutations (edit, delete) sont gated **côté serveur** par `requireCurator` (403 pour un non-curateur, déjà en place depuis 19.1). L'UI n'expose jamais Edit/Delete à un non-curateur (routes gated `isCurator` en composant).

## Tasks / Subtasks

- [x] **Task 1 — Service : `deleteCatalogEntry`** (AC: 6, 8)
  - [x] Ajouter `async deleteCatalogEntry(uid: string): Promise<void>` à `catalogService` dans `src/services/catalogService.ts`, calqué sur `updateCatalogEntry` : `apiFetch(`${API_BASE}/catalog/${uid}`, { method: 'DELETE', credentials: 'include' })` (apiFetch attache le CSRF). `response.status === 404` → `throw new CatalogNotFoundError()`. `!response.ok` → `throw new Error('Failed to delete catalog entry')`. Sinon retourne `void` (le back renvoie `{ message }`, non exploité).
  - [x] Écrire les tests service : 200 → résout ; 404 → `CatalogNotFoundError` ; 500 → throw générique.

- [x] **Task 2 — `CatalogAdmin` bi-mode (create + edit)** (AC: 3, 4, 5, 8)
  - [x] Lire l'`uid` d'édition via `useParams()` (route `/catalog/admin/:uid`). `isEdit = Boolean(uid)`.
  - [x] En mode edit : au montage, `catalogService.getCatalogEntry(uid)` → mapper `CatalogSong` → `CreateCatalogDTO` (ignorer `uid/createdAt/updatedAt` ; `genre`/`language` via `asArr` ; `durationSeconds` → initialiser `durationText` en m:ss via `formatSecondsToMmss`). Gérer un état `loading` et un état `notFound` (sur `CatalogNotFoundError`) → écran calme + lien `/catalog/manage`.
  - [x] `handleSubmit` : brancher sur `catalogService.updateCatalogEntry(uid, form)` en mode edit (vs `createCatalogEntry` en create). Toast « Catalog entry updated » ; **ne pas** réinitialiser à `emptyForm` en edit — proposer un retour à `/catalog/manage` (navigate) après succès. Réutiliser tel quel la gestion `CatalogConflictError` → `conflictMessage` ambre.
  - [x] Titre/sous-titre de page adaptés (« Edit catalog entry » vs « Curate the Catalog »). Bouton **Cancel** en edit → `navigate('/catalog/manage')` (au lieu de reset).
  - [x] Préserver 100 % du chemin **create** existant (auto-fill non destructif, m:ss, renderSelect/renderMulti, parseNumber anti-NaN, gate `!user?.isCurator` → `Navigate`).

- [x] **Task 3 — Page `CatalogManage` (liste + actions)** (AC: 1, 2, 6, 7)
  - [x] Nouveau `src/pages/CatalogManage.tsx`, gated `if (!user?.isCurator) return <Navigate to="/" replace />`.
  - [x] Charger les fiches via `catalogService.listCatalog({ limit: 100, sort })` (enveloppe `{items,total,page,limit}`). Réutiliser les patterns de `Catalog.tsx` (loading/erreur/Retry). Pagination simple si `total > limit` (réutiliser l'approche URL-state existante si pertinent, sinon un « Load more »/pagination minimale — ne pas sur-concevoir).
  - [x] Table/lignes réutilisant le style de `CatalogList` (Artist · Title · Key · Mode · Time-signature) + une cellule actions : **Edit** (`Link`/`navigate('/catalog/admin/'+uid)`) et **Delete** (bouton rouge discret) — `stopPropagation` si la ligne est cliquable.
  - [x] Delete : ouvrir `ConfirmDialog` (`isDangerous`, title « Delete catalog entry », message rappelant que les Songs déjà ajoutées par les utilisateurs sont **conservées**, confirmText « Delete »). Sur confirm → `deleteCatalogEntry(uid)` → retirer la fiche de l'état local ; absorber `CatalogNotFoundError` (déjà supprimée) en retirant quand même la ligne ; toast succès/erreur.
  - [x] Bouton **« New entry »** → `/catalog/admin`. En-tête cohérent avec le reste (utilities design-system, DL-14).

- [x] **Task 4 — Routes** (AC: 1, 2, 3, 8)
  - [x] Dans `src/router.tsx` (arbre exporté, utilisé aussi par le smoke test) : ajouter `{ path: 'catalog/manage', element: <CatalogManage /> }` et `{ path: 'catalog/admin/:uid', element: <CatalogAdmin /> }`. Garder l'ordre : segments statiques (`catalog/admin`, `catalog/manage`) **avant** `catalog/:uid`. Vérifier qu'`admin/:uid` ne capture pas `admin` (routes distinctes).
  - [x] Import de `CatalogManage`.

- [x] **Task 5 — Navigation** (AC: 2)
  - [x] Dans `src/components/Header.tsx` : l'entrée **« Curate »** (dropdown compte, desktop + mobile) pointe désormais vers `/catalog/manage` (hub) au lieu de `/catalog/admin`. La création reste accessible depuis le hub (« New entry »). Conserver le gating `isCurator` existant sur l'entrée.

- [x] **Task 6 — Tests** (AC: 1, 3, 4, 5, 6, 8, 9)
  - [x] `CatalogManage.test.tsx` : rend la liste (mock `listCatalog`) ; Delete ouvre le dialog ; confirm appelle `deleteCatalogEntry` et retire la ligne ; cancel = no-op ; gate non-curateur → redirection.
  - [x] `CatalogAdmin` edit-mode : pré-remplissage depuis `getCatalogEntry` (mock) ; submit appelle `updateCatalogEntry(uid, …)` + toast updated ; 409 → message ambre, fiche inchangée ; `uid` inconnu → écran not-found. Ne pas casser les tests existants du mode create (`CatalogAdmin.test.tsx`).
  - [x] Mettre les tests `CatalogAddButton`-style **sous StrictMode** si des effets/timers sont introduits (leçon Epic 18/19).

### Review Findings

Revue 3 couches (Blind Hunter / Edge Case Hunter / Acceptance Auditor) — Acceptance : **9/9 AC SATISFIED**. 4 patches, 3 dismiss.

- [x] [Review][Patch] `CatalogManage` : page vide sans pagination après suppression de la dernière ligne (ou `?page` hors-borne) — ajouter le guard `items.length` + clamp/refetch de page après delete [src/pages/CatalogManage.tsx]
- [x] [Review][Patch] `listCatalog` du hub omet `sort` (ordre non déterministe) — passer un `sort` explicite [src/pages/CatalogManage.tsx]
- [x] [Review][Patch] Smoke test router n'asserte pas les routes Catalog (`/catalog/manage`, `/catalog/admin/:uid`) — ajouter l'assertion (le matching est correct mais non couvert) [src/__tests__/router.test.tsx]
- [x] [Review][Patch] Pas de test pour la branche delete-404-absorbé (AC8 2ᵉ moitié) — ajouter un test `CatalogManage` [src/__tests__/CatalogManage.test.tsx]

Dismiss (accept-with-raison) : (a) deep-link non-curateur déclenche `getCatalogEntry` avant redirect → inoffensif (lecture Catalog publique à tout user loggé §3, redirect maintenu, aucun oracle/fuite) ; (b) toast `setTimeout` non nettoyé → no-op sous React 19, pattern hérité du showToast 19.2 (pré-existant) ; (c) course pré-remplissage vs auto-fill/duration → faux positif, vérifié par Edge Case + Auditor (auto-fill déclenché au clic, effet duration converge).

## Dev Notes

### Ce qui existe déjà (NE PAS réinventer)
- **Backend CRUD complet, gated curateur** (story 19.1, aucune modif back attendue) :
  - `PUT /api/catalog/:uid` → `updateCatalogEntry` : édition **in-place, uid préservé** ; `400` si titre vidé ; `404` si uid invalide/inconnu ; **`409 duplicate_catalog_entry`** sur collision de clé canonique globale, avec fallback titre/artiste courant pour un PUT **partiel** (rename artiste seul). Corps 409 = `{ error, message, entry }`. [Source: `backend/controllers/catalogcontroller.js:117-163`]
  - `DELETE /api/catalog/:uid` → `deleteCatalogEntry` : `404` si uid invalide/inconnu, sinon `entry.destroy()` + `200 { message }`. [Source: `backend/controllers/catalogcontroller.js:166-181`]
  - Routes gated `authsess` **puis** `requireCurator` (→ 403 franc, pas 404). CSRF app-wide sur toute mutation `/api`. [Source: `backend/routes/catalog.js`]
- **Service front** : `catalogService.updateCatalogEntry(uid, dto)` **existe déjà** (409 → `CatalogConflictError(body.entry)`). `getCatalogEntry(uid)` (404 → `CatalogNotFoundError`) et `listCatalog(params)` (enveloppe) existent. **Seul `deleteCatalogEntry` manque.** [Source: `src/services/catalogService.ts:80-194`]
- **`ConfirmDialog`** réutilisable : props `{ isOpen, title, message, confirmText, cancelText, onConfirm, onCancel, isDangerous }` ; `isDangerous` → bouton rouge ; Escape/backdrop → `onCancel` ; `onConfirm` peut être async (try/catch interne). [Source: `src/components/ConfirmDialog.tsx`]
- **Formulaire de fiche** : toute la logique de champs vit dans `CatalogAdmin` (auto-fill non destructif, duration m:ss `durationText`+blur, `renderSelect` key/mode/timeSignature préservant une valeur hors-liste, `renderMulti` genre/language dropdown+chips, `parseNumber` anti-NaN, gate `!user?.isCurator`). Le rendre **bi-mode** est le chemin de moindre churn (réutilise 100 % des champs) plutôt que d'extraire un composant form. [Source: `src/pages/CatalogAdmin.tsx`]
- **Options de champs partagées** : `keyOptions/modeOptions/timeSignatureOptions/genreOptions/languageOptions` dans `src/utils/songFieldOptions.ts` (source unique SongForm ↔ Catalog).
- **Types** : `CreateCatalogDTO = Omit<CatalogSong,'uid'|'createdAt'|'updatedAt'>` ; `UpdateCatalogDTO = Partial<CreateCatalogDTO>` ; `CatalogSong` porte `uid`. Le mapping edit = repartir des champs de `CatalogSong` vers `emptyForm` (arrays via `asArr`, duration via `formatSecondsToMmss`).

### Décisions d'architecture pour cette story
- **Édition = route `/catalog/admin/:uid`** réutilisant `CatalogAdmin` en mode edit (segment statique `admin` → aucune collision avec `/catalog/:uid` = détail public `CatalogEntry`). L'ordre des routes garde les segments statiques avant `:uid`.
- **Hub de gestion = `/catalog/manage`** (nouvelle page `CatalogManage`), vers laquelle pointe désormais « Curate ». Le hub porte la **liste + Edit + Delete + New entry**. Rationale : garder `CatalogAdmin` centré sur le formulaire (create/edit) et isoler la liste/actions destructives dans une page dédiée.
- **Gate de privilège** répliqué en composant (`Navigate to="/"`), cohérent avec 19.2 — ce n'est **pas** un oracle 404 : la ressource est lisible par tous (§3), c'est l'écran d'admin qui est un gate de privilège.
- **Découplage suppression** (AC7) : aucune FK `Song.sourceCatalogUid → CatalogSong` (souple, §4.7). `entry.destroy()` ne cascade rien vers les `Song`. Déjà prouvé en QA Epic 19 (supprimer une fiche → la Song copiée survit avec un `sourceCatalogUid` dangling). Aucun code défensif requis ; **micro-copy** dans le `ConfirmDialog` pour rassurer (« Songs users already added keep their copy »).

### Pièges à éviter (leçons Epic 17/18/19)
- **Faux 409 en édition** : ne PAS renvoyer un conflit quand la fiche garde sa propre clé — le back exclut déjà la fiche courante ; côté front, ne pas ré-implémenter de garde de doublon, juste relayer `CatalogConflictError`.
- **StrictMode** : tout effet/timer (chargement de la fiche à éditer, toasts) doit survivre au double-montage StrictMode (ré-armer les flags `mounted` **dans** l'effet, pas seulement à l'init) — régression vécue sur `CatalogAddButton` (bouton figé). Rendre les nouveaux tests sous StrictMode par défaut.
- **`emptyForm` partagé** : ne pas muter `emptyForm` (objet module) lors du mapping edit — cloner (`{ ...emptyForm, ...mapped }`).
- **Duration** : re-synchroniser `durationText` quand `form.durationSeconds` change out-of-band (l'effet existant le fait déjà ; le pré-remplissage edit doit poser `durationSeconds` **et** laisser l'effet régénérer le texte, ou poser `durationText` explicitement).
- **Router exporté** : le smoke test rejoue l'arbre exporté de `router.tsx` — ajouter les routes au bon endroit (sous `RequireAuth`).

### Project Structure Notes
- **NEW** : `src/pages/CatalogManage.tsx`, `src/__tests__/CatalogManage.test.tsx`.
- **UPDATE** : `src/services/catalogService.ts` (+`deleteCatalogEntry`), `src/pages/CatalogAdmin.tsx` (bi-mode), `src/router.tsx` (2 routes), `src/components/Header.tsx` (Curate → /catalog/manage), `src/__tests__/CatalogAdmin.test.tsx` (+ cas edit sans casser create).
- **Aucune migration, aucun changement backend** attendus (CRUD + gate déjà livrés en 19.1). Si un test back manque pour delete/update, il existe déjà dans `backend/__tests__/catalogcontroller.test.js` (25 tests) — vérifier, ne pas dupliquer.
- Convention vocabulaire projet : « **Songlist** » (perso) vs « **Catalog** » (partagé) ; action de copie = « Add to my songlist ». Ne pas écrire « Library ».

### References
- [Source: `_bmad-output/implementation-artifacts/sprint-status.yaml#189` — périmètre 19-5]
- [Source: `_bmad-output/planning-artifacts/architecture-catalog-2026-07-12.md` — §3 lecture non-scopée, §4.7 sourceCatalogUid souple, gate curateur]
- [Source: `_bmad-output/project-context.md` — Catalog : 2 exceptions assumées (lecture non-scopée + 403 write)]
- [Source: `backend/controllers/catalogcontroller.js:117-181` — update/delete]
- [Source: `backend/routes/catalog.js` — routes gated requireCurator]
- [Source: `src/services/catalogService.ts:80-194` — service Catalog]
- [Source: `src/pages/CatalogAdmin.tsx` — formulaire à rendre bi-mode]
- [Source: `src/components/ConfirmDialog.tsx` — dialog de confirmation réutilisable]
- [Source: story `19-2-admin-saisir-fiche-front.md` — gate isCurator, CatalogConflictError body.entry, caveat « Curate » visible après reconnexion]
- [Source: story `19-4-add-to-my-songlist.md` — découplage sourceCatalogUid, patterns 3-états/StrictMode]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- Front : 45 suites / **394 tests** verts (+11 : 3 service delete, 3 CatalogAdmin edit, 5 CatalogManage). Back : 21 suites / **294 tests** verts (inchangé — aucun code back touché). `tsc --noEmit` OK, eslint OK sur tous les fichiers touchés.

### Completion Notes List

- **Task 1** — `catalogService.deleteCatalogEntry(uid)` ajouté (DELETE, 404 → `CatalogNotFoundError`, sinon `void`). Commentaire sur le découplage `sourceCatalogUid` (aucune FK). 3 tests service (mock `global.fetch` + round-trip CSRF).
- **Task 2** — `CatalogAdmin` rendu **bi-mode** via `useParams().uid` : effet de pré-remplissage StrictMode-safe (`active` guard) → `getCatalogEntry` → `mapEntryToForm` (drop uid/timestamps, `asArr` genre/language, duration m:ss, clone des `streamingLinks`) ; `handleSubmit` branché sur `updateCatalogEntry` puis `navigate('/catalog/manage')` ; interstitiels `loading`/`notFound` calmes ; titres/sous-titres + label bouton (« Save changes ») + Cancel → manage adaptés. Chemin **create** 100 % préservé (tests 19.2 toujours verts).
- **Task 3** — nouvelle page `CatalogManage` : liste searchable (debounce 280 ms + AbortController, patterns `Catalog.tsx`), table Artist·Title·Key·Mode·Time-signature + cellule actions Edit/Delete, `ConfirmDialog` (`isDangerous`, micro-copy « Users who already added this song keep their own copy » = AC7), suppression locale sans refetch (pas de flash), 404 absorbé, bouton « New entry ». Gate `isCurator` (pas un oracle).
- **Task 4** — routes `catalog/manage` + `catalog/admin/:uid` (segments statiques avant `catalog/:uid`) dans l'arbre exporté (rejoué par le smoke test).
- **Task 5** — entrée « Curate » (desktop + mobile) repointée vers `/catalog/manage` (hub).
- **Task 6** — tests sous **StrictMode** (leçon 19.4) : `CatalogManage.test.tsx` (liste, edit-navigate, delete confirm/cancel, gate) + cas edit dans `CatalogAdmin.test.tsx` (pré-remplissage, update in-place same-uid, 409 calme, not-found) + `catalogService.test.ts` (delete 200/404/500).
- **Aucune migration, aucun changement backend** : le CRUD + `requireCurator` (403) sont livrés depuis 19.1 ; back suite inchangée à 294.

### File List

- `src/services/catalogService.ts` (UPDATE — `deleteCatalogEntry`)
- `src/pages/CatalogAdmin.tsx` (UPDATE — bi-mode create/edit)
- `src/pages/CatalogManage.tsx` (NEW — hub de gestion)
- `src/router.tsx` (UPDATE — routes `catalog/manage` + `catalog/admin/:uid`)
- `src/components/Header.tsx` (UPDATE — « Curate » → `/catalog/manage`)
- `src/__tests__/catalogService.test.ts` (NEW)
- `src/__tests__/CatalogManage.test.tsx` (NEW)
- `src/__tests__/CatalogAdmin.test.tsx` (UPDATE — cas edit + mock `getCatalogEntry`, sous StrictMode)
- `src/components/DuplicateBanner.tsx` (NEW — bandeau doublon ambre partagé, QA)
- `src/components/SongForm.tsx` (UPDATE — réutilise DuplicateBanner, QA)
- `src/pages/Catalog.tsx` (UPDATE — `w-full` anti-bouge largeur, QA)
- `src/components/CatalogList.tsx` (UPDATE — hauteur naturelle liste, QA)
- `src/__tests__/router.test.tsx` (UPDATE — assertions routes Catalog)

### QA manuelle (post-review) — corrections appliquées sur la branche
Tous les AC validés à la main (northwood). Correctifs UX pendant la QA :
- **Multi-sélection type Songlist** : checkboxes + select-all + barre « Delete selected » ; clic ligne = ouvre la fiche ; suppression par ligne retirée (AC6 revu). Delete aussi disponible **dans la fiche d'édition** (bouton rouge à gauche ; Cancel+Save à droite).
- **Form aligné sur SongForm** : Artist avant Title, ordre Artist→Title→auto-fill→Genre→Album→Language→(Duration·BPM·TimeSig)→(Key·Mode·Pitch). Bandeau 409 déplacé juste après titre via `DuplicateBanner` (même composant que la fiche chanson).
- **Layout stable** : `w-full` sur le conteneur (la colonne ne rétrécit plus à 0 résultat) ; en-tête `flex-wrap` (plus de chevauchement titre/New entry) ; Cancel en création → retour hub.
- Découvert en QA → cadré en **story 19-6** (draft/publish + autosave, backlog).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-15 | 0.1 | Story créée (context engine) — front pour gérer les fiches (list/edit/delete), back CRUD déjà livré en 19.1 | northwood |
| 2026-07-15 | 0.2 | Implémentation (dev-story) — service delete, CatalogAdmin bi-mode, page CatalogManage, routes, nav ; front 394✓ back 294✓ tsc✓ lint✓ → Status review | northwood |
| 2026-07-15 | 0.3 | Code review 3 couches (Acceptance 9/9) → 4 patch appliqués (F1 page vide/pager, F2 sort, F6 smoke routes, F7 test delete-404) + 3 dismiss ; front 402✓ tsc✓ lint✓ → Status done | northwood |
| 2026-07-16 | 0.4 | QA manuelle OK (tous AC). Correctifs UX : multi-select Songlist + delete-in-fiche, form aligné SongForm (artist-first) + DuplicateBanner partagé, w-full/flex-wrap anti-bouge. Front 406✓ back 294✓ tsc✓ lint✓. → story 19-6 draft/publish cadrée | northwood |
