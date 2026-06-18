---
baseline_commit: 28d51b7
arch_decision: "Free practice = topic SEEDÉ en base (vraie ligne Topics par user, marquée système), tranché 2026-06-18 — cf. Dev Notes › Décision d'architecture"
---

# Story 8.2: Topic système « Free practice » épinglé + création de topic à la volée

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui veut tout logger en entrée,
I want un topic « Free practice » toujours disponible et pouvoir créer un topic à la volée depuis le sélecteur d'entrée,
so that logguer du temps de pratique non structuré reste rapide (< 30 s, NFR1) sans devoir d'abord créer un topic.

## Acceptance Criteria

### Free practice — topic système épinglé (FR25)

1. **Fourni d'office** — Given un utilisateur (existant après migration, ou nouvellement inscrit), Then il possède exactement **un** topic système nommé `Free practice` (marqué système, `isSystem = true`) dans sa liste de topics — sans avoir eu à le créer.
2. **Épinglé en tête du sélecteur** — Given le sélecteur d'entrée d'une session (`EntryRefPicker`), When la liste de suggestions s'ouvre **sans recherche en cours**, Then `Free practice` apparaît **en première position du groupe Topics** (avant les topics de l'utilisateur, qui restent triés comme aujourd'hui).
3. **Sélectionnable comme un topic normal** — Given `Free practice` dans la liste, When je le sélectionne, Then l'entrée prend `ref = 'topic:<uid réel>'` (l'uid de la vraie ligne `Topics`) — exactement comme un topic ordinaire (aucun `ref` virtuel, aucun cas particulier en aval).
4. **Recherchable** — Given une recherche dont le texte matche « free » ou « practice », When je filtre, Then `Free practice` reste affiché (il passe par le même `filterOptions` que les autres).

### Protection du topic système

5. **Non supprimable (backend)** — Given une requête `DELETE /api/topics/:uid` ciblant un topic dont `isSystem = true`, Then le serveur répond **403** et le topic n'est **pas** supprimé.
6. **Non renommable (backend)** — Given une requête `PUT /api/topics/:uid` ciblant un topic dont `isSystem = true`, Then le serveur répond **403** et le topic est inchangé.
7. **Non éditable (UI MyTopicsPage)** — Given la page de gestion des topics (`MyTopicsPage`), When la liste s'affiche, Then la ligne `Free practice` n'expose **ni** action « Edit » **ni** action « Delete » (les autres topics les conservent).

### Création de topic à la volée (FR26)

8. **Proposer la création quand rien ne matche** — Given le sélecteur d'entrée avec une recherche **non vide**, When **aucun topic existant ne correspond exactement** au texte saisi (comparaison via `foldForSearch`), Then une option **« Create topic "&lt;texte&gt;" »** apparaît (au bas de la liste, dans son propre groupe).
9. **Créer + sélectionner sans quitter le formulaire** — Given l'option « Create topic "…" » affichée, When je la choisis, Then le topic est créé via `POST /api/topics`, **ajouté à l'état `topics`** de la page, et **immédiatement sélectionné** pour l'entrée courante (`ref = 'topic:<uid>'`) — **sans** fermer ni soumettre le formulaire de session.
10. **Doublon géré (409)** — Given une recherche qui correspond (à la casse/accents près) à un topic existant, When je tente la création (ou que le serveur renvoie 409), Then aucun doublon n'est créé : le topic **existant** est sélectionné à la place (pas d'erreur bloquante affichée).
11. **Pas de création vide** — Given une recherche vide ou réduite à des espaces, Then l'option « Create topic » **n'apparaît pas**.

### Non-régression

