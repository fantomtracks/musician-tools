---
baseline_commit: b0362372d077d6bf2c3da3bbe7efae0f2d2bd20b
---

# Story 2.3: Consulter mon historique de sessions

Status: done

## Story

As a musicien,
I want voir la liste de mes sessions passées,
so that je peux me remémorer ce que j'ai travaillé et quand.

## Acceptance Criteria

1. **Liste antichronologique** — Given des sessions existantes, When j'ouvre la page « Sessions », Then je vois la liste antichronologique : date, durée, instrument, entrées (FR14).
2. **Notes consultables** — les notes (globale de session ET par entrée) sont consultables dans la liste.
3. **Ownership** — Given un autre utilisateur, When il consulte son historique, Then il ne voit jamais mes sessions (NFR4).
4. **Standards** — la page est responsive et dark mode (NFR3) ; états vide / chargement / échec gérés.

## Tasks / Subtasks

- [x] Task 1 : Backend — GET /api/sessions (AC: 1, 2, 3)
  - [x] `backend/controllers/practicesessioncontroller.js` : ajouter `getAllPracticeSessions` (pattern `getAllTopics`) : 401 si pas de session → `PracticeSession.findAll({ where: { userUid: userId }, include: [{ model: SessionItem, as: 'items' }], order: [['date', 'DESC'], ['createdAt', 'DESC'], [{ model: SessionItem, as: 'items' }, 'createdAt', 'ASC']] })` → `res.json(sessions)` (brut, pas d'enveloppe)
  - [x] Antichronologique = tri PRIMAIRE sur `date` DESC (le jour FR19), PUIS `createdAt` DESC (deux sessions le même jour : la plus récemment saisie d'abord) ; les items d'une session en `createdAt` ASC (ordre d'ajout)
  - [x] L'alias `as: 'items'` est OBLIGATOIRE dans l'include (il correspond au `hasMany ... as: 'items'` posé en 2.2 — sans lui, Sequelize jette une erreur d'alias)
  - [x] PAS de pagination dans cette story (volumes utilisateur faibles ; la perf est traitée par NFR2 à l'epic 3) — le noter en commentaire si besoin
  - [x] `backend/routes/sessions.js` : `router.get('/', authsess, ...)` — la route POST existante ne bouge pas
- [x] Task 2 : Service frontend (AC: 1)
  - [x] `src/services/practiceSessionService.ts` : ajouter `getAll(): Promise<PracticeSession[]>` (GET `/api/sessions`, `credentials: 'include'`, `if (!res.ok) throw new Error('Failed to fetch sessions')`) — le type `PracticeSession` a déjà `items?: SessionItem[]` (2.2)
- [x] Task 3 : Page — liste d'historique sous le formulaire (AC: 1, 2, 4)
  - [x] `src/pages/MySessionsPage.tsx` : nouvel état `sessions: PracticeSession[]` + chargement au mount (AJOUTER `practiceSessionService.getAll()` au `Promise.allSettled` existant des catalogues — un échec de l'historique ne casse ni le formulaire ni les catalogues) ; états `loadFailed` distincts si besoin (pattern « Sessions could not be loaded. » vs « No sessions logged yet. », acquis 2.1)
  - [x] Après un POST réussi : `setSessions(prev => [created, ...prev])` — la réponse 201 contient déjà `items` avec labels (2.2). ATTENTION à l'ordre : une session rétroactive prépendue n'est pas à sa place antichronologique — soit ré-trier localement (`[created, ...prev].sort()` sur date DESC puis createdAt DESC), soit re-fetch ; préférer le tri local (pas d'aller-retour réseau)
  - [x] Rendu d'une carte session : date + instrument + durée (`40 min` ou rien si null) + note globale ; puis la liste des entrées : `label`, minutes (`15 min` si présentes), note d'entrée (« at 30 BPM ») — les labels viennent du snapshot FR4, ils s'affichent même si la chanson/le sujet a été supprimé
  - [x] **🚨 PIÈGE FR19 (affichage)** : ne JAMAIS faire `new Date('2026-06-07')` pour formater — parsé comme MINUIT UTC, ça affiche la veille dans les fuseaux négatifs. Afficher la string `date` brute (YYYY-MM-DD), ou formater en découpant manuellement (`const [y, m, d] = date.split('-')`)
  - [x] États : `Loading...` pendant le chargement initial, « No sessions logged yet. » si vide, « Sessions could not be loaded. » si échec (jamais l'état vide mensonger — acquis 1.1) ; responsive + dark mode + anglais partout
  - [x] NE PAS toucher au formulaire ni aux acquis 2.1/2.2 (toast, FR13, entrées) — la liste s'AJOUTE sous le formulaire
- [x] Task 4 : Tests backend (AC: 1, 3)
  - [x] Étendre `backend/__tests__/practicesessioncontroller.test.js` — ajouter `findAll` au mock `PracticeSession`. Cas : `getAllPracticeSessions` appelle `findAll` avec `where: { userUid }`, l'include `as: 'items'` et l'ordre exact (`date DESC, createdAt DESC, items createdAt ASC`) ; renvoie le résultat brut ; 401 sans session ; 500 si `findAll` rejette
- [x] Task 5 : Tests frontend (AC: 1, 2, 4)
  - [x] Étendre `src/__tests__/MySessionsPage.test.tsx` — ajouter `getAll` au mock du service (beforeEach : `mockResolvedValue([])` pour ne pas casser les 20 tests existants). Cas : la liste s'affiche après chargement (date, instrument, durée, note globale, entrées avec labels/minutes/notes) ; « No sessions logged yet. » si vide ; « Sessions could not be loaded. » si échec (et PAS l'état vide) ; après un create réussi la session apparaît dans la liste ; une session rétroactive créée ne passe PAS devant une session plus récente (tri local vérifié)
- [x] Task 6 : Validations finales
  - [x] PAS de migration (aucun changement de schéma)
  - [x] Les DEUX suites + lint + build ; vérifier zéro octet NUL (`perl -ne 'exit 1 if /\x00/'` sur les fichiers touchés)
  - [x] Smoke : `GET /api/sessions` sans session → 401 ; avec le serveur local, vérifier visuellement la liste sur `/my-sessions` (tes sessions de test 2.1/2.2 doivent apparaître !)

### Review Findings

- [x] [Review][Patch] Course : un GET initial lent écrase une session créée entre-temps (insertion locale perdue jusqu'au reload) (Med, blind+edge) [src/pages/MySessionsPage.tsx mount effect]
- [x] [Review][Patch] `sessionsFailed` jamais réinitialisé : après un échec de chargement, les sessions créées avec succès restent invisibles derrière le message d'erreur (Med, blind+edge+auditor) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] Ordre des items non déterministe au GET : `bulkCreate` horodate toutes les lignes au même instant → tie complet sur `createdAt`, Postgres rend un ordre arbitraire (Med, edge) [backend — tiebreak `uid` + durcissement comparateur]
- [x] [Review][Patch] Tri local : ordre initial non garanti côté client (confiance aveugle au serveur) + comparateur fragile si `createdAt` absent du 201 (les mocks de test cachent le cas) (blind+edge) [src/pages/MySessionsPage.tsx + tests]
- [x] [Review][Patch] États du History (« Loading… » / échec / vide) non annoncés aux lecteurs d'écran (blind) [src/pages/MySessionsPage.tsx]
- [x] [Review][Patch] Notes longues sans espaces débordent de la carte ; notes multi-lignes aplaties (edge ×2) [src/pages/MySessionsPage.tsx — break-words + whitespace-pre-wrap]
- [x] [Review][Defer] Vrai ordre de saisie des entrées au GET = colonne `position` (changement de schéma, exclu par les garde-fous de cette story) — le tiebreak `uid` rend l'ordre déterministe mais pas fidèle à la saisie ; à reconsidérer en 2.4 [backend/models/sessionitem.js]
- _Écartés (3) : « 0 min » masqué par le check truthy (inatteignable — validation serveur ≥ 1) ; warnings act() en hausse (pattern de test préexistant, non bloquant) ; mock findAll non-Once (inoffensif en l'état)._

## Dev Notes

### Décisions de conception

**1. Tri antichronologique à deux clés.** `date DESC` d'abord (le jour FR19 saisi par le client), `createdAt DESC` ensuite (départage des sessions du même jour). Le tri sur `date` seule serait instable ; le tri sur `createdAt` seul serait FAUX pour les sessions rétroactives (une session saisie aujourd'hui pour janvier doit apparaître à janvier).

**2. Même page, pas de nouvelle route.** La liste vit sous le formulaire sur `/my-sessions` (décision posée en 2.1) — pas de nouveau lien nav, pas de nouvelle page. Le formulaire reste l'élément du haut (saisie < 30 s d'abord).

**3. Mise à jour locale après création.** La réponse 201 du POST (2.2) contient la session complète avec `items` et labels → prepend + re-tri local, pas de re-fetch. Le tri local utilise la même logique double-clé.

**4. Pas de pagination.** Volumes mono-utilisateur faibles à ce stade ; NFR2 (perf heatmap) est le problème de l'epic 3, qui utilisera des agrégats, pas cette liste.

### Intelligence 2.1/2.2 (patterns à réutiliser tels quels)

- **Contrôleur** : `getAllTopics` (topiccontroller.js:6-22) est le squelette exact du GET filtré par ownership ; l'association `as: 'items'` existe déjà (practicesession.js, posée en 2.2)
- **Page** : le `Promise.allSettled` des catalogues (2.2, patché en review) est le bon endroit pour brancher le chargement des sessions — 3ᵉ promesse, échec indépendant
- **Affichage de date** : la story 2.1 a documenté le piège `toISOString` à l'ÉCRITURE ; cette story documente le piège symétrique à la LECTURE (`new Date('YYYY-MM-DD')` = minuit UTC). La date DATEONLY arrive du serveur comme string `YYYY-MM-DD` — l'afficher telle quelle est l'option zéro-risque
- **États d'affichage** : pattern « jamais d'état vide mensonger » (review 1.1) — trois états distincts : loading / vide / échec
- **Tests** : `fireEvent.submit(form)` pour contourner la validation native jsdom (2.1) ; attendre les options async avant de changer un select (2.2) ; vrais UUIDs ; mock `getAll` par défaut `[]` dans beforeEach pour préserver les 20 tests existants
- **🚨 Piège NUL-byte outillage (vécu 4×, y compris dans un .md)** : après toute édition, `perl -ne 'exit 1 if /\x00/'` sur les fichiers touchés ; pour écrire la séquence backslash-u-0000 dans du code, passer par `String.fromCharCode(0)` côté tests
- **Différés à ne PAS traiter** (deferred-work.md) : CSRF, 401-redirect, req.body guard des contrôleurs préexistants, etc.

### Périmètre — garde-fous

- **PAS d'édition/suppression de session** → story 2.4 (pas de boutons Edit/Delete sur les cartes)
- **PAS de reclassement d'entrée** (sujet supprimé → réassigner) → story 2.4 (FR4 fin de parcours)
- **PAS de filtre/recherche/groupement par instrument** → hors périmètre (2.5 = suggestions de saisie, epic 3 = visualisation)
- **NE PAS toucher** : markSongPlayed, SongPlay, lastPlayed (epic 4), heatmap (epic 3)
- Détail d'affichage : si une entrée a `songUid`/`topicUid` à NULL (réf supprimée), le `label` s'affiche normalement — AUCUN traitement spécial requis dans cette story (le badge « deleted » éventuel viendra avec la 2.4 si utile)

### Testing standards

Identiques aux stories précédentes. Mock backend : `PracticeSession.findAll` ajouté au mock existant ; l'assertion d'ordre vérifie la structure EXACTE du tableau `order` (c'est le cœur de l'AC 1).

### Project Structure Notes

- AUCUN nouveau fichier — story 100 % extension
- Modifiés (UPDATE) : `backend/controllers/practicesessioncontroller.js` (+ getAllPracticeSessions — lire l'état actuel AVANT, il contient les patches des reviews 2.1/2.2), `backend/routes/sessions.js` (+ GET), `src/services/practiceSessionService.ts` (+ getAll), `src/pages/MySessionsPage.tsx` (+ liste — préserver formulaire/toast/FR13), les deux fichiers de tests

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3] — story et ACs ; FR14, NFR3/4
- [Source: _bmad-output/implementation-artifacts/2-2-detailler-ma-session-avec-des-entrees.md] — association `as: 'items'`, réponse 201 avec items, Review Findings (patterns durcis)
- [Source: backend/controllers/topiccontroller.js] — pattern GET filtré ownership
- [Source: backend/models/practicesession.js] — hasMany items (alias)
- [Source: _bmad-output/project-context.md] — règles d'implémentation

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

- TDD : 3 tests backend RED → GREEN, puis 5 tests frontend RED (erreur de compilation, getAll absent) → GREEN
- Suites : backend 56/56, frontend 88/88 ; lint 0 nouvelle erreur ; build OK ; zéro octet NUL
- Smoke : GET /api/sessions sans session → 401
- Ajustement de test : « Bass » matchait l'option du select ET l'historique → scoping `within(history)`

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Story 100 % extension (zéro nouveau fichier, zéro migration) — le risque est dans les régressions 2.1/2.2 et le tri
- Piège symétrique FR19 documenté : new Date('YYYY-MM-DD') = minuit UTC à la lecture (l'affichage brut de la string est l'option sûre)
- Tri antichronologique double-clé justifié (sessions rétroactives)
- Backend : `getAllPracticeSessions` (ownership + include `as: 'items'` + ordre date DESC / createdAt DESC / items createdAt ASC), GET /api/sessions derrière authsess
- Frontend : carte « History » sous le formulaire — cartes session (date brute affichée verbatim, instrument, durée, note globale) avec sous-liste d'entrées (label snapshoté, minutes, note) ; états loading / vide / échec distincts ; insertion locale + re-tri après création (session rétroactive à sa vraie place — testé)
- Chargement intégré au Promise.allSettled existant (3ᵉ promesse, échec indépendant des catalogues)
- Régression zéro : 20 tests frontend et 24 backend préexistants inchangés

### File List

**Modifiés (aucun nouveau fichier) :**
- backend/controllers/practicesessioncontroller.js (+ getAllPracticeSessions)
- backend/routes/sessions.js (+ GET /)
- backend/__tests__/practicesessioncontroller.test.js (+ findAll au mock, +3 tests)
- src/services/practiceSessionService.ts (+ getAll)
- src/pages/MySessionsPage.tsx (+ sortSessions, état sessions, carte History)
- src/__tests__/MySessionsPage.test.tsx (+ getAll au mock, +5 tests)

## Change Log

- 2026-06-07 : Story 2.3 implémentée (GET /api/sessions avec items, carte History antichronologique avec tri double-clé et insertion locale) — statut → review
- 2026-06-07 : Code review adversariale (3 couches) — 6 patches appliqués (merge anti-course du GET initial, sessionsFailed réinitialisé au create, tiebreaks uid backend+frontend, tri local du fetch initial + comparateur durci, live region History, break-words/pre-wrap), 1 différé (colonne position pour l'ordre de saisie → 2.4), 3 écartés. Backend 56, frontend 92, tous verts. Statut → done
