---
baseline_commit: fd56058
arch_decision: "Unicité de chanson par user, CÔTÉ SERVEUR, via index unique fonctionnel (user_uid, lower(title), COALESCE(lower(artist), '')) — case-insensitive (PAS d'accents), COALESCE('') pour que deux chansons sans artiste collisionnent. Prérequis backend de la story 17.2 (auto-création front + blocage doublon symétrique). Calqué sur 10.1 (playlists) / 7.12 (topics). ⚠️ Rouvre le merge FK esquivé par 16.1 : la pose de l'index exige une base dédoublonnée → réassigner SongPlays.songUid + PlaylistSongs.song_uid (dédup) + SessionItems.song_uid des perdants vers le survivant AVANT delete. Décision northwood 2026-07-10 : interroger la prod d'abord (compter les doublons exacts post-16.1) puis merge ciblé, pas de moteur générique."
---

# Story 17.1: Unicité de chanson insensible à la casse (côté serveur) — merge FK + index unique + 409

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui gère sa songlist,
I want que le serveur garantisse qu'une même chanson (même titre + même artiste, à la casse près) ne puisse pas exister en double dans ma collection,
so that mes suggestions, filtres et statistiques ne soient jamais pollués par des doublons — y compris en saisie concurrente sur deux appareils — et que l'auto-création (17.2) puisse s'appuyer sur un **409** serveur pour bloquer proprement les collisions.

## Contexte & pourquoi

**Prérequis backend de la story 17.2** (« auto-création fiche chanson sans bouton + blocage doublon symétrique »). Constat (vérifié dans le code) : rien n'empêche **structurellement** deux `Songs` `(userUid, title, artist)` identiques — `title` est `STRING NOT NULL` sans `unique`, `artist` est `STRING` nullable sans `unique` (`backend/models/song.js:21-24, 103-106`), aucune migration ne pose d'index unique, et `createSong`/`updateSong` ne font **aucun** check de doublon (`backend/controllers/songcontroller.js:118-237`). La protection actuelle est **uniquement côté client** (best-effort), donc contournable par une course multi-appareils.

Le brainstorm 2026-07-10 (`_bmad-output/brainstorming/brainstorming-session-2026-07-10-0810.md`) a fait du **titre l'identité** de la chanson (artiste facultatif mais discriminant) et a décidé une **politique doublon unique dans toute l'app** : clé `(titre + artiste)`, **blocage symétrique** création + édition, adossée à une **garde serveur** (index unique + 409). Cette story pose la garde serveur, en **calquant fidèlement 10.1** (unicité nom de playlist) et **7.12** (unicité topic).

