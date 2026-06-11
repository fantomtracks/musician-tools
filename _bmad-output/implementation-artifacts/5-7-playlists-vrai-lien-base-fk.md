# Story 5.7: Playlists ↔ chansons — vrai lien en base (clé étrangère)

Status: ready

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

- [ ] Backend — migration `create-playlist-songs` : table `PlaylistSongs` (`uid` PK UUID, `playlist_uid` FK→Playlists CASCADE, `song_uid` FK→Songs CASCADE, `position` INT, timestamps), index/unique `(playlist_uid, song_uid)`. Pattern idempotent (`showAllTables`).
- [ ] Backend — migration de **backfill** : pour chaque playlist, insérer une ligne par `songUid` **existant dans Songs** (ordre → `position`) ; ignorer les orphelins. Idempotente (guard : ne pas réinsérer si des lignes existent déjà pour la playlist).
- [ ] Backend — modèle `playlistsong.js` (mirror `sessionitem.js` : `field: 'snake_case'`, `references`, `onDelete`) + associations (`Playlist hasMany PlaylistSong` ; `PlaylistSong belongsTo Song`). Chargé auto par `models/index.js`.
- [ ] Backend — `playlistcontroller` : `getAllPlaylists`/`getPlaylist` dérivent `songUids` depuis la jointure (ordre `position`) ; `createPlaylist`/`updatePlaylist`/`addSong`/`removeSong` synchronisent les lignes de jointure **dans une transaction**. Garder le contrat `songUids`.
- [ ] Backend — `songcontroller.deleteSong` : retirer le strip manuel de 5-6 (redondant avec la CASCADE) ; adapter ses tests.
- [ ] Tests — back : CRUD via jointure, CASCADE à la suppression d'une chanson, backfill droppe les orphelins, idempotence, ownership. Front : non-régression `MyPlaylistsPage` (contrat `songUids` inchangé).
- [ ] Vérifs : migration testée localement (`make migrate`), suites back + front, typecheck, lint.

## Dev Notes

- **Décisions ouvertes à trancher au dev (présenter en compromis simples d'abord)** :
  1. **Sort de la colonne `Playlist.songUids`** : la garder un temps (transition douce, double source à éviter) **ou** la dropper dès que la jointure est source de vérité ? Reco : garder une release puis dropper dans une migration séparée — éviter d'avoir 2 sources de vérité vivantes en même temps.
  2. **Forme de l'API** : garder `songUids` (reco, churn frontend minimal) vs exposer des objets chanson complets (plus propre mais touche le front). Reco : garder `songUids` pour cette story, évoluer plus tard si besoin.
- ⚠️ **Tout merge sur `main` = prod** : la migration de backfill DROPPE des orphelins (irréversible). Tester sur une copie/local avant. Idempotence obligatoire.
- Pattern à mirrorer : `SessionItems` (FK + `position` + `field: snake_case`). Convention colonnes : camelCase JS + `field: 'snake_case'` en DB.
- La story 5-6 (strip applicatif + filtre défensif front) reste valable jusqu'à cette migration ; 5-7 la rend structurellement superflue côté back.
- **northwood plus à l'aise front** → arbitrer les 2 décisions ci-dessus AVEC lui au moment du dev, impact d'abord, mécanique ensuite (leçon rétro épic 4).
