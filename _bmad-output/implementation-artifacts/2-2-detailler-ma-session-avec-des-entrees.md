---
baseline_commit: f85fb5aba05c76c43f8b6d23365e5875beb644ea
---

# Story 2.2: Détailler ma session avec des entrées

Status: done

## Story

As a musicien,
I want ajouter à ma session des entrées — chansons de mon répertoire ou sujets de ma bibliothèque — avec minutes et note contextuelle,
so that je sais précisément ce que j'ai travaillé, et avec quel ressenti.

## Acceptance Criteria

1. **Entrée chanson OU sujet** — Given une session en cours de création, When j'ajoute une entrée, Then je choisis une chanson de mon répertoire **ou** un sujet de ma bibliothèque (FR8), And je peux préciser des minutes optionnelles et une note libre optionnelle (« at 30 BPM ») (FR8).
2. **Durée pré-calculée surchargeable** — Given une session avec entrées « Sweet Child (15 min) » et « Pentatonique (25 min) », When toutes les entrées portent des minutes, Then la durée totale est pré-calculée à 40 min, et je peux la surcharger (FR13).
3. **Zéro entrée valide** — Given une session sans aucune entrée, When je valide, Then elle est acceptée (FR8).
4. **Migration idempotente** — Given la migration de la table des entrées, When elle s'exécute, Then elle est idempotente (NFR5).

## Tasks / Subtasks

- [x] Task 1 : Migration `SessionItems` (AC: 4)
  - [x] Créer `backend/migrations/20260607200000-create-session-items.js` — table `SessionItems` : `uid` UUID PK default UUIDV4, `session_uid` UUID NOT NULL FK → `PracticeSessions.uid` **ON DELETE CASCADE** (supprimer une session supprime ses entrées), `song_uid` UUID NULL FK → `Songs.uid` **ON DELETE SET NULL**, `topic_uid` UUID NULL FK → `Topics.uid` **ON DELETE SET NULL**, `label` STRING NOT NULL (snapshot du titre/nom — cœur du contrat FR4), `minutes` INTEGER NULL, `note` TEXT NULL, `createdAt`/`updatedAt` camelCase (pattern maison)
  - [x] PAS de contrainte CHECK « exactement une réf » en DB : après un SET NULL (chanson/sujet supprimé), une entrée peut légitimement n'avoir AUCUNE réf — c'est l'orphelin FR4 qui continue d'afficher son `label`. L'exclusivité est validée à l'API uniquement
  - [x] Gardes d'idempotence pattern maison (table via `showAllTables`, index `session_items_session_uid` sur `['session_uid']` via garde `showIndex` individuelle HORS de la garde de table — auto-réparation sync-race)
  - [x] `down` : `dropTable('SessionItems')`
  - [x] Tester localement 2× + scénario sync-race (drop index + delete meta + re-migrate)
- [x] Task 2 : Modèle `SessionItem` + associations (AC: 1)
  - [x] Créer `backend/models/sessionitem.js` (pattern `practicesession.js`) : `uid`, `sessionUid` (field `'session_uid'`), `songUid` (field `'song_uid'`, NULL), `topicUid` (field `'topic_uid'`, NULL), `label` STRING NOT NULL, `minutes` INTEGER NULL, `note` TEXT NULL ; `{ tableName: 'SessionItems', timestamps: true, indexes: [{ fields: ['session_uid'], name: 'session_items_session_uid' }] }`
  - [x] Associations : `SessionItem.belongsTo(models.PracticeSession, { foreignKey: 'sessionUid' })`, `SessionItem.belongsTo(models.Song, { foreignKey: 'songUid' })`, `SessionItem.belongsTo(models.Topic, { foreignKey: 'topicUid' })` ; ET dans `practicesession.js` : `PracticeSession.hasMany(models.SessionItem, { foreignKey: 'sessionUid', as: 'items' })`
