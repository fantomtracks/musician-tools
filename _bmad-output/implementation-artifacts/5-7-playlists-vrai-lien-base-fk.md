---
baseline_commit: 727d990
---

# Story 5.7: Playlists ↔ chansons — vrai lien en base (clé étrangère)

Status: done

## Contexte

Décision prise par northwood à la rétro épic 5 (2026-06-11) : traiter l'**option B** de la dette d'intégrité playlists. Aujourd'hui `Playlist.songUids` est un **tableau JSON sans clé étrangère** — la cohérence est purement applicative, à maintenir à la main à chaque porte. La story 5-6 a fermé la suppression, mais le latent demeure (l'API émet encore les orphelins, l'édition les recopie, l'ajout mute en place). Objectif : **remplacer le tableau JSON par une vraie relation en base** pour que toute cette famille de bugs disparaisse structurellement.

**Changement structurel backend (migration + modèle de données). northwood plus à l'aise front → volet back à piloter avec soin.**

## Approche recommandée (à confirmer au dev)

Table de jointure `PlaylistSongs` (sur le pattern `SessionItems`) avec FK `song_uid` → `Songs` **`onDelete: CASCADE`** et FK `playlist_uid` → `Playlists` **`onDelete: CASCADE`**, plus une colonne `position` pour l'ordre. La base supprime alors les liens toute seule quand une chanson (ou une playlist) disparaît.

**Garder la forme de l'API** (`songUids` array en entrée/sortie) pour minimiser le churn frontend : la lecture *dérive* `songUids` de la jointure (ordonnée par `position`) ; l'écriture *synchronise* la jointure depuis le `songUids` reçu. Le frontend (`MyPlaylistsPage`) ne change quasiment pas.

## Acceptance Criteria

