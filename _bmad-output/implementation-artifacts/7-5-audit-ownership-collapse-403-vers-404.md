---
baseline_commit: 0789a19b7ee78cbc054b6374bfef40273f472481
---

# Story 7.5: Auditer l'ownership et normaliser 403→404 (fix getSong & markSongPlayed)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que jamais une réponse ne révèle l'existence d'une donnée qui n'est pas à moi,
so that il n'y a ni IDOR ni oracle d'énumération par code de statut.

## Acceptance Criteria

1. **`getSong` (IDOR)** — `GET /api/songs/:uid`, aujourd'hui sans contrôle d'ownership, devient une **requête scopée** `Song.findOne({ where: { uid, userUid } })` → si `null` **404** (plus aucune donnée d'autrui renvoyée). Ajouter aussi la garde `userId` → 401 que les autres handlers ont. [Source: epics.md#Story 7.5 ; songcontroller.js:78-89]
2. **`markSongPlayed` (FK non vérifiée)** — quand un `instrumentUid` est fourni, son **appartenance au user est validée** (`Instrument.findOne({ where: { uid: instrumentUid, userUid } })`) ; sinon **404**. (L'ownership de la `Song` parente est déjà vérifié.) [Source: epics.md#Story 7.5 ; songcontroller.js:353]
3. **Collapse 403→404 app-wide** — audit systématique de toutes les routes vs le pattern ownership canonique : **tout échec d'ownership renvoie 404, jamais 403** (« pas à toi » indistinguable de « n'existe pas »). Forme cible canonique : requête scopée `where:{ uid, userUid }` → `null` → `next(createError(404))`. **Aucune route ne renvoie 403 pour de l'ownership.** [Source: architecture.md#Format Patterns L260-261]
4. **Garde `req.body` généralisée** — les contrôleurs préexistants (auth/topic/instrument/song) sans garde de corps : un POST/PUT **sans corps JSON** (Content-Type non-json → `req.body` undefined) ne doit plus produire un **500** par déstructuration, mais un **400** explicite. Généraliser le pattern `const { … } = req.body || {}` (déjà posé en story 2.1, `practicesessioncontroller.js:255`). [Source: epics.md#Story 7.5 ; deferred-work 2026-06-21]
5. **Exception préservée** — les **deux 403 « système »** de topic (`Cannot edit/delete the system topic`) sont **légitimes (non-ownership)** et **restent 403** : ils s'appliquent après vérification que le topic appartient bien au user. [Source: topiccontroller.js:86,147 ; tests 8.2]

**And** tests : `getSong` d'un autre user → **404** ; `markSongPlayed` avec `instrumentUid` étranger → **404** ; POST sans corps JSON → **400** (pas 500) ; les tests existants qui assertent un **ownership-403** passent à **404** ; les tests **system-topic restent 403**.

## Tasks / Subtasks

- [x] **Task 1 — `getSong` : fermer l'IDOR** (AC: 1)
  - [x] `backend/controllers/songcontroller.js` `getSong` (l.78-89) : ajouter `const userId = req.session.user; if (!userId) return next(createError(401, ...))` (aligner sur les autres handlers) ; remplacer `Song.findByPk(req.params.uid)` par `Song.findOne({ where: { uid: req.params.uid, userUid: userId } })` ; `if (!song) return next(createError(404, 'Song not found'))`.
- [x] **Task 2 — `markSongPlayed` : valider l'`instrumentUid`** (AC: 2)
  - [x] `backend/controllers/songcontroller.js` `markSongPlayed` (autour de l.353, où `instrumentUid` est persisté) : si `instrumentUid` est fourni (truthy), vérifier `Instrument.findOne({ where: { uid: instrumentUid, userUid: userId } })` → si `null` `next(createError(404, ...))` **avant** la persistance. Ne pas valider quand `instrumentUid` est absent (champ optionnel). `instrumentType` reste une string libre (déjà sanitizée l.267-274) — ne pas y toucher.
  - [x] Importer le modèle `Instrument` dans `songcontroller.js` si absent.
- [x] **Task 3 — Collapse ownership 403→404 (16 routes)** (AC: 3, 5)
  - [x] Pour CHAQUE route ci-dessous, remplacer le couple `findByPk(uid)` (→404 si absent) + `entity.userUid !== userId` (→**403**) par la forme canonique scopée : `Model.findOne({ where: { uid: req.params.uid, userUid: userId } })` → `if (!entity) next(createError(404, '<Entity> not found'))`. **Conserver** toute garde de format UUID préexistante (topic/session) qui renvoie déjà 404 avant le findByPk (évite un 500 Sequelize sur uid malformé).
    - `PUT /songs/:uid` songcontroller.js:158 · `DELETE /songs/:uid` songcontroller.js:215 · `POST /songs/:uid/plays` songcontroller.js:264 · `GET /songs/:uid/plays` songcontroller.js:385
    - `GET /songs/:uid/streaming-links` songlinkscontroller.js:19
    - `PUT /instruments/:uid` instrumentcontroller.js:65 · `DELETE /instruments/:uid` instrumentcontroller.js:96
    - `GET /playlists/:uid` playlistcontroller.js:91 · `PUT /playlists/:uid` playlistcontroller.js:148 · `DELETE /playlists/:uid` playlistcontroller.js:189 · `POST /playlists/:uid/songs/:songUid` playlistcontroller.js:217 · `DELETE /playlists/:uid/songs/:songUid` playlistcontroller.js:251
    - `PUT /topics/:uid` topiccontroller.js:82 · `DELETE /topics/:uid` topiccontroller.js:142
    - `PUT /sessions/:uid` practicesessioncontroller.js:445 · `DELETE /sessions/:uid` practicesessioncontroller.js:725
  - [x] **NE PAS toucher** les 2 × 403 « système » de topic (`topiccontroller.js:86` edit, `topiccontroller.js:147` delete) : ils restent **403** et s'exécutent après le scope (le topic appartient au user, mais `isSystem` interdit l'action). Ordre : scope→404, **puis** isSystem→403.
  - [x] Pour les handlers qui réutilisent l'entité après le fetch (ex. `deleteSong` scanne les playlists, `updateTopic`/`updatePracticeSession` relisent des champs), la `findOne` scopée renvoie bien la ligne → la logique aval est préservée.
- [x] **Task 4 — Garde `req.body || {}` généralisée (8 handlers)** (AC: 4)
  - [x] Ajouter `const { … } = req.body || {}` (ou `const body = req.body || {}`) aux handlers qui déstructurent `req.body` directement : `createUser` usercontroller.js:8,21-23 · `loginUser` usercontroller.js:83-93 · `createSong` songcontroller.js:99 · `updateSong` songcontroller.js:161 · `createInstrument` instrumentcontroller.js:32 · `updateInstrument` instrumentcontroller.js:68 · `createTopic` topiccontroller.js:35 · `updateTopic` topiccontroller.js:89.
  - [x] Vérifier qu'après la garde, un corps manquant ⇒ champs requis `undefined` ⇒ la **validation de présence existante renvoie 400** (et non 500). Si un handler ne valide pas la présence, ajouter le 400 explicite minimal (cohérent avec l'existant). Ne PAS introduire de nouvelle lib de validation.