- [x] Task 3 : Étendre `createPracticeSession` — items + transaction (AC: 1, 3)
  - [x] `backend/controllers/practicesessioncontroller.js` : accepter un champ optionnel `items` (array). Validation AVANT toute création :
    - `items` absent / `[]` → session sans entrée, valide (AC 3) ; `items` non-array → 400 `'Items must be an array'` ; > 50 items → 400 `'Too many items'`
    - Chaque item : **exactement un** de `songUid`/`topicUid` (les deux → 400 `'Each item must reference a song or a topic, not both'` ; aucun → 400 `'Each item must reference a song or a topic'`) ; uid au format UUID (réutiliser le pattern `UUID_PATTERN` de `topiccontroller.js`) sinon 400 `'Invalid entry reference'`
    - `minutes` : optionnel, entier 1-1440 sinon 400 (mêmes règles que la durée de session) ; `note` : optionnelle, string ≤ 1000, trim → null si vide, rejet des octets nuls (`\u0000`) — mêmes gardes que la 2.1
  - [x] **NFR4 — ownership des références (CRITIQUE)** : pour chaque item, résoudre la réf avec `Song.findOne({ where: { uid: songUid, userUid: userId } })` / `Topic.findOne({ where: { uid: topicUid, userUid: userId } })` → introuvable (inexistant OU à un autre utilisateur) → 400 `'Invalid entry reference'` (pas d'oracle 403/404). JAMAIS de findByPk nu : un user ne doit pas pouvoir attacher la chanson d'un autre
  - [x] **Snapshot FR4** : `label` = `song.title` ou `topic.name` résolu CÔTÉ SERVEUR au moment de l'ajout — jamais fourni par le client
  - [x] **Transaction** : `const { sequelize } = require('../models')` → `sequelize.transaction(async (t) => { create session ; create items ({ transaction: t }) })` — toutes les validations et résolutions AVANT d'ouvrir la transaction ; réponse 201 = `{ ...session.toJSON(), items: [...] }`
  - [x] Ne PAS toucher aux validations 2.1 existantes (date/instrument/durée/note) ni à la route (POST seul)
- [x] Task 4 : Service frontend (AC: 1)
  - [x] `src/services/practiceSessionService.ts` : ajouter les types `SessionItem` (`uid`, `sessionUid`, `songUid?: string | null`, `topicUid?: string | null`, `label`, `minutes?: number | null`, `note?: string | null`) et `CreateSessionItemDTO` (`songUid?` | `topicUid?`, `minutes?`, `note?` — PAS de label : snapshot serveur) ; étendre `CreatePracticeSessionDTO` avec `items?: CreateSessionItemDTO[]` et `PracticeSession` avec `items?: SessionItem[]`
- [x] Task 5 : Page — constructeur d'entrées + FR13 (AC: 1, 2, 3)
  - [x] `src/pages/MySessionsPage.tsx` : charger chansons (`songService.getAllSongs()`) et sujets (`topicService.getAll()`) au mount (en parallèle, `Promise.all`) ; en cas d'échec de chargement, le formulaire reste utilisable SANS entrées (bandeau d'erreur, pattern 1.1)
  - [x] Bouton « Add entry » → ligne d'entrée : `<select>` labellisé (« Entry 1 », aria) avec DEUX `<optgroup>` « Songs » / « Topics » (values préfixées `song:<uid>` / `topic:<uid>` pour désambiguïser), input `Minutes` (number, min 1, max 1440, optionnel), input `Note` (text, maxLength 1000, optionnel, placeholder « e.g. at 30 BPM »), bouton « Remove » avec `aria-label={'Remove entry ' + (i + 1)}`
  - [x] État local : `items: { key, ref, minutes, note }[]` (key stable généré par compteur/`crypto.randomUUID()` pour les React keys — PAS l'index) ; updates par fonctions (`setItems(prev => ...)`, acquis 1.2)
  - [x] **FR13** : si `items.length > 0` ET toutes les entrées ont des minutes ET l'utilisateur n'a PAS touché manuellement la durée (`durationTouched`), le champ Duration affiche la somme automatiquement ; toute saisie manuelle dans Duration fixe `durationTouched = true` et gèle l'auto-calcul ; vider le champ Duration ré-active l'auto-calcul (`durationTouched = false`)
  - [x] Submit : entrées sans sélection ignorées ; payload `items: [{ songUid | topicUid, minutes?, note? }]` (durée d'entrée `''` → undefined, `'0'` envoyé tel quel — acquis 2.1) ; zéro entrée = payload sans items (AC 3) ; reset des entrées après succès (avec durée/note, date+instrument conservés)
  - [x] Standards : labels réels, dark mode, responsive, anglais — préserver TOUS les acquis 2.1 (toast live region toujours montée + timer ref, today recalculé au submit, messages 400 surfacés, min/max date)
- [x] Task 6 : Tests backend (AC: 1, 3, 4)
  - [x] Étendre `backend/__tests__/practicesessioncontroller.test.js` — mock enrichi : `PracticeSession.create`, `SessionItem.create` (ou `bulkCreate`), `Song.findOne`, `Topic.findOne`, `sequelize.transaction: jest.fn(async (cb) => cb({}))`. Cas : 201 avec 2 items (song + topic) → labels snapshotés depuis les entités résolues, `sessionUid` propagé ; 201 zéro items ; 400 item avec les deux réfs / aucune réf / uuid invalide ; 400 réf d'un autre user (`findOne` → null) ; 400 minutes invalides (0, 1.5, 'abc', 1441) ; 400 note > 1000 ou octet nul ; AUCUNE création de session si un item est invalide (validations avant transaction) ; régression : tous les cas 2.1 inchangés
- [x] Task 7 : Tests frontend (AC: 1, 2, 3)
  - [x] Étendre `src/__tests__/MySessionsPage.test.tsx` — mocker AUSSI `songService` et `topicService`. Cas : « Add entry » affiche le select avec optgroups Songs/Topics ; payload contient `items` corrects (song:/topic: décodés) ; **FR13** : 2 entrées 15+25 min → Duration affiche 40 ; surcharge manuelle (50) conservée malgré modif des entrées ; entrée sans minutes → pas d'auto-calcul ; Remove retire la ligne ; zéro entrée → payload sans items et succès ; les tests 2.1 existants restent verts sans modification
  - [x] ⚠️ Acquis 2.1 : jsdom applique la validation native min/max → utiliser `fireEvent.submit(form)` pour tester les chemins JS contournant les contraintes natives
- [x] Task 8 : Validations finales
  - [x] Les DEUX suites + lint des deux côtés + `npm run build`
  - [x] Migration 2× + sync-race ; smoke : POST avec items sans session → 401
  - [x] Vérifier en local (curl ou UI) : créer une session avec 1 chanson + 1 sujet → `SELECT * FROM "SessionItems"` montre les labels snapshotés

### Review Findings

- [x] [Review][Patch] Lignes d'entrée sans sélection silencieusement jetées au submit (minutes/note saisies perdues) ET comptées dans l'auto-somme → durée incohérente persistée (Med, blind+edge ×2) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] Auto-somme > 1440 auto-remplit une valeur invalide que l'utilisateur n'a jamais saisie (blocage natif sur un champ non touché ou 400 serveur) (Med, blind+edge+auditor) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] TOCTOU : réf supprimée entre la résolution et le bulkCreate → violation FK → 500 au lieu de 400 (blind+edge+auditor) [backend/controllers/practicesessioncontroller.js catch]
- [x] [Review][Patch] N+1 : jusqu'à 50 findOne séquentiels par requête, sans dédoublonnage — à batcher en 2 findAll + Map (Med, edge) [backend/controllers/practicesessioncontroller.js]
- [x] [Review][Patch] badInput ('e', '1e') dans Duration → value '' → ré-arme durationTouched et écrase la surcharge manuelle (edge) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] Promise.all jette le catalogue chargé si l'autre échoue → allSettled pour garder le partiel (edge) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] Pas de contrainte CHECK « pas les deux réfs » — un write hors contrôleur peut persister une ligne ambiguë (les deux-NULL restent légitimes) (edge) [backend/migrations/20260607200000-create-session-items.js]
- [x] [Review][Patch] A11y : bloc Entries sans fieldset/legend (le « Entries » est un span non associé) (blind) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] Trous de tests : assertion `{ transaction }` réellement passé (l'atomicité peut casser sans test rouge), octet nul dans note d'entrée, ré-armement FR13 (blind+auditor) [tests]
- _Écartés (6) : pas de chemin de lecture (= story 2.3, by design) ; label 255 vs sources (Song.title et Topic.name sont des STRING 255, vérifié) ; doublons d'items autorisés (« joué deux fois » plausible — la dédup est une règle du PONT 4.1, pas de la saisie manuelle) ; pas de cap serveur durée vs total items (FR13 = client par design) ; bandeau catalogue effacé au submit (cosmétique) ; noms accessibles positionnels qui glissent à la suppression (inhérent au pattern, impact faible)._

## Dev Notes

### Le contrat FR4 s'exécute ICI (deferred-work.md → cette story)

`deferred-work.md` § « Contrat FR4 pour l'Epic 2 » : les sujets sont en hard delete (1.2) → **chaque entrée snapshotte son `label` côté serveur** (titre de chanson ou nom de sujet) au moment de l'ajout, avec FK `SET NULL`. Résultat : une session passée affiche toujours « Pentatonique » même si le sujet est supprimé, et l'entrée reste reclassable (édition = story 2.4). Même protection étendue aux chansons (suppression de chanson existe dans l'app). Le `label` n'est JAMAIS accepté du client — uniquement résolu en DB (sinon un client pourrait falsifier l'historique).