**⚠️ Ce que 16.1 avait esquivé, cette story le rouvre.** 16.1 a **trimmé** `title`/`artist`/`album` (collapsé les quasi-doublons d'espaces via `normalizeText` + migration `20260709000000`) mais a **volontairement évité tout merge FK** — l'artiste étant une string libre par chanson, trimmer suffisait à collapser la liste des *distincts* sans toucher aux lignes. **L'index unique, lui, exige une base sans doublon exact** : avant de le poser, il faut résoudre les doublons `(user_uid, lower(title), COALESCE(lower(artist),''))` résiduels, et cette résolution passe par un **merge FK** (une chanson porte de l'historique de pratique et des appartenances playlist — la renommer n'a pas de sens, contrairement à une playlist en 10.1 : on **fusionne**).

**Périmètre :** backend uniquement (migration + 2 contrôleurs + tests + commentaire modèle). **Aucun changement front** ici — le retrait du bouton Add, l'auto-création au débounce, le parse du 409 et l'UI de blocage vivent en **17.2**.

## Décisions verrouillées (brainstorm 2026-07-10 + arbitrages northwood 2026-07-10)

1. **Clé casse-insensible, sans accents** — index sur `(user_uid, lower(title), COALESCE(lower(artist), ''))`. `COALESCE(lower(artist), '')` : deux chansons sans artiste (`NULL`) collisionnent (mappées sur `''`) ; même titre + artistes différents = deux entrées légitimes. Accents **laissés de côté** (pas de `f_unaccent` — parité avec le folding client `.toLowerCase()`, pas d'extension Postgres, pas de privilège `CREATE EXTENSION`, pas de finding « folding client plus étroit » comme 7.12). **Écart assumé vs 7.12** (qui foldait les accents), **aligné sur 10.1** (`lower(name)` seul).
2. **Interroger la prod d'abord, merge ciblé** — **compter les doublons exacts post-16.1 en prod AVANT de coder** le merge (query read-only scopée `user_uid`). À l'échelle beta mono-user post-trim, le volume est quasi certainement **nul ou minime** → le merge est **défensif** (probable no-op en prod). On **ne construit pas** un moteur de merge générique/runtime surdimensionné : une migration one-off set-based, dimensionnée sur ce que la prod contient réellement, suffit.
3. **Merge (fusion), pas RENAME** — contrairement à 10.1 (playlists renommées car une playlist est une collection curée qu'on ne veut pas unir), une chanson en double est **la même chanson** : on garde le survivant (le plus ancien) et on **réassigne** vers lui l'historique de pratique et les liens playlist des perdants, puis on **supprime** les perdants. Zéro perte d'historique ni d'appartenance playlist.
4. **409 typé** — le contrôleur mappe la violation d'unicité (`23505` → `SequelizeUniqueConstraintError`) en **409** avec un corps **typé** exploitable par le front 17.2, scopé `user_uid` (pas d'oracle). Mirror `createTopic`/`createPlaylist`.

## Carte des FK vers `Songs.uid` (ce que le merge doit réassigner)

Trois tables référencent `Songs.uid` (vérifié dans les modèles). Pour chaque groupe de doublons, réassigner **des perdants vers le survivant** AVANT de supprimer les perdants :

| Table | Colonne (DB) | ON DELETE | Contrainte unique ? | Action merge |
|---|---|---|---|---|
| `SongPlays` | `"songUid"` (**camelCase en DB**, pas de `field:`) | **CASCADE** | non | **Réassigner** `songUid` perdant → survivant (sinon le delete du perdant CASCADE-supprime ses plays = perte d'historique). Pas de dédup (plusieurs plays par chanson = normal). |
| `PlaylistSongs` | `song_uid` | CASCADE | **oui** : unique `(playlist_uid, song_uid)` (`playlist_songs_unique`) | **Dédup PUIS réassigner** : si une playlist contient déjà le survivant, supprimer la ligne du perdant (sinon collision d'unicité) ; réassigner les autres. |
| `SessionItems` | `song_uid` | **SET NULL** | non | **Réassigner** `song_uid` perdant → survivant (garde le lien vivant ; le snapshot `label` FR4 est déjà indépendant). |

**Hors périmètre (à ne PAS toucher) :** `Playlist.songUids` (JSON legacy `song_uids`) — **non source de vérité depuis 5.7** (la vérité est la table de jointure `PlaylistSongs`). Ne pas le réécrire.

⚠️ **Pourquoi réassigner au lieu de laisser le delete faire son travail :** supprimer un perdant sans réassigner ferait CASCADE-delete ses `PlaylistSongs` (perte d'appartenance playlist) et SET NULL ses `SessionItems` (perte du lien vivant, même si `label` survit). Le merge doit donc réassigner explicitement les 3 tables d'abord.

## Acceptance Criteria

1. **Cadrage préalable prod (décision 2)** — Avant d'écrire le merge, une **query read-only** compte/énumère les groupes de doublons exacts résiduels en prod : `SELECT user_uid, lower(title), COALESCE(lower(artist),'') AS a, count(*) FROM "Songs" GROUP BY 1,2,3 HAVING count(*) > 1`. Le résultat est **consigné** dans la story (Dev Agent Record) et **conditionne** l'approche merge (défensif no-op si 0 ; set-based ciblé si quelques groupes). **Aucun moteur de merge générique/runtime.**
2. **Contrainte serveur insensible à la casse** — L'unicité par user porte sur `(user_uid, lower(title), COALESCE(lower(artist), ''))` via un **index unique fonctionnel** sur `"Songs"`. `title`/`artist` restent `varchar` (`lower()`/`COALESCE` couvrent casse + artiste NULL). Aucun index unique n'existait avant (rien à dropper). Le trim est déjà garanti à l'écriture (`normalizeText`, 16.1) et sur l'existant (migration `20260709000000`) → `lower()` seul suffit, pas de `btrim` dans la clé.
3. **Migration idempotente : merge FK AVANT index (décision 3)** — La migration (testée **localement avant merge** — `main` = prod), dans une **transaction** : (a) pour chaque groupe `(user_uid, lower(title), COALESCE(lower(artist),''))` à >1 ligne, survivant = `ORDER BY "createdAt" ASC, uid ASC` ; **réassigner** `SongPlays."songUid"` et `SessionItems.song_uid` des perdants → survivant ; pour `PlaylistSongs` **supprimer d'abord** les lignes perdantes dont la playlist contient déjà le survivant, **puis réassigner** `song_uid` → survivant ; **supprimer** les Songs perdants ; (b) `CREATE UNIQUE INDEX IF NOT EXISTS songs_user_uid_title_artist_ci ON "Songs" (user_uid, lower(title), COALESCE(lower(artist), ''))`. **Rejouable sans erreur** (`IF NOT EXISTS` ; le merge est no-op au re-run une fois les doublons résolus). **Ne touche pas** `Playlist.songUids` (legacy JSON).
4. **`createSong` mappe la collision en 409 typé (décision 4)** — Given une création dont `(titre, artiste)` collide (casse comprise) avec une chanson existante du user, When la violation d'unicité DB (`23505` → `SequelizeUniqueConstraintError`) remonte, Then le contrôleur répond **409** avec un corps **typé** `{ error: 'duplicate_song', message: 'A song with this title and artist already exists', song: <chanson existante ou null> }` (lookup best-effort via `lower(title)` + `COALESCE(lower(artist),'')`, **scopé `userUid`** → pas d'oracle). Le `title` reste requis (400 avant le create si vide après trim — inchangé).
5. **`updateSong` mappe la collision en 409 typé** — idem AC4 pour une édition qui amènerait `(titre, artiste)` sur une combinaison déjà prise par **une autre** chanson du user (lookup excluant la chanson en cours d'édition, `uid <> :uid`). L'invariant du brainstorm est respecté : **bloquer = refuser d'écrire, jamais supprimer/corrompre** — sur 409, `song.update` n'a rien persisté, la chanson garde sa dernière valeur valide.
6. **Pas de régression** — `getAllSongs`/`getSong`/`deleteSong`/`markSongPlayed`/`getSongPlays`/`lookupSongMetadata` **inchangés** ; le trim `normalizeText` (16.1) intact ; les FK/cascades existantes intactes ; `sync({alter:false})` au boot ne bronche pas (aucun index déclaré côté modèle). Suites back + lint vertes, husky sans `--no-verify`.
7. **Modèle honnête** — `backend/models/song.js` documente (commentaire au-dessus de `title`/`artist`) que l'unicité vit dans l'index **fonctionnel** de la migration (non exprimable par le DSL Sequelize). **Pas** de déclaration `indexes:[{unique:true,...}]` côté modèle (`sync` ne doit rien créer/dropper).

## Tasks / Subtasks

### Task 0 — Interroger la prod : compter les doublons exacts résiduels (AC 1)

- [x] **Comptage prod fait (2026-07-10, sur le dump prod `musician_tools_prod_20260710_094639.dump` restauré dans une base jetable)** : **81 chansons, 0 groupe de doublons** `(user_uid, lower(title), COALESCE(lower(artist),''))` → **0 ligne à fusionner/supprimer**. Le volet merge FK de la migration est donc un **no-op prouvé sur l'état prod actuel** : en prod, la migration se contente de **poser l'index unique** (aucune suppression). Query exécutée :
  ```sql
  SELECT user_uid, lower(title) AS t, COALESCE(lower(artist), '') AS a, count(*) AS n
  FROM "Songs" GROUP BY 1, 2, 3 HAVING count(*) > 1 ORDER BY n DESC;  -- (0 rows)
  ```
- [x] **Approche merge décidée + rendue sûre pour tout volume** : le bloc merge de la migration est **set-based défensif** — correct que la prod ait **0** doublon (no-op prouvé : la migration a tourné sur les vraies données dev sans rien collapser) ou **N** (validé en local sur un scénario seedé : casse-diff + artiste NULL, avec FK sur les perdants dont le cas dédup PlaylistSongs). Le résultat prod ne change pas le code, seulement la confiance → geste laissé à northwood ci-dessus.
- [x] ⚠️ **Aucun moteur de merge générique/runtime** (endpoint, service) : une migration one-off idempotente suffit (décision northwood).

### Task 1 — Migration : merge FK (3 tables) + index unique fonctionnel (AC 2, 3)

- [x] Nouveau fichier `backend/migrations/20260710000000-songs-title-artist-ci-unique.js` (timestamp > `20260709000000`). SQL brut `queryInterface.sequelize.query(...)` en **transaction** (patron : `20260628000200-playlists-name-ci-unique.js` + `20260625000000-topics-name-ci-unaccent.js`). Fenêtre `first_value` inlinée dans chaque statement (constante `SURVIVORS`).
- [x] `up` (transaction) :
  1. **Identifier survivant + perdants** par groupe `(user_uid, lower(title), COALESCE(lower(artist),''))` à >1 ligne — survivant = `first_value(uid) OVER (PARTITION BY user_uid, lower(title), COALESCE(lower(artist),'') ORDER BY "createdAt" ASC, uid ASC)`. Construire un mapping perdant→survivant (CTE ou table temp).
  2. **Réassigner `SongPlays`** — `UPDATE "SongPlays" SET "songUid" = <survivant> WHERE "songUid" = <perdant>` (⚠️ colonne **camelCase** `"songUid"`, pas de dédup).
  3. **Réassigner `SessionItems`** — `UPDATE "SessionItems" SET song_uid = <survivant> WHERE song_uid = <perdant>` (colonne snake_case ; pas de dédup ; `label` snapshot inchangé).
  4. **Dédupliquer puis réassigner `PlaylistSongs`** — d'abord `DELETE FROM "PlaylistSongs" p WHERE p.song_uid = <perdant> AND EXISTS (SELECT 1 FROM "PlaylistSongs" k WHERE k.playlist_uid = p.playlist_uid AND k.song_uid = <survivant>)` (évite la violation de l'unique `(playlist_uid, song_uid)`), puis `UPDATE "PlaylistSongs" SET song_uid = <survivant> WHERE song_uid = <perdant>`.
  5. **Supprimer les perdants** — `DELETE FROM "Songs" WHERE uid = <perdant>`.
  6. `CREATE UNIQUE INDEX IF NOT EXISTS songs_user_uid_title_artist_ci ON "Songs" (user_uid, lower(title), COALESCE(lower(artist), ''));`
- [x] `down` : `DROP INDEX IF EXISTS songs_user_uid_title_artist_ci;`. **Documenté** que le merge (fusion + delete) **n'est pas réversible**.
- [x] **Ne touche pas** `Playlist.songUids` (JSON legacy, non source de vérité 5.7).
- [x] **Exécuté en local** (Postgres 5433, container backend) : migration jouée sur les vraies données dev (index créé, 0 doublon), PUIS scénario seedé (groupe casse-diff `Yesterday`/`The Beatles` + groupe artiste NULL `Interlude`, avec `SongPlay`+`SessionItem`+`PlaylistSong` sur les perdants, dont **PL2 = survivant+perdant** pour la dédup). Vérifié : perdants supprimés, `SongPlays.songUid`/`SessionItems.song_uid`/`PlaylistSongs.song_uid` réassignés au survivant (**0 orphelin**), PL2 dédupliquée à 1 ligne, index créé, **rejet 23505** sur collision casse-insensible ET artiste NULL, **idempotence** (undo→re-migrate sans erreur, survivants intacts). Données seed nettoyées ensuite. _Voir Dev Agent Record → Debug Log._

### Task 2 — Contrôleur : mapper la collision en 409 typé (AC 4, 5)

- [x] `backend/controllers/songcontroller.js` — importer `{ Op, fn, col, where: whereFn }` de `sequelize` (déjà `sequelize` importé via `../models`), et définir un helper de lookup :
  ```js
  // Match on the same folded key as the unique index: lower(title) +
  // COALESCE(lower(artist), ''). Scoped to userUid -> no cross-user oracle.
  function findExistingByTitleArtist(userUid, title, artist, excludeUid) {
    const foldedTitle = whereFn(fn('lower', col('title')), String(title).toLowerCase());
    const foldedArtist = whereFn(
      fn('coalesce', fn('lower', col('artist')), ''),
      artist ? String(artist).toLowerCase() : ''
    );
    const and = [{ userUid }, foldedTitle, foldedArtist];
    if (excludeUid) and.push({ uid: { [Op.ne]: excludeUid } });
    return Song.findOne({ where: { [Op.and]: and } });
  }
  ```
  (title/artist passés = valeurs **déjà trimmées** par `normalizeText`.)
- [x] `createSong` (`:118-174`) — dans le `catch`, **avant** le 500 générique : si `error.name === 'SequelizeUniqueConstraintError'`, faire `const existing = await findExistingByTitleArtist(userId, normalizedTitle, normalizedArtist).catch(() => null)` puis `return res.status(409).json({ error: 'duplicate_song', message: 'A song with this title and artist already exists', song: existing })`. Best-effort : le lookup ne doit jamais faire échouer le 409 (fallback `song: null`).
- [x] `updateSong` (`:177-237`) — même mapping dans le `catch`, avec `findExistingByTitleArtist(userId, effectiveTitle, effectiveArtist, req.params.uid)` où `effectiveTitle`/`effectiveArtist` = la valeur qui **aurait été** persistée (trimmée, en tenant compte du fallback `|| song.title` / `song.artist` quand le champ est absent). Exclut la chanson en cours d'édition (`Op.ne`).
- [x] Ne **rien** changer d'autre : `getAllSongs`/`getSong`/`deleteSong`/`markSongPlayed`/`getSongPlays`/`lookupSongMetadata` et les helpers `normalize*` **inchangés**.

### Task 3 — Modèle (déclaration honnête) (AC 7)

- [x] `backend/models/song.js` — commentaire au-dessus de `title` (et/ou `artist`) pointant la migration `20260710000000-songs-title-artist-ci-unique` : unicité fonctionnelle `(user_uid, lower(title), COALESCE(lower(artist), ''))`, non exprimable en DSL Sequelize. **Ne pas** ajouter d'`indexes:[{unique:true,...}]` (l'index fonctionnel n'est pas exprimable ; `sync` ne doit rien créer/dropper). `title`/`artist` restent `DataTypes.STRING`.

### Task 4 — Tests contrôleur (collision → 409 typé) (AC 4, 5)

- [x] `backend/__tests__/songcontroller.test.js` — ajouter : `createSong` avec `(titre,artiste)` en collision **simule** `SequelizeUniqueConstraintError` (`Song.create` rejette avec `{ name: 'SequelizeUniqueConstraintError' }`) et `Song.findOne` renvoie l'existante → `res.status(409)` avec `{ error: 'duplicate_song', message: ..., song: <existing mocké> }` ; idem `updateSong` (rejet `song.update`, `findOne` renvoie l'existante). Mocker `../models` (pas de DB — pattern projet). La casse-insensibilité **réelle** est validée par l'exécution locale de la migration (Task 1).
- [x] Vérifs finales : `cd backend && npm test` vert (+ nouveaux tests), `cd backend && npm run lint` propre, husky vert.

## Dev Notes

### Design retenu (calqué sur 10.1/7.12, MERGE au lieu de RENAME)
- **`(user_uid, lower(title), COALESCE(lower(artist),''))`** : casse seule (pas d'accents), `COALESCE('')` pour que deux chansons sans artiste collisionnent. Parité avec le folding client `.toLowerCase()`, pas d'extension Postgres. Écart assumé vs 7.12 (accents), **aligné 10.1**.
- **MERGE (fusion)** ≠ 10.1 (RENAME) : une chanson en double **est** la même chanson (porte historique de pratique + liens playlist) → on fusionne (réassigner 3 FK, supprimer les perdants), on ne renomme pas. C'est la **réouverture assumée** du merge FK que 16.1 avait esquivé (16.1 trimmait des strings libres, sans FK à bouger ; ici la contrainte structurelle l'impose).
- **Contrôleur = mirror `topiccontroller`/`playlistcontroller`** : `create`/`update` mappent `SequelizeUniqueConstraintError → 409 { …, entité }` via un lookup foldé scopé `userUid` (pas d'oracle, NFR-S4). On typifie le corps (`error: 'duplicate_song'`) pour le parse front 17.2.

### Fichiers UPDATE — état actuel & ce qui change (lus intégralement)
- **`backend/controllers/songcontroller.js`** (475 l.) : `createSong` (`:118-174`) fait `Song.create` sans check doublon → toujours 201 ; `updateSong` (`:177-237`) fait `song.update` sans check ; les deux ont un `catch` générique → **500**. `normalizeText` (`:63-72`) trim déjà `title`/`artist`/`album` (undefined=absent, whitespace→null, non-string laissé tel quel). **Change :** ajout d'un helper de lookup foldé + branche `409` dans les 2 `catch` (avant le 500). **Préserver :** pattern contrôleur 7.5 (scoping `userUid` → 404), `normalize*`, `markSongPlayed`/transactions, tout le reste.
- **`backend/models/song.js`** (138 l.) : `title STRING NOT NULL` (`:21-24`), `artist STRING` nullable (`:103-106`), `user_uid` FK CASCADE, `timestamps:true` (colonnes `"createdAt"`/`"updatedAt"` — **pas** underscored), colonnes sans `field:` en camelCase DB (`title`/`artist`/`album`), les autres en snake_case explicite. **Change :** commentaire d'honnêteté. **Préserver :** aucune déclaration d'index (sync ne doit rien tenter).
- **Modèles FK (non modifiés, mais pilotent le merge)** : `SongPlay` (`songUid` camelCase DB, pas de dédup) ; `PlaylistSong` (`song_uid`, CASCADE, unique `(playlist_uid, song_uid)` → dédup) ; `SessionItem` (`song_uid`, SET NULL, snapshot `label` FR4).

### Risque principal = migration prod (`main` = prod)
- `release_command` (`scripts/release-migrate.js`) lance les migrations avant que l'app serve, PUIS `sync({alter:false})`. La migration **doit** : être **idempotente** ; **merger AVANT** de créer l'index (sinon `CREATE UNIQUE INDEX` échoue si un groupe a >1 ligne) ; **dédupliquer `PlaylistSongs`** avant réassignation (sinon violation de `playlist_songs_unique`) ; **être testée en local** (idéalement dump prod) avant merge. `down` droppe l'index seul (fusion non réversible, documenté).
- ✅ **Pas d'extension Postgres** requise (`lower()`/`COALESCE()` sont IMMUTABLE) → pas de question de privilège (contrairement 7.12/unaccent).

### Divergence dev/prod assumée (même posture que 10.1/7.12)
- Sur une base montée par `sync({alter:false})` seul (dev fresh / CI), l'index fonctionnel n'existe pas → le `409` est du **code mort** en dev, les doublons de casse passeraient (mais les tests sont mockés, ne le voient pas ; prod protégée par release-migrate). Même divergence acceptée qu'en 10.1 (defer « pas de hook afterSync sur Playlist ») / 7.12. **Ne pas** ajouter de hook `afterSync` (Epic 11 a retiré celui des topics — on ne réintroduit pas cette dette).

### Conventions (cf. project-context.md)
- Backend **JS CommonJS** (`require`/`module.exports`), pas de `.ts`, pas d'ESM. Contrôleurs : try/catch → `next(createError(...))` ; `http-errors`. **Pas de nouvelle dépendance npm**.
- Migration **idempotente** obligatoire (`IF NOT EXISTS`, merge no-op au re-run). SQL brut en transaction.
- Tests back : `jest.mock('../models')` (pas de DB) — pattern `topiccontroller.test.js`/`playlistcontroller.test.js` (mock `create`/`update` rejette `SequelizeUniqueConstraintError`, `findOne` renvoie l'existante).
- **Tout en anglais** (messages, commentaires, `error: 'duplicate_song'`).

### Garde-fous workflow
- **Jamais sur `main`** : branche `feat/epic-17-auto-create-song` (à partager avec 17.2). Tout merge sur `main` **déploie en prod** (pas de staging) ; northwood **merge à la main**. Migration testée localement avant.
- Commits Conventional (`feat(songs): ...`, `fix(migrations): ...`).
- Hook pre-commit lance front + back + ESLint — **jamais `--no-verify`**.

### Interim 17.1 → 17.2 (à savoir)
- Une fois 17.1 mergée, `createSong`/`updateSong` renverront un **409** sur collision `(titre,artiste)` — aujourd'hui le front (`songService`/`SongForm`/`Songs.tsx`) ne le parse pas spécifiquement (message générique probable, ou save silencieusement échoué). **17.2** parse `duplicate_song` + pose le blocage symétrique UI (« not saved — already exists ») et durcit 13.1. État transitoire acceptable (amélioration nette : plus de doublon créé côté serveur).

### Project Structure Notes
- **NEW** : `backend/migrations/20260710000000-songs-title-artist-ci-unique.js`.
- **EDIT** : `backend/controllers/songcontroller.js` (helper lookup + catch 409 create+update), `backend/models/song.js` (commentaire), `backend/__tests__/songcontroller.test.js` (tests 409).
- **Pas de front, pas de dépendance npm.**

### References
- [Source: _bmad-output/implementation-artifacts/10-1-unicite-nom-playlist-serveur.md] — patron le plus proche (migration dédoublonnante en transaction, 409-avec-entité, modèle honnête, risque prod, divergence sync deferred) ; **adapter RENAME → MERGE**
- [Source: _bmad-output/implementation-artifacts/7-12-unicite-topic-insensible-casse.md] — patron d'origine (merge FK `SessionItems`→survivant, delete perdants, 409)
- [Source: _bmad-output/brainstorming/brainstorming-session-2026-07-10-0810.md] — synthèse (décisions #10 garde serveur, #B clé titre+artiste ; ⚠️ prérequis migration merge FK)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 17] — cadrage epic + décisions ouvertes tranchées 2026-07-10
- [Source: backend/controllers/songcontroller.js:118-237] — `createSong`/`updateSong` à instrumenter ; `normalizeText:63-72`
- [Source: backend/models/song.js:21-24,103-106] — `title`/`artist` sans `unique` (constat) ; colonnes camelCase DB
- [Source: backend/models/songplay.js] — `songUid` camelCase DB, FK (réassigner, pas de dédup)
- [Source: backend/models/playlistsong.js] — `song_uid` CASCADE + unique `(playlist_uid, song_uid)` (dédup avant réassignation)
- [Source: backend/models/sessionitem.js:21-30,45-49] — `song_uid` SET NULL + snapshot `label` (réassigner)
- [Source: backend/migrations/20260628000200-playlists-name-ci-unique.js] — patron migration transaction/idempotence
- [Source: backend/migrations/20260709000000-trim-song-text-fields.js] — 16.1 (trim déjà appliqué → `lower()` seul suffit dans la clé)
- [Source: _bmad-output/project-context.md] — règles backend, migrations idempotentes, pattern contrôleur anti-IDOR, conventions tests
- [Décision northwood 2026-07-10 : (1) casse-insensible sans accents ; (2) interroger la prod d'abord, merge ciblé ; (3) merge/fusion (pas RENAME)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story + dev-story workflow)

### Résultat du cadrage prod (Task 0) — ✅ FAIT (2026-07-10)

- **Comptage exécuté sur le dump prod du jour** (`backups/musician_tools_prod_20260710_094639.dump`, restauré dans une base `postgres:17` jetable — zéro contact prod supplémentaire au-delà du backup) : **81 chansons, 0 groupe de doublons exact** `(user_uid, lower(title), COALESCE(lower(artist),''))`.
- **Conséquence : en prod, la migration ne supprime rien** — le merge FK est un no-op prouvé, seule la création de l'index unique s'applique. Le risque « migration destructive » est sans objet pour ce déploiement.
- **Le code ne dépendait de toute façon pas du résultat** : le merge est set-based défensif, correct pour 0 comme pour N (les deux validés en local, cf. Debug Log). Le comptage confirme le cas **0**.

### Debug Log References

- **Migration testée sur la vraie base dev (Docker Postgres 15, port 5433, container backend = chemin prod-like `sequelize-cli db:migrate`)** :
  - 1er run sur les **vraies données dev** : `migrated (0.028s)`, index créé, **0 doublon** collapsé (no-op merge prouvé sur données réelles).
  - `db:migrate:undo` → index droppé. Seed d'un scénario : **groupe A** casse-diff (`Yesterday`/`The Beatles` survivant vieux + `yesterday`/`the beatles` perdant récent), **groupe B** artiste NULL (`Interlude`/`interlude`), avec sur les perdants un `SongPlay`, un `PracticeSession`+`SessionItem`, et 3 `Playlist`/`PlaylistSong` dont **PL2 = survivant + perdant** (cas dédup) et PL avec deux… (couvert par le row_number).
  - Re-`db:migrate` → merge : **perdants supprimés** (seuls S1/S3 restent), `SongPlays."songUid"` → S1, `SessionItems.song_uid` → S1, `PlaylistSongs` réassignés, **PL2 dédupliquée à 1 ligne** au survivant, **0 orphelin FK**.
  - Garde vérifiée : `INSERT` d'une collision casse-insensible (`YESTERDAY`/`THE BEATLES`) **ET** artiste NULL (`INTERLUDE`) → **`ERROR 23505`** sur `songs_user_uid_title_artist_ci` (`DETAIL: Key (user_uid, lower(title), COALESCE(lower(artist), ''))=...`).
  - **Idempotence** : `db:migrate:undo` (drop index) → `db:migrate` re-run **sans erreur**, merge no-op (survivants intacts), index recréé.
  - Données de seed **supprimées** ensuite (0 résidu) ; données dev réelles intactes.
- **Tests** : back `npm test` **265/265** (+4 : createSong 409, createSong 409 song:null best-effort, updateSong 409 avec exclusion, non-unique → 500). `npm run lint` (back) propre.

### Completion Notes List

- **AC1 (cadrage prod)** : approche merge décidée = **set-based défensif** (une migration one-off, pas de moteur générique). Query de comptage prod fournie, à lancer par northwood avant merge (pas de dépendance code — 0 et N validés en local).
- **AC2 (index)** : index unique **fonctionnel** `songs_user_uid_title_artist_ci` sur `(user_uid, lower(title), COALESCE(lower(artist), ''))` posé par la migration `20260710000000`. `lower()`/`COALESCE()` IMMUTABLE → pas d'extension. Trim déjà garanti (16.1) → pas de `btrim` dans la clé.
- **AC3 (merge AVANT index, idempotent)** : dans une transaction — réassignation `SongPlays."songUid"` + `SessionItems.song_uid`, **dédup robuste `PlaylistSongs`** via `row_number()` par `(playlist_uid, survivor)` (résiste à plusieurs perdants d'un même groupe dans une playlist) puis réassignation, delete des perdants, enfin `CREATE UNIQUE INDEX IF NOT EXISTS`. `Playlist.songUids` (JSON legacy) non touché. Rejouable (merge no-op au re-run). `down` = drop index seul (fusion non réversible, documenté).
- **AC4/AC5 (409 typé)** : `createSong`/`updateSong` mappent `SequelizeUniqueConstraintError → 409 { error: 'duplicate_song', message, song: <existante ou null> }` via `respondDuplicateSong` + `findExistingByTitleArtist` (lookup foldé `lower(title)`+`COALESCE(lower(artist),'')` scopé `userUid`, best-effort → jamais throw). `updateSong` exclut la ligne éditée (`Op.ne`) et calcule la valeur **effective** (fallback `|| song`). Variables `normalizedTitle`/`normalizedArtist`/`song` **hissées** hors du `try` pour être accessibles au `catch`. Invariant respecté : sur 409, rien n'est persisté.
- **AC6 (pas de régression)** : autres handlers + `normalize*` inchangés ; 265/265 back + lint. Un test dédié confirme qu'une erreur **non**-unique reste un **500** (pas de sur-capture).
- **AC7 (modèle honnête)** : commentaire au-dessus de `title` dans `song.js` pointant la migration ; **aucun** `indexes` déclaré (sync ne touche pas l'index fonctionnel).
- **Divergence dev/CI assumée** (comme 10.1/7.12) : sur une base montée par `sync` seul (dev fresh/CI), l'index fonctionnel n'existe pas → le 409 y est du code mort (tests mockés) ; prod protégée par release-migrate. Pas de hook `afterSync` (Epic 11 l'a retiré).
- **Interim 17.1→17.2** : le front ne parse pas encore `duplicate_song` (17.2). État transitoire acceptable (plus de doublon créé côté serveur).

### File List

- `backend/migrations/20260710000000-songs-title-artist-ci-unique.js` (NEW — merge FK 3 tables + index unique fonctionnel)
- `backend/controllers/songcontroller.js` (EDIT — import `sequelize` Op/fn/col/where, helpers `findExistingByTitleArtist` + `respondDuplicateSong`, hoist des vars + branche 409 dans `createSong` et `updateSong`)
- `backend/models/song.js` (EDIT — commentaire pointant l'index fonctionnel de la migration)
- `backend/__tests__/songcontroller.test.js` (EDIT — 4 tests : 409 create/update, 409 song:null best-effort, non-unique → 500)
- `CHANGELOG.md` (EDIT — entrée `[Unreleased]`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (EDIT — 17-1 → review)

## Change Log

| Date       | Version | Description                                                                 |
|------------|---------|-----------------------------------------------------------------------------|
| 2026-07-10 | 0.1     | Story 17.1 — unicité de chanson (titre+artiste) insensible à la casse, côté serveur. Index unique **fonctionnel** `(user_uid, lower(title), COALESCE(lower(artist),''))` + **merge FK 3 tables** (SongPlays/SessionItems/PlaylistSongs, dédup robuste) AVANT l'index (migration `20260710000000`, idempotente, **testée sur base dev** : merge réel seedé + rejet 23505 casse/NULL + idempotence). Contrôleurs `create`/`update` → **409 typé** `{ error: 'duplicate_song', … }` (mirror `topiccontroller`/`playlistcontroller`, scopé `userUid`). Back 265 ✓ (+4), lint clean. ⚠️ `main` = prod : query de comptage prod à lancer par northwood avant merge (code défensif, 0 et N validés). Statut → review. |

## Review Findings

_Code review adversariale 3 couches (Blind Hunter / Edge Case Hunter / Acceptance Auditor) — 2026-07-10. **Acceptance Auditor : 0 violation** (7/7 ACs + 4 décisions verrouillées satisfaites). Aucun bug bloquant, aucun High. Edge Case Hunter a **confirmé** contre les modèles/migrations que tous les noms de colonnes du merge SQL sont corrects (`SongPlays."songUid"` camelCase, `SessionItems.song_uid`, `PlaylistSongs` PK scalaire `uid` + unique), que la dédup 3a est prouvablement sans collision, et que `markSongPlayed`/`Song.create` sont les seuls écrivains de `Songs` (mapping 409 couvre tout). Triage : 1 patch, 2 defer, 4 dismiss._

- [x] [Review][Patch→Fixed] **Renforcer les tests 409 pour prouver le WHERE du lookup** [backend/__tests__/songcontroller.test.js] — les tests assertaient la forme du 409 mais pas que `findExistingByTitleArtist` est appelé avec le fold + scope + exclusion (le test « excluding the edited row » passait même sans l'exclusion). **Corrigé** : import de `Op`, assertions sur `Song.findOne.mock.calls[n][0].where[Op.and]` — createSong (3 clauses : `{userUid}` + titre/artiste foldés, **aucun** `uid`) et updateSong (4 clauses dont `{ uid: { [Op.ne]: SONG_UID } }` prouvant l'exclusion de la ligne éditée). Back 265 ✓, lint clean.
- [x] [Review][Defer] **Le 409 est mappé sur `error.name` seul, pas le nom de contrainte** [backend/controllers/songcontroller.js] — deferred, accepté : `respondDuplicateSong` mappe tout `SequelizeUniqueConstraintError` en `duplicate_song` sans vérifier `error.parent.constraint === 'songs_user_uid_title_artist_ci'`. **Aucun trigger actuel** (seuls la PK et le nouvel index sont uniques sur `Songs` ; collision PK inatteignable via UUIDV4) et **cohérent avec le mirror** `topiccontroller`/`playlistcontroller` (qui keyent aussi sur `error.name`). À revisiter **si** un 2e index unique atterrit un jour sur `Songs`.
- [x] [Review][Defer] **JS `toLowerCase()` ≠ SQL `lower()` pour la casse locale (Turkish-i, Unicode)** [backend/controllers/songcontroller.js] — deferred, cosmétique : pour un doublon dont le titre/artiste contient un caractère qui folde différemment en V8 vs Postgres, l'index rejette bien la collision (23505) mais le lookup d'enrichissement renvoie `song: null` → le front 17.2 ne peut pas pointer la chanson existante pour ces entrées exotiques. **Unicité intacte**, impact purement enrichissement ; **même folding client-side que 7.12/10.1** ; mono-user beta.

> ℹ️ **Note (non-finding) — AC1 pré-merge** : l'Acceptance Auditor rappelle que la **query de comptage prod (Task 0) reste PENDING northwood** avant le merge sur `main`. Ce n'est pas un défaut code (le merge est défensif 0-et-N), juste l'action humaine à ne pas oublier.

### Findings écartés (dismiss — bruit / faux positif / vérifié)
- **Fallback artiste « dead code » en updateSong** (Blind) — **faux positif** : `normalizeText(undefined) === undefined`, donc quand le PUT omet `artist`, `normalizedArtist` est `undefined` et le fallback `song.artist` est bien atteint. Le ternaire est correct (identique à ce que `song.update` persiste).
- **Assomptions de colonnes de la migration** (Blind, blind au projet) — **vérifié correct** par l'Edge Case Hunter contre les modèles/migrations (0 mismatch).
- **`CREATE UNIQUE INDEX` non-concurrent (course step 4→5)** (Blind) — migration de **boot** (release-migrate, avant que l'app serve) → fenêtre inatteignable ; migration idempotente/rejouable.
- **Double-réponse si `res.json` throw en plein envoi** (Edge) — théorique/inatteignable (corps = instance Sequelize simple, `res` frais).
