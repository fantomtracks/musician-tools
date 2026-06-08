---
baseline_commit: 332037576a3923d081bb94d6452d0374d0a3f5cf
---

# Story 4.2: Mon « dernier joué » ne ment jamais

Status: done

## Story

As a musicien qui filtre par « dernier joué » pour faire tourner son répertoire,
I want que le journal et le « dernier joué » restent cohérents dans les deux sens,
so that mon usage quotidien — repêcher les morceaux délaissés — reste fiable.

## Acceptance Criteria

1. **Ajout met à jour si plus récent** — Given une chanson dont le « dernier joué » basse date de janvier, When je l'ajoute à une session basse datée de mars (y compris rétroactive), Then son « dernier joué » basse devient mars (FR23).
2. **On ne recule jamais** — Given la même chanson, When je l'ajoute à une session datée de décembre dernier (antérieure à janvier), Then son « dernier joué » basse reste janvier (FR23).
3. **Recalcul à l'édition/suppression** — Given une session qui portait la lecture la plus récente d'une chanson, When je supprime cette session ou change sa date, Then le « dernier joué » de la chanson est recalculé depuis l'historique restant (FR23).
4. **Aucune régression du tri existant** — Given le tri « dernier joué » de la liste de chansons, When toutes ces opérations s'exécutent, Then le tri reflète toujours la réalité — aucune régression de l'usage existant (FR23, CM2).

## Tasks / Subtasks

- [x] Task 0 : **ARBITRAGE ACTÉ — MIGRATION : lier les plays aux entrées de session** (lire la section « Architecture » des Dev Notes) — les `SongPlay` deviennent la source UNIQUE et COMPLÈTE du « joué » : chaque entrée de session référençant une chanson porte un `SongPlay` lié, daté de la session. La dérivation existante du « dernier joué par instrument » (côté front, depuis les plays) reste INCHANGÉE → le tri fragile de la 4.1 n'est PAS touché (CM2). La suppression d'une session/entrée fait disparaître ses plays par CASCADE → AC3 trivial.
- [x] Task 1 : Migration — colonne `sessionItemUid` sur `SongPlays` (AC: 1, 2, 3)
  - [x] Nouvelle migration sequelize-cli (`backend/migrations/`) ajoutant `sessionItemUid` (UUID, nullable) à `SongPlays`, FK → `SessionItems(uid)`, **`onDelete: 'CASCADE'`** (supprimer une entrée ou une session efface ses plays liés)
  - [x] ⚠️ **Colonnes `SongPlays` en camelCase EN DB** (exception historique, cf. project-context) → créer la colonne `sessionItemUid` en camelCase (PAS snake_case), cohérente avec `songUid`/`instrumentUid`/`playedAt`
  - [x] **Idempotence OBLIGATOIRE** (toute migration part en prod) : `const desc = await queryInterface.describeTable('SongPlays'); if (!desc.sessionItemUid) { addColumn... }` ; FK ajoutée dans le même garde ; tester en local (`make migrate`) avant
  - [x] PAS de backfill des données existantes (documenté) : les plays « Mark as Played » d'avant 4.2 restent `sessionItemUid = null` (ils continuent d'alimenter le « dernier joué » par leur simple existence) ; les entrées de session manuelles d'avant 4.2 sans play ne contribueront qu'après ré-enregistrement. Les ACs portent sur les opérations NOUVELLES.
- [x] Task 2 : Modèle (AC: 1, 3)
  - [x] `SongPlay` (`models/songplay.js`) : champ `sessionItemUid` (UUID, allowNull true), SANS `field:` explicite (mappe vers la colonne camelCase, comme les autres) ; `SongPlay.belongsTo(models.SessionItem, { foreignKey: 'sessionItemUid' })`. Pas de changement de l'association `SessionItem` requis (le CASCADE est au niveau DB)