12. **Aucune régression du sélecteur** — Given les comportements existants d'`EntryRefPicker` (groupes Recent/Songs/Topics, navigation clavier ↑/↓/Entrée/Échap, `onMouseDown` avant blur, pré-remplissage des minutes de 8.1), Then ils restent intacts ; la nouvelle option « Create topic » est navigable au clavier comme les autres (elle a un `idx` dans le compteur).
13. **Auto-remplissage 8.1 préservé** — Given je sélectionne `Free practice` ou un topic créé à la volée, Then **aucun** pré-remplissage de minutes (les topics n'ont pas de durée) — conforme à l'AC5 de la story 8.1.

## Tasks / Subtasks

### Backend — modèle & migrations (AC1, AC5, AC6)

- [x] **Modèle** `backend/models/topic.js` : ajouter le champ `isSystem` (`DataTypes.BOOLEAN`, `allowNull: false`, `defaultValue: false`, `field: 'is_system'`) — convention camelCase JS + snake_case DB (pattern `Songs`).
- [x] **Migration — colonne** `backend/migrations/<timestamp>-add-is-system-to-topics.js` : `addColumn('Topics', 'is_system', { type BOOLEAN, allowNull:false, defaultValue:false })`. **Idempotente** : `const desc = await queryInterface.describeTable('Topics'); if (!desc.is_system) { ... }` (cf. project-context.md).
- [x] **Migration — backfill** (même fichier, après l'ajout de colonne, ou fichier `<timestamp+1>-seed-free-practice-topic.js`) : pour **chaque user existant**, garantir un topic `Free practice` système. Utiliser un `findOrCreate`-équivalent en SQL brut idempotent : pour chaque `user_uid` de `Users`, si aucune ligne `Topics(user_uid, name='Free practice')` n'existe → l'insérer avec `is_system = true` ; sinon → `UPDATE ... SET is_system = true` sur la ligne existante (gère le cas où un user aurait déjà un topic nommé ainsi). Respecter la contrainte unique `(user_uid, name)`.
- [x] **Constante partagée backend** : définir `FREE_PRACTICE_NAME = 'Free practice'` (ex. dans un petit module `backend/constants/topics.js` ou en tête du `topiccontroller`) et la réutiliser dans le hook d'inscription + la migration backfill (pas de littéral dupliqué).

### Backend — seed à l'inscription (AC1)

- [x] **`backend/controllers/usercontroller.js`** (`createUser`, ~ligne 12) : après `User.create(...)` et **avant** la réponse, créer le topic système via `Topic.findOrCreate({ where: { userUid: newUser.uid, name: FREE_PRACTICE_NAME }, defaults: { isSystem: true, category: null } })` puis s'assurer `isSystem === true`. Importer `Topic` depuis `../models`. En cas d'échec de cette étape, **logger** sans faire échouer l'inscription (le backfill/idempotence rattrapera ; l'inscription ne doit pas casser pour ça).

### Backend — protection du topic système (AC5, AC6)

- [x] **`backend/controllers/topiccontroller.js`** :
  - `deleteTopic` : après le check d'ownership (`topic.userUid !== userId → 403`), ajouter `if (topic.isSystem) return next(createError(403, 'Cannot delete the system topic'));` **avant** `topic.destroy()`.
  - `updateTopic` : idem, ajouter `if (topic.isSystem) return next(createError(403, 'Cannot edit the system topic'));` avant l'`update`.
  - `createTopic` : ne **jamais** lire `isSystem` depuis `req.body` (déjà le cas — ne lit que `name`/`category`) ; un nouveau topic est donc toujours `isSystem:false` (default). Vérifier qu'un user ne peut pas recréer « Free practice » → la contrainte unique `(user_uid, name)` renvoie déjà **409** (comportement existant, OK).

### Frontend — service & types (AC3, AC9)

- [x] **`src/services/topicService.ts`** : ajouter `isSystem?: boolean` au type `Topic`. (`CreateTopicDTO`/`UpdateTopicDTO` n'incluent pas `isSystem` — pas de changement, le champ n'est jamais envoyé par le client.)

### Frontend — sélecteur d'entrée (AC2, AC4, AC8–AC13)

- [x] **`src/pages/MySessionsPage.tsx` › `EntryRefPicker`** :
  - **Épinglage (AC2/AC4)** : dans le groupe `Topics`, trier le topic système (`t.isSystem`) en première position **avant** `filterOptions`. Ex. `const sortedTopics = [...topics].sort((a, b) => Number(b.isSystem ?? false) - Number(a.isSystem ?? false));` puis mapper `sortedTopics`. (Le tri actuel des topics utilisateur est conservé pour le reste.)
  - **Option « Create topic » (AC8/AC11)** : construire un nouveau groupe `Create` ajouté **en dernier** des `groups`, présent uniquement si `searching && searchText.trim() !== ''` **et** qu'aucun topic existant n'a un label dont `foldForSearch(label) === query` (pas de match exact). Cette option porte une `value` sentinelle distincte (ex. `'create:<texte brut>'`) et un `label` `Create topic "<texte>"`. Elle doit recevoir un `idx` dans le compteur (navigation clavier, AC12).
  - **Handler `pick` (AC9/AC10)** : si `option.value` commence par `create:` → appeler une callback parent `onCreate(rawText)` (nouvelle prop) au lieu de `onPick`. Sinon, comportement inchangé. Réinitialiser `searching/searchText/active/open` comme aujourd'hui.
- [x] **`MySessionsPage` (parent)** : implémenter `onCreate={rawText => handleCreateTopic(entry.key, rawText)}` passé à `EntryRefPicker` (à côté du `onPick` existant ~ligne 705-720). `handleCreateTopic` :
  1. `const name = rawText.trim();` (garde AC11 — déjà filtré côté picker, double-check).
  2. `try { const created = await topicService.create({ name }); setTopics(prev => [created, ...prev]); updateEntry(key, { ref: \`topic:${created.uid}\` }); }`
  3. `catch` 409 « Topic already exists » (AC10) → retrouver le topic existant par nom (`topics.find(t => foldForSearch(t.name) === foldForSearch(name))`) et le sélectionner s'il est présent ; sinon recharger la liste via `topicService.getAll()` puis sélectionner. Ne pas afficher d'erreur bloquante.
  4. autres erreurs → toast d'erreur léger (pattern `setToastMessage` + `setTimeout(2500)` existant), sans casser le formulaire.

### Frontend — page de gestion des topics (AC7)

- [x] **`src/pages/MyTopicsPage.tsx`** : pour une ligne dont `item.isSystem` est vrai, **ne pas rendre** les boutons « Edit » et « Delete » (les remplacer par un libellé discret type « System » ou rien). Garder les actions pour les topics normaux. (Défense en profondeur : le backend bloque déjà, AC5/AC6.)

### Tests

- [x] **Backend `backend/__tests__/topiccontroller.test.js`** : `deleteTopic` sur un topic `isSystem:true` → `next(403)`, `destroy` non appelé ; `updateTopic` sur `isSystem:true` → `next(403)`, `update` non appelé. (Mock `Topic.findByPk` renvoyant `{ userUid:'user-1', isSystem:true, destroy, update }`.)
- [x] **Backend `backend/__tests__/usercontroller.test.js`** (créer si absent, sinon étendre) : `createUser` appelle `Topic.findOrCreate` avec `name:'Free practice'` pour le nouvel user (mock `Topic.findOrCreate`). Vérifier que l'inscription réussit même si le seed échoue (findOrCreate rejette → réponse 201 quand même).
- [x] **Frontend `src/__tests__/MySessionsPage.test.tsx`** : (a) `Free practice` (mock topic `isSystem:true`) apparaît en tête du groupe Topics à l'ouverture ; (b) taper un nom inexistant fait apparaître « Create topic "…" », le choisir appelle `topicService.create` puis sélectionne le ref `topic:<uid>` retourné ; (c) sélectionner `Free practice` ne pré-remplit pas les minutes (régression 8.1). Mocker `topicService.create`.
- [x] **Frontend `src/__tests__/MyTopicsPage.test.tsx`** : la ligne système (`isSystem:true`) n'affiche pas Edit/Delete ; une ligne normale les affiche.

## Dev Notes

### Contexte & pourquoi
Phase B de l'Epic 8 (« tout est entrée », cf. `sprint-change-proposal-2026-06-18.md`). Objectif produit : pouvoir logger du **temps non structuré** (« j'ai juste joué ») comme une entrée ordinaire, sur un topic `Free practice` toujours là, et créer un topic sans quitter le formulaire. **Prérequis de la story 8.3** (qui supprime la durée globale : il faut que « tout » soit logguable en entrée avant de retirer la saisie de durée). Périmètre **moyen** : touche modèle + migration + 2 contrôleurs backend + 2 pages frontend.

