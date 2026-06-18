---
baseline_commit: 341b03a
arch_decision: "Delta « non détaillé » des sessions existantes (durée globale > somme des entrées) → CONVERTI en une entrée one-shot « Free practice » lors de la migration (tranché 2026-06-18 avec northwood), pas perdu. Préserve les totaux heatmap historiques."
---

# Story 8.3: Suppression de la durée globale + heatmap somme des entrées + migration

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a produit (modèle « tout est entrée »),
I want retirer la durée globale saisie d'une session et faire de la somme des minutes des entrées la **seule** source de vérité du temps,
so that le temps a une source unique partout (formulaire, liste, heatmap), sans la double-vérité qui a généré les incohérences de la story 6.1.

## Acceptance Criteria

### Formulaire de session — plus de durée saisie (FR13 amendé)

1. **Champ « Duration » retiré** — Given le formulaire de session (création **et** édition), Then il n'expose plus de champ de saisie « Duration » (input + label supprimés).
2. **Total dérivé en lecture seule** — Given un formulaire avec des entrées, When j'ajoute / édite / retire une entrée, Then un total **lecture seule** affiche la somme des minutes des entrées (recalcul en direct). Une entrée sans minutes compte 0. Une somme nulle (aucune entrée chiffrée) s'affiche `0` (ou un état neutre), sans champ éditable.
3. **Payload sans `durationMinutes`** — Given je crée ou édite une session, Then le payload envoyé à l'API **ne contient plus** `durationMinutes`.
4. **Historique cohérent** — Given la liste d'historique des sessions, Then le « · X min » de chaque session = **somme des minutes de ses entrées** (et non plus `session.durationMinutes`).

### Backend — durée dérivée, plus saisie (FR13 amendé)

5. **Création/édition ignorent la durée globale** — Given `POST /api/sessions` ou `PUT /api/sessions/:uid`, When le body contient (ou non) `durationMinutes`, Then le serveur **ne valide plus** et **n'écrit plus** ce champ ; un body legacy contenant `durationMinutes` est **toléré et ignoré** (pas de 400 pour ça).
6. **Plus de plancher/calage** — Given la logique de plancher « Duration cannot be less than the N minutes logged in its entries » (commit `380e8c4`) et l'auto-calage du total (commit `cbd6676`), Then ils sont **retirés** (devenus sans objet) ; aucune 400 « Duration cannot be less… » ne peut plus survenir.
7. **Réponse session** — Given la réponse JSON d'une session, Then elle continue d'inclure ses `items` (le front en dérive le total) ; le champ `durationMinutes` disparaît du contrat (le modèle ne l'a plus — AC13).

### Heatmap — somme des entrées (FR15 précisé)

8. **Agrégation sur les entrées** — Given `GET /api/sessions/heatmap?year=`, Then les minutes d'un jour = `SUM(SessionItem.minutes)` des entrées des sessions de ce jour (jointure `PracticeSessions` ↔ `SessionItems`), **au lieu** de `SUM(duration_minutes)`.
9. **Toute session allume le jour** — Given une session **sans entrée** ou dont les entrées n'ont **pas** de minutes, When la heatmap calcule le jour, Then le jour compte **0 minute** mais reste **allumé** (`sessionCount ≥ 1` → intensité minimale visible) — toute session compte (FR15). Le `sessionCount` reste le **nombre de sessions** (pas de gonflement par la jointure des entrées).
10. **Pas de double comptage des plays** — Given le rétro-import FR22 (plays), Then la règle inchangée : un jour avec sessions garde ses agrégats, les plays n'ajoutent que la présence (annotation) ; un jour play-only reste 0 minute.

### Retrait de la sync 6.1 (markSongPlayed)

11. **Plus de gestion du total côté plays** — Given `markSongPlayed` (`songcontroller.js`), Then le bloc qui lit/maintient `session.durationMinutes` (`priorTotal` / `totalIsAuto` / `session.update({ durationMinutes })`) est **retiré** ; « Mark as Played » continue de créer/compléter l'entrée et ses minutes (FR21/FR24 inchangés) — le temps remonte désormais **uniquement** via la somme des entrées (heatmap AC8).

### Migration (NFR5)

12. **Conversion du delta + suppression de colonne** — Given la base existante, When la migration s'exécute, Then **dans le même `up`** et de façon **idempotente** : (a) pour chaque session où `duration_minutes` > somme des minutes de ses entrées, créer **une** entrée one-shot sur le topic système « Free practice » de l'utilisateur (garanti présent par 8.2) portant le delta (`duration_minutes − somme`), avec `label = 'Free practice'`, `position` = nombre d'entrées existantes ; puis (b) retirer la colonne `duration_minutes`. La conversion ne doit pas se ré-exécuter en double (garde d'idempotence — voir Dev Notes).
13. **Modèle nettoyé** — Given le modèle `PracticeSession`, Then le champ `durationMinutes` (`duration_minutes`) est **retiré**.

