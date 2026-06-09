---
baseline_commit: 525095f3a193dcb79c5c7319f567fc75e7c94f0a
---

# Story 2.4: Corriger mon journal a posteriori

Status: done

## Story

As a musicien,
I want éditer ou supprimer toute session,
so that mon journal reste fidèle à ma pratique réelle, pas à mon usage de l'app.

## Acceptance Criteria

1. **Édition complète** — Given une session existante, When je l'édite, Then date, durée, instrument, entrées et notes sont tous modifiables (FR10).
2. **FR4 de bout en bout** — Given une session référençant un sujet supprimé depuis, When je la consulte ou l'édite, Then le nom du sujet supprimé reste affiché (FR4), And je peux reclasser l'entrée vers un autre sujet (FR4).
3. **Suppression confirmée** — Given une session, When je la supprime, Then dialogue de confirmation avant suppression définitive (FR11).
4. **Ownership** — PUT/DELETE refusés (403) sur la session d'un autre utilisateur (NFR4).

## Tasks / Subtasks

- [x] Task 1 : Migration — colonne `position` sur SessionItems (résout le défer 2.3) (AC: 1)
  - [x] Créer `backend/migrations/20260607300000-add-position-to-session-items.js` : garde `describeTable('SessionItems')` → si `position` absente, `addColumn('SessionItems', 'position', { type: INTEGER, allowNull: false, defaultValue: 0 })` puis backfill idempotent par session : `UPDATE "SessionItems" si SET position = sub.rn - 1 FROM (SELECT uid, ROW_NUMBER() OVER (PARTITION BY session_uid ORDER BY "createdAt", uid) rn FROM "SessionItems") sub WHERE si.uid = sub.uid` (le backfill peut tourner plusieurs fois sans dégât)
  - [x] `down` : `removeColumn`
  - [x] Modèle `backend/models/sessionitem.js` : + `position` INTEGER allowNull false defaultValue 0
  - [x] Tester 2× + rejouer après drop de colonne (garde describeTable)
- [x] Task 2 : Backend — position au POST + GET ordonné par position (AC: 1)
  - [x] `createPracticeSession` : `resolvedItems.map((item, index) => ({ ...item, position: index, sessionUid }))` — l'ordre du payload devient l'ordre persistant
  - [x] `getAllPracticeSessions` : ordre items `['position', 'ASC'], ['uid', 'ASC']` (remplace `createdAt ASC` — fidèle à la saisie désormais)