1. **Intégrité garantie par la base** — Given une chanson présente dans des playlists, When elle est supprimée, Then ses liens de playlist disparaissent **automatiquement via la contrainte FK CASCADE** (plus de nettoyage applicatif requis).
2. **Nettoyage des orphelins existants** — Given des playlists contenant des `songUids` orphelins (suppressions passées), When la migration de backfill s'exécute, Then seuls les UID correspondant à une chanson **existante** sont migrés ; les orphelins sont **droppés** (données assainies en base, pas seulement masquées).
3. **Ordre préservé** — Given une playlist avec des chansons dans un ordre donné, Then cet ordre est conservé (colonne `position`) à la lecture comme à l'écriture.
4. **Migrations idempotentes** — Given un (re)déploiement, Then la création de table (`showAllTables` guard) et le backfill sont **rejouables sans erreur ni doublon** (NFR5).
5. **Contrat API stable** — Given le frontend actuel, When il lit/crée/édite une playlist via `songUids`, Then le comportement reste identique (l'API expose et accepte toujours `songUids`) — création, renommage, ajout/retrait, réordonnancement inchangés côté client.
6. **Ownership & pattern contrôleur** — 401/404/403 respectés ; seules les playlists du user concerné ; ne jamais introduire la faille de `getSong` (vérifier l'ownership).
7. **Suppression du nettoyage devenu inutile** — Given la FK CASCADE en place, Then le strip manuel des playlists ajouté en 5-6 dans `deleteSong` est retiré (ou neutralisé), et ses tests adaptés — la base est désormais la source de vérité.
8. **Aucune régression** — suites back + front vertes ; le filtre défensif frontend de 5-6 peut rester (inerte) ou être retiré.

## Tasks / Subtasks

- [x] Backend — migration `create-playlist-songs` : table `PlaylistSongs` (`uid` PK UUID, `playlist_uid` FK→Playlists CASCADE, `song_uid` FK→Songs CASCADE, `position` INT, timestamps), index `playlist_songs_playlist_uid` + unique `(playlist_uid, song_uid)`. Idempotent (`showAllTables` + gardes d'index).
- [x] Backend — migration de **backfill** : SQL `INSERT … json_array_elements_text(song_uids) WITH ORDINALITY` joint sur `Songs` (droppe les orphelins), `gen_random_uuid()`, `position = ord-1`. Idempotente (`WHERE NOT EXISTS` ligne de jointure pour la playlist).
- [x] Backend — modèle `playlistsong.js` (mirror `sessionitem.js`) + associations `belongsTo Playlist`/`belongsTo Song` — **chargement + associations vérifiés** (`node -e require('./models')`).
- [x] Backend — `playlistcontroller` réécrit : lecture dérive `songUids` de la jointure (ordre `position`) ; create/update/add/remove **synchronisent en transaction** (helper `syncPlaylistSongs` : garde uniquement les chansons **du user qui existent**, ordre préservé, dédup) ; **contrat `songUids` conservé**. Décision A : colonne `song_uids` laissée intacte (non écrite, filet de sécurité, drop ultérieur).
- [x] Backend — `songcontroller.deleteSong` : strip manuel de 5-6 retiré (CASCADE FK le remplace), import `Playlist` retiré ; tests `deleteSong` adaptés.
- [x] Tests — back : `playlistcontroller.test.js` (dérivation ordonnée, filtre owned, dédup, ownership 401/403/404, add/remove) ; `deleteSong` simplifié. Front : `MyPlaylistsPage` inchangé (contrat `songUids` préservé) — 184 verts.
- [x] Vérifs : suites **back 122 + front 184**, **typecheck 0**, **lint back clean**. ✅ **Migration VALIDÉE sur un dump prod réel** (restauré en base jetable) : chaîne complète + 5-7 appliquées, backfill OK, orphelin + valeur poubelle droppés sans erreur, **FK `song_uid` = ON DELETE CASCADE confirmée**, cascade réelle testée (suppression chanson → lien playlist supprimé tout seul), idempotence (re-run no-op).

## Dev Notes

- **Décisions ouvertes à trancher au dev (présenter en compromis simples d'abord)** :
  1. **Sort de la colonne `Playlist.songUids`** : la garder un temps (transition douce, double source à éviter) **ou** la dropper dès que la jointure est source de vérité ? Reco : garder une release puis dropper dans une migration séparée — éviter d'avoir 2 sources de vérité vivantes en même temps.
  2. **Forme de l'API** : garder `songUids` (reco, churn frontend minimal) vs exposer des objets chanson complets (plus propre mais touche le front). Reco : garder `songUids` pour cette story, évoluer plus tard si besoin.
- ⚠️ **Tout merge sur `main` = prod** : la migration de backfill DROPPE des orphelins (irréversible). Tester sur une copie/local avant. Idempotence obligatoire.
- Pattern à mirrorer : `SessionItems` (FK + `position` + `field: snake_case`). Convention colonnes : camelCase JS + `field: 'snake_case'` en DB.
- La story 5-6 (strip applicatif + filtre défensif front) reste valable jusqu'à cette migration ; 5-7 la rend structurellement superflue côté back.
- **northwood plus à l'aise front** → arbitrer les 2 décisions ci-dessus AVEC lui au moment du dev, impact d'abord, mécanique ensuite (leçon rétro épic 4).

**Décisions tranchées avec northwood (2026-06-11) : 🅰️ + 🅰️** — (1) garder la colonne `song_uids` (inutilisée, drop ultérieur) ; (2) garder le contrat API `songUids`.

### Review Findings

- [x] [Review][Patch→Fixed] Backfill robuste — réécrit en jointure **texte** (`s.uid::text = elem.song_uid_text`) : plus aucun cast d'une valeur douteuse, une valeur pourrie devient un orphelin droppé (le `song_uid` inséré est le vrai `Songs.uid`). Plus de risque d'abort du backfill. _(Blind High.)_
- [x] [Review][Patch→Fixed] `updatePlaylist` ne synchronise que si `Array.isArray(songUids)` — un body `null`/non-tableau = « pas de changement » (ne vide plus la playlist). Test ajouté. _(Edge Med.)_
- [x] [Review][Defer] Course concurrente add/remove (lost update) [playlistcontroller.js] — `destroy`+`bulkCreate` sans `SELECT … FOR UPDATE` sur la playlist parente ; 2 écritures concurrentes sur la même playlist → la dernière écrase. Risque réel quasi nul (app mono-utilisateur, pas d'écritures concurrentes sur une même playlist). — deferred, acceptable à cette échelle
- [x] [Review][Defer] Fenêtre de perte au backfill si `sync` crée la table au boot AVANT `make migrate` et qu'on édite entretemps [backend/migrations/20260611000100] — **prod-safe** (release_command lance les migrations AVANT que l'app serve) ; ne concerne qu'un dev local mal ordonné. — deferred, prod-safe
- [x] [Review][Defer] Index simple `playlist_songs_playlist_uid` redondant avec l'unique composite `(playlist_uid, song_uid)` (préfixe) [migration create] — inoffensif, micro-optimisation. — deferred, harmless
- [x] [Review][Defer] `songcontroller.getSong` toujours sans contrôle d'ownership (trou pré-existant) — 5.7 ne le reproduit PAS côté playlist (bon), mais le trou demeure hors périmètre. — deferred, pre-existing

## Dev Agent Record

### Debug Log

- ✅ **Migration VALIDÉE sur un dump prod réel (2026-06-11)** : dump `backups/musician_tools_prod_20260609_143436.dump` (format 1.16 → restauré via un conteneur client postgres:17, `--no-owner`) dans une base jetable `musician_tools_57test` (la base de dev `musician_tools` non touchée). `sequelize-cli db:migrate` a appliqué la chaîne complète (le dump était à la migration 20260221 — prod pré-journal) **+ les 2 migrations 5-7**, sans erreur. Orphelin (UUID inexistant) + valeur poubelle (non-UUID) injectés dans une playlist → **tous deux droppés par le backfill sans abort** (patch P1 confirmé). `pg_constraint.confdeltype = 'c'` sur `PlaylistSongs_song_uid_fkey` (**CASCADE**). Suppression d'une chanson → sa ligne `PlaylistSongs` disparaît (1→0). Re-run `db:migrate` = no-op (idempotence). Base jetable supprimée après coup.
- _(Initialement bloqué : pas de Postgres pensé indisponible. En fait docker était juste arrêté, et des dumps prod existaient dans `backups/` — d'où ce test sur données réelles, bien meilleur qu'une base vide.)_
- Les tests backend mockent `../models` → ils ne couvrent ni le SQL de migration ni la CASCADE réelle (comportement DB). La CASCADE est garantie par la contrainte FK (migration + modèle), pas par un test unitaire — d'où l'essai local requis.

### Completion Notes

- **Cause racine éliminée structurellement** : `PlaylistSongs` avec FK `song_uid` CASCADE → supprimer une chanson retire ses lignes de playlist **automatiquement** (plus de nettoyage applicatif ; le strip de 5-6 est retiré).
- **Données existantes assainies** : le backfill ne migre que les UID correspondant à une chanson existante → les orphelins hérités sont droppés.
- **Contrat API stable** : l'API expose/accepte toujours `songUids` (dérivé/synchronisé via la jointure) → frontend inchangé, le filtre défensif 5-6 reste en place (inerte, ceinture-bretelles).
- **Bonus intégrité** : `syncPlaylistSongs` ne garde que les chansons **du user** (ownership) et **existantes** (FK) → une playlist ne peut plus référencer une chanson d'autrui ou inexistante.
- ✅ **Migration vérifiée sur données prod réelles** (cf. Debug Log) — plus de maillon en suspens. Prête au merge.

## File List

- `backend/migrations/20260611000000-create-playlist-songs.js` (créé)
- `backend/migrations/20260611000100-backfill-playlist-songs.js` (créé)
- `backend/models/playlistsong.js` (créé)
- `backend/controllers/playlistcontroller.js` (réécrit — jointure + contrat `songUids`)
- `backend/controllers/songcontroller.js` (modifié — `deleteSong` simplifié, import `Playlist` retiré)
- `backend/__tests__/playlistcontroller.test.js` (créé — inclut le test du garde `updatePlaylist`/`Array.isArray`)
- `backend/__tests__/songcontroller.test.js` (modifié — tests `deleteSong` adaptés, mock `Playlist` retiré)

## Change Log

- 2026-06-11 — Story 5.7 : vrai lien FK playlists↔chansons (table `PlaylistSongs` + backfill assainissant + contrôleur réécrit, contrat `songUids` conservé) ; `deleteSong` simplifié (CASCADE). Back 121 / front 184 / typecheck 0 / lint clean. ⚠️ `make migrate` à exécuter en local avant merge. Statut → review.
- 2026-06-11 — Code review (3 couches) : 8 AC satisfaites. 2 patches appliqués (backfill robuste — jointure texte ; `updatePlaylist` garde `Array.isArray`). 4 dettes reportées. Back 122 / lint clean.
- 2026-06-11 — **Migration validée sur un dump prod réel** (base jetable) : chaîne + 5-7 OK, orphelin + poubelle droppés sans erreur, FK CASCADE confirmée (`confdeltype='c'`), cascade réelle testée (suppression chanson → lien playlist supprimé), idempotence no-op. **Garde-fou levé → Statut `done`.**