### Décisions de conception

**1. Deux FK nullables + label, PAS de polymorphisme ni de CHECK.** `song_uid`/`topic_uid` nullables avec vraies FK (intégrité référentielle + SET NULL natif). L'exclusivité « exactement une réf » est une règle d'API (validation), pas de DB : après suppression de la réf, l'entrée orpheline (deux NULL + label) est un état LÉGITIME (FR4).

**2. Items imbriqués dans POST /api/sessions, en transaction.** Pas de sous-ressource `/sessions/:uid/items` dans cette story : le formulaire compose la session entière puis soumet une fois (cohérent avec « saisie < 30 s »). `sequelize.transaction` garantit session + entrées atomiques ; toutes les validations/résolutions d'ownership AVANT la transaction (pas de rollback pour cause de validation). L'édition des entrées d'une session existante = story 2.4.

**3. Ownership des réfs = `findOne({ where: { uid, userUid } })`.** Réf inexistante et réf d'un autre utilisateur → même 400 `'Invalid entry reference'` (pas d'oracle d'énumération — leçon du défer 1.2, appliquée dès la conception ici).

**4. FR13 côté client.** L'auto-somme est une aide de saisie, pas une règle serveur : le serveur stocke `durationMinutes` tel qu'envoyé. Mécanique `durationTouched` : auto tant que l'utilisateur n'a pas touché ; sa saisie gagne toujours ; vider le champ ré-arme l'auto.

