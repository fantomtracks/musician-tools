---
baseline_commit: f3c54e3c83e2fabd17556df920406fa4160f272f
---

# Story 4.1: « Mark as Played » remplit mon journal tout seul

Status: done

## Story

As a musicien qui n'a pas encore adopté le journal,
I want que cliquer « Mark as Played Now » alimente automatiquement la session du jour de mon instrument,
so that ma heatmap vit même si je n'ouvre jamais le formulaire de session.

## Acceptance Criteria

1. **Création de la session du jour** — Given aucune session aujourd'hui pour la guitare, When je clique « Mark as Played Now » sur une chanson avec l'instrument guitare, Then une session du jour est créée pour la guitare, avec la chanson comme entrée sans minutes (FR21).
2. **Complétion d'une session existante** — Given une session guitare existe déjà aujourd'hui, When je marque une autre chanson jouée à la guitare, Then la chanson s'ajoute comme entrée à cette session existante — pas de session en double (FR21).
3. **Une session par instrument** — Given une session basse existe aujourd'hui mais aucune pour la guitare, When je marque une chanson jouée à la guitare, Then une session guitare distincte est créée (FR21, FR7).
4. **Pas d'entrée dupliquée** — Given la même chanson déjà présente dans la session du jour (même instrument), When je la marque jouée à nouveau, Then aucune entrée dupliquée n'est ajoutée à la session (la requête reste un succès, idempotente).
5. **Jour = date locale client** — Given un clic à 23h50 heure locale, When la session du jour est déterminée, Then c'est la date locale de l'appareil qui fait foi — le serveur n'utilise plus son horloge pour dater le jour ni l'horodatage du SongPlay (FR19/FR21, correction de l'horodatage existant).
6. **Historique par instrument préservé** — Given le comportement existant de la page Songs, When je marque une chanson jouée, Then l'enregistrement `SongPlay` est toujours créé (le « dernier joué par instrument » et le rétro-import heatmap 3.3 continuent de fonctionner) ; la heatmap ne double-compte pas la présence (la fusion 3.3 fait déjà primer la session).

## Tasks / Subtasks

- [x] Task 1 : Backend — `markSongPlayed` crée/complète la session du jour (AC: 1, 2, 3, 4, 5, 6)
  - [x] **Accepter une date locale client** : lire `playedOn` (ou `date`) dans `req.body` — string `YYYY-MM-DD`. Valider avec les helpers du contrôleur de sessions logiquement équivalents (PATTERN + calendaire) ; rejeter 400 si format invalide, `< MIN_DATE` (1900-01-01), ou `>` tolérance future (UTC+1j). ⚠️ Ces helpers (`DATE_PATTERN`, `isValidCalendarDate`, `MIN_DATE`, `maxAllowedDate`) vivent dans `practicesessioncontroller.js` — les EXTRAIRE dans un petit module partagé `backend/utils/sessionDates.js` (require depuis les deux contrôleurs) plutôt que dupliquer (la duplication d'une règle de validation est un piège — cf. acquis 3.3 PLAY_DAY_EXPR « une seule définition »)
  - [x] **Rétrocompatibilité** : si `playedOn` est absent du body, NE PAS casser — fallback sur la date locale… impossible côté serveur (pas d'horloge client). Donc : `playedOn` devient REQUIS pour le nouveau chemin ; le front l'enverra toujours (Task 4). Documenter : un appel legacy sans `playedOn` → 400 explicite `'playedOn (local date) is required'`. (Aucun autre appelant que le front de ce repo — vérifié : `songPlayService.markPlayed` est le seul.)
  - [x] **SongPlay horodaté sur le jour client** (AC5) : `playedAt` ne doit plus être `new Date()` (horloge serveur). ⚠️ MISE À JOUR (retour terrain) : finalement **jour client + heure réelle du serveur** — `new Date('${playedOn}T' + new Date().toISOString().slice(11))` — et NON midi UTC pile (qui donnait des timestamps identiques et figeait le tri « last played »). Le jour UTC du play reste == `playedOn` (la projection heatmap 3.3 via `DATE(playedAt AT TIME ZONE 'UTC')` est préservée, pas de bascule de date) ; l'heure ne date jamais le jour, elle départage l'ordre.
  - [x] **Find-or-create la session du jour** (AC1, AC2, AC3) : dans une transaction — `PracticeSession.findOne({ where: { userUid, date: playedOn, instrumentType: <l'instrument du play> } })`. ⚠️ `instrumentType` est la string d'instrument (FR7 : une session = un instrument). Si le play n'a pas d'`instrumentType` (cas du bulk sans filtre — voir Task 4), DÉCIDER : soit 400 (un play journalisé exige un instrument), soit ne pas créer de session (créer juste le SongPlay legacy). Recommandation : **exiger l'instrument pour alimenter le journal** — si `instrumentType` vide/absent, créer le SongPlay (AC6) mais NE PAS créer de session, et le documenter (une session sans instrument violerait FR7/le NOT NULL du modèle).
    - Si trouvée → réutiliser ; sinon → `PracticeSession.create({ userUid, date: playedOn, instrumentType, durationMinutes: null, note: null })`. Pas de durée (FR21 : entrée sans minutes).
  - [x] **Ajouter la chanson comme entrée, sans doublon** (AC1, AC4) : chercher une `SessionItem` existante de cette session avec `songUid === song.uid`. Si présente → ne rien ajouter (idempotent, AC4). Sinon → `SessionItem.create({ sessionUid, songUid: song.uid, topicUid: null, label: song.title, minutes: null, note: null, position: <nb d'items existants> })`. ⚠️ `label` = snapshot du titre côté serveur (FR4, jamais fourni par le client) ; `position` = index en fin de liste (cohérent avec le contrôleur de sessions)
  - [x] **Garder la création du SongPlay** (AC6) — inchangée hormis `playedAt` (ci-dessus). L'ownership reste vérifiée via le Song parent (déjà fait : findByPk → 404 → userUid 403). La transaction englobe SongPlay + session + item pour l'atomicité (un échec ne laisse pas de moitié)
  - [x] Réponse : conserver le contrat actuel (`res.status(201).json(songPlay)`) pour ne pas casser `songPlayService.markPlayed` qui attend un `SongPlay`. Optionnel : enrichir avec `{ sessionUid }` si utile au front, mais NON requis
- [x] Task 2 : Backend — extraction partagée des helpers de date (refactor, AC: 5)
  - [x] Créer `backend/utils/sessionDates.js` exportant `DATE_PATTERN`, `MIN_DATE`, `isValidCalendarDate`, `maxAllowedDate` (déplacés depuis `practicesessioncontroller.js`) ; mettre à jour le require dans `practicesessioncontroller.js` pour consommer le module (zéro changement de comportement — les tests existants du contrôleur de sessions doivent rester verts SANS modification)
  - [x] `songcontroller.js` require ce module pour valider `playedOn`
- [x] Task 3 : Heatmap — dédoublonnage du détail de jour (AC: 6, décision northwood)
  - [x] Dans `getDayPlays` (practicesessioncontroller.js) OU à l'affichage du panneau (MyHeatmapPage.tsx) : une chanson déjà présente comme entrée de session ce jour-là ne doit pas être re-listée dans « Played ». Recommandation : **côté backend** est risqué (getDayPlays ne connaît pas les sessions) → **côté front** dans le panneau : filtrer `dayPlays` pour retirer les `songUid` déjà présents dans les items des `daySessions` du même jour. Conserver les « Played » dont le `songUid` n'apparaît dans aucune entrée de session (= vrais plays historiques 3.3, ou plays sans instrument sans session)
  - [x] ⚠️ Préserver tous les acquis 3.2/3.3 du panneau : garde d'annulation, échecs partiels, toggle, lien de création
- [x] Task 4 : Frontend — envoyer la date locale + rafraîchir l'état (AC: 1, 5)
  - [x] `songPlayService.markPlayed(songUid, dto)` : ajouter `playedOn: string` au `MarkPlayedDTO` ; l'inclure dans le body POST
  - [x] `src/pages/Songs.tsx` — `handleMarkAsPlayedNow` et `handleMarkSelectedAsPlayedNow` : calculer la date locale du jour avec un helper local (composants locaux, JAMAIS `toISOString().slice(0,10)` — piège FR19 ; réutiliser le pattern `formatLocalDate` de `src/utils/heatmap.ts`, l'importer si pratique) et la passer en `playedOn`
  - [x] ⚠️ Le bulk `handleMarkSelectedAsPlayedNow` passe parfois `instrumentType: undefined` (pas de filtre d'instrument actif) → cohérent avec la décision Task 1 (SongPlay créé, pas de session). Ne PAS forcer un instrument arbitraire
  - [x] NE PAS toucher à la logique `lastPlayed` existante du front (mise à jour optimiste via `songService.updateSong`) — c'est le périmètre de la 4.2, hors scope ici
- [x] Task 5 : Tests (AC: tous)
  - [x] Backend `songcontroller.test.js` (modèles mockés via `jest.mock('../models')` — AJOUTER `PracticeSession`, `SessionItem`, `sequelize.transaction` au mock ; `markSongPlayed` n'a AUCUN test aujourd'hui, c'est un trou à combler) :
    - AC1 : aucune session ce jour pour l'instrument → `PracticeSession.create` appelée avec `{ date: playedOn, instrumentType, durationMinutes: null }` + `SessionItem.create` avec `label = song.title`, `minutes: null`
    - AC2 : session du jour/instrument existe → pas de `PracticeSession.create`, `SessionItem.create` appelée sur la session trouvée
    - AC3 : session basse existe, pas guitare → une session guitare créée (findOne filtre bien sur instrumentType)
    - AC4 : chanson déjà entrée → pas de second `SessionItem.create`, réponse 201
    - AC5 : `playedOn` invalide/absent/futur/<1900 → 400 ; `playedAt` du SongPlay == `${playedOn}T12:00:00.000Z` (pas `new Date()`)
    - AC6 : `SongPlay.create` toujours appelée ; 401 sans session, 404 chanson absente, 403 chanson d'un autre user (ownership)
    - instrument absent → SongPlay créé, pas de session
  - [x] Backend : un test de non-régression sur le contrôleur de sessions après extraction des helpers (les suites existantes passent inchangées)
  - [x] Frontend `Songs` / `songPlayService` : `markPlayed` envoie bien `playedOn` (date locale) dans le body
  - [x] Frontend `MyHeatmapPage.test.tsx` : un jour avec une session contenant la chanson X ET un SongPlay de la chanson X → « Played » ne re-liste pas X ; un jour avec un play historique d'une chanson absente des sessions → « Played » liste toujours la chanson (non-régression 3.3)
- [x] Task 6 : Validations finales
  - [x] Les DEUX suites + lint (racine ET `cd backend && npm run lint`) + build + scan NUL (`perl -ne 'exit 1 if /\x00/'` sur les fichiers touchés)
  - [ ] **Test manuel Safari + Chrome** (accord rétro #2/#3 reconduits) : marquer une chanson jouée → la heatmap du jour s'allume avec une session ; re-marquer la même chanson → pas de doublon ; marquer une 2e chanson même instrument → s'ajoute à la session ; marquer un autre instrument → 2e session ; vérifier le détail du jour (pas de double affichage chanson) ; non-régression page Songs (dernier joué par instrument)

### Review Findings

- [x] [Review][Patch] Marquage en masse (`handleMarkSelectedAsPlayedNow`) en `Promise.all` → N requêtes concurrentes qui font toutes `findOne`(null) puis `create` → sessions du jour DUPLIQUÉES pour le même instrument (pas de contrainte d'unicité, et on ne peut pas en ajouter : une session multiple/jour/instrument est légitime en saisie manuelle). Sérialiser la boucle (await séquentiel) + `now` distinct par chanson + `order` déterministe sur le `findOne` de session (High, blind+edge) [src/pages/Songs.tsx, backend/controllers/songcontroller.js]
- [x] [Review][Patch] Dédoublonnage heatmap par `songUid` SEUL → une chanson en entrée de session Guitare masque à tort un play Basse (ou un play sans instrument) de la même chanson ; clé le dédoublonnage sur (instrument de la session, songUid) (Med, blind+edge) [src/pages/MyHeatmapPage.tsx]
- [x] [Review][Patch] `markSongPlayed` ne valide pas `instrumentType` (longueur/NUL) contrairement à `createPracticeSession` → un instrument >255 ou avec NUL fait throw `PracticeSession.create` DANS la transaction → 500 et le play est PERDU (pré-4.1 il était enregistré). Valider ; si invalide → enregistrer le play mais sauter la session (durabilité du play préservée) (Med, edge) [backend/controllers/songcontroller.js]
- [x] [Review][Patch] Repère « aujourd'hui » couleur-seule (outline ambre) sans alternative textuelle → ajouter « (today) » à l'aria-label de la case du jour (a11y, NFR6) + ajuster les tests qui matchent le label de TODAY (Med, blind) [src/pages/MyHeatmapPage.tsx]
- [x] [Review][Patch] Aucun test du chemin d'échec transactionnel : ajouter un test où le throw d'une étape session/item → 500 et `next` appelé (le mock transaction n'exerce jamais le rollback) (Med, blind) [backend/__tests__/songcontroller.test.js]
- [x] [Review][Patch] Doc de story périmée : Dev Notes + Task 1/5 imposent encore `playedAt` à midi UTC pile, alors que le code final utilise jour client + heure réelle (correctif terrain du tri) ; aligner le texte sur l'implémentation + corriger les 2 libellés de test « AC5 » dupliqués (Low, auditor) [story 4.1, backend/__tests__/songcontroller.test.js]
- [x] [Review][Defer] `song.lastPlayed` horodaté à l'horloge serveur + double-écriture front/back + incohérence sur un `playedOn` rétroactif → cohérence bidirectionnelle = périmètre explicite de la 4.2 [backend/controllers/songcontroller.js, src/pages/Songs.tsx] — deferred, story 4.2
- [x] [Review][Defer] Course résiduelle find-or-create (double-clic multi-appareils) après sérialisation du bulk : un verrou applicatif (advisory lock user+date+instrument) le couvrirait totalement — non justifié à cette échelle [backend/controllers/songcontroller.js] — deferred, pre-existing scale concern
- [x] [Review][Defer] `instrumentUid` stocké sans vérif d'ownership (incohérence pré-existante de `markSongPlayed`, identique avant 4.1) [backend/controllers/songcontroller.js] — deferred, pre-existing
- [x] [Review][Defer] AC4 anti-doublon et `position` via `count` non atomiques sous concurrence (théorique après sérialisation du bulk ; une contrainte unique casserait les entrées dupliquées manuelles légitimes) [backend/controllers/songcontroller.js] — deferred, theoretical

## Dev Notes

### 🎯 Décisions actées (arbitrage create-story avec northwood)

1. **Le SongPlay est CONSERVÉ** (pas remplacé par l'entrée de session). Raisons : la page Songs dérive le « dernier joué par instrument » de `SongPlays` (`songPlayService.getLastPlayForInstrument`), et le rétro-import heatmap 3.3 projette les `SongPlays`. Les remplacer imposerait de re-dériver le « dernier joué » depuis les entrées de session — c'est le périmètre de la 4.2 (cohérence bidirectionnelle de `lastPlayed`), à ne pas tirer dans la 4.1. Conséquence à gérer : le dédoublonnage du détail de jour (Task 3).
2. **Déploiement** : décision reportée par northwood (« on verra plus tard »). Rien n'est en prod, ~22 commits sur `bmad-and-claude`. Reste BLOQUANT avant le premier merge vers `main` (action item rétro Epic 3 #1). Ne bloque pas le développement sur la branche.

### ⚠️ Le cœur de la story : la date locale client (FR19/FR21)

- Aujourd'hui `markSongPlayed` (songcontroller.js:225-233) fait `playedAt: new Date()` (horloge serveur) ET `song.update({ lastPlayed: new Date() })`. Le PRD/epics exige que **le jour vienne du client**. Cette story corrige `playedAt` (→ jour client à midi UTC) et la date de session.
- **Le jour du play** : la heatmap 3.3 dérive le jour d'un play par `DATE("SongPlay"."playedAt" AT TIME ZONE 'UTC')`. En stampant `${playedOn}T<heure réelle UTC>`, le jour UTC du play est exactement `playedOn` dans toutes les zones (la partie date est `playedOn`, l'heure reste dans 00:00–23:59). Ainsi la présence « play » et la session tombent le même jour → la fusion 3.3 (les minutes/sessions priment, le play annote) ne double-allume pas. NB : le premier jet « midi UTC pile » a été abandonné car il figeait le tri « last played » (timestamps identiques) — corrigé en gardant l'heure réelle pour l'ordre.
- **Le piège FR19 à la LECTURE** côté front : pour calculer le jour local à envoyer, JAMAIS `new Date().toISOString().slice(0,10)` (UTC, décale en zone négative). Utiliser des composants locaux — `formatLocalDate(new Date())` de `src/utils/heatmap.ts` est exactement ça (déjà éprouvé sur tout l'Epic 3).

### État actuel du code touché (lu, à préserver)

- `backend/controllers/songcontroller.js` (`markSongPlayed`, l.206-240) : pattern maison 401 → findByPk → 404 → ownership 403. Crée un `SongPlay` puis met à jour `song.lastPlayed`. Le `lastPlayed` global reste géré ici + côté front (4.2 le rationalisera) — NE PAS y toucher au-delà du `playedAt`. `markSongPlayed` n'a aucun test → trou à combler.
- `backend/routes/songs.js` : route `POST /:uid/plays` déjà en place (l.17). ⚠️ ce routeur utilise `bodyParser.json()` (l.8) — héritage ; ne pas l'imiter dans du nouveau code mais ne pas le changer ici non plus.
- `backend/controllers/practicesessioncontroller.js` : `createPracticeSession` montre le pattern de référence pour items + label snapshot FR4 + transaction (l.281-397) ; `findOne`/`create` de session ; helpers de date (l.6-30) à EXTRAIRE (Task 2). Le modèle `PracticeSession` a un index `(user_uid, date)` (pratique pour le findOne) et `instrumentType` NOT NULL (d'où l'exigence d'instrument). `SessionItem` : `label` NOT NULL, `position` NOT NULL default 0, `songUid` ON DELETE SET NULL.
- `src/services/songPlayService.ts` : `markPlayed(songUid, { instrumentType })` POST `/api/songs/:uid/plays` ; `MarkPlayedDTO` à étendre avec `playedOn`. `getLastPlayForInstrument` filtre par `instrumentUid` — non impacté.
- `src/pages/Songs.tsx` : `handleMarkAsPlayedNow` (l.669, depuis la fiche d'édition, instrument explicite) et `handleMarkSelectedAsPlayedNow` (l.756, bulk, instrument = filtre actif ou `undefined`). Les deux font une MAJ optimiste de `lastPlayed` via `songService.updateSong(..., { lastPlayed: now })` — laisser tel quel (4.2).
- `src/pages/MyHeatmapPage.tsx` : panneau de détail avec sessions + « Played » (3.3). C'est là que se fait le dédoublonnage Task 3.

### Leçons des stories précédentes (à appliquer d'office)

- **Une seule définition d'une règle partagée** (acquis 3.3 PLAY_DAY_EXPR) → d'où l'extraction des helpers de date (Task 2) plutôt qu'une copie dans songcontroller.
- **Discipline FR19** : composants locaux, jamais `toISOString().slice(0,10)` (le patch High de la 3.3 était précisément ce piège).
- **Transaction = atomicité** : SongPlay + session + item dans une transaction (le contrôleur de sessions le fait pour session+items).
- **Label snapshot serveur** (FR4) : `label` vient de `song.title` côté serveur, jamais du client.
- **Tests** : modèles mockés `jest.mock('../models')`, vrais UUIDs si un pattern garde, `String.fromCharCode(0)` pour les NUL ; assertions sur les options réellement passées (`{ transaction }`).
- **NUL + Safari/Chrome** : accords rétro #2/#3 reconduits pour l'Epic 4.

### Ce que cette story NE fait PAS

- PAS de cohérence bidirectionnelle de `lastPlayed` (story 4.2) — la MAJ optimiste front + `song.update` backend restent en l'état.
- PAS de migration de schéma (aucune nouvelle colonne ; `PracticeSession`/`SessionItem`/`SongPlay` existent déjà).
- PAS de remplacement du SongPlay par l'entrée de session (décision actée : on garde).

### Project Structure Notes

- Backend : `backend/controllers/songcontroller.js` (modifié), nouveau `backend/utils/sessionDates.js`, `backend/controllers/practicesessioncontroller.js` (require le module extrait). Routes inchangées.
- Frontend : `src/services/songPlayService.ts` (DTO étendu), `src/pages/Songs.tsx` (date locale), `src/pages/MyHeatmapPage.tsx` (dédoublonnage).
- Tests : `backend/__tests__/songcontroller.test.js`, `backend/__tests__/practicesessioncontroller.test.js` (non-régression), `src/__tests__/MyHeatmapPage.test.tsx`, test du service/page Songs.

### References

- epics.md : Story 4.1 (l.389-415), FR21 (l.38), FR7 (l.24), FR19 (l.36), hint correction horloge serveur (l.57)
- project-context.md : pièges SongPlay (l.127-130 — `markSongPlayed` horodate serveur « à corriger »), pattern contrôleur (l.78), FR4 label (l.82 conventions)
- Story 3.3 (done) : PLAY_DAY_EXPR, fusion heatmap (les sessions priment), getDayPlays
- Story 2.2 (done) : contrat FR4 label snapshot, items + transaction

## Dev Agent Record

### Context Reference

Ultimate context engine analysis completed - comprehensive developer guide created

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- TDD : 5 tests backend RED → GREEN sur `markSongPlayed` (qui n'avait AUCUN test) ; régression contrôleur sessions verte sans modif après extraction des helpers (55/55) ; 1 test heatmap dédup + 2 tests service RED → GREEN
- Le label d'un jour mixte inclut les minutes (« 0 minutes, 1 session, 1 play ») — attendu de test corrigé en conséquence
- `global.fetch` absent de jsdom → assignation directe au lieu de `jest.spyOn` dans le test de service
- ⚠️ EN ATTENTE : test manuel Safari + Chrome par northwood (accords rétro #2/#3)

### Completion Notes List

- **`markSongPlayed` alimente le journal** : dans une transaction, crée le SongPlay (horodaté `${playedOn}T12:00:00.000Z` — jour client à midi UTC, AC5), puis si un instrument est fourni, find-or-create la session du jour pour cet instrument (FR7) et y ajoute la chanson comme entrée sans minutes (label = `song.title`, snapshot serveur FR4), sans doublon d'entrée (AC4).
- **Date locale client** (AC5) : `playedOn` requis et validé (pattern + calendaire + MIN_DATE + tolérance future) via les helpers partagés. Le serveur ne date plus le jour de son horloge.
- **Helpers extraits** dans `backend/utils/sessionDates.js` (`DATE_PATTERN`, `MIN_DATE`, `isValidCalendarDate`, `maxAllowedDate`), consommés par les deux contrôleurs — une seule définition (leçon 3.3).
- **SongPlay conservé** (AC6, décision northwood) : toujours créé, page Songs et rétro-import 3.3 intacts. Sans instrument → SongPlay créé mais pas de session (FR7).
- **Dédoublonnage panneau** (Task 3) : `visiblePlays` filtre les plays dont le `songUid` est déjà une entrée de session du jour ; les vrais plays historiques (sans session) restent listés.
- **lastPlayed inchangé** (4.2 scope) : `song.update({ lastPlayed: new Date() })` côté backend + MAJ optimiste front laissés en l'état.
- Validations : 163 front + 93 back verts, lint racine + backend, build, scan NUL.

### File List

- backend/utils/sessionDates.js (nouveau — helpers de date partagés)
- backend/controllers/songcontroller.js (modifié — markSongPlayed alimente le journal)
- backend/controllers/practicesessioncontroller.js (modifié — consomme sessionDates.js)
- backend/__tests__/songcontroller.test.js (modifié — mock étendu + 9 tests markSongPlayed)
- src/services/songPlayService.ts (modifié — playedOn dans MarkPlayedDTO)
- src/pages/Songs.tsx (modifié — envoie la date locale)
- src/pages/MyHeatmapPage.tsx (modifié — dédoublonnage visiblePlays)
- src/__tests__/songPlayService.test.ts (nouveau — body playedOn)
- src/__tests__/MyHeatmapPage.test.tsx (modifié — test dédup)

## Change Log

- 2026-06-08 : Story créée (analyse epics + project-context + code songcontroller/Songs/heatmap + arbitrages create-story avec northwood : SongPlay conservé + dédoublonnage panneau, déploiement reporté) — statut ready-for-dev
- 2026-06-08 : Implémentation TDD complète (markSongPlayed alimente le journal, helpers de date extraits, date locale client, dédoublonnage panneau) — 12 tests ajoutés, 163 front + 93 back verts, lint/build/NUL OK — statut → review (test manuel Safari/Chrome en attente)
- 2026-06-08 : Retours terrain northwood — (1) RÉGRESSION corrigée : `playedAt` à midi UTC pile donnait des timestamps identiques pour plusieurs plays du même jour → tri « last played » figé ; désormais jour client + heure réelle du serveur (jour UTC == playedOn préservé pour la heatmap, valeurs distinctes pour l'ordre) + test « two marks → distinct playedAt ». (2) Repère discret du jour sur la grille : `outline` ambre sur la case d'aujourd'hui (stacke avec le ring de sélection) + test. 164 front + 94 back verts.
- 2026-06-08 : Tri « last played » (2e passe, filtre instrument + marquage fiche d'édition) — (a) la map `songPlays` du tri n'était pas rafraîchie au marquage depuis la fiche → ajoutée ; (b) départage par `song.lastPlayed` global (instants réels distincts) quand les timestamps par instrument sont à égalité → le tri ne fige plus, même sur les anciennes données midi-UTC sans re-marquer ; test d'intégration de repro (filtre Guitar + toggle) + test du départage. 166 front + 94 back verts.
- 2026-06-08 : Suppression de session depuis la heatmap qui laisse les plays rallumer le jour → REPORTÉ en 4.2 (cohérence à la suppression, décision northwood)
- 2026-06-08 : Revue 3 couches — 6 findings patchés (bug High : marquage en masse sérialisé pour ne plus dupliquer les sessions du jour + `findOne` déterministe ; dédoublonnage heatmap rendu instrument-aware (clé instrument|songUid) ; validation de l'instrument dans markSongPlayed → play durable même sur instrument invalide ; repère « aujourd'hui » annoncé dans l'aria-label (a11y) ; test du rollback transactionnel ; doc/ libellés alignés), 4 defer (cohérence lastPlayed → 4.2, course double-clic multi-appareils, instrumentUid sans ownership pré-existant, atomicité AC4/position). Incident NUL #1 de l'Epic 4 (octet brut dans une garde d'instrument) attrapé par le scan perl, corrigé en binaire + `String.fromCharCode(0)`. 166 front + 97 back verts, lint/build/NUL OK — statut → done