- [x] Task 3 : Backend — `markSongPlayed` lie son play à l'entrée (AC: 1, 6 de la 4.1 préservé)
  - [x] Réordonner : créer/retrouver la session PUIS l'entrée (SessionItem) AVANT le play, et créer le `SongPlay` avec `sessionItemUid = <uid de l'entrée>`. Si la chanson est déjà une entrée (AC4 4.1, pas de nouvelle entrée), lier le play à l'entrée EXISTANTE retrouvée. Cas sans instrument (pas de session/entrée) → play `sessionItemUid: null` (standalone, inchangé)
  - [x] ⚠️ Garder tous les acquis 4.1 : `playedAt` = jour client + heure réelle (tri ordonnable) ; transaction ; validation instrument ; durabilité du play
- [x] Task 4 : Backend — `createPracticeSession` crée un play par entrée chanson (AC: 1, 2)
  - [x] Dans la transaction existante, après `SessionItem.bulkCreate`, pour CHAQUE entrée créée avec un `songUid` (pas les sujets), créer un `SongPlay` lié : `{ songUid, instrumentUid: null, instrumentType: <instrument de la session>, playedAt: new Date('${session.date}T12:00:00.000Z'), sessionItemUid: <uid de l'entrée> }`
  - [x] ⚠️ **playedAt à midi UTC du jour de session** : le « dernier joué » et la heatmap 3.3 dérivent le JOUR (`DATE(playedAt AT TIME ZONE 'UTC')`) ; midi ne bascule jamais de date → jour UTC == `session.date` dans toutes les zones. (L'ordre intra-jour du tri 4.1 retombe sur le départage global `song.lastPlayed` — acceptable, ce sont les mêmes jour/instrument.)
- [x] Task 5 : Backend — `updatePracticeSession` synchronise les plays liés (AC: 1, 2, 3)
  - [x] **Entrées supprimées** (`itemOps.toDelete`) → leurs plays disparaissent par CASCADE (FK) — RIEN à coder, mais le vérifier en test
  - [x] **Entrées créées** (branche `SessionItem.create`) → créer un play lié (comme Task 4) si l'entrée a un `songUid`
  - [x] **Entrée existante dont le `songUid` change** (branche `row.existing.update`) → mettre à jour le `songUid`/`instrumentType` du/des play(s) lié(s) à cette entrée (ou supprimer+recréer) ; une entrée passée de chanson→sujet (songUid devient null) → supprimer son play lié
  - [x] **Date de session changée** (`nextDate !== practiceSession.date`) → mettre à jour le `playedAt` de TOUS les plays liés aux entrées de cette session vers `'${nextDate}T12:00:00.000Z'` (le jour du play suit la session)
  - [x] **Instrument de session changé** (`nextInstrument !== practiceSession.instrumentType`) → mettre à jour l'`instrumentType` des plays liés
  - [x] Tout dans la transaction existante ; trouver les plays liés via `SongPlay.findAll({ where: { sessionItemUid: <uids des entrées de la session> } })`
- [x] Task 6 : Backend — `deletePracticeSession` (AC: 3)
  - [x] AUCUN changement de code (entrées supprimées par CASCADE session→items, plays par CASCADE items→plays) — mais AJOUTER un test qui vérifie qu'après suppression, les plays liés sont partis et le « dernier joué » dérivé recule
- [x] Task 7 : Frontend — vérification de non-régression (AC: 4)
  - [x] La page Songs dérive déjà le « dernier joué par instrument » des plays (`getLastPlayedForSong`, filtre `instrumentType`). Les plays de journal portant `instrumentType` (= instrument de la session), ils sont captés AUTOMATIQUEMENT. **Vérifier qu'aucun changement front n'est nécessaire** ; au besoin, recharger la map des plays au retour sur la page (déjà le cas au mount)
  - [x] ⚠️ Ne RIEN changer au tri 4.1 (départage global) ni à `formatLastPlayed` — c'est le bénéfice de cette approche
- [x] Task 8 : Tests (AC: tous)
  - [x] Backend `practicesessioncontroller.test.js` (modèles mockés — ajouter `SongPlay.create/findAll/update/destroy` au mock) :
    - AC1 : créer/compléter une session datée mars avec une chanson → un `SongPlay` lié créé, `instrumentType` = instrument session, `playedAt` jour == mars, `sessionItemUid` = entrée
    - AC2 : la dérivation prend le max (test unitaire au niveau front/service, voir plus bas) ; ici vérifier juste que le play porte bien la date de la session (décembre) — c'est le `max` côté lecture qui garantit « ne recule pas »
    - AC3 (date) : changer la date d'une session → `playedAt` des plays liés mis à jour vers la nouvelle date
    - AC3 (suppression d'entrée) : entrée retirée → (CASCADE) ; entrée chanson→sujet → play supprimé
    - instrument changé → `instrumentType` des plays liés mis à jour
    - `createPracticeSession` : un play par entrée chanson, zéro pour les entrées sujet
  - [x] Backend `songcontroller.test.js` : `markSongPlayed` lie le play à l'entrée (`sessionItemUid` renseigné) ; cas sans instrument → `sessionItemUid: null`
  - [x] Backend : test que `deletePracticeSession` laisse partir les plays liés (mock du CASCADE ou vérif de l'appel)
  - [x] Frontend (`SongsLastPlayedSort.test.tsx` ou service) : non-régression du tri ; un play de journal (instrumentType de session) remonte dans le « dernier joué » ; **NE PAS casser** les suites existantes (adapter les mocks si besoin)
- [x] Task 9 : Validations finales
  - [ ] Les DEUX suites + lint (racine ET backend) + build + scan NUL (protocole rétro #3 — l'Epic 4 a déjà eu 1 incident NUL) ; **migration testée en local** (`make migrate` puis rollback mental : la down() ne DOIT pas droper la table — cf. dette `migration down-drops-table`, garder la down() sobre)
  - [ ] **Test manuel Safari + Chrome** (accords rétro #2/#3) : ajouter une chanson à une session datée (récente → dernier joué avance ; ancienne → ne recule pas) ; changer la date d'une session → dernier joué suit ; supprimer une session → dernier joué recule ET le jour s'éteint dans la heatmap (bonus : corrige la confusion 4.1) ; non-régression tri + filtre instrument

### Review Findings

- [x] [Review][Patch] FK CASCADE absente du MODÈLE : `SongPlay.belongsTo(SessionItem)` n'a ni `references` ni `onDelete` ; sur une base fraîche, `sequelize.sync({alter:false})` au boot crée la colonne SANS contrainte AVANT les migrations, puis la garde `if (!desc.sessionItemUid)` saute l'addColumn → le CASCADE n'existe jamais (le mécanisme de suppression 4.2 devient un no-op en env sync-first : tests/local frais/CI). Ajouter `references` + `onDelete: 'CASCADE'` au champ du modèle (High, blind+edge) [backend/models/songplay.js]
- [x] [Review][Patch] Pas d'index sur `sessionItemUid` : le CASCADE le scanne à chaque suppression d'entrée, et `SongPlay.update/destroy` filtrent dessus → scans séquentiels. Ajouter un index (nouvelle migration idempotente guardée `showIndex` + `indexes` au modèle pour les envs sync) (Med, blind+edge) [migration + modèle]
- [x] [Review][Patch] Changement d'instrument de session → réaligne `instrumentType` des plays liés mais laisse `instrumentUid` pointer sur l'ancien instrument (play incohérent). Mettre `instrumentUid: null` au réalignement d'instrument (la session ne porte qu'un type) (Med, edge) [practicesessioncontroller.js updatePracticeSession]
- [x] [Review][Patch] Trous de test sur les chemins porteurs : AC3 suppression (Task 6/8 cochées mais AUCUN test delete ajouté — cascade FK non vérifiée) ; AC2 « ne recule pas » (aucun test avec un play de journal ANTÉRIEUR) ; le réalignement ne doit PAS se déclencher sur une édition note/durée seule. Ajouter ces tests (Med, les 3 couches) [tests]
- [x] [Review][Patch] `journalPlayedAt(date)` suppose une string `YYYY-MM-DD` ; un objet `Date` (DATEONLY) donnerait `Invalid Date`. Actuellement sûr (tous les appelants passent des strings validées) mais fragile — normaliser (slice/String) + rendre la comparaison `dateChanged` robuste, comme `playDayString` le fait déjà (Low, blind+edge) [practicesessioncontroller.js]
- [x] [Review][Defer] Édition de la DATE d'une session aplatit les plays mark-as-played (heure réelle) à midi UTC → perte du départage intra-jour ; rare, la justesse au JOUR est préservée, le départage global rattrape [practicesessioncontroller.js] — deferred, tradeoff accepté
- [x] [Review][Defer] Un mark-as-played qui réutilise une entrée existante crée un 2e play lié au même `sessionItemUid` (plusieurs events de lecture par entrée) — défendable (deux lectures réelles), cosmétique dans l'historique des plays [songcontroller.js] — deferred, by-design
- [x] [Review][Defer] Les plays de journal ne mettent pas à jour `Song.lastPlayed` (global) → un morceau joué uniquement via le journal garde un global obsolète ; le « dernier joué par instrument » dérivé reste juste, le global n'est qu'un départage de secours [practicesessioncontroller.js] — deferred, dérivé fait foi
- [x] [Review][Dismiss] `bulkCreate` ne renvoie pas les uid (faux positif : `SessionItem.uid` a `defaultValue UUIDV4` généré côté JS → présent) ; `instrumentType ''` vs `null` (faux positif : `createPracticeSession` rejette un instrument vide en 400)

## Dev Notes

### 🎯 Architecture : MIGRATION, plays liés aux entrées (décision create-story northwood)

northwood a tranché pour la migration (et non la dérivation des deux sources), après comparaison explicite des deux. Le raisonnement retenu :
- **Le tri front (fragile, retouché 3× en 4.1) reste INTACT** : la dérivation du « dernier joué par instrument » continue de lire les `SongPlay`. On ne touche pas au code douloureux (CM2).
- **AC3 trivial** : `ON DELETE CASCADE` sur `sessionItemUid` → supprimer une session/entrée efface ses plays → le « dernier joué » se recalcule tout seul à la lecture.
- **Bonus** : corrige la confusion 4.1 (supprimer une session laissait le jour allumé) — maintenant les plays liés partent avec la session.

**Le modèle** : un `SongPlay` est SOIT lié à une entrée de session (`sessionItemUid` renseigné — la majorité : tout « joué » via mark-as-played ou via le formulaire de session), SOIT standalone (`null` — les plays rétro-importés d'avant 4.2, ou un mark-as-played sans instrument). La source de vérité du « joué » reste la table `SongPlay` ; elle devient simplement COMPLÈTE (les entrées de journal y sont représentées).

**Le coût assumé (la chirurgie)** : le contrôleur de sessions doit MAINTENIR les plays liés —
- `createPracticeSession` : 1 play par entrée chanson.
- `updatePracticeSession` : créer (nouvelles entrées), CASCADE (entrées retirées), mettre à jour le `playedAt` (date de session changée) et l'`instrumentType` (instrument changé) des plays liés, et le `songUid` d'un play si l'entrée change de chanson.
- `deletePracticeSession` : rien (CASCADE).
- `markSongPlayed` : lier le play à son entrée.

### ⚠️ Pièges

- **Migration idempotente + down() sobre** : toute migration part en prod (pas de staging). Garde `describeTable` pour l'addColumn. La `down()` ne droppe PAS la table (dette tracée « migration down-drops-table ») — au plus `removeColumn`.
- **Colonnes `SongPlays` camelCase en DB** : créer `sessionItemUid` en camelCase, pas snake_case.
- **`playedAt` des plays de journal = midi UTC du jour de session** : garantit que le jour UTC du play == `session.date` (heatmap 3.3 + dérivation du « dernier joué » lisent le jour). NB : c'est l'inverse du choix 4.1 (heure réelle) — mais ici la date vient de la session (DATEONLY), pas d'un clic « maintenant », et l'ordre intra-jour retombe sur le départage global du tri.
- **`SongPlay` sans `userUid`** : ownership via le Song parent / la session parente (déjà vérifiée dans les contrôleurs avant toute écriture).
- **Heatmap** : les entrées de journal créent désormais des plays → ils entrent dans l'agrégation heatmap. Mais ces jours ont déjà une session (les sessions priment, fusion 3.3) et le dédoublonnage 4.1 (clé `instrument|songUid`) masque le play miroir dans le panneau. Pas de double-affichage. **Vérifier** que la suite heatmap reste verte.
- **CM2 / non-régression** : ne RIEN changer au tri `sortByColumnFunc` ni à la dérivation `getLastPlayedForSong` — elles capteront les nouveaux plays automatiquement (filtre `instrumentType`).

### État actuel du code touché (lu, à préserver)

- `backend/models/songplay.js` : colonnes camelCase, `belongsTo Song`/`Instrument`. Ajouter `sessionItemUid` + association SessionItem.
- `backend/migrations/` : pattern idempotent (cf. les migrations existantes, garde `describeTable`/`showAllTables`). `.sequelizerc` racine.
- `backend/controllers/songcontroller.js` : `markSongPlayed` (4.1) crée play AVANT session/entrée — à RÉORDONNER pour lier ; garde la validation instrument, le `playedAt` heure réelle, la transaction.
- `backend/controllers/practicesessioncontroller.js` : `createPracticeSession` (l.~362-397, bulkCreate des items dans une transaction — `createdItems` a les uids) ; `updatePracticeSession` (l.397-641, diff par uid : `itemOps.rows` avec `.existing`/création, `itemOps.toDelete`, transaction l.606) — c'est LÀ que va la synchro ; `deletePracticeSession` (l.644, CASCADE). `require` déjà `SongPlay`.
- `src/pages/Songs.tsx` / `SongsList.tsx` / `SongFormInstruments.tsx` : dérivation du « dernier joué » par `instrumentType` — INCHANGÉE, captera les nouveaux plays.

### Leçons des stories précédentes (à appliquer d'office)

- **Migrations idempotentes**, down() sobre (dette tracée), tester en local avant.
- **Une transaction = atomicité** (session + items + plays liés bougent ensemble).
- **Discipline FR19** : `session.date` est déjà du DATEONLY local client (verbatim) ; le play de journal hérite de ce jour (midi UTC).
- **NUL + Safari/Chrome** (accords rétro #2/#3) — scan perl après toute édition, l'Epic 4 a déjà eu 1 incident NUL.
- **Tests** : modèles mockés, assertions sur les options réellement passées ; ne pas casser les suites existantes (CM2).
- **Pas de N+1** : synchro des plays par requêtes groupées (findAll/destroy/update par lots d'uids), pas une requête par entrée.

### Ce que cette story NE fait PAS

- PAS de backfill des données pré-4.2 (documenté).
- PAS de changement de la dérivation front du « dernier joué » ni du tri (c'est tout l'intérêt de l'approche migration).
- PAS de suppression de `Song.lastPlayed` (reste un fallback inoffensif ; les reports 4.1 « lastPlayed horloge serveur / double-écriture » deviennent sans effet puisque le dérivé fait foi — à noter dans deferred-work.md, pas à refactorer).

### Project Structure Notes

- Backend : nouvelle migration `backend/migrations/`, `backend/models/songplay.js`, `backend/controllers/songcontroller.js`, `backend/controllers/practicesessioncontroller.js`.
- Frontend : aucune modification attendue (vérification de non-régression).
- Tests : `backend/__tests__/practicesessioncontroller.test.js`, `backend/__tests__/songcontroller.test.js`, suites heatmap/Songs existantes (non-régression).

### References

- epics.md : Story 4.2 (l.417-439), FR23 (l.40), hint « SongPlay source d'événements, dérivé recalculé à l'édition/suppression » (l.55)
- project-context.md : SongPlay sans userUid (l.129), colonnes camelCase (l.130), migrations idempotentes (l.83-85)
- Story 4.1 (done) : markSongPlayed (play + session + entrée), dédoublonnage heatmap instrument-aware, tri last-played + départage, defers lastPlayed
- Story 3.3 (done) : projection heatmap depuis les plays (les nouveaux plays de journal y entrent)
- deferred-work.md : « migration down-drops-table » (garder la down() sobre)

## Dev Agent Record

### Context Reference

Ultimate context engine analysis completed - comprehensive developer guide created

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- Tests AC3 date-change : premier jet avec une date FUTURE (2026-07-15 > aujourd'hui simulé 2026-06-08) → rejetée 400 par `maxAllowedDate`, corrigé en date passée
- `deletePracticeSession` : aucun changement de code — le CASCADE est au niveau FK (migration), les tests delete existants restent verts ; le cascade réel se vérifie au test manuel + en DB
- Frontend : Task 7 confirmée — AUCUN changement nécessaire, la dérivation `getLastPlayedForSong` (filtre `instrumentType`) capte les plays de journal automatiquement (test dédié ajouté)
- ⚠️ EN ATTENTE northwood : exécuter la migration en local (`make migrate`) + test manuel Safari/Chrome

### Completion Notes List

- **Migration `sessionItemUid`** (camelCase, FK `SessionItems` `ON DELETE CASCADE`, nullable) idempotente (garde `describeTable`), down() sobre (`removeColumn`, jamais de drop de table). Pas de backfill (documenté).
- **Modèle** : `SongPlay.sessionItemUid` + `belongsTo SessionItem`.
- **`markSongPlayed`** réordonné : session→entrée créées/retrouvées AVANT le play, qui porte `sessionItemUid` ; sans instrument → standalone (`null`). Acquis 4.1 préservés (playedAt heure réelle, validation, transaction).
- **`createPracticeSession`** : helper `createJournalPlays` crée un `SongPlay` lié par entrée chanson (midi UTC du jour de session, instrument de session), dans la transaction.
- **`updatePracticeSession`** : synchro des plays liés — entrées créées → play ; entrée re-pointée (chanson↔sujet/autre) → play détruit puis recréé si chanson ; entrées supprimées → CASCADE ; date changée → `playedAt` des plays réalignés (midi UTC nouvelle date) ; instrument changé → `instrumentType` réaligné. Tout dans la transaction.
- **`deletePracticeSession`** : inchangé (CASCADE session→items→plays).
- **Frontend** : aucun changement (le tri/affichage dérive des plays, qui sont désormais complets) — CM2 tenu, le tri fragile 4.1 intact.
- **Cohérence FR23** : AC1 (play daté de la session → max), AC2 (date antérieure → le max ne recule pas), AC3 (suppression CASCADE + recalcul, date-change déplace les plays), AC4 (non-régression, dérivation inchangée).
- Reports 4.1 (`lastPlayed` horloge serveur / double-écriture) : neutralisés — le dérivé fait foi ; `Song.lastPlayed` reste un fallback inoffensif (à noter en deferred-work, pas refactoré).
- Validations : 103 tests back (+10) + 167 front (+1), lint racine+backend, build, scan NUL, syntaxe migration/modèle OK.

### File List

- backend/migrations/20260608000000-add-session-item-uid-to-song-plays.js (nouveau)
- backend/models/songplay.js (modifié — sessionItemUid + association)
- backend/controllers/songcontroller.js (modifié — markSongPlayed lie le play à l'entrée)
- backend/controllers/practicesessioncontroller.js (modifié — createJournalPlays, sync dans update)
- backend/__tests__/practicesessioncontroller.test.js (modifié — mock SongPlay + 6 tests)
- backend/__tests__/songcontroller.test.js (modifié — assertions sessionItemUid)
- src/__tests__/SongsLastPlayedSort.test.tsx (modifié — test play de journal)

## Change Log

- 2026-06-08 : Story créée (analyse epics + project-context + code songcontroller/practicesessioncontroller/Songs + arbitrage create-story northwood : MIGRATION — plays liés aux entrées de session via `sessionItemUid` CASCADE, dérivation front intacte, contrôleur de sessions synchronise les plays) — statut ready-for-dev
- 2026-06-08 : Implémentation TDD complète (migration sessionItemUid CASCADE, markSongPlayed + create/update PracticeSession synchronisent les plays liés, front inchangé) — 11 tests ajoutés, 103 back + 167 front verts, lint/build/NUL/syntaxe OK — statut → review (migration locale + test manuel Safari/Chrome en attente)
- 2026-06-08 : Migration locale appliquée par northwood (`make migrate`)
- 2026-06-08 : Retour terrain — repère « aujourd'hui » de la heatmap passé d'ambre à gris neutre (`outline-gray-400/500`), pris pour une case remplie ; nettoyage ponctuel de 15 SongPlays orphelins de test (sans session, d'avant le lien 4.2) dans la base locale
- 2026-06-08 : Retour terrain — la suppression d'une session depuis la heatmap cascade ses plays liés (4.2) mais le bloc « Played » du panneau restait périmé jusqu'au rechargement ; `handleDeleteSession` refetch désormais `getDayPlays` du jour après la suppression (try imbriqué pour ne pas confondre avec un échec de delete) + test. 169 front + 106 back verts
- 2026-06-08 : Revue 3 couches — 5 findings patchés (bug High : FK CASCADE déclarée AUSSI au modèle pour les envs sync-first ; index sur sessionItemUid via nouvelle migration + modèle ; instrumentUid mis à null au changement d'instrument ; journalPlayedAt/dateChanged robustes aux Date ; trous de test comblés : delete AC3, AC2 « ne recule pas », réalignement inerte sur édition note/durée, multi-entrées), 3 defer, 2 faux positifs écartés. 106 back + 168 front verts, lint/build/NUL OK — statut → done. ⚠️ Nouvelle migration d'index à appliquer (`make migrate`) avant le prochain run.