**5. Select à optgroups, values préfixées.** `song:<uid>` / `topic:<uid>` dans une seule liste (Songs / Topics) — un seul contrôle, simple. Les suggestions intelligentes et la recherche instantanée = story 2.5, ne PAS les implémenter ici.

### Intelligence 2.1 (tout est frais — réutiliser tel quel)

- **Contrôleur existant** : `practicesessioncontroller.js` créé en 2.1 avec les validations durcies par la review (req.body || {}, borne 1900, octets nuls, messages précis). Cette story l'ÉTEND — ne rien casser, les 16 tests existants doivent rester verts
- **`UUID_PATTERN`** : copier la constante de `topiccontroller.js:6` (garde anti-500 Postgres)
- **Page existante** : `MySessionsPage.tsx` avec toast live-region toujours montée + `toastTimerRef`, `submitToday` recalculé, gestion d'erreur à messages surfacés — préserver intégralement
- **Service** : `practiceSessionService.create` surfac e déjà les messages 400 (`body?.message`) — les nouveaux messages d'items remonteront gratuitement à l'UI
- **Tests jsdom** : la validation native min/max bloque le submit → `fireEvent.submit(form)` pour les chemins JS (découverte review 2.1)
- **🚨 Piège d'outillage (vécu 2×)** : écrire `\u0000` dans du code via les outils d'édition peut produire un octet NUL BRUT dans le fichier (fichier « binaire »). Après toute édition contenant cette séquence : vérifier avec `perl -ne 'exit 1 if /\x00/' <fichier>` et corriger via un remplacement binaire si besoin

### Périmètre — garde-fous

- **NE PAS toucher `Song.lastPlayed` ni `SongPlay`** : ajouter une chanson à une session ne met PAS à jour le « dernier joué » dans cette story — c'est FR23 / story 4.2 (cohérence bidirectionnelle). Zéro logique de ce type ici
- **PAS d'affichage d'historique** (2.3), **PAS d'édition de session existante** (2.4), **PAS de suggestions/recherche/récents** (2.5)
- **PAS de réordonnancement** des entrées (pas de champ position — ordre `createdAt` suffit)
- Limite anti-abus : 50 items max par session (au-delà → 400)

### Testing standards

Identiques 1.x/2.1 : mocks backend complets (y compris `sequelize.transaction` mocké `async (cb) => cb({})`), Testing Library comportemental, vrais UUIDs dans les payloads de test (leçon 1.2), deux suites + pre-commit.

### Project Structure Notes

