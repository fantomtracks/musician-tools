---
baseline_commit: 1f3e68ad9d3fc2503af324fa4414edac1e73a07a
---

# Story 2.1: Créer une session de pratique

Status: done

## Story

As a musicien,
I want enregistrer une session (date, instrument, durée, note libre),
so that ma pratique du jour — ou d'un jour passé — laisse une trace fidèle.

## Acceptance Criteria

1. **Création du jour** — Given je suis authentifié, When je crée une session avec la date du jour (pré-remplie), l'instrument « Basse » et 40 minutes, Then la session est sauvegardée et m'appartient (NFR4).
2. **Session rétroactive** — Given j'ai pratiqué hier sans logger, When je crée une session datée d'hier, Then la session rétroactive est acceptée sans distinction de traitement (FR6).
3. **Dates futures interdites** — Given une date future, When je valide, Then une erreur de validation s'affiche (FR6).
4. **Aucune durée minimale** — Given une session de 2 minutes, When je valide, Then elle est acceptée (FR6).
5. **Un instrument + note optionnelle** — Given le formulaire de création, When je choisis l'instrument, Then exactement un instrument par session (FR7) et je peux ajouter une note libre globale optionnelle (FR9).
6. **Standards** — la migration de la table sessions est idempotente (NFR5) ; formulaire responsive, dark mode, labellisé (NFR3, NFR6).

## Tasks / Subtasks

- [x] Task 1 : Migration `PracticeSessions` (AC: 6)
  - [x] Créer `backend/migrations/20260607100000-create-practice-sessions.js` — table `PracticeSessions` : `uid` UUID PK default UUIDV4, `user_uid` UUID NOT NULL FK → `Users.uid` ON DELETE CASCADE, `date` DATEONLY NOT NULL, `instrument_type` STRING NOT NULL, `duration_minutes` INTEGER NULL, `note` TEXT NULL, `createdAt`/`updatedAt` DATE NOT NULL default `CURRENT_TIMESTAMP` (camelCase, pattern Topics/Instruments)
  - [x] Gardes d'idempotence VALIDÉES en 1.1 : garde de table (`showAllTables`) + gardes d'index INDIVIDUELLES hors de la garde de table (`showIndex` → noms), pattern exact de `20260607000000-create-topics.js` (auto-réparation si `sequelize.sync` a créé la table avant)
  - [x] Index : `practice_sessions_user_uid_date` sur `['user_uid', 'date']` (requêtes historique 2.3 + heatmap epic 3) — PAS de contrainte unique : plusieurs sessions le même jour, même pour le même instrument, sont légitimes (UJ-4)
  - [x] `down` : `dropTable('PracticeSessions')`
  - [x] Tester localement DEUX fois (`make migrate`), puis le scénario sync-race : `DROP INDEX practice_sessions_user_uid_date` + delete SequelizeMeta + re-migrate → l'index doit se recréer
- [x] Task 2 : Modèle `PracticeSession` (AC: 1, 5)
  - [x] Créer `backend/models/practicesession.js` (pattern `topic.js`) : `uid`, `userUid` (field `'user_uid'`, FK Users, CASCADE), `date` DATEONLY allowNull false, `instrumentType` (field `'instrument_type'`) STRING allowNull false, `durationMinutes` (field `'duration_minutes'`) INTEGER allowNull true, `note` TEXT allowNull true ; options `{ tableName: 'PracticeSessions', timestamps: true, indexes: [{ fields: ['user_uid', 'date'], name: 'practice_sessions_user_uid_date' }] }` (indexes dans le modèle = parité sync/migration, acquis 1.1)
  - [x] `associate` : `belongsTo(models.User, { foreignKey: 'userUid' })`
