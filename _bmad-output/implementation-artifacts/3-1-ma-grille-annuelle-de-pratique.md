---
baseline_commit: f4bf3dbf2b5bb1165efbcd3ff362bccc602956ef
---

# Story 3.1: Ma grille annuelle de pratique

Status: done

## Story

As a musicien,
I want voir une grille annuelle type GitHub où chaque jour pratiqué s'allume selon mes minutes,
so that ma régularité — et mes trous — me sautent aux yeux, sans jugement.

## Acceptance Criteria

1. **Grille annuelle** — Given des sessions sur plusieurs jours, When j'ouvre la heatmap, Then une grille annuelle affiche une case par jour, intensité = minutes totales du jour (FR15), And l'échelle est relative à ma propre distribution (paliers type quartiles GitHub) (FR15).
2. **Toute session compte** — Given une session de 2 minutes ou sans durée un jour donné, When la grille s'affiche, Then ce jour s'allume à l'intensité minimale visible (FR15).
3. **Visible dès le premier jour** — Given un nouvel utilisateur sans aucune session, When il ouvre la heatmap, Then la grille s'affiche, vide, sans seuil (FR20).
4. **Aucune mécanique punitive** — pas de compteur de streak, pas de couleur agressive sur les jours vides, pas de message de relance (FR18).
5. **Jour = date client** — Given le calcul du « jour », When la grille agrège, Then elle utilise la date telle que saisie côté client, sans conversion serveur (FR19).
6. **Standards** — rendu < 1 s avec une année complète (NFR2) ; navigable au clavier avec alternatives textuelles ARIA (NFR6) ; responsive et dark mode (NFR3).

## Tasks / Subtasks

- [x] Task 1 : Backend — endpoint d'agrégation `GET /api/sessions/heatmap?year=YYYY` (AC: 1, 5, 6)
  - [x] `backend/controllers/practicesessioncontroller.js` : ajouter `getHeatmap` — 401 → validation `year` (string/number entier, 1900 ≤ year ≤ 2100, sinon 400 `'Year must be a valid year'`) → agrégation UNE seule requête :
    `PracticeSession.findAll({ attributes: ['date', [fn('SUM', col('duration_minutes')), 'totalMinutes'], [fn('COUNT', col('uid')), 'sessionCount']], where: { userUid, date: { [Op.between]: ['YYYY-01-01', 'YYYY-12-31'] } }, group: ['date'], order: [['date', 'ASC']], raw: true })` — importer `{ fn, col, Op }` de sequelize
  - [x] **🚨 PIÈGE pg/Sequelize** : en raw, `SUM`/`COUNT` Postgres reviennent en **STRING** (numeric/bigint) — caster dans le contrôleur : `rows.map(r => ({ date: r.date, totalMinutes: Number(r.totalMinutes ?? 0), sessionCount: Number(r.sessionCount) }))`. `SUM` de durées toutes NULL → NULL → `?? 0`
  - [x] **FR19** : la colonne `date` est DATEONLY saisie par le client — l'agrégation GROUP BY date l'utilise TELLE QUELLE, aucun timezone/cast serveur. Réponse : array `{ date: 'YYYY-MM-DD', totalMinutes, sessionCount }` (jours actifs uniquement — les jours vides sont déduits côté client)
  - [x] `backend/routes/sessions.js` : `router.get('/heatmap', authsess, ...)` déclaré AVANT les routes `/:uid` (hygiène d'ordre, même si seuls PUT/DELETE matchent `/:uid` aujourd'hui)
  - [x] NFR2 côté serveur : une requête, ≤ 366 lignes, index `(user_uid, date)` déjà en place depuis la 2.1 — rien d'autre à faire
