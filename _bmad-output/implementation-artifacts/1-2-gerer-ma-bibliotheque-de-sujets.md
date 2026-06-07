---
baseline_commit: 9f91cf3c563e590ecab36cbb4db7c60ed9bae7c3
---

# Story 1.2: Gérer ma bibliothèque de sujets

Status: done

## Story

As a musicien,
I want consulter, renommer, recatégoriser et supprimer mes sujets,
so that ma bibliothèque reste fidèle à ma pratique réelle.

## Acceptance Criteria

1. **Liste plate** — Given des sujets existants, When j'ouvre la page « Topics », Then je vois la liste plate de tous mes sujets avec nom et catégorie — aucune hiérarchie. *(Déjà livré en 1.1 — vérifier la non-régression.)*
2. **Renommer / recatégoriser** — Given un sujet, When je le renomme ou change sa catégorie, Then la modification est sauvegardée et visible immédiatement.
3. **Supprimer avec confirmation** — Given un sujet, When je le supprime, Then un dialogue de confirmation s'affiche (pattern `ConfirmDialog` existant) avant suppression définitive, And la sémantique de suppression préserve le nom pour les références futures de l'historique (préparation FR4 — vérifié de bout en bout à l'Epic 2).
4. **Techniques intactes** — Given les « techniques » existantes des chansons, When cette story est livrée, Then aucun rapprochement ni migration : le formulaire chanson est inchangé (FR5).
5. **Ownership** — Given un autre utilisateur, When il tente d'accéder à mes sujets (page ou API), Then l'accès est refusé (NFR4) — 403 sur PUT/DELETE d'un sujet qui ne m'appartient pas.

## Tasks / Subtasks

- [x] Task 1 : Contrôleur — `updateTopic` + `deleteTopic` (AC: 2, 3, 5)
  - [x] Étendre `backend/controllers/topiccontroller.js` avec le pattern ownership OBLIGATOIRE de `instrumentcontroller.js` : `req.session.user` → 401 → `Topic.findByPk(req.params.uid)` → 404 `'Topic not found'` → `topic.userUid !== userId` → 403 `'Forbidden'` → action
  - [x] `updateTopic` — sémantique partielle (champ absent = inchangé, comme `updateInstrument`), MAIS avec les validations de la 1.1 : si `name` est fourni → trim, 400 si vide/blanc, 400 si > 255 ; si `category` est fournie → trim, `''`/blanc → `null`, 400 si > 255
  - [x] `updateTopic` — CRITIQUE (acquis review 1.1) : la contrainte unique `topics_user_uid_name` s'applique au rename → catch `error.name === 'SequelizeUniqueConstraintError'` → 409 `'Topic already exists'` (même pattern que `createTopic`)
  - [x] `deleteTopic` — `await topic.destroy()` puis `res.json({ message: 'Topic deleted successfully' })` (pattern existant, hard delete — voir Dev Notes « Sémantique FR4 »)
  - [x] Exporter les deux fonctions ; réponses = entité JSON brute pour update, pas d'enveloppe
- [x] Task 2 : Routes (AC: 2, 3, 5)
  - [x] `backend/routes/topics.js` : ajouter `router.put('/:uid', authsess, topicController.updateTopic)` et `router.delete('/:uid', authsess, topicController.deleteTopic)` — rien d'autre ne change
- [x] Task 3 : Service frontend (AC: 2, 3)
  - [x] `src/services/topicService.ts` : ajouter `UpdateTopicDTO = Partial<CreateTopicDTO>`, `update(uid, payload)` (PUT, 409 → `throw new Error('Topic already exists')` comme `create`) et `remove(uid)` (DELETE, void) — pattern exact `instrumentService.ts`, TOUJOURS `credentials: 'include'`
- [x] Task 4 : Page — édition inline + suppression (AC: 1, 2, 3)
  - [x] `src/pages/MyTopicsPage.tsx` : édition inline par ligne sur le pattern exact de `MyInstrumentsPage.tsx` (`editingUid`/`editName`/`editCategory`, `startEdit`/`cancelEdit`/`saveEdit`, ligne en mode édition avec fond `bg-sky-50 dark:bg-sky-900/40`), boutons Edit (`btn-secondary`) / Delete (rouge, pattern existant) dans une colonne Actions alignée à droite
  - [x] `saveEdit` : `setError(null)` au début (acquis review 1.1), bouton Save désactivé si `!editName.trim()`, message 409 distinct (« Topic already exists ») vs générique (« Failed to update topic »), mise à jour immédiate de la liste (`setList(list.map(...))`)
  - [x] Suppression : état `deleteUid`, `ConfirmDialog` (props : `isOpen={!!deleteUid}`, `title="Delete topic"`, `message="Are you sure you want to delete this topic?"`, `confirmText="Delete"`, `isDangerous`, `onConfirm`/`onCancel`) — retrait immédiat de la liste après succès
  - [x] Inputs d'édition avec `maxLength={255}` et `aria-label` (« Edit name », « Edit category ») — NFR6 ; variantes `dark:` partout (NFR3)
  - [x] UI 100 % anglais ; ne PAS toucher au formulaire d'ajout ni aux acquis 1.1 (labels, bandeau role="alert", loadFailed)
- [x] Task 5 : Tests backend (AC: 2, 3, 5)
  - [x] Étendre `backend/__tests__/topiccontroller.test.js` (mêmes mocks — ajouter `findByPk` au mock `Topic`) : update OK (200, champs transmis), update partiel (category seule → name conservé), update name vide → 400, update name > 255 → 400, update rename en doublon → 409, update sujet inexistant → 404, update sujet d'un autre user → 403, update sans session → 401, delete OK (message), delete 404/403/401
- [x] Task 6 : Tests frontend (AC: 2, 3)
  - [x] Étendre `src/__tests__/MyTopicsPage.test.tsx` (ajouter `update`/`remove` au mock du service) : Edit ouvre le mode édition pré-rempli, Save appelle `update` et met à jour la ligne, Cancel referme sans appel, message « Topic already exists » sur 409 au rename, Delete ouvre le ConfirmDialog, confirmer appelle `remove` et retire la ligne, annuler ne supprime rien
- [x] Task 7 : Validations finales
  - [x] PAS de migration dans cette story (aucun changement de schéma) — ne pas en créer
  - [x] Les DEUX suites : `npm test` (racine) + `cd backend && npm test` ; lint des deux côtés ; `npm run build`
  - [x] Vérifier FR5 : `git diff` ne touche ni `SongForm.tsx` ni le champ `technique`

### Review Findings

- [x] [Review][Patch] `:uid` malformé (non-UUID) → 500 au lieu de 404 sur PUT/DELETE (Med, blind+edge) [backend/controllers/topiccontroller.js]
- [x] [Review][Patch] ConfirmDialog sans protection in-flight : double-clic « Delete » → DELETE dupliqué + fausse erreur ; et en cas d'échec, le bandeau d'erreur s'affiche DERRIÈRE la modale restée ouverte (Med, blind+edge+auditor) [src/pages/MyTopicsPage.tsx handleDelete]
- [x] [Review][Patch] `category` non-string en PUT (ex. 123) efface silencieusement la catégorie au lieu d'un 400 (edge) [backend/controllers/topiccontroller.js]
- [x] [Review][Patch] Boutons Edit/Delete par ligne sans nom accessible (le lecteur d'écran entend « Edit, Delete, Edit, Delete… ») ; le message du dialog ne nomme pas le sujet (blind, NFR6) [src/pages/MyTopicsPage.tsx]
- [x] [Review][Patch] Mutations de liste sur closure périmée (`setList([...list])`) au lieu d'updates fonctionnelles — latent mais atteignable via le gap dialog (blind) [src/pages/MyTopicsPage.tsx ×3]
- [x] [Review][Patch] Bouton rouge Delete sans variantes dark: (auditor, NFR3) [src/pages/MyTopicsPage.tsx]
- [x] [Review][Patch] Contrat FR4 (snapshot du nom dans les SessionItems, Epic 2) absent de deferred-work.md — risque d'oubli à la création des stories Epic 2 (auditor) [_bmad-output/implementation-artifacts/deferred-work.md]
- [x] [Review][Defer] 403 vs 404 = oracle d'énumération inter-utilisateurs [backend/controllers/*] — deferred, pattern maison imposé par le spec (instrumentcontroller identique) ; à revoir globalement
- [x] [Review][Defer] Posture CSRF des routes mutantes (cookie de session, pas de token visible) [backend] — deferred, pre-existing app-wide (toutes les routes PUT/DELETE existantes)
- [x] [Review][Defer] PUT sur un sujet supprimé concurremment → 200 fantôme (pas de verrouillage optimiste) [backend/controllers/topiccontroller.js] — deferred, pattern app-wide, course rare
- [x] [Review][Defer] Cliquer Edit sur une autre ligne jette les modifications non sauvées sans confirmation [src/pages/MyTopicsPage.tsx] — deferred, pattern maison identique (MyInstrumentsPage)

## Dev Notes

### Intelligence de la story 1.1 (à lire en premier — patterns établis et pièges connus)

**Acquis de la code review 1.1 qui impactent directement la 1.2 :**
- **Contrainte unique `topics_user_uid_name` en base** (décision review) : le RENAME peut violer la contrainte → `updateTopic` DOIT mapper `SequelizeUniqueConstraintError` → 409, exactement comme `createTopic` le fait déjà. Sans ça : 500 en prod sur un rename en doublon. C'est LE piège n°1 de cette story.
- **Validations établies** : name trim + 400 si vide + 400 si > 255 ; category trim + `''` → null + 400 si > 255. `updateTopic` applique les mêmes règles aux champs fournis.
- **Patterns front établis en 1.1** (ne pas régresser) : bandeau d'erreur avec `role="alert"`, `aria-label="Dismiss error"`, variantes `dark:` ; `setError(null)` au début de chaque action ; état `loadFailed` (« Topics could not be loaded. ») ; `maxLength={255}` sur les inputs.
- **Différés assumés (NE PAS « corriger » au passage)** : `loading` partagé qui masque la liste pendant une action (pattern maison, cf. deferred-work.md), pas de nav mobile, 401 session expirée sans redirect. Hors périmètre.
- **Piège dev local connu** : `sequelize.sync()` au boot peut créer les tables avant les migrations — sans objet ici (pas de migration), mais ne pas s'étonner si la table existe déjà.

**État du code (1.1 non commitée)** : tout le travail 1.1 est dans le working tree de la branche `bmad-and-claude` (baseline 9f91cf3). La 1.2 modifie directement ces fichiers non commités — `topiccontroller.js`, `routes/topics.js`, `topicService.ts`, `MyTopicsPage.tsx` et leurs tests existent déjà et sont fonctionnels (backend 14/14, frontend 57/57 verts avant cette story).

### Sémantique FR4 — décision de conception (suppression)

**Hard delete maintenant, dénormalisation du nom à l'Epic 2.** Le `destroy()` est définitif côté `Topics`. La préservation du nom dans l'historique (FR4) sera assurée à l'Epic 2 par contrat : **les futures entrées de session (SessionItem) devront snapshotter le nom du sujet (champ dénormalisé `topicName`), pas seulement sa FK** — ainsi une session passée affiche toujours « Pentatonique » même si le sujet est supprimé, et l'entrée reste reclassable vers un autre sujet (FR4). Ne PAS implémenter de soft delete (`paranoid`) ici : le modèle reste minimal (contrainte PRD), et un sujet supprimé libère son nom (cohérent avec l'unicité par utilisateur). Documenter ce contrat est l'unique obligation FR4 de cette story — le « vérifié de bout en bout » appartient à l'Epic 2.

### Modèle de référence : updateInstrument / deleteInstrument

`backend/controllers/instrumentcontroller.js:52-105` est le squelette exact (401 → findByPk → 404 → ownership 403 → action). Différences voulues pour Topic :
- `updateInstrument` accepte n'importe quelle valeur de `name` ; `updateTopic` NON : name fourni mais vide/blanc → 400 (un sujet sans nom n'existe pas)
- catch du 409 unique en plus (voir ci-dessus)

Côté front, `MyInstrumentsPage.tsx:71-101` (startEdit/cancelEdit/saveEdit) et `:105-114` (ConfirmDialog) sont le squelette exact de l'édition inline et de la suppression.

### Contraintes critiques (project-context.md — rappels actifs pour cette story)

- Backend CommonJS, jamais d'ESM ; erreurs via `createError` + `logger.error` + try/catch → `next(error)`
- **Anti-pattern `getSong` (ne vérifie pas l'ownership) : ne PAS le copier** — `updateTopic`/`deleteTopic` vérifient l'ownership, c'est l'objet même de l'AC 5
- Réponses brutes : entité pour update, `{ message: '...' }` pour delete
- Tests backend : modèles mockés (`jest.mock('../models')`), jamais de DB réelle
- Frontend : `verbatimModuleSyntax` (`import type`), `noUnusedLocals`, Tailwind only, anglais partout (UI + commentaires)
- Pre-commit = les deux suites ; jamais `--no-verify`

### Périmètre — garde-fous

- **PAS de migration** : aucun changement de schéma (uid/user_uid/name/category suffisent)
- **NE PAS toucher** : formulaire chanson, champ `technique` (FR5), formulaire d'ajout de la 1.1, modèle `topic.js`
- **PAS de GET /:uid** : inutile pour cette story (la liste suffit), et ça éviterait de devoir trancher le cas getSong
- **PAS de recherche/tri/pagination** : la liste plate `createdAt DESC` de la 1.1 reste telle quelle (les suggestions intelligentes arrivent en 2.5)

### Testing standards

Identiques à la 1.1 (deux suites indépendantes, mocks backend, Testing Library comportementale). Pour le mock : `findByPk` renvoie soit `null` (404), soit `{ userUid: 'user-1'|'user-2', update: jest.fn(), destroy: jest.fn() }` — cf. le pattern `updateSong` dans `songcontroller.test.js:56-80`.

### Project Structure Notes

- Fichiers modifiés (UPDATE uniquement, aucun nouveau fichier) : `backend/controllers/topiccontroller.js`, `backend/routes/topics.js`, `src/services/topicService.ts`, `src/pages/MyTopicsPage.tsx`, `backend/__tests__/topiccontroller.test.js`, `src/__tests__/MyTopicsPage.test.tsx`
- Import à ajouter dans `MyTopicsPage.tsx` : `import { ConfirmDialog } from '../components/ConfirmDialog';` (export nommé)
- Aucun conflit de structure : pure extension des fichiers 1.1

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] — story et ACs
- [Source: _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/prd.md#Groupe A] — FR2, FR4, FR5, NFR4
- [Source: _bmad-output/implementation-artifacts/1-1-creer-un-sujet-de-travail.md] — Dev Agent Record + Review Findings (contrainte unique, validations, patterns front)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — différés à ne pas retraiter ici
- [Source: backend/controllers/instrumentcontroller.js:52-105] — pattern update/delete avec ownership
- [Source: src/pages/MyInstrumentsPage.tsx:71-114] — pattern édition inline + ConfirmDialog
- [Source: src/components/ConfirmDialog.tsx] — props exactes (export nommé, isDangerous)
- [Source: _bmad-output/project-context.md] — règles d'implémentation

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

- TDD : 11 nouveaux tests backend écrits et vus en échec (RED) avant l'implémentation ; idem frontend (erreur de compilation = RED, le service n'avait pas update/remove)
- Suite backend : 25/25 verts (dont 20 topiccontroller) — `cd backend && npm test`
- Suite frontend : 63/63 verts (dont 14 MyTopicsPage) — `npm test`
- Lint : backend 0 erreur ; frontend 8 préexistantes, 0 nouvelle ; build `tsc -b && vite build` OK
- FR5 vérifié : `git diff HEAD --stat` sur SongForm.tsx + songcontroller.js = vide
- Smoke test : PUT/DELETE `/api/topics/:uid` sans session → 401 (authsess actif)

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Intelligence 1.1 intégrée : le piège 409-au-rename (contrainte unique issue de la review 1.1) est documenté comme risque n°1
- Décision FR4 tranchée et documentée : hard delete + contrat de dénormalisation du nom pour l'Epic 2 (pas de soft delete)
- Aucune migration requise — story purement API + UI sur les fichiers 1.1
- `updateTopic`/`deleteTopic` implémentés avec le pattern ownership complet (401 → 404 → 403) ; update partiel (champ absent = inchangé), validations 1.1 réappliquées, `SequelizeUniqueConstraintError` → 409 sur le rename
- Édition inline + ConfirmDialog sur le pattern exact MyInstrumentsPage ; `setError(null)` au début de chaque action (acquis review 1.1)
- Subtilité corrigée en cours de route : en édition, `category` est TOUJOURS envoyée (chaîne vide = effacer) — `undefined` serait omis par JSON.stringify et l'update partiel conserverait l'ancienne catégorie, rendant impossible le « dé-catégorisage »
- Périmètre respecté : pas de migration, pas de GET /:uid, formulaire d'ajout et acquis 1.1 intacts, différés non retraités

### File List

**Modifiés (aucun nouveau fichier) :**
- backend/controllers/topiccontroller.js (+ updateTopic, deleteTopic)
- backend/routes/topics.js (+ PUT /:uid, DELETE /:uid)
- backend/__tests__/topiccontroller.test.js (+ 11 tests : update ×7, delete ×4)
- src/services/topicService.ts (+ UpdateTopicDTO, update, remove)
- src/pages/MyTopicsPage.tsx (+ édition inline, suppression avec ConfirmDialog, colonne Actions)
- src/__tests__/MyTopicsPage.test.tsx (+ 6 tests : edit ×4, delete ×2)

## Change Log

- 2026-06-07 : Story 1.2 implémentée (update/delete avec ownership, 409 au rename, édition inline + ConfirmDialog) — statut → review
- 2026-06-07 : Code review adversariale (3 couches) — 7 patches appliqués (UUID malformé → 404, dialog protégé contre le double-submit, category non-string → 400, a11y boutons par ligne + dialog nommant le sujet, setList fonctionnels, dark: sur Delete, contrat FR4 dans deferred-work.md), 4 différés tracés, 1 écarté. Tests backend 29, frontend 63, tous verts. Statut → done