- [x] Task 3 : Contrôleur + routes (AC: 1, 2, 3, 4, 5)
  - [x] Créer `backend/controllers/practicesessioncontroller.js` avec `createPracticeSession` (pattern maison : 401 → validations → create → 201 entité brute) et les validations suivantes :
    - `date` : requise, format `/^\d{4}-\d{2}-\d{2}$/` ET date calendaire valide (rejeter `2026-13-45`) → sinon 400 `'Date must be a valid YYYY-MM-DD date'` ; date future → 400 `'Date cannot be in the future'` avec tolérance fuseaux : rejeter seulement si `date > (UTC today + 1 jour)` (FR19 : le client est la source de vérité du « jour » ; un client à UTC+13 peut légitimement être « demain » pour le serveur — voir Dev Notes)
    - `instrumentType` : requis, string non vide après trim, ≤ 255 → sinon 400 `'Instrument is required'` / `'Instrument must be at most 255 characters'`
    - `durationMinutes` : optionnel ; si fourni (non null) → `Number.isInteger` et `1 ≤ n ≤ 1440` sinon 400 `'Duration must be a whole number of minutes between 1 and 1440'` — une session d'1 minute est valide (FR6), null/absent = pas de durée (valide aussi)
    - `note` : optionnelle ; si fournie non-string → 400 ; trim, `''` → null ; > 5000 → 400 `'Note must be at most 5000 characters'`
    - AUCUN horodatage serveur du jour : ne JAMAIS remplacer `date` par `new Date()` (FR19)
  - [x] Créer `backend/routes/sessions.js` (`express.json()`, jamais body-parser) : `router.post('/', authsess, ...)` UNIQUEMENT — pas de GET (story 2.3), pas de PUT/DELETE (story 2.4)
  - [x] Enregistrer `router.use('/sessions', sessionsRouter)` dans `backend/routes/index.js`
- [x] Task 4 : Service frontend (AC: 1, 5)
  - [x] Créer `src/services/practiceSessionService.ts` : type `PracticeSession` (`uid`, `date`, `instrumentType`, `durationMinutes?: number | null`, `note?: string | null`, timestamps), `CreatePracticeSessionDTO = Omit<..., 'uid' | 'createdAt' | 'updatedAt'>`, `practiceSessionService.create(payload)` — pattern exact `topicService.ts` (fetch brut, `credentials: 'include'`, erreurs typées par message)