### Décision d'architecture — Free practice = topic SEEDÉ (tranché 2026-06-18)
Le change proposal laissait ouvert : **seedé** (vraie ligne `Topics` par user) vs **virtuel** (sentinelle hors base). → **Seedé**, décision confirmée. Raison décisive :

- `SessionItem.topicUid` est un **vrai FK** vers `Topics` (`backend/models/sessionitem.js:31-40`, `onDelete: 'SET NULL'`), établi par la story 5-7. Un topic **virtuel** n'aurait **aucune ligne** à référencer → il faudrait soit stocker `topicUid = null` + label seul (l'entrée deviendrait indistinguable d'un **orphelin FR4** de topic supprimé), soit **desserrer le FK** (régression directe de 5-7).
- Avec un topic **seedé**, `topicUid` pointe une vraie ligne → **zéro cas particulier** : agrégation/heatmap de 8.3 (`SUM(SessionItem.minutes) GROUP BY day`), `recentRefs`, snapshot `label` (FR4) fonctionnent **nativement** comme pour n'importe quel topic.
- Coût accepté (faible, beta 3-4 users) : colonne `is_system`, seed à l'inscription, migration backfill, gardes anti-delete/rename, épinglage UI.

### Fichiers à toucher
**Backend (UPDATE) :**
- `backend/models/topic.js` — ajout champ `isSystem` (field `is_system`). Le modèle a déjà l'index unique `(user_uid, name)` (`topics_user_uid_name`) → garantit un seul « Free practice » par user.
- `backend/controllers/topiccontroller.js` — gardes système dans `deleteTopic` (l.122) et `updateTopic` (l.66). Le pattern d'ownership existant (`401 → findByPk → 404 → userUid !== userId → 403`) est à **conserver** ; la garde `isSystem` s'insère **après** le 403 d'ownership.
- `backend/controllers/usercontroller.js` — `createUser` (l.7-39) : seed du topic après `User.create`, avant la réponse 201. La fonction crée déjà une session + JWT ; insérer le seed entre `User.create` et le `res.status(201)`.