- [x] Task 2 : Logique de grille et de paliers — `src/utils/heatmap.ts` (NOUVEAU, testable unitairement) (AC: 1, 2, 5)
  - [x] `formatLocalDate(d: Date): string` — le formateur manuel `YYYY-MM-DD` (généralisation de `todayLocalDate`)
  - [x] `buildYearGrid(year: number)` : génère les jours de l'année par **constructeur local** `new Date(year, 0, 1)` + itération `setDate(getDate() + 1)` tant que `getFullYear() === year` — **JAMAIS `new Date('YYYY-MM-DD')`** (piège FR19 lecture : parsé minuit UTC). Retour : semaines (colonnes) × 7 jours (lignes), semaine commençant LUNDI (public FR), avec cellules de padding `null` avant le 1er janvier et après le 31 décembre. Gérer les années bissextiles (366)
  - [x] `computeLevels(days: HeatmapDay[])` : paliers relatifs à l'utilisateur — `positives` = `totalMinutes > 0` triés ; seuils = rangs 25/50/75 % (nearest-rank : `sorted[Math.floor(q * (n - 1))]`) ; `levelFor(day)` : pas de donnée → 0 ; `sessionCount > 0` et `totalMinutes === 0` → **1** (toute session allume, FR15/AC2) ; sinon ≤ q1 → 1, ≤ q2 → 2, ≤ q3 → 3, > q3 → 4 ; si `positives` est vide → tous les jours actifs à 1
- [x] Task 3 : Service frontend (AC: 1)
  - [x] `practiceSessionService.ts` : type `HeatmapDay = { date: string; totalMinutes: number; sessionCount: number }` + `getHeatmap(year: number): Promise<HeatmapDay[]>` (GET `/api/sessions/heatmap?year=`, pattern maison, 400 → message surfacé)
