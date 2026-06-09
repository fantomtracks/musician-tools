---
baseline_commit: 3e49319c9e7fbc1e997129a19bb1f521ce549d6d
---

# Story 3.3: Ma grille a déjà une histoire (rétro-import)

Status: done

## Story

As a musicien qui utilise l'app depuis des mois,
I want que mes « Mark as Played » passés apparaissent dans la heatmap dès le lancement,
so that ma grille reflète ma vraie histoire au jour 1 — pas un désert décourageant.

## Acceptance Criteria

1. **Lectures passées visibles** — Given mon historique de lectures existant (`SongPlays`), When la heatmap s'affiche, Then chaque lecture passée allume son jour à l'intensité minimale (niveau 1) (FR22).
2. **Pas de double comptage** — Given un jour avec à la fois des lectures historiques et une vraie session, When la grille agrège, Then les minutes de session priment et l'historique n'ajoute que la présence — le niveau du jour est celui des sessions, jamais gonflé par les lectures (FR22).
3. **Idempotence** — Given le mécanisme de rétro-import, When il est rejoué (redéploiement, re-calcul, refresh), Then aucun doublon n'est créé (NFR5).
4. **Détail d'un jour historique** — Given le détail d'un jour uniquement historique (FR16), When je l'ouvre, Then les lectures sont identifiables comme telles (« Played », sans durée), distinctes des sessions loggées — titre de la chanson + instrument si connu.
5. **Performance préservée** — Given une année complète de données (sessions + rétro-import), When la heatmap se charge, Then le rendu reste < 1 s (NFR2) — agrégation SQL groupée, pas de N+1.

## Tasks / Subtasks

- [x] Task 0 : **ARBITRAGE EXÉCUTÉ — PROJECTION à la lecture** (AC: 3) — lire la section « Arbitrage » des Dev Notes ; AUCUNE écriture en base, AUCUNE migration de données, AUCUN champ de provenance — l'idempotence (AC3) est satisfaite par construction
- [x] Task 1 : Backend — fusion des SongPlays dans `getHeatmap` (AC: 1, 2, 5)
  - [x] Constante module `PLAY_DAY_EXPR` = expression SQL du « jour » d'une lecture : `DATE("SongPlay"."playedAt" AT TIME ZONE 'UTC')` — UNE SEULE définition, partagée heatmap + détail (un jour allumé DOIT s'ouvrir sur ses lectures) ; ⚠️ colonnes `SongPlays` en camelCase EN DB (exception historique) → guillemets doubles obligatoires dans tout littéral
  - [x] Deuxième agrégation dans `getHeatmap` : `SongPlay.findAll` joint à `Song` (include `attributes: []`, where `user_uid = userId` — `SongPlay` n'a PAS de userUid, l'ownership passe par le Song parent), `attributes: [[literal(PLAY_DAY_EXPR), 'date'], [fn('COUNT', col('SongPlay.uid')), 'playCount']]`, where sur l'année via la même expression, `group: [literal(PLAY_DAY_EXPR)]`, `raw: true`
  - [x] Fusion en JS : map par date des lignes sessions, puis pour chaque ligne plays — si la date a déjà des sessions → ajouter `playCount` à la ligne SANS toucher totalMinutes/sessionCount (AC2 : les minutes de session priment) ; sinon → nouvelle ligne `{ date, totalMinutes: 0, sessionCount: 0, playCount }` ; toutes les lignes sortent avec `playCount` (0 par défaut) — cast `Number()` partout (pg renvoie COUNT en string)
  - [x] Tri final par date ASC (la fusion casse l'ordre SQL)
- [x] Task 2 : Backend — lectures d'un jour pour le panneau de détail (AC: 4)
  - [x] `getDayPlays` dans `practicesessioncontroller.js`, route `GET /sessions/plays?date=YYYY-MM-DD` (déclarée AVANT les routes paramétrées, comme `/heatmap`) — réutilise `DATE_PATTERN` + `isValidCalendarDate` → 400 `'Date must be a valid YYYY-MM-DD date'` si invalide ou absent ; 401 via `req.session.user`
  - [x] Requête : `SongPlay.findAll` joint `Song` (ownership + `attributes` incluant `title`), where `literal(PLAY_DAY_EXPR) = date` (la MÊME constante que la heatmap), order `playedAt ASC` ; réponse : tableau brut `[{ uid, songUid, title, instrumentType, playedAt }]`
- [x] Task 3 : Service frontend (AC: 1, 4)
  - [x] Type `HeatmapDay` : champ `playCount: number` ajouté ; nouveau type `DayPlay = { uid: string; songUid: string; title: string; instrumentType?: string | null; playedAt: string }`
  - [x] `practiceSessionService.getDayPlays(date: string): Promise<DayPlay[]>` → `GET /api/sessions/plays?date=${encodeURIComponent(date)}` (acquis P8 de la 3.2), `credentials: 'include'`, erreur générique `'Failed to fetch plays'`
- [x] Task 4 : Heatmap — niveaux et labels (AC: 1, 2)
  - [x] `computeLevels` (src/utils/heatmap.ts) : un jour s'allume si `sessionCount > 0` OU `playCount > 0` ; jour AVEC sessions → logique actuelle inchangée (les minutes priment, AC2) ; jour plays-only → niveau 1 (le chemin `minutes <= 0 → 1` existant s'applique) ; sanitize `playCount` comme les autres champs (NaN → 0)
  - [x] ⚠️ NE PAS inclure les jours plays-only dans les quantiles (`positives` ne contient que des minutes > 0 — déjà le cas, ne pas dégrader)
  - [x] `labelFor` (MyHeatmapPage) : jour plays-only → `"${date} — played (N play${s})"` ; jour mixte → label sessions actuel + `", N play${s}"` ; jour vide inchangé