- [x] Task 5 : Page « New session » (AC: 1, 2, 3, 4, 5, 6)
  - [x] Créer `src/pages/MySessionsPage.tsx` : formulaire labellisé (`<label htmlFor>`) avec : Date (`<input type="date">`, pré-remplie à AUJOURD'HUI EN DATE LOCALE — voir le piège FR19 en Dev Notes — et `max={today}` pour bloquer le futur côté client), Instrument (`<select>` requis sur `instrumentTypeOptions` de `src/constants/instrumentTypes.ts`, option vide « Select instrument »), Duration (`<input type="number" min={1} max={1440}>`, optionnel, placeholder « Minutes (optional) »), Note (`<textarea>`, optionnel)
  - [x] Submit désactivé si `!date || !instrumentType` (NFR1 : seuls date + instrument obligatoires) ; `setError(null)` au début du handler (acquis 1.1)
  - [x] Après succès : toast de confirmation « Session logged » (pattern maison : `setToastMessage` + `setTimeout(2500)` — cf. Songs.tsx, PAS de lib) ; reset de la durée et de la note, date et instrument CONSERVÉS (re-log rapide)
  - [x] Bandeau d'erreur : pattern 1.1 complet (`role="alert"`, `aria-label="Dismiss error"`, variantes `dark:`)
  - [x] Responsive (`grid-cols-1 md:grid-cols-X`), dark mode partout, UI 100 % anglais
- [x] Task 6 : Routing + navigation (AC: 1)
  - [x] `src/App.tsx` : route `/my-sessions` gardée par auth (pattern existant) ; `src/components/Header.tsx` : lien « Sessions » (mêmes classes que les autres liens)
- [x] Task 7 : Tests (AC: tous)
  - [x] Backend `backend/__tests__/practicesessioncontroller.test.js` (mock `jest.mock('../models')`, pattern topiccontroller.test.js) : 201 minimal (date du jour + instrument seuls), 201 complet (durée 40 + note), 201 date passée (rétroactive), 201 durée 2 min puis 1 min (aucun minimum), 400 date absente / format invalide (`'07/06/2026'`, `'2026-13-45'`) / future (UTC+2 jours), 400 instrument absent/blanc, 400 durée 0 / -5 / 1.5 / `'abc'`, note trimée et `''` → null, 401 sans session — vérifier que `create` reçoit `date` TELLE QUELLE (jamais réécrite serveur, FR19)
  - [x] Frontend `src/__tests__/MySessionsPage.test.tsx` (mock du service) : formulaire labellisé rendu avec date du jour pré-remplie, submit appelle `create` avec le payload, bouton désactivé sans instrument, `max` de l'input date = aujourd'hui, succès → toast + durée/note réinitialisées, échec → bandeau d'erreur
- [x] Task 8 : Validations finales
  - [x] Les DEUX suites + lint des deux côtés + `npm run build`
  - [x] Migration testée 2× + scénario sync-race (cf. Task 1)
  - [x] Smoke : `POST /api/sessions` sans session → 401

### Review Findings

- [x] [Review][Patch] Les messages 400 du serveur sont avalés → erreur générique inexploitable (horloge client décalée = échec inexpliqué en boucle) (Med, blind+edge) [src/services/practiceSessionService.ts + MySessionsPage.tsx]
- [x] [Review][Patch] Toast `role="status"` monté conditionnellement → jamais annoncé par les lecteurs d'écran (la live region doit préexister au changement de contenu) (Med, blind) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] Dates très anciennes acceptées (typo `0205-06-07` pour 2025) — aucune borne min (Med, edge) [backend/controllers/practicesessioncontroller.js + input sans min]
- [x] [Review][Patch] Timer du toast jamais nettoyé → deux logs rapprochés tronquent le 2ᵉ toast (blind+edge) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] `today` capturé au render → après minuit, le guard bloque la date du nouveau jour / la date pré-remplie devient hier (blind+edge+auditor) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] `req.body` undefined (Content-Type non-JSON) → destructuring → 500 ; octet nul dans note/instrument → erreur Postgres → 500 (edge) [backend/controllers/practicesessioncontroller.js]
- [x] [Review][Patch] Durée « 0 » silencieusement transformée en « pas de durée » + toast de succès (falsy) au lieu d'une erreur (auditor) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] Trous de couverture : guard client anti-futur non testé, chemin 500 backend non testé, bornes 255/256 et 5000/5001 non testées (blind) [tests]
- [x] [Review][Defer] `down: dropTable` peut détruire une table créée par `sequelize.sync` (rollback ≠ inverse du up gardé) [backend/migrations/*] — deferred, pattern maison identique sur toutes les migrations create-table, rollback inutilisé en prod (release_command ne fait que migrate up)
- [x] [Review][Defer] Garde `req.body || {}` manquante dans les contrôleurs préexistants (topics, instruments, songs — même exposition au 500) [backend/controllers/*] — deferred, pre-existing app-wide
- _Écartés (5) : instrumentType libre côté API (décision de conception n°5 assumée), CSRF (déjà différé app-wide), double check auth (pattern vérifié), placement cosmétique de setError(null), flake théorique des tests à minuit pile._

## Dev Notes

### Décisions de conception (tranchées pendant l'analyse — à suivre telles quelles)

**1. Nommage `PracticeSession`, PAS `Session`.** `connect-pg-simple` utilise déjà une table `session` en production (server.js : `tableName: 'session'`, `createTableIfMissing: true`) et `req.session` (express-session) est omniprésent dans les contrôleurs. Un modèle `Session` serait un champ de mines (collision mentale partout, table `Sessions` vs `session` en DB). Donc : modèle `PracticeSession`, table `PracticeSessions`, fichiers `practicesession.js` / `practicesessioncontroller.js` / `practiceSessionService.ts`. L'API reste `/api/sessions` et l'UI dit « Session » (le contexte produit est sans ambiguïté pour l'utilisateur).

**2. `date` en DATEONLY (string `YYYY-MM-DD`), JAMAIS un timestamp.** FR19 : le « jour » d'une session est la date locale de l'appareil — c'est le client qui l'envoie, le serveur la stocke telle quelle sans aucune conversion de fuseau. DATEONLY évite structurellement tout décalage UTC. C'est LE fondement de la heatmap (epic 3) et du pont (epic 4).

**3. 🚨 PIÈGE FR19 côté client : `new Date().toISOString().slice(0, 10)` donne la date UTC, PAS la date locale.** À 00h30 heure de Paris (UTC+2), `toISOString()` renvoie encore la date d'HIER. Utiliser un helper local :
```ts
const todayLocalDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
```
(à utiliser pour le pré-remplissage ET pour le `max` de l'input date).

**4. Validation « date future » : stricte côté client, tolérante côté serveur.** Le client bloque le futur par rapport à SON horloge locale (`max={today}` + check au submit). Le serveur ne connaît pas le fuseau du client : il rejette seulement `date > (date UTC du serveur + 1 jour)` — un client à UTC+13 peut être légitimement « demain » pour un serveur UTC. Ne PAS resserrer cette tolérance.

**5. `instrumentType` STRING, aligné sur `SongPlay.instrumentType`.** L'app type les instruments par des strings (`'Guitar'`, `'Bass'`… — `src/constants/instrumentTypes.ts`, `SongPlay.instrumentType`). La session porte donc un `instrumentType` STRING NOT NULL — PAS une FK vers `Instruments` (qui modélise les instruments physiques de l'utilisateur : « 5 strings bass », marque, modèle). C'est ce qui rendra le pont FR21 trivial à l'epic 4 (matcher la session du jour par `instrumentType`). Le front utilise un `<select>` sur `instrumentTypeOptions` ; le serveur valide juste « string non vide ≤ 255 » (comme `markSongPlayed` qui accepte un `instrumentType` libre).

**6. Pas de contrainte d'unicité (user, date, instrument).** UJ-4 du PRD montre deux sessions le même jour ; FR7 dit « un instrument par session », pas « une session par instrument par jour ». La fusion « session du jour » est un comportement du pont FR21 (epic 4), pas une contrainte DB.

### Intelligence des stories 1.1/1.2 (patterns établis — réutiliser, ne pas réinventer)

- **Migration auto-réparatrice** : garde de table + gardes d'index individuelles via `showIndex` hors de la garde de table — copier la structure exacte de `20260607000000-create-topics.js` (le scénario « sync crée la table avant la migration » a été OBSERVÉ en dev local sur la 1.1)
- **Indexes déclarés AUSSI dans le modèle** (option `indexes`) pour que `sequelize.sync` les crée en dev — parité sync/migration (acquis 1.1)
- **Contrôleur** : 401 d'abord, validations avant create, `createError` + `logger.error`, 201 + entité brute, try/catch → next ; pour les futures routes à `:uid` (2.3/2.4) le pattern UUID_PATTERN → 404 existe dans `topiccontroller.js`
- **Front** : `setError(null)` en début de handler ; bandeau `role="alert"` + `aria-label="Dismiss error"` + `dark:text-red-300 dark:bg-red-900/40 dark:border-red-800` ; `setList`/setState fonctionnels ; `maxLength` sur les inputs texte ; labels `<label htmlFor>` réels
- **Tests** : backend tout mocké (`jest.mock('../models')`, mockRes/mockNext — `practicesessioncontroller.test.js` n'a besoin que de `PracticeSession.create`) ; frontend Testing Library comportemental, uids de test en VRAIS UUIDs si une route `:uid` apparaît (leçon review 1.2)
- **Différés à ne PAS traiter ici** (deferred-work.md) : CSRF, 403/404 oracle, verrouillage optimiste, nav mobile, 401-redirect

### Contrat FR4 (rappel pour la 2.2, pas pour cette story)

`deferred-work.md` porte le contrat : les **SessionItems (story 2.2)** devront snapshotter le nom du sujet (`topicName` dénormalisé) + FK nullable. Cette story 2.1 ne crée PAS la table des entrées — modèle Session minimal strict (obstacle identifié au brainstorming : ne pas enrichir trop tôt).

### Périmètre — garde-fous

- **PAS d'entrées de session** (chansons/sujets) → story 2.2 ; pas de durée pré-calculée (FR13) → 2.2
- **PAS de liste/historique** → story 2.3 (la page 2.1 = formulaire seul ; la 2.3 ajoutera la liste sur la même page)
- **PAS d'édition/suppression** → story 2.4
- **PAS de suggestions intelligentes ni d'instrument « le plus récent » pré-rempli** → story 2.5 (ici : select simple, pas de défaut d'instrument)
- **NE PAS toucher** : `markSongPlayed` (sa correction d'horodatage = epic 4 / story 4.1), `SongPlay`, `Song.lastPlayed`, heatmap (epic 3)
- Toast : pattern manuel maison (`setToastMessage` + `setTimeout 2500`), PAS de lib

### Testing standards

Identiques aux stories 1.x : deux suites indépendantes, mocks backend (pas de DB réelle), Testing Library comportementale, pre-commit = les deux suites, jamais `--no-verify`.

### Project Structure Notes

- Nouveaux : `backend/migrations/20260607100000-create-practice-sessions.js`, `backend/models/practicesession.js`, `backend/controllers/practicesessioncontroller.js`, `backend/routes/sessions.js`, `backend/__tests__/practicesessioncontroller.test.js`, `src/services/practiceSessionService.ts`, `src/pages/MySessionsPage.tsx`, `src/__tests__/MySessionsPage.test.tsx`
- Modifiés (UPDATE) : `backend/routes/index.js` (+ `/sessions`), `src/App.tsx` (+ route `/my-sessions`), `src/components/Header.tsx` (+ lien « Sessions »)
- Préserver : ordre des routes et catch-all `*` dans App.tsx ; dark toggle et bloc auth dans Header.tsx

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1] — story et ACs ; #Epic 2 pour le contexte cross-stories
- [Source: _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/prd.md#Groupe B] — FR6, FR7, FR9 ; FR19 (Groupe C) pour la date locale ; NFR1/3/5/6
- [Source: _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/addendum.md] — modèle Session minimal, mécanique du pont, date locale client
- [Source: _bmad-output/implementation-artifacts/1-2-gerer-ma-bibliotheque-de-sujets.md + deferred-work.md] — patterns établis, différés, contrat FR4
- [Source: backend/server.js:91-95] — session store `connect-pg-simple` table `'session'` (justification du nommage PracticeSession)
- [Source: backend/models/songplay.js:18-21] — `instrumentType` STRING (alignement)
- [Source: src/constants/instrumentTypes.ts] — `instrumentTypeOptions` pour le select
- [Source: backend/migrations/20260607000000-create-topics.js] — pattern de migration auto-réparatrice à copier
- [Source: backend/controllers/topiccontroller.js, src/services/topicService.ts, src/pages/MyTopicsPage.tsx] — patterns 1.x de référence
- [Source: _bmad-output/project-context.md] — règles d'implémentation

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

- TDD : 11 tests backend écrits et vus en échec avant l'implémentation ; 6 tests frontend idem
- Suite backend : 40/40 verts (4 suites) ; suite frontend : 69/69 verts (12 suites)
- Lint : backend 0 erreur, frontend 8 préexistantes / 0 nouvelle ; build `tsc -b && vite build` OK
- Migration testée : 2 passages (`make migrate`), puis scénario sync-race (DROP INDEX + delete meta → re-migrate recrée `practice_sessions_user_uid_date`) ✓
- Structure DB vérifiée : `date` est bien de type `date` (DATEONLY, pas de timestamp), `instrument_type` varchar NOT NULL
- Smoke : `POST /api/sessions` sans session → 401

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- 3 décisions de conception tranchées après lecture du code : nommage PracticeSession (collision connect-pg-simple/req.session vérifiée dans server.js), date DATEONLY client-source-de-vérité (FR19), instrumentType STRING aligné SongPlay
- Piège UTC/locale documenté avec helper fourni (toISOString = date UTC, faux à minuit)
- Patterns 1.x capitalisés : migration auto-réparatrice, indexes dans le modèle, bandeau a11y, validations
- Backend : `createPracticeSession` avec validations complètes (date YYYY-MM-DD calendaire + future bloquée avec tolérance UTC+1j, instrument requis ≤255, durée entière 1-1440 optionnelle, note ≤5000 trimée) — la date du client n'est JAMAIS réécrite côté serveur (FR19, testé explicitement)
- Frontend : page « New session » avec date locale pré-remplie (`todayLocalDate()`, pas toISOString), `max` anti-futur, select sur `instrumentTypeOptions`, toast « Session logged » (pattern maison), reset durée/note en conservant date/instrument pour le re-log rapide
- Périmètre respecté : POST uniquement (pas de GET/PUT/DELETE), pas d'entrées, pas de suggestions, `markSongPlayed`/`SongPlay` intacts

### File List

**Nouveaux :**
- backend/migrations/20260607100000-create-practice-sessions.js
- backend/models/practicesession.js
- backend/controllers/practicesessioncontroller.js
- backend/routes/sessions.js
- backend/__tests__/practicesessioncontroller.test.js
- src/services/practiceSessionService.ts
- src/pages/MySessionsPage.tsx
- src/__tests__/MySessionsPage.test.tsx

**Modifiés :**
- backend/routes/index.js (+ router `/sessions`)
- src/App.tsx (+ route `/my-sessions`)
- src/components/Header.tsx (+ lien « Sessions »)

## Change Log

- 2026-06-07 : Story 2.1 implémentée (table PracticeSessions, POST /api/sessions, page New session avec date locale FR19) — statut → review
- 2026-06-07 : Code review adversariale (3 couches) — 8 patches appliqués (messages 400 surfacés, toast live region toujours montée + timer nettoyé, borne min 1900, today recalculé au submit, req.body/octets nuls → 400, durée 0 non avalée, +10 tests de couverture), 2 différés tracés, 5 écartés. Backend 45, frontend 73, tous verts. Statut → done