- [x] Task 4 : Page `src/pages/MyHeatmapPage.tsx` (NOUVELLE) (AC: 1, 2, 3, 4, 6)
  - [x] Année COURANTE uniquement (locale : `new Date().getFullYear()`) — la navigation entre années est la story 3.2, le détail au clic aussi : AUCUNE interaction de cellule dans cette story au-delà du focus
  - [x] Rendu grille : container `role="grid"` `aria-label="Practice heatmap {year}"`, lignes `role="row"`, cellules `role="gridcell"` avec `aria-label` textuel — jour actif : `"2026-06-07 — 40 minutes, 2 sessions"` (accorder singulier/pluriel) ; jour vide : `"2026-06-07 — no practice"` (NEUTRE, pas de reproche — FR18)
  - [x] **NFR6 — roving tabindex** : UNE cellule tabbable (`tabIndex=0`, les autres `-1`), flèches ←→↑↓ déplacent le focus de cellule en cellule (handler `onKeyDown` sur le container, état `focusedIndex`), Home/End optionnels. 365 tab-stops serait une faute a11y — le pattern grid ARIA est requis
  - [x] Couleurs (FR18 — un constat, pas un fouet) : niveau 0 = neutre (`bg-gray-100 dark:bg-gray-800`), niveaux 1-4 = rampe verte (`bg-green-200/400/600/800` + variantes dark) — AUCUN rouge, AUCUN compteur de streak, AUCUN texte culpabilisant ; légende « Less → More » discrète
  - [x] Étiquettes de mois au-dessus des colonnes (au changement de mois), initiales de jours (M/T/W/T/F/S/S ou L/M/M/J/V/S/D ? — UI anglaise : Mon/Wed/Fri en marge, pattern GitHub)
  - [x] FR20 : `getHeatmap` renvoie `[]` → la grille se rend quand même, toute à 0, avec un texte neutre du type « No practice logged in {year} yet. » (PAS d'incitation pressante)
  - [x] États : loading / échec (« Heatmap could not be loaded. », jamais d'état vide mensonger — acquis 1.1) via live region `role="status"` nommée ; responsive (scroll horizontal `overflow-x-auto` sur mobile — 53 colonnes ne tiennent pas) ; dark partout ; anglais partout
  - [x] NFR2 client : `useMemo` sur grille + niveaux ; cellules = divs simples (pas de handler par cellule au-delà du nécessaire)
- [x] Task 5 : Routing + nav (AC: 3)
  - [x] `App.tsx` : route `/my-heatmap` gardée par auth ; `Header.tsx` : lien « Heatmap » (mêmes classes)
- [x] Task 6 : Tests (AC: tous)
  - [x] Backend (étendre `practicesessioncontroller.test.js`, mock `findAll` + vérifier le shape exact attributes/group/where/order) : agrégation appelée avec Op.between sur l'année demandée ; cast Number des strings pg (mock renvoie `totalMinutes: '120'`, `sessionCount: '3'` → réponse en numbers) ; SUM null → 0 ; year invalide (absent, 'abc', 1800, 2200, 2026.5) → 400 ; 401 ; 500 si rejet
  - [x] Utils (`src/__tests__/heatmap.test.ts`, NOUVEAU — tests unitaires purs) : `buildYearGrid` 365 jours pour 2026, 366 pour 2024, alignement lundi (le 2026-01-01 est un jeudi → 3 cellules de padding), premier/dernier jour corrects SANS parsing de string ; `computeLevels` : quartiles sur distribution connue, jour 0 minute avec session → 1, positives vide → tous à 1, jour absent → 0
  - [x] Page (`src/__tests__/MyHeatmapPage.test.tsx`, NOUVEAU, mock du service) : grille rendue avec `role="grid"` et ~371 gridcells pour 2026 ; aria-labels actifs/vides corrects ; niveaux appliqués (classe de couleur sur une cellule connue) ; FR20 : `[]` → grille présente + texte neutre ; échec → message d'erreur sans grille mensongère ; flèches déplacent le focus (ArrowRight depuis la cellule tabbable → cellule suivante focusée)
  - [x] ⚠️ Les tests de page ne touchent PAS à MySessionsPage — fichiers séparés, zéro risque sur les 114 tests existants
- [x] Task 7 : Validations finales
  - [x] Les DEUX suites + lint + build + scan NUL ; smoke : `GET /api/sessions/heatmap?year=2026` sans session → 401 ; **test manuel Safari + Chrome** (accord de rétro #2 — c'est une page nouvelle) et chrono visuel du rendu (NFR2)

### Review Findings

- [x] [Review][Patch] Sémantique ARIA transposée : semaines en role="row" mais flèches contraires au pattern APG pour un lecteur d'écran, clamp qui traverse les lignes, chords Alt+flèche avalés, Home/End absents — restructurer en 7 lignes-jours (les touches actuelles deviennent conformes), no-move aux bords, ignorer les modificateurs, + Home/End (Med, blind+edge) [src/pages/MyHeatmapPage.tsx]
- [x] [Review][Patch] Paliers effondrés sur distributions à égalités : un utilisateur régulier (30 min chaque jour) voit TOUTE son année au vert le plus pâle — démotivant, contraire à l'esprit FR15/FR18 ; règle « le max personnel = niveau 4 » + quartiles pour le reste (Med, blind+edge) [src/utils/heatmap.ts + tests]
- [x] [Review][Patch] NaN d'une réponse API non conforme → niveau 4 + « NaN minutes » — garde Number.isFinite (edge) [computeLevels]
- [x] [Review][Patch] focusedDate périmé après le passage au nouvel an → plus aucune cellule tabbable — garde de validité sur tabbableDate (edge) [page]
- [x] [Review][Patch] DST à minuit (moteurs historiques) peut dupliquer un jour — curseur construit à midi (edge) [buildYearGrid]
- [x] [Review][Patch] buildYearGrid(année < 100) → grille vide (quirk Date deux chiffres) — setFullYear après construction (edge) [buildYearGrid + test]
- [x] [Review][Patch] Garde morte dans monthByWeek (condition insatisfaisable) — supprimer (blind+edge+auditor) [page]
- [x] [Review][Patch] focus() non enveloppé ligne 95 → warning act() à chaque run (les 3 couches) [test]
- _Écartés (6) : index (user_uid, date) « absent du diff » (créé en 2.1, vérifié en DB) ; clearAllMocks « invisible » (présent dans le beforeEach du fichier) ; lien Heatmap absent du menu mobile (l'app n'a PAS de menu mobile — défer connu) ; 3 infos auditor (jour unique → couvert par le patch paliers ; parsing 400 = pattern établi ; compte de gridcells meilleur que la lettre du spec)._

## Dev Notes

### Décisions de conception

**1. Agrégation côté serveur, pas le GET /sessions complet.** NFR2 (< 1 s sur 365 jours) : la liste complète avec items serait des centaines de lignes jointes ; l'agrégat GROUP BY date renvoie ≤ 366 lignes plates. L'index `(user_uid, date)` posé en 2.1 « en prévision de la heatmap » sert enfin. SOMME sur `duration_minutes` de la SESSION (pas des items — FR15 dit « minutes totales du jour », la durée de session est la donnée canonique, FR13 la pré-remplit déjà depuis les items).

**2. Échelle relative calculée CLIENT.** Les paliers quartiles dépendent de la distribution de l'année affichée — c'est un calcul de présentation sur ≤ 366 valeurs, pas une responsabilité serveur. `computeLevels` dans `src/utils/heatmap.ts` = pur, unitairement testable (leçon digitsOnly : la logique extraite des pages se teste sans jsdom).

**3. Le piège FR19 à la LECTURE, version grille.** Construire les jours de l'année avec `new Date(year, 0, 1)` (constructeur LOCAL, sûr) et itérer ; formater avec le formateur manuel. `new Date('2026-01-01')` = minuit UTC = 31 décembre dans les fuseaux négatifs → grille décalée d'un jour. Les dates de l'API restent des strings comparées telles quelles (`Map<string, HeatmapDay>`).

**4. Semaine commençant lundi.** Public FR (toi 😄). GitHub commence dimanche ; on assume lundi. `getDay()` renvoie 0=dimanche → décalage `(getDay() + 6) % 7`.

**5. Périmètre 3.1 = sessions UNIQUEMENT.** Le rétro-import des `SongPlay` historiques (FR22) est la story 3.3 — l'endpoint n'agrège QUE `PracticeSessions`. Le clic-détail et la navigation d'années = 3.2. Cette grille est statique (focus clavier excepté).

**6. FR18 par construction.** Pas de streak, pas de rouge, jours vides neutres, états vides sans incitation. C'est un AC, pas une nuance de style — l'auditor de review le vérifiera mot à mot.

### Intelligence des stories/rétro précédentes

- **Accords de rétro Epic 2 ACTIFS** : (a) test manuel Safari + Chrome avant review (page nouvelle avec interactions clavier → obligatoire) ; (b) protocole NUL (scan perl, double échappement, vérifier l'exécution) ; (c) tout champ numérique futur → `digitsOnly` + `inputMode="numeric"` (pas de champ numérique dans cette story, mais 3.2 en aura peut-être)
- **Patterns établis à réutiliser** : live region nommée pour les états (2.3), états loading/vide/échec distincts sans mensonge (1.1), messages 400 surfacés par le service (2.1), `within()` dans les tests pour les collisions, helpers extraits dans utils pour testabilité (digitsOnly)
- **practicesessioncontroller.js fait ~600 lignes** (getAll, create, update, delete + helpers durcis par 4 reviews) — lire AVANT d'ajouter `getHeatmap` ; réutiliser `UUID_PATTERN`/constantes existantes si besoin, suivre le style des autres handlers
- **Différés à ne PAS traiter** : inchangés (deferred-work.md)

### Périmètre — garde-fous

- **PAS de SongPlay/rétro-import** (3.3), **PAS de clic-détail ni navigation d'années** (3.2), **PAS de lastPlayed** (epic 4)
- **PAS de lib de visualisation** (d3, etc.) : la grille est du CSS grid + divs Tailwind, c'est tout
- **PAS de localStorage** de préférences ici (rien à persister tant que la 3.2 n'apporte pas le choix d'année)
- **NE PAS toucher MySessionsPage** — page entièrement nouvelle, zéro risque sur les 114 tests

### Testing standards

Identiques. La nouveauté : `src/__tests__/heatmap.test.ts` = tests unitaires PURS des utils (pas de render) — le gros de la logique (grille, quartiles) se teste là, la page ne teste que l'assemblage et l'a11y.

### Project Structure Notes

- Nouveaux : `src/utils/heatmap.ts`, `src/pages/MyHeatmapPage.tsx`, `src/__tests__/heatmap.test.ts`, `src/__tests__/MyHeatmapPage.test.tsx`
- Modifiés : `backend/controllers/practicesessioncontroller.js` (+getHeatmap), `backend/routes/sessions.js` (+GET /heatmap avant /:uid), `backend/__tests__/practicesessioncontroller.test.js` (+findAll heatmap cases), `src/services/practiceSessionService.ts` (+HeatmapDay, getHeatmap), `src/App.tsx` (+route), `src/components/Header.tsx` (+lien)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1] — FR15/18/19/20, NFR2/3/6
- [Source: _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/prd.md#Groupe C] — philosophie « miroir, pas fouet »
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-06-07.md] — accords actifs + points fléchés 3.1 (agrégation NFR2, FR19 lecture)
- [Source: backend/models/practicesession.js] — DATEONLY + index (user_uid, date)
- [Source: src/utils/digitsOnly.ts] — précédent d'extraction utils testable
- [Source: _bmad-output/project-context.md] — règles d'implémentation

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

- TDD : 4 tests backend RED → GREEN 45/45 ; 8 tests utils purs écrits avant l'implémentation ; 7 tests page (1 ajustement : act() pour flusher le onFocus avant le keyDown — jsdom ne sépare pas les macro-événements comme un navigateur)
- Suites : backend 74/74, frontend 129/129 (+15 nouveaux, les 114 existants intacts) ; lint 0 nouvelle erreur ; build OK ; zéro NUL
- Smoke : GET /api/sessions/heatmap?year=2026 sans session → 401
- ✅ Test manuel effectué par northwood (accord rétro #2) — 3 retours terrain, tous traités avant review :
  1. « Heatmap could not be loaded. » → simple 401 (session MemoryStore vidée par les restarts nodemon) ; résolu en se reconnectant ; le défer « 401 dead-end » passe en priorité haute (3ᵉ manifestation réelle, deferred-work.md mis à jour)
  2. « Il n'y a que 3 jours dans la semaine » → le labelling clairsemé GitHub (Mon/Wed/Fri) lisait comme des semaines de 3 jours → les 7 étiquettes Mon→Sun sont affichées
  3. Jours vides invisibles (même couleur que le fond du body, surtout en dark) → niveau 0 passé de gray-100/gray-800 à gray-200/gray-700 — les cases existent visuellement, toujours neutres (FR18)

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Agrégation : une requête GROUP BY date sur l'index (user_uid, date) — NFR2 réglé côté serveur ; cast Number des SUM/COUNT pg (piège string vérifié par test) ; date groupée verbatim (FR19)
- Grille : buildYearGrid 100 % constructeurs locaux (le test vérifie l'alignement lundi sans jamais parser une string) ; bissextiles couvertes
- Paliers : nearest-rank quartiles sur la distribution de l'utilisateur ; jour actif sans minutes → niveau 1 (AC2) ; distribution vide → tout à 1
- A11y : roving tabindex avec flèches (↓↑ = jour, →← = semaine), labels textuels par cellule, statuts en live region nommée — et 365 cellules SANS être 365 tab-stops
- FR18 vérifié par construction : zéro rouge, zéro streak, jours vides neutres, message vide non culpabilisant
- Décisions tranchées : agrégation serveur GROUP BY date (l'index 2.1 sert enfin), paliers quartiles côté client en utils purs, semaine lundi, grille statique (interactions = 3.2)
- Pièges documentés : SUM/COUNT pg en string (cast Number), FR19 lecture version grille (constructeur local, jamais de parsing de string), roving tabindex obligatoire (365 tab-stops = faute a11y)
- Accords de rétro Epic 2 intégrés comme exigences (Safari/Chrome manuel, protocole NUL)

### File List

**Nouveaux :**
- src/utils/heatmap.ts (formatLocalDate, buildYearGrid, computeLevels)
- src/pages/MyHeatmapPage.tsx
- src/__tests__/heatmap.test.ts (8 tests unitaires purs)
- src/__tests__/MyHeatmapPage.test.tsx (7 tests)

**Modifiés :**
- backend/controllers/practicesessioncontroller.js (+ getHeatmap, import fn/col/Op)
- backend/routes/sessions.js (+ GET /heatmap avant les routes paramétrées)
- backend/__tests__/practicesessioncontroller.test.js (+4 tests)
- src/services/practiceSessionService.ts (+ HeatmapDay, getHeatmap)
- src/App.tsx (+ route /my-heatmap)
- src/components/Header.tsx (+ lien Heatmap)

## Change Log

- 2026-06-07 : Code review adversariale (3 couches, verdict ACCEPT) — 8 patches appliqués (restructuration ARIA en lignes-jours rendant les flèches conformes APG + no-move aux bords + modificateurs ignorés + Home/End ; règle « max personnel = niveau 4 » réparant le miroir démotivant des pratiques régulières ; gardes NaN/rollover/DST-midi/année-courte ; garde morte supprimée ; act() ; +6 tests), 0 différé, 6 écartés. Frontend 133/133, backend 74/74. Statut → done


- 2026-06-07 : Story 3.1 implémentée (endpoint d'agrégation GROUP BY date avec cast des strings pg, grille annuelle lundi-first construite en local-safe, paliers quartiles relatifs, roving tabindex, palette non punitive) — statut → review