- [x] Task 5 : Panneau de détail — section lectures (AC: 4)
  - [x] Au choix d'un jour : fetch `getDayPlays(selectedDate)` EN PARALLÈLE de `getAll(selectedDate)` (Promise.allSettled, pattern MySessionsPage) — même garde d'annulation que l'existant (acquis P1/P2 de la 3.2 : un delete ou un changement de jour ne doit pas peindre le mauvais panneau)
  - [x] Rendu : sous les sessions (ou seul si jour historique pur), bloc « Played » — liste `title` + `instrumentType` si présent + badge/texte « Played » ; AUCUNE durée ; style visuellement distinct des cartes session (plus sobre — ex. liste simple avec bordure gauche, pas de carte) ; PAS de bouton Edit/Delete sur une lecture (ce n'est pas une session)
  - [x] États : « No practice on {date}. » UNIQUEMENT si ni sessions ni lectures ; jour plays-only → la liste Played s'affiche, le statut reste vide ; le lien « Log a session for this day » reste offert tant qu'il n'y a PAS de session (un jour de lectures peut mériter une vraie session) et que le jour n'est pas futur (acquis P4)
  - [x] Échec du fetch plays SEUL (sessions OK) : afficher les sessions + message discret dans la live region « Day detail status » (« Plays could not be loaded. ») — ne pas sacrifier tout le panneau
- [x] Task 6 : Tests (AC: tous)
  - [x] Backend (`practicesessioncontroller.test.js`, modèles mockés via `jest.mock('../models')`) : heatmap fusionne plays-only (`{date, totalMinutes: 0, sessionCount: 0, playCount: N}`) ; jour mixte → minutes/sessionCount des sessions + playCount ajouté (AC2) ; cast Number des strings pg ; tri par date ; `getDayPlays` : 401, 400 (date absente/invalide), réponse jointe avec title, where par la même expression de jour
  - [x] Frontend heatmap.test.ts : `computeLevels` — plays-only → 1 ; mixte → niveau des minutes inchangé ; `playCount` NaN → ignoré
  - [x] Frontend MyHeatmapPage.test.tsx : mock `getDayPlays` ajouté au mock du service (les tests existants doivent passer avec `mockResolvedValue([])`) ; jour plays-only → label « played », panneau avec section Played (titre + « Played », pas de durée, pas de bouton Delete) + lien « Log a session » présent ; jour mixte → sessions ET lectures rendues ; échec plays seul → sessions affichées + message
  - [x] ⚠️ Les tests existants 3.1/3.2 ne doivent pas casser : tout `HeatmapDay` mocké sans `playCount` → le composant doit tolérer `playCount` absent (`?? 0`) OU les mocks existants sont complétés mécaniquement — choisir la tolérance (`playCount?: number` optionnel côté type) pour ne PAS toucher aux 18 tests existants
- [x] Task 7 : Validations finales
  - [x] Les DEUX suites + lint (racine ET `cd backend && npm run lint`) + build + scan NUL (`perl -ne 'exit 1 if /\x00/'` sur les fichiers touchés)
  - [x] **Test manuel Safari + Chrome** (accord rétro #2) : validé par northwood le 2026-06-07 — rétro-import visible avec les vraies données, panneau Played, pas de régression 3.2

### Review Findings

- [x] [Review][Patch] `playDayString` : la branche Date utilise `toISOString().slice(0,10)` — pg parse un DATE à minuit LOCAL, donc sur un serveur UTC+ le jour recule d'un cran → exactement le mismatch « case allumée → panneau vide » que la story interdit ; code mort sous Sequelize 6 mais faux s'il s'active — formater par composants locaux (High, les 3 couches) [backend/controllers/practicesessioncontroller.js:27-29]
- [x] [Review][Patch] WHERE non-sargable sur `DATE(playedAt AT TIME ZONE 'UTC')` dans les DEUX requêtes plays — aucun index ne peut servir ; réécrire en bornes demi-ouvertes sur `"playedAt"` (équivalent exact, l'index existant sert), garder l'expression en SELECT/GROUP ; renforcer les tests qui n'assertent ni le where ni le group (l'invariant central case↔panneau n'est pas verrouillé) (Med, les 3 couches) [practicesessioncontroller.js:129,183 + tests]
- [x] [Review][Patch] Les deux requêtes de `getHeatmap` sont séquentielles sans dépendance — `Promise.all` (Med, blind) [practicesessioncontroller.js]
- [x] [Review][Patch] Échec sessions → les plays chargés sont cachés, le commentaire « and vice versa » ment ; rendre les plays indépendants de `dayFailed`, message adapté, + test du sens sessions-KO/plays-OK (Med, les 3 couches) [src/pages/MyHeatmapPage.tsx]
- [x] [Review][Patch] `getDayPlays` : order `playedAt ASC` sans tiebreak `uid` — ordre instable pour les timestamps identiques (double-clic, import bulk), la convention maison l'exige (Low, blind+edge) [practicesessioncontroller.js:184]
- [x] [Review][Patch] `getDayPlays` : pas de plancher `MIN_DATE` — `?date=0205-06-07` (classe de typo que MIN_DATE existe pour attraper) atteint Postgres ; incohérent avec create/heatmap (Low, edge) [practicesessioncontroller.js:176]
- [x] [Review][Patch] Commentaires mensongers : le sens du décalage timezone est inversé (c'est 00h30 Paris qui atterrit sur la veille UTC, pas 23h50 sur le lendemain) + le type `HeatmapDay.date` documente « client-local day (FR19) » alors que les lignes play-only portent un jour UTC (Low, blind+edge) [practicesessioncontroller.js:16-17, practiceSessionService.ts]
- [x] [Review][Patch] Pas de test de course plays : un `getDayPlays` lent du jour A qui résout après sélection du jour B (la garde `cancelled` couvre, mais rien ne le verrouille) (Low, edge) [src/__tests__/MyHeatmapPage.test.tsx]
- [x] [Review][Patch] Dev Agent Record surcompte : « 8 tests backend » — en réalité 7 nouveaux + 1 assertion modifiée (Low, auditor) [story 3.3]
- [x] [Review][Defer] Suppression d'une chanson (CASCADE sur ses plays) → case allumée périmée qui s'ouvre sur « No practice » jusqu'au prochain refetch — rare, auto-guéri au refresh, cross-feature [src/pages/MyHeatmapPage.tsx] — deferred, pre-existing interaction

## Dev Notes

### 🎯 ARBITRAGE : projection à la lecture (PAS de backfill matérialisé)

L'epics laissait le choix (« arbitrage projection à la lecture vs backfill matérialisé à faire en implémentation », epics.md:56). **Décision : PROJECTION.** Justification :

| Critère | Projection (retenu) | Backfill (rejeté) |
|---|---|---|
| Idempotence AC3/NFR5 | **Gratuite** — aucune écriture, rejouable à l'infini | Machinerie : champ de provenance (`source_play_uid`), garde anti-doublon, migration de données en PROD |
| Intégrité des données | Les SongPlays restent la seule vérité | Fabrique des sessions que l'utilisateur n'a JAMAIS loggées — éditables/supprimables dans son journal (confusion) |
| Réversibilité | Supprimer le code suffit | Données à purger en prod |
| Interaction 4.1 | Un jour qui gagne une vraie session via le pont 4.1 → les sessions priment automatiquement (AC2) | Double source pour le même clic (SongPlay + session importée + session du pont) |
| epics.md:56 | « sans duplication en table session » — la projection y répond littéralement | Contredit l'esprit du hint |

Coût accepté : `getHeatmap` fait 2 requêtes groupées au lieu d'une (toujours O(1) requêtes, NFR2 tenu), et le panneau de détail fait un fetch de plus.

### ⚠️ Le piège central : le « jour » d'une lecture

- Les sessions ont un `date` DATEONLY local client (FR19). Les `SongPlays` n'ont qu'un `playedAt` TIMESTAMP **horodaté serveur** (`new Date()`, cf. songcontroller.js:229) — l'horloge du client n'a jamais été enregistrée.
- **Décision : jour UTC** — `DATE("SongPlay"."playedAt" AT TIME ZONE 'UTC')`. C'est la meilleure vérité disponible ; une lecture à 23h50 heure de Paris peut s'afficher le lendemain — limitation CONNUE et ACCEPTÉE, documenter en commentaire. La 4.1 corrigera la source (date locale client) pour le futur.
- **Une seule constante** `PLAY_DAY_EXPR` partagée entre l'agrégation heatmap et `getDayPlays` — si les deux expressions divergent, un jour allumé peut s'ouvrir sur un panneau vide (mensonge UI).
- NE Pas utiliser `new Date('YYYY-MM-DD')` ni `toISOString().slice(0,10)` côté front (piège FR19 — discipline en vigueur depuis l'epic 2).

### ⚠️ SongPlays : 3 chausse-trappes (project-context.md)

1. **Colonnes camelCase EN DB** (exception historique — le reste du schéma est snake_case) : dans tout `literal()`, écrire `"playedAt"`, `"songUid"` AVEC guillemets doubles, sinon Postgres downcase et la colonne n'existe pas.
2. **Pas de `userUid`** : l'ownership passe par le Song parent → include `Song` avec `where: { user_uid: userId }`... ATTENTION : côté Sequelize c'est `userUid` (le modèle mappe `field: 'user_uid'`) — `include: [{ model: Song, attributes: [], where: { userUid: userId }, required: true }]`.
3. `Song.lastPlayed` est dénormalisé et global — NE PAS s'en servir ici, le vrai historique est `SongPlays`.

### État actuel du code touché (lu, à préserver)

- `backend/controllers/practicesessioncontroller.js` : `getHeatmap` (l.79-115) agrège `PracticeSession` GROUP BY date avec cast Number (pg renvoie SUM/COUNT en strings, commentaire l.104 — même piège pour la nouvelle requête) ; `getAllPracticeSessions` accepte `?date=` (3.2) ; constantes `DATE_PATTERN`, `isValidCalendarDate`, `UUID_PATTERN` réutilisables. Pattern 401 : `req.session.user` → `createError(401, 'Unauthorized')`.
- `backend/routes/sessions.js` : `/heatmap` déclaré avant les routes paramétrées — faire pareil pour `/plays`.
- `src/utils/heatmap.ts` : `computeLevels` l.59 — `if (!day || day.sessionCount === 0) return 0;` → c'est LA ligne qui éteint aujourd'hui un jour plays-only ; les quantiles ne comptent que les minutes > 0 (à préserver) ; règle « max personnel = niveau 4 » (à préserver).
- `src/pages/MyHeatmapPage.tsx` : panneau de détail avec garde d'annulation par jour (`selectedDateRef`, acquis P1/P2), toggle fermeture (P9), lien création masqué jour futur (P4), live region « Day detail status » ; `labelFor` construit les aria-labels (FR18/NFR6) — les étendre, pas les remplacer.
- `src/services/practiceSessionService.ts` : types exportés, `getAll(date?)` avec `encodeURIComponent` (P8) — copier ce pattern.
- Tests existants : 18 (MyHeatmapPage) + heatmap.test.ts — le mock du service DOIT gagner `getDayPlays: jest.fn()` sinon TypeError au premier clic de jour.

### Leçons des stories précédentes (à appliquer d'office)

- **Cast Number** sur tout agrégat pg en raw (3.1, testé).
- **Gardes d'annulation** sur tout fetch piloté par la sélection (3.2 P1/P2) — le fetch plays entre dans le MÊME effet que le fetch sessions, même `cancelled`.
- **`encodeURIComponent`** sur tout param d'URL (3.2 P8).
- **Live region** : états d'échec partiels exprimés dans « Day detail status », jamais de contenu mensonger (3.1/3.2).
- **NUL bytes** : protocole double-échappement + scan perl avant commit (accord rétro #3) ; tests avec `String.fromCharCode(0)` — ne concerne cette story que si des littéraux ` ` apparaissent (peu probable ici).
- **jsdom** : `fireEvent.submit(form)` pour contourner la validation native ; `act(() => cell.focus())`.
- **Tests uids** : toujours de vrais UUIDs si un `UUID_PATTERN` garde la route (3.1).

### Ce que cette story NE fait PAS

- PAS de modification de `markSongPlayed` (horloge serveur → corrigé en 4.1, FR21).
- PAS d'écriture/migration de données (projection pure). Une migration d'INDEX sur `"SongPlays"("playedAt")` est optionnelle — seulement si la perf le réclame en vrai ; si ajoutée : idempotente (garde `showIndex`), pattern des migrations existantes.
- PAS de cohérence bidirectionnelle lastPlayed (story 4.2).

### Project Structure Notes

- Contrôleur : `backend/controllers/practicesessioncontroller.js` (existant, minuscules collées) — `getDayPlays` y vit avec les validateurs déjà en place ; require `SongPlay` et `Song` depuis `../models`.
- Route : `backend/routes/sessions.js` — `router.get('/plays', authsess, ...)` AVANT les routes paramétrées.
- Service : `src/services/practiceSessionService.ts` (existant).
- Utils : `src/utils/heatmap.ts` (existant).
- Page : `src/pages/MyHeatmapPage.tsx` (existant).
- Tests : `backend/__tests__/practicesessioncontroller.test.js`, `src/__tests__/heatmap.test.ts`, `src/__tests__/MyHeatmapPage.test.tsx` (existants).

### References

- epics.md : Story 3.3 (l.361-383), FR22 (l.39), NFR2 (l.45), NFR5 (l.48), hint d'arbitrage (l.56)
- project-context.md : pièges SongPlay (l.127-130), convention colonnes (l.82), migrations idempotentes (l.83-85)
- Story 3.2 (done) : acquis P1/P2/P4/P8/P9, patterns du panneau de détail
- Story 3.1 (done) : `computeLevels`, cast Number pg, APG grid

## Dev Agent Record

### Context Reference

Ultimate context engine analysis completed - comprehensive developer guide created

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- TDD respecté sur les 3 fronts : 7 nouveaux tests backend + 1 assertion existante mise à jour, RED → GREEN (54/54), 5 tests computeLevels RED (erreurs de compilation TS = RED valide) → GREEN (16/16), 3 tests page RED → GREEN (21/21)
- Le bloc « Played » initialement inséré AVANT les sessions — déplacé SOUS les sessions conformément à la Task 5
- Test manuel Safari + Chrome (accord rétro #2) : VALIDÉ par northwood le 2026-06-07 avec ses vraies données

### Completion Notes List

- **Arbitrage exécuté : projection à la lecture.** Aucune écriture, aucune migration — `getHeatmap` fait 2 agrégations GROUP BY (sessions par date FR19, plays par jour UTC) fusionnées en JS. AC3 (idempotence) satisfaite par construction.
- `PLAY_DAY_EXPR` = `DATE("SongPlay"."playedAt" AT TIME ZONE 'UTC')` — constante unique partagée heatmap/détail ; guillemets doubles (colonnes SongPlays camelCase en DB) ; limitation UTC documentée en commentaire (4.1 corrigera la source).
- Règle de fusion AC2 : jour avec sessions → agrégats intacts + `playCount` annoté ; jour plays-only → `{totalMinutes: 0, sessionCount: 0, playCount}` → niveau 1 côté client ; tri par date refait en JS.
- `GET /sessions/plays?date=` : validations 400/401 du contrôleur réutilisées, jointure Song pour l'ownership (pas de userUid sur SongPlay), title aplati depuis le raw (`row['Song.title']`).
- `computeLevels` : les quantiles ne voient toujours QUE les minutes de sessions — les plays ne gonflent jamais l'échelle ; `playCount` optionnel (payloads pré-3.3 et 18 tests existants intacts).
- Panneau : fetch sessions+plays en `Promise.allSettled` sous la même garde d'annulation (acquis P1/P2) ; échec partiel des plays → sessions affichées + « Plays could not be loaded. » ; bloc Played sobre (pas de durée, pas d'actions) ; « No practice » seulement si ni sessions ni lectures ; lien de création conservé tant qu'aucune session (et jour non futur, acquis P4).
- Validations : 158 tests front + 83 back verts, lint racine + backend, build, scan NUL.

### File List

- backend/controllers/practicesessioncontroller.js (modifié — PLAY_DAY_EXPR, fusion plays dans getHeatmap, getDayPlays)
- backend/routes/sessions.js (modifié — route GET /plays)
- backend/__tests__/practicesessioncontroller.test.js (modifié — mock SongPlay + 8 tests)
- src/services/practiceSessionService.ts (modifié — HeatmapDay.playCount, type DayPlay, getDayPlays)
- src/utils/heatmap.ts (modifié — computeLevels : présence par plays)
- src/pages/MyHeatmapPage.tsx (modifié — fetch parallèle, labels, bloc Played, états)
- src/__tests__/heatmap.test.ts (modifié — 5 tests computeLevels)
- src/__tests__/MyHeatmapPage.test.tsx (modifié — mock getDayPlays + 3 tests)

## Change Log

- 2026-06-07 : Story créée (analyse epics + project-context + code 3.1/3.2 + arbitrage projection vs backfill TRANCHÉ : projection à la lecture) — statut ready-for-dev
- 2026-06-07 : Implémentation TDD complète (projection des SongPlays dans la heatmap, endpoint /sessions/plays, niveaux/labels/panneau) — 16 tests ajoutés, 158 front + 83 back verts, lint/build/NUL OK — statut → review (test manuel Safari/Chrome en attente)
- 2026-06-07 : Test manuel Safari + Chrome validé par northwood avec ses vraies données
- 2026-06-07 : Revue 3 couches — 9 findings patchés (playDayString par composants locaux, WHERE sargables sur playedAt dans les 2 requêtes plays + assertions where/group verrouillées, Promise.all sur les 2 agrégations, plays survivants à un échec sessions + message dédié, tiebreak uid, plancher MIN_DATE sur getDayPlays, commentaires timezone/type corrigés, test de course plays lents, Dev Record corrigé), 1 defer (case périmée après suppression de chanson → deferred-work.md), 10 dismissed. 160 front + 84 back verts, lint/build/NUL OK — statut → done