- [x] Task 3 : Backend — `updatePracticeSession` (PUT /api/sessions/:uid) (AC: 1, 2, 4)
  - [x] Pattern ownership complet : 401 → `UUID_PATTERN` sur `:uid` → 404 → `findByPk` (avec include items) → 404 → `userUid !== userId` → 403
  - [x] Champs session PARTIELS (absent = inchangé), mêmes validations que le POST : `date` (format + calendaire + ≥ 1900 + tolérance future UTC+1j), `instrumentType` (non vide, ≤255, sans NUL), `durationMinutes` (entier 1-1440 ou null explicite pour effacer), `note` (string ≤5000, trim → null, null explicite pour effacer)
  - [x] **Sémantique items = DIFF par `uid`** (CRITIQUE — voir Dev Notes « Pourquoi pas replace-all ») : `items` absent → entrées inchangées ; `items` fourni (array ≤ 50) →
    - item AVEC `uid` (UUID valide, appartenant à CETTE session sinon 400 `'Invalid entry reference'`) → UPDATE de la ligne : `minutes`/`note` appliqués depuis le payload (valeurs complètes de la ligne) ; si `songUid`/`topicUid` fourni → re-résolution ownership + NOUVEAU label (= reclassement FR4) ; si AUCUNE réf fournie → refs et label EXISTANTS conservés (l'orphelin FR4 garde son label)
    - item SANS `uid` → création (exactement une réf requise, résolution + snapshot, validations 2.2)
    - lignes existantes ABSENTES du payload → suppression
    - `position` = index dans le payload pour TOUTES les lignes (l'ordre d'édition fait foi)
  - [x] Résolutions batch (2 findAll, pattern 2.2) AVANT la transaction ; transaction autour de update session + update/create/destroy items ; catch `SequelizeForeignKeyConstraintError` → 400
  - [x] Réponse 200 : session relue avec items ordonnés par position (`{ ...session.toJSON(), items }`)
  - [x] **NE PAS toucher à `Song.lastPlayed` / `SongPlay`** : le recalcul du « dernier joué » à l'édition/suppression est FR23 = story 4.2 — ZÉRO logique de ce type ici
- [x] Task 4 : Backend — `deletePracticeSession` (DELETE /api/sessions/:uid) (AC: 3, 4)
  - [x] Pattern complet 401 → UUID guard → 404 → 403 → `destroy()` (le CASCADE supprime les items) → `{ message: 'Session deleted successfully' }`
  - [x] Routes : `router.put('/:uid', authsess, ...)` + `router.delete('/:uid', authsess, ...)`
- [x] Task 5 : Service frontend (AC: 1, 3)
  - [x] `practiceSessionService.ts` : `UpdatePracticeSessionDTO` (champs partiels + `items?: UpdateSessionItemDTO[]` où `UpdateSessionItemDTO = CreateSessionItemDTO & { uid?: string }`), `update(uid, payload)` (PUT, 400 → message serveur surfacé comme `create`), `remove(uid)` (DELETE)
- [x] Task 6 : Page — mode édition + suppression (AC: 1, 2, 3)
  - [x] Boutons sur chaque carte session : « Edit » (`aria-label={'Edit session of ' + date}`) et « Delete » (rouge, `aria-label={'Delete session of ' + date}`, dark:)
  - [x] **Mode édition = réutiliser le formulaire du haut** : état `editingSessionUid` ; « Edit » peuple le formulaire (date, instrument, durée → `durationTouched = true` si durée présente, note, entrées depuis `items`) et affiche un bandeau « Editing session of {date} » + bouton « Cancel edit » ; le submit devient PUT ; succès → toast « Session updated », remplacement dans la liste (`setSessions(prev => sortSessions(prev.map(...)))`), sortie du mode édition et reset du formulaire
  - [x] **EntryDraft étendu pour FR4** : `{ key, uid?, ref, label?, minutes, note }` — une entrée existante porte son `uid` ; une entrée ORPHELINE (refs null) arrive avec `ref: ''` et son `label` : le select affiche une option spéciale `value=""` libellée `Keep "${label}"` (au lieu du placeholder) — le garde « ref vide bloque le submit » (review 2.2) NE s'applique PAS aux entrées orphelines avec uid+label ; choisir un sujet dans le select = reclassement (envoie `{ uid, topicUid }`)
  - [x] Payload PUT items : entrées avec uid → `{ uid, minutes?, note?, songUid?/topicUid? seulement si ref changée }` ; nouvelles entrées → `{ songUid|topicUid, minutes?, note? }` ; entrées retirées via « Remove » → absentes du payload
  - [x] Suppression : `deleteSessionUid` + `ConfirmDialog` (props maison, `title="Delete session"`, message nommant date + instrument, `isDangerous`) — fermer le dialog AVANT la requête (anti double-submit, acquis 1.2), retrait de la liste, toast « Session deleted »
  - [x] Préserver TOUS les acquis : FR13 (en édition, `durationTouched` initialisé à true si la session a une durée — l'auto-somme ne doit pas écraser une durée existante), toast/timer, merge anti-course, sessionsFailed reset, live regions, anglais, dark
- [x] Task 7 : Tests backend (AC: tous)
  - [x] Update : 200 champs partiels (date seule, durée null pour effacer) ; date invalide/future → 400 ; 404 uid malformé/inexistant ; 403 autre user ; items diff : update minutes d'une ligne existante (label conservé), reclassement (`uid` + `topicUid` → label re-résolu), orphelin renvoyé sans réf → label/refs conservés, ligne absente → destroy appelé, nouvelle ligne → create avec position, uid d'item d'une AUTRE session → 400, positions = index payload ; transaction réellement passée (assertion option) ; lastPlayed/SongPlay JAMAIS touchés (aucun import)
  - [x] Delete : 200 + message ; 404/403/401 ; destroy appelé
  - [x] POST : positions affectées ; GET : ordre items par position
- [x] Task 8 : Tests frontend (AC: 1, 2, 3)
  - [x] Edit peuple le formulaire (y c. entrées existantes) et le bandeau s'affiche ; submit → `update` avec le bon payload (uid conservés, réf changée envoyée, retirée absente) ; Cancel edit restaure le formulaire vierge sans appel ; orphelin : option `Keep "..."` affichée, submit SANS reclasser → item `{ uid }` sans réf, reclasser → `{ uid, topicUid }` ; Delete → ConfirmDialog nommé → confirme → `remove` + retrait + toast ; annule → rien ; FR13 en édition : durée existante non écrasée par l'auto-somme
- [x] Task 9 : Validations finales
  - [x] Suites + lint + build + migration 2× + scan NUL ; smoke : PUT/DELETE sans session → 401

### Review Findings

- [x] [Review][Patch] **Gardes NUL du PUT = code mort** : le source contient le texte littéral `\\u0000` (sur-correction du double échappement) au lieu du caractère — un vrai NUL passe la validation → 500 Postgres ; AUCUN test PUT ne couvrait le cas (High, blind+edge+auditor) [backend/controllers/practicesessioncontroller.js:292,322,391 + tests]
- [x] [Review][Patch] Le backfill de la migration tourne à CHAQUE replay → écrase les positions éditées par l'utilisateur — à déplacer DANS la garde addColumn (Med, blind) [backend/migrations/20260607300000]
- [x] [Review][Patch] uid d'item dupliqué dans le payload PUT → deux updates de la même ligne (last-write-wins) + trou de position, sans erreur (blind+edge+auditor) [backend — rejeter en 400]
- [x] [Review][Patch] FR13 en édition : une session SANS durée + entrées minutées → l'auto-somme assigne silencieusement une durée ; et vider le champ pour dire « aucune durée » est impossible (ré-armement) — en mode édition, désactiver l'auto-somme (durationTouched permanent) (edge+blind) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] L'option `Keep "label"` s'affiche aussi pour les entrées NON-orphelines (retour à '' = garde l'ancienne réf avec label périmé, état non round-trippable) — la réserver aux orphelins, placeholder disabled sinon (edge) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] Entrer en mode édition ne déplace pas le focus (l'utilisateur clavier/lecteur d'écran ne perçoit pas le changement) — focus sur le champ Date (blind) [src/pages/MySessionsPage.tsx]
- _Écartés (6) : noms de colonnes du backfill (réfuté — schéma réel vérifié + migration exécutée avec succès en local) ; lost-update read-merge-write (= défer optimistic-locking existant) ; CASCADE non vérifié (vérifié en 2.2 : confdeltype 'c' en DB) ; changement d'édition sans confirmation (pattern maison déjà différé en 1.2) ; affichage dégradé si catalogue en échec pendant l'édition (mode signalé par bandeau) ; session datée « demain » (fuseau avancé) non éditable depuis un appareil en retard (symétrique au create, exotique)._

## Dev Notes

### Pourquoi pas « replace-all » pour les items (décision centrale)

Le replace-all (supprimer toutes les lignes, recréer depuis le payload) serait plus simple MAIS **casserait FR4** : une entrée orpheline (sujet supprimé → refs NULL + label snapshoté) ne peut pas être recréée sans accepter un `label` du client — interdit (falsification d'historique). D'où la **sémantique diff par `uid`** : les lignes existantes sont mises à jour en place (l'orphelin garde son label tant qu'on ne le reclasse pas), les nouvelles sont créées avec résolution serveur, les absentes sont supprimées. Le reclassement FR4 = update d'une ligne existante avec une nouvelle réf → re-résolution + nouveau label.

### La colonne `position` (défer 2.3 résolu ici)

L'édition rend l'ordre des entrées user-visible → le tiebreak `uid` (déterministe mais arbitraire) ne suffit plus. `position` INTEGER NOT NULL DEFAULT 0, affectée depuis l'index du payload au POST comme au PUT ; GET ordonne par `position ASC, uid ASC`. Migration **addColumn** (pattern `describeTable` du fix e5400c5, différent du pattern create-table) + backfill window-function idempotent. Rien n'est encore déployé en prod (aucun merge vers main depuis le début de l'itération) — le backfill ne concerne que les données dev locales.

### Sémantique de mise à jour des champs de session

Partielle comme `updateTopic` (1.2) : champ absent = inchangé. DISTINCTION explicite : `durationMinutes: null` = effacer la durée ; absent = garder. Idem `note`. La `date` éditée suit TOUTES les règles du POST (validations 2.1 durcies). L'instrument est modifiable (FR10) — pas de logique « dernier joué » à recalculer ici (c'est 4.2).

### Intelligence des stories précédentes (acquis à appliquer)

- **Patterns review capitalisés** : UUID guard → 404 ; messages 400 surfacés à l'UI (service `body?.message`) ; dialog fermé avant la requête (1.2) ; `setSessions` fonctionnels + sortSessions ; transaction assertée dans les tests ({ transaction }) ; batch findAll (pas de N+1) ; FK TOCTOU → 400 ; gardes NUL (`String.fromCharCode(0)` dans les tests) ; jsdom min/max → `fireEvent.submit(form)` ; options async avant change de select (2.2) ; `within(history)` pour éviter les collisions de texte (2.3)
- **ÉTAT ACTUEL des fichiers** : `practicesessioncontroller.js` contient les validations durcies 2.1 + items batch 2.2 + getAll 2.3 — LIRE le fichier entier avant d'éditer ; `MySessionsPage.tsx` ~470 lignes (formulaire + entrées + FR13 + History) — l'édition RÉUTILISE l'existant, ne pas dupliquer
- **uid de test en VRAIS UUIDs** (les guards UUID rejettent 'topic-1')
- **🚨 NUL bytes (vécu 4×)** : scan perl après chaque édition contenant des échappements unicode
- **Différés à ne PAS traiter** : oracle 403/404 (le pattern maison 404→403 reste), CSRF, optimistic locking (PUT sur session supprimée concurremment → comportement best-effort acceptable)

### Périmètre — garde-fous

- **INTERDIT : toucher à `Song.lastPlayed`, `SongPlay`, `markSongPlayed`** — la cohérence bidirectionnelle du « dernier joué » à l'édition/suppression de session est FR23 = STORY 4.2. Cette story 2.4 modifie/supprime des sessions SANS répercussion sur le dernier joué (l'incohérence temporaire est attendue et sera résolue par la 4.2)
- **PAS de suggestions/récents/recherche** (2.5), pas de heatmap (epic 3)
- **PAS d'édition inline dans les cartes** : le formulaire du haut est l'unique éditeur (un seul code de formulaire à maintenir)
- Le tri de la liste après édition : re-trier (la date a pu changer)

### Testing standards

Identiques. Pour le mock update backend : `findByPk` renvoie une session avec `items` (array d'objets avec `update`/`destroy` jest.fn) ou utiliser `SessionItem.findAll/destroy/bulkCreate` selon l'implémentation — choisir l'implémentation qui reste mockable simplement (ex. `SessionItem.destroy({ where: { uid: [...] } })` + `bulkCreate` + updates individuels par instance).

### Project Structure Notes

- Nouveau : `backend/migrations/20260607300000-add-position-to-session-items.js`
- Modifiés : `backend/models/sessionitem.js` (+position), `backend/controllers/practicesessioncontroller.js` (+update/delete, position au POST, ordre GET), `backend/routes/sessions.js` (+PUT/DELETE), `src/services/practiceSessionService.ts` (+update/remove/DTO), `src/pages/MySessionsPage.tsx` (+mode édition, boutons cartes, ConfirmDialog), les 2 fichiers de tests

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4] — FR10, FR4, FR11
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — défer position (résolu ici), contrat FR4, différés à ne pas traiter
- [Source: _bmad-output/implementation-artifacts/2-3-consulter-mon-historique-de-sessions.md + 2-2-*.md] — Review Findings (patterns durcis à réappliquer)
- [Source: backend/controllers/topiccontroller.js:updateTopic/deleteTopic] — pattern update partiel + delete avec ownership
- [Source: backend/migrations/20251222100000-add-album-to-songs.js] — pattern addColumn idempotent (describeTable)
- [Source: src/components/ConfirmDialog.tsx] — props exactes
- [Source: _bmad-output/project-context.md] — règles d'implémentation

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

- TDD : 14 tests backend RED (11 update/delete + 3 assertions position) → GREEN 39/39 ; 9 tests frontend écrits avec l'implémentation → 37/37
- Suites complètes : backend 68/68, frontend 100/100 ; lint 0 nouvelle erreur ; build OK ; zéro octet NUL
- Migration position : 2 passages + replay avec colonne existante (garde describeTable + backfill window-function) ✓
- 🏆 Piège NUL enfin vaincu : le DOUBLE échappement (backslash-backslash-u0000) dans les paramètres d'édition produit la séquence source correcte — vérifié 3 occurrences propres
- Smoke : PUT/DELETE /api/sessions/:uid sans session → 401

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Sémantique diff-by-uid implémentée intégralement : update en place (label FR4 conservé sans nouvelle réf), reclassement = re-résolution serveur, lignes absentes supprimées, positions = ordre payload
- Déviation mineure assumée vs spec : la réf d'une entrée existante est envoyée même si inchangée (re-résolution idempotente du même label — plus simple que tracker originalRef, et rafraîchit le label si la chanson/le sujet a été renommé entre-temps)
- Mode édition : formulaire unique réutilisé (bandeau + Cancel edit), durationTouched=true à l'entrée en édition (l'auto-somme FR13 n'écrase pas une durée existante — testé)
- Suppression de la session en cours d'édition → resetForm automatique
- Garde-fou respecté : zéro référence à lastPlayed/SongPlay (FR23 = 4.2)
- Décision centrale : sémantique diff par uid pour les items (le replace-all casserait les orphelins FR4 — un label ne vient JAMAIS du client)
- Défer 2.3 résolu : colonne position (l'édition rend l'ordre user-visible), migration addColumn + backfill idempotents
- Garde-fou massif sur lastPlayed/SongPlay (FR23 = 4.2) — l'incohérence temporaire est un choix assumé du découpage

### File List

**Nouveau :**
- backend/migrations/20260607300000-add-position-to-session-items.js

**Modifiés :**
- backend/models/sessionitem.js (+ position)
- backend/controllers/practicesessioncontroller.js (+ updatePracticeSession diff-by-uid, deletePracticeSession, position au POST, ordre GET par position)
- backend/routes/sessions.js (+ PUT/DELETE /:uid)
- backend/__tests__/practicesessioncontroller.test.js (+ mocks findByPk/create/destroy/findAll, +12 tests)
- src/services/practiceSessionService.ts (+ UpdatePracticeSessionDTO/UpdateSessionItemDTO, update, remove)
- src/pages/MySessionsPage.tsx (+ mode édition réutilisant le formulaire, option Keep pour orphelins, boutons Edit/Delete sur cartes, ConfirmDialog, helper showToast/resetForm)
- src/__tests__/MySessionsPage.test.tsx (+ mocks update/remove, +8 tests)

## Change Log

- 2026-06-07 : Code review adversariale (3 couches) — 6 patches appliqués (gardes NUL du PUT réparées — les 3 couches ont attrapé le code mort que 168 tests verts cachaient, +tests NUL PUT ; backfill déplacé dans la garde addColumn ; uid dupliqué → 400 ; FR13 désactivé en mode édition — durée volontairement absente préservée et effaçable ; option Keep réservée aux orphelins ; focus sur Date à l'entrée en édition), 0 nouveau différé, 6 écartés dont un High réfuté par vérification du schéma réel. Backend 70, frontend 104, tous verts. Statut → done

- 2026-06-07 : Story 2.4 implémentée (édition complète diff-by-uid préservant les orphelins FR4, reclassement avec re-résolution du label, suppression confirmée, colonne position résolvant le défer 2.3) — statut → review