**Backend (NEW) :**
- `backend/migrations/<ts>-add-is-system-to-topics.js` (+ backfill). Migrations via sequelize-cli (`.sequelizerc`), pattern d'idempotence **obligatoire** (`describeTable`). Toute migration mergée part en prod → tester localement (`make migrate`).
- éventuellement `backend/constants/topics.js` pour `FREE_PRACTICE_NAME`.

**Frontend (UPDATE) :**
- `src/services/topicService.ts` — `isSystem?: boolean` sur le type `Topic`.
- `src/pages/MySessionsPage.tsx` — `EntryRefPicker` (l.31-161 : épinglage + groupe « Create » + branche `create:` dans `pick`) ; parent (l.705-720 : nouvelle prop `onCreate` + `handleCreateTopic`).
- `src/pages/MyTopicsPage.tsx` — masquer Edit/Delete sur la ligne système (map l.186+).

### État actuel d'`EntryRefPicker` (à préserver — lire avant de coder)
- `value: '' | 'song:<uid>' | 'topic:<uid>'`. Les groupes sont **`Recent`, `Songs`, `Topics`** dans cet ordre, vides retirés, chaque option reçoit un `idx` via un compteur **partagé** (navigation clavier robuste). `flat = groups.flatMap(...)`.
- `filterOptions(opts)` = filtre par `foldForSearch(label).includes(query)` quand une recherche est en cours.
- `pick(option)` : `onPick(option.value)` + reset (`searching/searchText/active/open`). Les boutons utilisent **`onMouseDown` (pas `onClick`)** pour tirer **avant** le blur de l'input — **reproduire** ce détail pour l'option « Create ».
- Clavier : ↑/↓ bornés sur `flat.length`, Entrée **n'envoie jamais** le formulaire (elle `pick` l'option active), Échap ferme. La nouvelle option « Create » doit être dans `flat` (donc avoir un `idx`) pour être navigable.
- **8.1** : le pré-remplissage des minutes est dans le `onPick` **parent** (~l.715), uniquement pour `ref.startsWith('song:')` et `entry.minutes === ''`. Un `ref` de topic n'y déclenche rien → AC13 respecté **sans** changement de cette logique.