- Nouveaux : `backend/migrations/20260607200000-create-session-items.js`, `backend/models/sessionitem.js`
- Modifiés (UPDATE) : `backend/models/practicesession.js` (+ hasMany items — ne pas toucher au reste), `backend/controllers/practicesessioncontroller.js` (+ validation/résolution items + transaction — préserver les validations 2.1), `backend/__tests__/practicesessioncontroller.test.js` (+ mocks et cas items), `src/services/practiceSessionService.ts` (+ types items), `src/pages/MySessionsPage.tsx` (+ constructeur d'entrées + FR13), `src/__tests__/MySessionsPage.test.tsx` (+ mocks song/topic services et cas)
- AUCUN changement dans : routes (POST existant), App.tsx, Header.tsx

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2] — story et ACs ; FR8, FR13
- [Source: _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/addendum.md] — modèle Entrée (SessionItem) : réf chanson OU sujet, minutes/note optionnelles
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Contrat FR4] — snapshot du label, FK nullable (OBLIGATOIRE)
- [Source: _bmad-output/implementation-artifacts/2-1-creer-une-session-de-pratique.md] — Dev Agent Record + Review Findings (acquis à préserver)
- [Source: backend/controllers/practicesessioncontroller.js] — contrôleur à étendre (lire ENTIÈREMENT avant)
- [Source: backend/controllers/topiccontroller.js:6] — UUID_PATTERN à réutiliser
- [Source: backend/models/index.js:37] — `db.sequelize` exporté (transaction)
- [Source: src/services/songService.ts:34] — `songService.getAllSongs()` ; [Source: src/services/topicService.ts] — `topicService.getAll()`
- [Source: _bmad-output/project-context.md] — règles d'implémentation

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

- TDD : 7 tests backend items écrits et vus en échec (16 anciens verts), puis 7 tests frontend idem
- Suites complètes : backend 52/52, frontend 80/80 ; lint 0 nouvelle erreur ; build OK
- Migration testée : 2 passages + sync-race (index `session_items_session_uid` auto-recréé)
- Règles FK vérifiées en DB : `session_uid` → CASCADE (`c`), `song_uid`/`topic_uid` → SET NULL (`n`) — contrat FR4 conforme
- Smoke : POST avec items sans session → 401
- Piège NUL-byte (outillage) déclenché une 3ᵉ fois sur `includes('\u0000')` → détecté et corrigé immédiatement (perl check systématique désormais)
- Test frontend : race catalogues-async vs select contrôlé (option absente → fallback `''`) → helper attend les options

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Contrat FR4 (deferred-work.md) intégré comme exigence centrale : label snapshoté serveur + FK SET NULL, étendu aux chansons
- Conception tranchée : items imbriqués dans POST + transaction, ownership des réfs sans oracle, FR13 purement client (durationTouched)
- Acquis 2.1 inventoriés (validations durcies, jsdom min/max, piège NUL bytes outillage)
- Backend : `createPracticeSession` étendu — validation complète des items (exclusivité song/topic, UUID, minutes 1-1440, note ≤1000, max 50), résolution ownership `findOne({uid, userUid})` → 400 'Invalid entry reference' uniforme, label snapshoté depuis `song.title`/`topic.name`, transaction session+bulkCreate, réponse 201 `{...session, items}`
- Frontend : constructeur d'entrées (Add entry → select optgroups Songs/Topics chargés en parallèle, minutes, note, Remove), FR13 avec `durationTouched` (auto-somme ↔ surcharge ↔ ré-armement), reset complet après succès, formulaire dégradé gracieusement si catalogues indisponibles
- Régression zéro : les 16 tests backend 2.1 et 10 tests frontend 2.1 passent inchangés (seul ajustement : payload enrichi d'items optionnels)
- Périmètre respecté : lastPlayed/SongPlay intacts, pas d'affichage d'historique, pas de suggestions

### File List

**Nouveaux :**
- backend/migrations/20260607200000-create-session-items.js
- backend/models/sessionitem.js

**Modifiés :**
- backend/models/practicesession.js (+ hasMany items)
- backend/controllers/practicesessioncontroller.js (+ validation/résolution items + transaction)
- backend/__tests__/practicesessioncontroller.test.js (+ mocks SessionItem/Song/Topic/transaction, +7 tests)
- src/services/practiceSessionService.ts (+ types SessionItem/CreateSessionItemDTO, items dans les DTO)
- src/pages/MySessionsPage.tsx (+ constructeur d'entrées + FR13)
- src/__tests__/MySessionsPage.test.tsx (+ mocks song/topic services, +7 tests)

## Change Log

- 2026-06-07 : Story 2.2 implémentée (SessionItems avec labels FR4 snapshotés, items transactionnels dans POST /api/sessions, constructeur d'entrées + FR13 auto-somme) — statut → review
- 2026-06-07 : Code review adversariale (3 couches) — 9 patches appliqués (lignes sans réf bloquées au submit, auto-somme cappée à 1440, TOCTOU FK → 400, résolution batch 2 findAll au lieu de N findOne, garde badInput, allSettled catalogues partiels, contrainte CHECK one-ref-max, fieldset/legend, +5 tests dont assertion transaction réelle), 0 différé, 6 écartés. Backend 53, frontend 83, tous verts. Statut → done