### Non-régression

14. **Comportements préservés** — Given l'édition de session (diff-by-uid des items), les orphelins FR4, le pré-remplissage minutes 8.1, le topic « Free practice » + création à la volée 8.2, et le « dernier joué » FR23, Then ils restent **intacts**.
15. **Tests à jour & verts** — Given les suites front et back, Then les tests touchant la durée globale (formulaire, heatmap, create/update, plancher, sync 6.1) sont **adaptés** au nouveau modèle ; toutes les suites passent.

## Tasks / Subtasks

### Backend — modèle & migration (AC8, AC12, AC13)

- [x] **Migration** `backend/migrations/<timestamp>-drop-duration-minutes-from-practice-sessions.js` (NEW), idempotente, **dans l'ordre** :
  1. **Conversion du delta → entrée « Free practice »** (SQL brut, avant le drop). Pour chaque `PracticeSessions` dont `duration_minutes` > `COALESCE(SUM(SessionItems.minutes), 0)` : `INSERT INTO "SessionItems"` une ligne rattachée au topic système de l'user (`JOIN "Topics" t ON t.user_uid = ps.user_uid AND t.is_system = true AND t.name = 'Free practice'`), `minutes = ps.duration_minutes − COALESCE(sum, 0)`, `label = 'Free practice'`, `position = COALESCE(nb entrées existantes, 0)`, `song_uid = NULL`, `topic_uid = t.uid`, `uid = gen_random_uuid()`, timestamps `NOW()`. **Idempotence** : ne convertir que si la colonne existe encore (`describeTable` garde) — une migration mergée part en prod et est enregistrée dans `SequelizeMeta`, donc non rejouée ; pour la robustesse d'un re-run avant drop, exclure les sessions ayant **déjà** une entrée système au montant exact (sous-requête `NOT EXISTS`). Voir Dev Notes pour le SQL de référence.
  2. **Drop colonne** : `await queryInterface.removeColumn('PracticeSessions', 'duration_minutes')` (gardé par `describeTable` pour idempotence).
  - `down` : `addColumn('PracticeSessions','duration_minutes',{ type INTEGER, allowNull:true })` (les entrées « Free practice » créées ne sont **pas** re-supprimées — perte acceptée au rollback, beta).
- [x] **Modèle** `backend/models/practicesession.js` : retirer le bloc `durationMinutes` (lignes 32-36). Ne pas toucher aux associations ni à l'index `(user_uid, date)`.

### Backend — heatmap somme des entrées (AC8, AC9, AC10)

- [x] **`backend/controllers/practicesessioncontroller.js` › `getHeatmap`** (l.125-195) : remplacer l'agrégation sessions. Au lieu de `SUM(duration_minutes)` sur `PracticeSession.findAll`, sommer les minutes des entrées par jour de session. Deux options (Dev Notes) — **recommandé** : `PracticeSession.findAll` avec `include` de `SessionItem` (`attributes: []`, `required: false`), `attributes: ['date', [fn('SUM', col('items.minutes')), 'totalMinutes'], [fn('COUNT', literal('DISTINCT "PracticeSession"."uid"')), 'sessionCount']]`, `group: ['date']`, `raw: true`. **`required: false`** (LEFT JOIN) pour qu'une session **sans entrée** apparaisse quand même (jour allumé, 0 min — AC9). `sessionCount` via **`COUNT(DISTINCT uid)`** car la jointure démultiplie les lignes. Conserver `Number(row.totalMinutes ?? 0)` (SUM NULL → 0). Le reste (merge des plays FR22, re-tri) **inchangé**.

### Backend — retrait sync 6.1 + validation durée (AC5, AC6, AC11)