### Ce qui doit être préservé (ne pas casser)
- **FK `SessionItem.topicUid` → `Topics`** (`SET NULL`) : ne pas le toucher. Le topic système est une ligne ordinaire pour ce FK.
- L'index unique `topics_user_uid_name` : le seed et le backfill doivent passer par `findOrCreate` (ou garde d'existence) pour ne pas violer l'unicité ni planter sur re-exécution.
- Le contrat de réponse topics : entité JSON brute (pas d'enveloppe). `isSystem` s'ajoute simplement au JSON (`Topic` n'a pas de `defaultScope` masquant des champs).
- Le `recentRefs` (l.323-349) résout les labels depuis les catalogues courants et **exclut les refs absents** — un topic créé à la volée n'apparaîtra en « Recent » qu'après avoir été loggé puis rechargé ; comportement normal, ne pas sur-ingénier.
- **Calage/plancher de session** (commits `380e8c4`/`cbd6676`) : encore présent, retiré en **8.3** — ne pas y toucher ici.

### Conventions (cf. project-context.md)
- Backend **JS CommonJS** (`require`/`module.exports`), **pas** de `.ts`, pas d'ESM. Contrôleurs : try/catch → `next(createError(...))`. `http-errors` pour les codes.
- Modèles : camelCase JS + `field: 'snake_case'` (pattern `Songs`) → `isSystem`/`is_system`.
- Migration **idempotente** obligatoire (`describeTable`/garde d'existence) — part en prod via release-migrate puis `sync({alter:false})`.
- Frontend **TS strict** + `verbatimModuleSyntax` (imports de **types** via `import type`), pas d'alias de paths, imports relatifs. **Tout en anglais** (UI + commentaires), y compris les libellés « Create topic… », « Free practice », « System ».
- Tailwind only, dark mode `dark:` sur chaque élément stylé ; réutiliser les couleurs `brand/...`. Toasts : `setToastMessage` + `setTimeout(2500)` (pas de lib). Confirmations destructives : `ConfirmDialog` (déjà utilisé dans `MyTopicsPage`).
- Deux suites Jest **indépendantes** : front (`npm test` racine, jsdom, Testing Library) et back (`cd backend && npm test`, node, **modèles mockés** via `jest.mock('../models')`). Le hook pre-commit lance les deux — **jamais** `--no-verify`.

### Garde-fous workflow
- **Jamais** sur `main` : créer une branche (`feat/free-practice-topic-inline-create` ou similaire). Tout merge sur `main` **déploie en prod** (pas de staging) — `main` doit rester déployable, migration testée localement avant.
- Commits Conventional (`feat(topics): ...`, `feat(sessions): ...`, `fix(migrations): ...`).

### Project Structure Notes
- Pas de seeders sequelize en place (`backend/seeders/` absent) → le backfill se fait **dans une migration** (cohérent avec `20260611000100-backfill-playlist-songs.js`, précédent de backfill existant à imiter).
- `usercontroller.js` n'a **pas** de test dédié aujourd'hui (`backend/__tests__/` n'a pas de `usercontroller.test.js`) → en créer un minimal pour AC1, en suivant le pattern de `topiccontroller.test.js` (mock `../models`, `mockRes/mockNext`).

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-18.md] — Phase B, FR25/FR26, décision seedé-vs-virtuel à trancher
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8 / Story 8.2 (l.542-557)] — énoncé + AC esquissés
- [Source: _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/prd.md] — FR25 (topic système épinglé), FR26 (création à la volée)
- [Source: backend/models/sessionitem.js:31-40] — `topicUid` est un **vrai FK** vers `Topics` (fondement de la décision seedé)
- [Source: backend/models/topic.js] — modèle Topic, index unique `(user_uid, name)`
- [Source: backend/controllers/topiccontroller.js] — pattern ownership + create/update/delete à garder ; ajouter gardes `isSystem`
- [Source: backend/controllers/usercontroller.js:7-45] — `createUser`, point d'insertion du seed
- [Source: backend/migrations/20260611000100-backfill-playlist-songs.js] — précédent de migration de backfill idempotent à imiter
- [Source: src/pages/MySessionsPage.tsx:31-161] — `EntryRefPicker` (groupes, filtre, pick, clavier)
- [Source: src/pages/MySessionsPage.tsx:705-720] — usage du picker + `onPick` (pré-remplissage 8.1)
- [Source: src/pages/MyTopicsPage.tsx] — gestion des topics (Edit/Delete via `ConfirmDialog`)
- [Source: src/services/topicService.ts] — type `Topic`, `create` (gère déjà le 409)
- [Source: _bmad-output/implementation-artifacts/8-1-auto-remplissage-minutes-entree-depuis-duree-chanson.md] — story sœur (Phase A), comportement minutes à ne pas régresser
- [Source: _bmad-output/project-context.md] — règles backend/frontend, migrations idempotentes, conventions de tests

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow)

### Debug Log References

- Migration exécutée localement : `make migrate` → `20260618000000-add-is-system-to-topics: migrated (0.014s)`.
- Vérif DB (4 users) : 4 topics `Free practice` système, 0 doublon ; colonne `is_system boolean NOT NULL default false`.
- Idempotence backfill : ré-exécution de l'`INSERT … ON CONFLICT (user_uid, name) DO UPDATE` → `INSERT 0 4`, total inchangé (4).
- Suites de tests : front `npm test` 230/230 ✓ ; back `npm test` 145/145 ✓ ; `tsc -b` + `eslint` propres.

### Completion Notes List

- **AC1 (fourni d'office)** : seed à l'inscription via `Topic.findOrCreate` (best-effort, n'échoue jamais l'inscription) + backfill migration idempotent (`INSERT … SELECT FROM Users … ON CONFLICT (user_uid, name) DO UPDATE SET is_system = true`) pour les users existants. Constante partagée `backend/constants/topics.js` (`FREE_PRACTICE_NAME`).
- **AC2/AC4 (épinglage + recherche)** : `EntryRefPicker` trie le topic système en tête (`sortedTopics`) **avant** `filterOptions`, donc il reste recherchable via le même filtre.
- **AC3 (vrai ref)** : aucune sentinelle — `Free practice` est une vraie ligne `Topics`, sélection → `ref = 'topic:<uid>'` comme un topic ordinaire.
- **AC5/AC6 (protection backend)** : gardes `if (topic.isSystem) → 403` insérées **après** le 403 d'ownership dans `deleteTopic`/`updateTopic`. `createTopic` ne lit jamais `isSystem` (default false).
- **AC7 (UI)** : `MyTopicsPage` rend un badge « System » au lieu d'Edit/Delete pour `item.isSystem`.
- **AC8–AC11 (création à la volée)** : groupe `Create` ajouté en dernier, présent seulement si `searching && rawText !== '' && !hasExactTopic` (fold-match). Valeur sentinelle `create:<texte>`, navigable au clavier (idx dans le compteur). `pick` route vers `onCreate` → `handleCreateTopic` (create + `setTopics` + sélection, sans soumettre). 409 → sélectionne l'existant (state, sinon reload `getAll`), pas d'erreur bloquante.
- **AC12/AC13 (non-régression)** : `onMouseDown` reproduit pour l'option Create ; le pré-remplissage minutes 8.1 (parent, branché sur `ref.startsWith('song:')`) est inchangé → un topic ne déclenche rien.
- Migration : pattern d'idempotence `describeTable` pour la colonne ; `down` supprime les lignes système `Free practice` puis la colonne.

### Code review — corrections appliquées (2026-06-18)
Revue multi-angles post-implémentation. Corrigé directement :
- Branche morte dans le handler 409 de `handleCreateTopic` retirée (le `topics.find` initial était toujours `undefined` vu la garde `hasExactTopic` du picker) → 409 ⇒ rechargement direct via `getAll`.
- `CreateTopicDTO`/`UpdateTopicDTO` excluent désormais `isSystem` (`Omit<… | 'isSystem' | …>`) — le type reflète l'invariant « champ serveur, jamais envoyé par le client ».
- Tri d'épinglage hissé dans le parent (`pinnedTopics` mémoïsé) au lieu d'être recalculé dans chaque `EntryRefPicker` à chaque rendu.
- Commentaire du seed `usercontroller` corrigé : pas d'auto-réparation sur le read-path (le backfill ne rattrape pas un inscrit postérieur).

### Suivi à planifier (hors périmètre 8.2)
- **Unicité de topic insensible à la casse/accents (gap AC10).** Le dédoublonnage « à la casse/accents près » est garanti côté client (`foldForSearch`), mais l'index unique `(user_uid, name)` et `createTopic` sont sensibles à la casse/accents. Avec un catalogue client périmé, créer une variante de casse différente d'un topic existant passe le 409 et crée un vrai doublon. Correctif propre = normalisation serveur + index unique `citext`/`LOWER()` — touche aussi la feature topics existante ⇒ lot dédié (pré-existant, non régressé par 8.2).

### File List

**Backend (NEW)**
- `backend/constants/topics.js` — constante `FREE_PRACTICE_NAME`
- `backend/migrations/20260618000000-add-is-system-to-topics.js` — colonne `is_system` + backfill idempotent
- `backend/__tests__/usercontroller.test.js` — tests du seed à l'inscription

**Backend (UPDATE)**
- `backend/models/topic.js` — champ `isSystem` (`field: 'is_system'`)
- `backend/controllers/usercontroller.js` — seed `Free practice` après `User.create` (best-effort)
- `backend/controllers/topiccontroller.js` — gardes `isSystem` (403) dans `updateTopic`/`deleteTopic`
- `backend/__tests__/topiccontroller.test.js` — tests 403 système (update/delete)

**Frontend (UPDATE)**
- `src/services/topicService.ts` — `isSystem?: boolean` sur le type `Topic`
- `src/pages/MySessionsPage.tsx` — `EntryRefPicker` (épinglage + groupe Create + branche `create:`) + `handleCreateTopic` parent + prop `onCreate`
- `src/pages/MyTopicsPage.tsx` — badge « System » au lieu d'Edit/Delete sur la ligne système
- `src/__tests__/MySessionsPage.test.tsx` — tests 8.2 (épinglage, recherche, création, 409, no-prefill)
- `src/__tests__/MyTopicsPage.test.tsx` — test ligne système sans actions

**Docs**
- `CHANGELOG.md` — entrée `[Unreleased]` (Free practice + création à la volée)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — statut 8-2 → review

## Change Log

| Date       | Version | Description                                                                 |
|------------|---------|-----------------------------------------------------------------------------|
| 2026-06-18 | 0.1     | Implémentation story 8.2 — topic système Free practice (seed + backfill + protection) et création de topic à la volée dans le sélecteur d'entrée. 230 tests front / 145 back ✓, migration testée localement. |