- [x] **Task 5 — Tests** (AC: tous)
  - [x] **Nouveaux** : `getSong` d'un autre user → 404 (et non-auth → 401) [songcontroller.test.js] ; `markSongPlayed` avec `instrumentUid` étranger → 404 ; un POST **sans corps JSON** sur ≥1 handler représentatif par contrôleur (ex. `createSong`, `createTopic`, `createInstrument`, `createUser`) → 400 (pas 500).
  - [x] **À METTRE À JOUR (403→404)** — ownership : `topiccontroller.test.js:307` (update foreign), `:385` (delete foreign) ; `songcontroller.test.js:432` (foreign song), `:476` (delete foreign) ; `playlistcontroller.test.js:157` (foreign playlist) ; `practicesessioncontroller.test.js:827` (update foreign), `:1137` (delete foreign). Couvrir aussi les routes sans test contrôleur dédié si pertinent (instruments, streaming-links, songplays, playlist add/remove song).
  - [x] **À NE PAS TOUCHER (restent 403)** : `topiccontroller.test.js:332` (edit system topic), `:410` (delete system topic) ; tous les 403 de `csrf.test.js` (hors scope).
  - [x] Suites back + lint backend verts ; husky vert sans `--no-verify`.

## Dev Notes

### Contexte & design retenu