- [x] **`backend/controllers/practicesessioncontroller.js` › `createSession`** : retirer la validation `durationMinutes` (l.271-276), le bloc plancher (l.358-366), et `durationMinutes: durationMinutes ?? null` du `sessionValues` (l.398). Ne plus déstructurer `durationMinutes` (l.248) **ou** le laisser déstructuré mais inutilisé (préférer le retirer). Tolérer un body legacy : ne **pas** ajouter de 400 si `durationMinutes` est présent — simplement l'ignorer.
- [x] **`backend/controllers/practicesessioncontroller.js` › `updateSession`** : retirer la validation/écriture `durationMinutes` (l.361, 459 déstructuration, 490-499 `nextDuration`, 676 `durationMinutes: nextDuration`). L'update ne gère plus que `date`/`instrumentType`/`note`/`items`.
- [x] **`backend/controllers/songcontroller.js` › `markSongPlayed`** : retirer le bloc de gestion du total (l.324-332 `priorTotal`/`totalIsAuto`, l.358-366 `session.update({ durationMinutes })`). **Conserver** : recherche/création de session (l.309-322, sans changer `durationMinutes: null` au `create` → le retirer aussi puisque la colonne disparaît), création/accrual de l'entrée (l.334-356), `SongPlay.create`. Vérifier que `SessionItem.sum('minutes', …)` n'est plus utilisé pour le total (le supprimer s'il ne sert plus).
- [x] **Constante `MAX_DURATION_MINUTES`** : reste utilisée pour la validation des **minutes d'entrée** (l.325) → **ne pas** la retirer. Seule la validation du total global disparaît.

### Frontend — formulaire & service (AC1, AC2, AC3, AC4, AC7)

- [x] **`src/services/practiceSessionService.ts`** : retirer `durationMinutes` de `PracticeSession` (l.26), de `CreatePracticeSessionDTO` (via l'Omit, il disparaît avec le type source) et de `UpdatePracticeSessionDTO` (l.43, retirer la ré-déclaration explicite `durationMinutes`). `HeatmapDay.totalMinutes` **inchangé** (toujours fourni par le serveur).
- [x] **`src/pages/MySessionsPage.tsx` › formulaire** :
  - Retirer le champ « Duration » (label + input, l.705-733 environ) et son state : `duration` (l.208), `durationTouched` (l.226), `autoSum`/`effectiveDuration` (l.336-337), la logique de plancher dans `submit` (l.522-527) et `onBlur` (l.725-732), les resets (`setDuration`/`setDurationTouched` l.442-443, 581-582), et le calcul `loadedFloor` dans `startEditSession` (l.455-460).
  - **Total lecture seule (AC2)** : afficher la somme des minutes des entrées (réutiliser `enteredMinutesSum`, l.335 — déjà calculé). Un petit texte/badge « Total: N min » près des entrées, recalculé en direct.
  - **Payload (AC3)** : retirer `durationMinutes` des objets passés à `create`/`update` (l.549, 569-571).
  - Conserver tout le reste : entrées, `EntryRefPicker`, pré-remplissage 8.1 (l.770-784), Free practice 8.2.
- [x] **`src/pages/MySessionsPage.tsx` › historique** (l.874-875) : remplacer `session.durationMinutes` par la somme des minutes des `items` de la session (helper local `sumItemsMinutes(session)`), n'afficher le « · X min » que si > 0.
- [x] **`src/pages/MyHeatmapPage.tsx`** (l.442-443) : idem — le « · X min » du panneau de détail de jour doit dériver de la somme des entrées, pas de `session.durationMinutes`.

### Tests

- [x] **Back `backend/__tests__/practicesessioncontroller.test.js`** : (a) `getHeatmap` somme les `SessionItem.minutes` (mock `PracticeSession.findAll` renvoyant `totalMinutes` agrégé + `sessionCount` via DISTINCT) ; une session sans entrée → jour présent, 0 min, sessionCount 1 ; (b) `createSession`/`updateSession` ignorent `durationMinutes` du body (pas d'écriture, pas de 400) ; (c) retrait des tests de plancher « Duration cannot be less… » (supprimer/adapter).
- [x] **Back `backend/__tests__/songcontroller.test.js`** : adapter/retirer les assertions sur `session.update({ durationMinutes })` ; vérifier que `markSongPlayed` crée toujours l'entrée + ses minutes sans toucher au total.
- [x] **Front `src/__tests__/MySessionsPage.test.tsx`** : retirer les tests FR13 de plancher/override/auto-sum éditable (`floors a manual duration…`, `manual duration override wins`, `clearing a manual override…`, edit-mode floor tests) ; ajouter : pas de champ « Duration », total lecture seule = somme des entrées, payload sans `durationMinutes`, historique « · X min » = somme des entrées.
- [x] **Front `src/__tests__/MyHeatmapPage.test.tsx`** : adapter les fixtures qui posaient `durationMinutes` → le `totalMinutes` vient du serveur (déjà mocké via `getHeatmap`) ; détail de jour « · X min » dérivé des entrées.

## Dev Notes

### Contexte & pourquoi
Phase C (dernière) de l'Epic 8 « tout est entrée » (cf. `sprint-change-proposal-2026-06-18.md`). La story 6.1 a créé une **double source de vérité** du temps : `PracticeSession.durationMinutes` (global, surchargeable) **vs** `SUM(SessionItem.minutes)`. Cette dualité a généré les incohérences (total < somme, total non alimenté par Mark as Played, d'où le plancher/calage des commits `380e8c4`/`cbd6676`). On supprime la durée globale : la session n'est qu'un **regroupement (jour + instrument)**, le temps vit **uniquement** sur les entrées. Prérequis livrés : 8.1 (pré-remplissage minutes) et 8.2 (topic système « Free practice », **dont dépend la conversion du delta de la migration**). **Breaking changes tolérés (beta, 3-4 users).**

### Décision tranchée — delta « non détaillé » → entrée Free practice (2026-06-18, avec northwood)
À la suppression de `duration_minutes`, les sessions dont la durée globale dépasse la somme des entrées (du « temps non détaillé ») seraient amputées sur la heatmap. **Décision : convertir** ce delta en **une entrée one-shot « Free practice »** (cf. `arch_decision` frontmatter), au lieu de l'accepter perdu. Conséquence : la migration **dépend du topic système de 8.2** (garanti présent par le seed + backfill de la migration `20260618000000-add-is-system-to-topics`). C'est le choix le plus fidèle à « tout est entrée » et il préserve les totaux heatmap historiques.

### SQL de référence — conversion du delta (migration, étape 1)
```sql
INSERT INTO "SessionItems"
  (uid, session_uid, song_uid, topic_uid, label, minutes, note, position, "createdAt", "updatedAt")
SELECT gen_random_uuid(), ps.uid, NULL, t.uid, 'Free practice',
       ps.duration_minutes - COALESCE(agg.sum_min, 0),
       NULL, COALESCE(agg.cnt, 0), NOW(), NOW()
FROM "PracticeSessions" ps
JOIN "Topics" t
  ON t.user_uid = ps.user_uid AND t.is_system = true AND t.name = 'Free practice'
LEFT JOIN (
  SELECT session_uid, SUM(minutes) AS sum_min, COUNT(*) AS cnt
  FROM "SessionItems" GROUP BY session_uid
) agg ON agg.session_uid = ps.uid
WHERE ps.duration_minutes IS NOT NULL
  AND ps.duration_minutes > COALESCE(agg.sum_min, 0)
  AND NOT EXISTS (  -- idempotence : ne pas re-convertir si déjà fait
    SELECT 1 FROM "SessionItems" si2
    WHERE si2.session_uid = ps.uid AND si2.topic_uid = t.uid
      AND si2.minutes = ps.duration_minutes - COALESCE(agg.sum_min, 0)
  );
```
- `gen_random_uuid()` : déjà utilisé par `20260611000100-backfill-playlist-songs.js` (dispo, pg). Colonnes camelCase à **quoter** (`"createdAt"`/`"updatedAt"`), snake_case sans quote.
- Étape 2 (drop) gardée par `const desc = await queryInterface.describeTable('PracticeSessions'); if (desc.duration_minutes) { ... }`.

### Heatmap — nouvelle agrégation (état actuel à préserver)
- `getHeatmap` (`practicesessioncontroller.js:125-195`) lance **deux** requêtes concurrentes (sessions, plays) **mergées en JS** : projection à la lecture, jamais matérialisée → rejouable (NFR5). Ne **pas** toucher : le filtre année, `PLAY_DAY_EXPR`, la règle de merge FR22 (un jour avec sessions garde ses agrégats ; play-only = présence), le re-tri final.
- **Seul changement** : la requête sessions passe de `SUM(duration_minutes)` à `SUM(items.minutes)` via `include` de `SessionItem` en **LEFT JOIN** (`required:false`) + `COUNT(DISTINCT "PracticeSession"."uid")` pour `sessionCount` (la jointure démultiplie les lignes — sans DISTINCT le compte serait faux). `raw:true` conservé ; attention au nom de colonne dans `col('items.minutes')` (alias d'association `as: 'items'`).
- `computeLevels`/`buildYearGrid` (`src/utils/heatmap.ts`) consomment `day.totalMinutes` — **inchangés** (le serveur fournit toujours `totalMinutes`).

### Frontend — état actuel du formulaire (lire avant de coder)
- `MySessionsPage.tsx` : `enteredMinutesSum` (l.335) est **déjà** la somme des minutes des entrées → c'est le total lecture seule à afficher (AC2). `autoSum`/`effectiveDuration`/`durationTouched` et toute la logique de plancher disparaissent. Le `submit` (l.500+) construit le payload `create`/`update` — retirer `durationMinutes`/`flooredDuration`.
- `startEditSession` (l.~450) : retirer `loadedSum`/`loadedFloor`/`storedDuration` (calcul du `durationTouched` initial) — ne plus charger la durée globale.
- Le pré-remplissage minutes 8.1 (`onPick`, l.770-784) et Free practice 8.2 (`pinnedTopics`, `handleCreateTopic`) ne touchent **pas** au total → intacts.

### Ce qui doit être préservé (ne pas casser)
- **Minutes d'entrée** : validation 1..1440 par entrée (`practicesessioncontroller.js:323-328`) **conservée** ; `MAX_DURATION_MINUTES` reste utilisée pour ça.
- **Diff-by-uid des items** (update), **FR4 orphelins** (label snapshot), **FR23 « dernier joué »** (`markSongPlayed`/recalcul) : aucun lien avec `durationMinutes` → ne pas toucher, mais vérifier qu'aucun test ne s'appuie sur l'ancien total.
- **Index `practice_sessions_user_uid_date`** et associations `hasMany SessionItem as 'items'` : inchangés (l'agrégation heatmap s'appuie dessus).
- **FK `SessionItem.topicUid` → Topics** (`SET NULL`) : l'entrée « Free practice » de la migration pointe le vrai topic système (comme 8.2).

### Conventions (cf. project-context.md)
- Backend **JS CommonJS**, contrôleurs try/catch → `next(createError(...))`, `http-errors`. Modèles camelCase JS + `field:'snake_case'`. Migration **idempotente** obligatoire (`describeTable`) — part en prod via release-migrate. Tester localement (`make migrate`) avant merge.
- Frontend **TS strict** + `verbatimModuleSyntax` (`import type`), imports relatifs, **tout en anglais** (UI + commentaires). Tailwind dark mode `dark:` sur chaque élément stylé ; toasts `setToastMessage` + `setTimeout(2500)`.
- Deux suites Jest indépendantes : front (`npm test`, jsdom) et back (`cd backend && npm test`, node, **modèles mockés** `jest.mock('../models')`). Hook pre-commit lance les deux — **jamais** `--no-verify`.

### Garde-fous workflow
- **Jamais** sur `main` (push = prod). Brancher (`feat/drop-session-global-duration` ou similaire). Migration testée localement avant merge ; `main` doit rester déployable.
- Commits Conventional (`feat(sessions)`, `feat(heatmap)`, `fix(migrations)`, `refactor`…). **Pas** de trailer Co-Authored-By Claude (préférence repo).
- **CHANGELOG** : ajouter une entrée `[Unreleased]` (curée à la main).

### Project Structure Notes
- Pas de seeders sequelize → la conversion du delta se fait **dans la migration** (précédent : `20260611000100-backfill-playlist-songs.js`).
- `markSongPlayed` créait `durationMinutes: null` au `create` de session — à retirer puisque la colonne disparaît (sinon Sequelize tentera d'écrire un champ inconnu après retrait du modèle).
- Ordre de merge : cette migration doit s'exécuter **après** `20260618000000-add-is-system-to-topics` (timestamp postérieur) pour que le topic système existe.

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-18.md] — Phase C, FR13 amendé, décision delta « à confirmer » (tranchée ici : conversion)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8 / Story 8.3 (l.559-580)] — énoncé + AC esquissés + rollback sync/plancher
- [Source: _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/prd.md] — FR13 (amendé), FR15 (précisé)
- [Source: backend/controllers/practicesessioncontroller.js:125-195] — `getHeatmap` (agrégation à changer)
- [Source: backend/controllers/practicesessioncontroller.js:248-400,459-676] — create/update (validation + plancher + écriture durationMinutes à retirer)
- [Source: backend/controllers/songcontroller.js:300-367] — `markSongPlayed`, sync 6.1 à retirer
- [Source: backend/models/practicesession.js:32-36] — champ `durationMinutes` à retirer
- [Source: backend/models/sessionitem.js] — colonnes pour l'INSERT de conversion (label, position, FK topic)
- [Source: backend/migrations/20260618000000-add-is-system-to-topics.js] — topic système « Free practice » dont dépend la conversion ; précédent de backfill idempotent
- [Source: backend/migrations/20260611000100-backfill-playlist-songs.js] — précédent INSERT…SELECT idempotent (gen_random_uuid)
- [Source: src/pages/MySessionsPage.tsx:208-337,442-460,500-582,705-733,874-875] — durée globale & plancher à retirer ; `enteredMinutesSum` à réutiliser
- [Source: src/pages/MyHeatmapPage.tsx:442-443] — détail de jour « · X min » à dériver des entrées
- [Source: src/services/practiceSessionService.ts:26,43] — types `durationMinutes` à retirer
- [Source: src/utils/heatmap.ts] — `computeLevels`/`buildYearGrid` (consomment `totalMinutes`, inchangés)
- [Source: _bmad-output/implementation-artifacts/8-2-topic-systeme-free-practice-et-creation-a-la-volee.md] — story sœur (Phase B), topic système
- [Source: _bmad-output/project-context.md] — conventions backend/frontend, migrations idempotentes, tests

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow)

### Debug Log References

- Migration exécutée localement (`make migrate`) : `20260618010000-drop-duration-minutes-from-practice-sessions: migrated`.
- État avant : 10 sessions (3 avec `duration_minutes`), 8 entrées ; 2 sessions avec delta (90 et 20 min, sans entrées).
- Après migration : colonne `duration_minutes` **supprimée** ; 2 entrées « Free practice » créées (90 et 20 min, rattachées au topic système) ; SessionItems 8 → 10.
- Agrégation heatmap validée sur données réelles : `SUM(items.minutes)` + `COUNT(DISTINCT ps.uid)` → jour 2026-06-07 = 110 min / 4 sessions (delta préservé) ; jours sans minutes d'entrée = NULL (→ 0 en JS) avec `session_count ≥ 1` (jour allumé, AC9).
- Suites : back **135/135** ✓, front **224/224** ✓, `tsc -b` + `eslint` propres.

### Code review — corrections appliquées (2026-06-18)
Revue multi-angles post-implémentation. Corrigé directement :
- `sumSessionMinutes(session)` n'est plus appelé deux fois par ligne (historique `MySessionsPage` + détail `MyHeatmapPage`) : total calculé une fois par ligne dans le `.map`.
- `enteredMinutesSum` : tableau intermédiaire `entryMinutes` supprimé → un seul `reduce`.
- Total `<output>` : classe `input-base` retirée (élément lecture seule, pas un input) ; affiche un tiret neutre `—` quand le total est 0 (cohérent avec l'historique/heatmap qui masquent « · X min » à 0).

Notes migration (non bloquantes, edges acceptés au stade beta — migration déjà jouée proprement sur dev, topics garantis par 8.2) :
- La conversion du delta fait un **INNER JOIN** sur le topic système : une session dont l'user n'aurait pas de « Free practice » serait silencieusement ignorée. Couvert en pratique (la migration 8.2 backfille tous les users existants ; seed best-effort à l'inscription). Robustesse possible : LEFT JOIN + création à la demande.
- La garde d'idempotence `NOT EXISTS` est basée sur la **valeur** (`topic_uid` + `minutes == delta`), pas sur la provenance : une entrée Free practice pré-existante de valeur égale au delta pourrait faire sauter la conversion. Edge improbable ; un marqueur (`note`) fiabiliserait le dédoublonnage. Sans objet ici (migration déjà jouée une fois).

### Completion Notes List

- **AC1-AC4 (formulaire)** : champ « Duration » éditable retiré ; remplacé par un total **lecture seule** (`<output aria-label="Total minutes">`) = `enteredMinutesSum`, recalculé en direct. Payload `create`/`update` sans `durationMinutes`. Historique « · X min » dérivé via `sumSessionMinutes(session)`.
- **AC5-AC7 (backend create/update)** : `durationMinutes` retiré de la déstructuration, de la validation et de l'écriture ; un body legacy est toléré et ignoré (pas de 400). Plancher/calage (`380e8c4`/`cbd6676`) supprimés des deux contrôleurs.
- **AC8-AC10 (heatmap)** : `getHeatmap` agrège `SUM(items.minutes)` via `include` LEFT JOIN de `SessionItem` (`required:false`) + `COUNT(DISTINCT "PracticeSession"."uid")` pour `sessionCount`. Merge des plays FR22 et re-tri inchangés.
- **AC11 (sync 6.1)** : bloc `priorTotal`/`totalIsAuto`/`session.update({ durationMinutes })` retiré de `markSongPlayed` ; `durationMinutes: null` retiré du `create` de session. Création/accrual d'entrée inchangés.
- **AC12-AC13 (migration + modèle)** : migration idempotente (conversion delta → entrée Free practice avec garde `describeTable` + `NOT EXISTS`, puis drop colonne) ; champ `durationMinutes` retiré du modèle.
- **Décision delta** : conversion en entrée « Free practice » (cf. `arch_decision`) — préserve les totaux heatmap historiques. Validé sur la base dev (90 et 20 min reportés).
- **Helper partagé** : `sumSessionMinutes` exporté depuis `practiceSessionService.ts`, utilisé par les deux pages (mock Jest via `requireActual` pour conserver le vrai helper).
- **Non-régression** : diff-by-uid des items, orphelins FR4, pré-remplissage 8.1, Free practice 8.2, « dernier joué » FR23 — intacts (tests verts). Tests obsolètes de plancher/override/auto-sum retirés ; nouveaux tests Total/heatmap ajoutés.

### File List

**Backend (NEW)**
- `backend/migrations/20260618010000-drop-duration-minutes-from-practice-sessions.js` — conversion delta → Free practice + drop colonne

**Backend (UPDATE)**
- `backend/models/practicesession.js` — champ `durationMinutes` retiré
- `backend/controllers/practicesessioncontroller.js` — heatmap somme des entrées ; retrait validation/plancher/écriture `durationMinutes` (create + update)
- `backend/controllers/songcontroller.js` — retrait de la sync 6.1 (`markSongPlayed`)
- `backend/__tests__/practicesessioncontroller.test.js` — tests heatmap (nouvelle agrégation) + create/update sans durée ; retrait des tests de plancher
- `backend/__tests__/songcontroller.test.js` — retrait des tests de sync du total ; assertion `create` sans `durationMinutes`

**Frontend (UPDATE)**
- `src/services/practiceSessionService.ts` — types `durationMinutes` retirés ; helper `sumSessionMinutes` exporté
- `src/pages/MySessionsPage.tsx` — champ Duration → total lecture seule ; retrait du state/plancher ; payload sans `durationMinutes` ; historique via `sumSessionMinutes`
- `src/pages/MyHeatmapPage.tsx` — détail de jour « · X min » via `sumSessionMinutes`
- `src/__tests__/MySessionsPage.test.tsx` — tests adaptés (Total lecture seule, payload, historique) ; tests FR13 de plancher retirés
- `src/__tests__/MyHeatmapPage.test.tsx` — fixtures sans `durationMinutes` ; mock conservant les helpers réels

**Docs**
- `CHANGELOG.md` — entrée `[Unreleased]`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — statut 8-3 → review

## Change Log

| Date       | Version | Description                                                                 |
|------------|---------|-----------------------------------------------------------------------------|
| 2026-06-18 | 0.1     | Implémentation story 8.3 — suppression de la durée globale (modèle « tout est entrée ») : total = somme des entrées partout (formulaire lecture seule, historique, heatmap), retrait sync 6.1 + plancher, migration de conversion du delta en entrée Free practice + drop colonne. 224 front / 135 back ✓, migration testée localement. |