Deux failles nommées + une normalisation transverse, toutes au service de l'**anti-énumération** (NFR sécurité) :
- **IDOR** : `getSong` renvoie la chanson de n'importe qui (pas de scope). Fermé par requête scopée.
- **FK non vérifiée** : `markSongPlayed` persiste un `instrumentUid` arbitraire sur un `SongPlay`.
- **Oracle par code de statut** : un user authentifié distingue aujourd'hui « existe mais pas à moi » (**403**) de « n'existe pas » (**404**). On **collapse tout en 404** via la requête scopée canonique. [Source: architecture.md#Format Patterns ; deferred-work « lot sécu »]

**Pattern canonique (cœur de la story)** — à appliquer partout :
```js
// AVANT (fuit l'existence via 403)
const x = await Model.findByPk(req.params.uid);
if (!x) return next(createError(404, '<Entity> not found'));
if (x.userUid !== userId) return next(createError(403, 'Forbidden'));
// APRÈS (scopé : « inconnu » et « pas à toi » indistinguables → 404)
const x = await Model.findOne({ where: { uid: req.params.uid, userUid: userId } });
if (!x) return next(createError(404, '<Entity> not found'));
```
Le `userId` vient de `req.session.user` (toutes les routes entité sont derrière `authsess`, mais chaque handler garde son double-check 401 — le conserver).

**Garde `req.body` (référence story 2.1)** — `practicesessioncontroller.js:255` :
```js
// req.body is undefined when the request body is not JSON — treat as empty.
const { date, instrumentType, note, items } = req.body || {};
```

### Inventaire d'audit (exhaustif, 2026-06-23)

**A. Ownership-403 → 404 (16, Task 3) :** songcontroller.js {158, 215, 264, 385} · songlinkscontroller.js:19 · instrumentcontroller.js {65, 96} · playlistcontroller.js {91, 148, 189, 217, 251} · topiccontroller.js {82, 142} · practicesessioncontroller.js {445, 725}.

**B. Manque la garde `req.body` (8, Task 4) :** usercontroller.js (createUser, loginUser) · songcontroller.js (createSong:99, updateSong:161) · instrumentcontroller.js (createInstrument:32, updateInstrument:68) · topiccontroller.js (createTopic:35, updateTopic:89).
**Déjà gardés (référence) :** createPracticeSession:255, updatePracticeSession:450, markSongPlayed:244, createPlaylist:110, updatePlaylist:151.

**C. Pas d'ownership / scope à poser (2, Tasks 1-2) :** `getSong` (songcontroller.js:78-89, IDOR) · `markSongPlayed` `instrumentUid` (songcontroller.js:353, FK non validée).

**403 légitimes — RESTENT 403 (AC5) :** topiccontroller.js:86 (edit system), :147 (delete system). Ordre obligatoire : scope→404 **puis** isSystem→403.

### Pièges à éviter

- **System-topic** : ne pas collapser ses 403. Ils suivent le scope (le user possède son topic système ; l'action est interdite). Les tests `:332`/`:410` doivent rester verts en **403**.
- **Tests existants** : changer 403→404 **casse** les assertions actuelles (liste précise en Task 5) — les mettre à jour dans la même passe, sinon régression husky.
- **Garde UUID préexistante** (topic/session renvoient 404 sur uid malformé avant findByPk) : la **conserver** avant la `findOne` scopée, sinon un uid malformé → exception Sequelize → 500. song/instrument/playlist n'en ont pas aujourd'hui (500 sur uid malformé = pré-existant, **hors scope** ; ne pas l'ajouter ici).
- **`markSongPlayed`** : ne valider l'`instrumentUid` que s'il est fourni (optionnel). `instrumentType` (string libre) n'est PAS une FK — ne pas le valider contre la table Instrument.
- **`SongPlay` n'a pas de `userUid`** : ownership via la `Song` parente. Les agrégations (`getHeatmap`, `getDayPlays`, `getSongPlays`) scopent déjà via le join `Song where userUid` — ne pas régresser ce join.
- **Pas de nouvelle dépendance, pas de migration, pas de front** : pure logique contrôleur. Le front fait déjà `if(!res.ok) throw` ; 404 au lieu de 403 ne change pas l'UX (apiFetch n'intercepte que 401, et le retry CSRF de 7.3 ne se déclenche que sur le marqueur `X-CSRF-Token-Invalid`, absent ici). [Source: src/services/apiFetch.ts]
- **Backend CommonJS**, `http-errors`, commentaires **EN**. Modèles mockés dans les tests (`jest.mock('../models')`). [Source: project-context.md]

### Project Structure Notes

- **EDIT** (contrôleurs) : `songcontroller.js`, `songlinkscontroller.js`, `instrumentcontroller.js`, `playlistcontroller.js`, `topiccontroller.js`, `practicesessioncontroller.js`, `usercontroller.js`.
- **EDIT/NEW** (tests) : `songcontroller.test.js`, `topiccontroller.test.js`, `playlistcontroller.test.js`, `practicesessioncontroller.test.js`, `usercontroller.test.js` ; pas de test dédié aujourd'hui pour `instrumentcontroller` ni `songlinkscontroller` (en créer si on veut couvrir leur 404 d'ownership — recommandé).
- **Aucune migration, aucun fichier front.** Risque de déploiement faible (logique pure, déploiement atomique).
- Convention contrôleurs minuscules collées ; réponses JSON brutes ; `next(createError(...))`. [Source: project-context.md]

### References

- [Source: epics.md#Story 7.5] — ACs (getSong, markSongPlayed, collapse, garde req.body)
- [Source: architecture.md#Format Patterns L260-261] — collapse 403→404, requête scopée canonique
- [Source: deferred-work.md « lot sécu »] — getSong IDOR, markSongPlayed, 403/404 oracle, garde req.body (généralisation du pattern 2.1)
- [Source: project-context.md] — pattern contrôleur, anti-pattern getSong explicitement cité, tests `jest.mock('../models')`
- [Source: audit 2026-06-23] — inventaire A/B/C ci-dessus, file:line vérifiés
- [Source: story 7.3] — apiFetch n'intercepte que 401 ; retry CSRF sur marqueur uniquement (pas d'impact 404)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Forme retenue : requête scopée `findOne({ where: { uid, userUid } })` → 404 (canonique archi), remplaçant `findByPk` + `userUid !== userId` → 403. Conséquence : **aucun `findByPk` ne subsiste dans les contrôleurs** ; les mocks de test sont passés de `findByPk` à `findOne`.
- Les tests « foreign user → 403 » deviennent « scoped out → 404 » : le mock renvoie `null` (le `where` scopé exclut la ligne d'autrui) et on asserte 404.
- 2 tests system-topic (`topiccontroller`) **conservés en 403** (le user possède le topic, `isSystem` interdit l'action — 403 légitime).
- `markSongPlayed` : `Instrument.findOne` ajouté au mock ; le test AC6 (passe un `instrumentUid`) mocke désormais un instrument possédé.
- Smoke : backend 166 ✓ / frontend 241 ✓ ; lint backend ✓.

### Completion Notes List

- **AC1 (getSong IDOR)** : `getSong` scopé `findOne({where:{uid,userUid}})` + garde 401 → 404 pour un id d'autrui/inconnu.
- **AC2 (markSongPlayed instrumentUid)** : validation `Instrument.findOne({where:{uid:instrumentUid,userUid}})` quand fourni → 404 si non possédé, avant persistance.
- **AC3 (collapse 403→404)** : 16 routes (song ×4, songlinks, instrument ×2, playlist ×5, topic ×2, session ×2) passées à la forme scopée → 404. Plus aucun 403 d'ownership.
- **AC4 (garde req.body)** : 8 handlers (createUser, loginUser, createSong, updateSong, createInstrument, updateInstrument, createTopic, updateTopic) → `req.body || {}` ; corps non-JSON → 400 au lieu de 500. `createUser` gardé **avant** le `try` (la vraie cause du 500). `loginUser` : check présence login/password → 400 générique.
- **AC5 (exception)** : les 2 × 403 « système » de topic restent 403, après le scope.
- **AC6 (tests)** : nouveaux (getSong owned/foreign/anon ; markSongPlayed instrumentUid foreign→404 & owned→201 ; createSong/createTopic/createInstrument/createUser/loginUser sans corps→400 ; nouveau fichier `instrumentcontroller.test.js`) ; 7 tests d'ownership basculés 403→404 ; 2 tests system-topic conservés en 403.
- **Décisions** : forme scopée canonique (archi) plutôt que simple 403→404 littéral ; gardes UUID préexistantes (topic/session) conservées ; aucune migration, aucun front, aucune dépendance.

### File List

- `backend/controllers/songcontroller.js` (EDIT — getSong scopé, instrumentUid validé, collapse ×4, garde req.body ×2)
- `backend/controllers/songlinkscontroller.js` (EDIT — collapse)
- `backend/controllers/instrumentcontroller.js` (EDIT — collapse ×2, garde req.body ×1)
- `backend/controllers/playlistcontroller.js` (EDIT — collapse ×5)
- `backend/controllers/topiccontroller.js` (EDIT — collapse ×2, garde req.body ×2, 403 système conservés)
- `backend/controllers/practicesessioncontroller.js` (EDIT — collapse ×2, include items conservé)
- `backend/controllers/usercontroller.js` (EDIT — garde req.body createUser/loginUser)
- `backend/__tests__/songcontroller.test.js` (EDIT — findOne, getSong, instrumentUid, body, foreign→404)
- `backend/__tests__/topiccontroller.test.js` (EDIT — findOne, foreign→404, system 403 gardés, body)
- `backend/__tests__/playlistcontroller.test.js` (EDIT — findOne, foreign→404)
- `backend/__tests__/practicesessioncontroller.test.js` (EDIT — findOne, foreign→404)
- `backend/__tests__/usercontroller.test.js` (EDIT — body→400 ×2)
- `backend/__tests__/instrumentcontroller.test.js` (NEW — couverture create/update/delete + ownership 404 + body 400)

### Change Log

- 2026-06-23 — Suivi code review : aucun bug de correction. `project-context.md` synchronisé avec 7.5 (pattern contrôleur canonique → requête scopée `findOne({uid,userUid})→404`, ligne 78 ; note `getSong` réécrite, ligne 116) pour empêcher la réintroduction du 403 d'ownership. `deferred-work.md` : inconsistance garde-UUID (song/instrument/playlist) notée (pré-existante).
- 2026-06-23 — Story 7.5 : audit ownership + collapse 403→404. `getSong` IDOR fermé (scopé), `markSongPlayed` valide l'`instrumentUid`, 16 routes passées en requête scopée `where:{uid,userUid}` → 404 (plus aucun 403 d'ownership ; 2 × 403 « topic système » conservés). Garde `req.body || {}` généralisée sur 8 handlers (corps non-JSON → 400, plus 500). Aucune migration/front/dépendance. Back 166 / front 241 verts.
