---
baseline_commit: 435d9f3
---

# Story 5.6: Suppression de chanson → nettoyer les playlists (UID orphelin)

Status: done

## Contexte

Bug remonté par northwood (2026-06-11) : dans les playlists, un « hash » est parfois visible à la place d'un nom de chanson. **Diagnostic confirmé (code) :**

- `backend/models/playlist.js` : les chansons d'une playlist sont stockées dans `songUids` = **tableau JSON d'UID** (dénormalisé, **aucune clé étrangère**, donc aucun cascade possible).
- `backend/controllers/songcontroller.js:182-200` (`deleteSong`) : fait seulement `song.destroy()` — **ne touche jamais aux playlists**.
- ⟹ Supprimer une chanson laisse son UID dans le `songUids` de chaque playlist concernée → **UID orphelins** qui s'accumulent.
- `src/pages/MyPlaylistsPage.tsx:132` : `song ? '...' : uid` → affiche l'**UID brut** quand la chanson n'existe plus (le « hash » visible).

Gravité : gênant (cosmétique en surface, intégrité de données en profondeur). Non bloquant.

## Story

As a musicien qui gère ses playlists,
I want que supprimer une chanson la retire aussi de mes playlists,
so that je ne vois jamais d'UID orphelin et mes playlists restent propres.

## Acceptance Criteria

1. **Suppression nettoie les playlists (back)** — Given une chanson présente dans une ou plusieurs playlists du user, When je supprime la chanson, Then son UID est retiré du `songUids` de **toutes** ses playlists, dans la **même transaction** que la suppression (pas d'état intermédiaire incohérent).
2. **Ownership / périmètre** — seules les playlists **du user propriétaire** sont touchées ; respect du pattern contrôleur (401/404/403) ; aucune autre playlist modifiée.
3. **Nettoyage des orphelins existants** — Given des playlists contenant déjà des UID orphelins (suppressions passées), Then ces UID ne sont plus présentés à l'utilisateur (nettoyage one-shot : migration de purge **idempotente**, et/ou filtrage défensif à la lecture — voir Dev Notes).
4. **Frontend défensif** — Given un `songUids` contenant un UID introuvable dans le catalogue, When la playlist s'affiche, Then l'entrée orpheline est **masquée** (jamais d'UID brut rendu) ; l'affichage des chansons valides reste « Artiste - Titre » (cf. 5.5) et le tri/recherche ne régresse pas.
5. **Aucune régression playlists** — création / renommage / ajout-retrait manuel de chansons / réordonnancement inchangés.

## Tasks / Subtasks

- [x] Backend — `deleteSong` : nettoyage transactionnel — `sequelize.transaction` englobe le retrait de l'UID des `songUids` de chaque playlist du user qui le contient (`Playlist.findAll({ where: { userUid } })` + `playlist.update({ songUids: filtré })`) **et** `song.destroy({ transaction })`. JSON relu/réécrit en JS (pas d'opérateur relationnel).
- [x] Backend — tests (`songcontroller.test.js`) : retire l'UID des playlists du user (ordre préservé) ; playlist sans l'UID intacte ; 401/404/403 ; 403 → pas de destroy ni de scan playlists. `beforeEach(clearAllMocks)` ajouté au describe (sibling, pas couvert par celui du parent).
- [x] Données — **décision : backend `deleteSong` (vraie correction) + filtrage défensif frontend**. Migration de purge des orphelins existants **différée** (non nécessaire : le filtrage défensif les masque immédiatement, sans risque sur la donnée). Le filtrage est en lecture côté UI (pas dans `playlistcontroller`) pour rester minimal.
- [x] Frontend — `MyPlaylistsPage` : les `songUids` non résolus dans le catalogue sont filtrés avant rendu (plus jamais d'UID brut) ; chansons valides toujours en « Artiste - Titre ».
- [x] Vérifs : backend 110 ✓, frontend 183 ✓, typecheck 0, backend lint clean (1 erreur lint `_uid` préexistante, hors périmètre).

## Dev Notes

- `Playlist.songUids` est un **`DataTypes.JSON`** (`field: 'song_uids'`) — pas de FK, donc la cohérence est **applicative**, à maintenir à la main côté contrôleur. C'est la dette de fond ; ce bug en est la première manifestation.
- Piège ownership : `SongPlay` n'a pas de `userUid` mais `Playlist` **oui** (`user_uid`) — filtrer les playlists par `userUid` du user courant.
- Choix migration vs filtrage : une **migration de purge** assainit la base une fois pour toutes (mais ne couvre pas un futur trou si un autre chemin oublie le nettoyage) ; un **filtrage défensif à la lecture** protège l'UI en continu (mais laisse la donnée sale en base). Recommandation : **les deux** — backend `deleteSong` (la vraie correction) + filtrage défensif léger côté lecture/affichage (ceinture-bretelles), migration de purge optionnelle. À trancher avec northwood au dev.
- northwood plus à l'aise front → le volet backend (transaction + JSON) est à piloter avec soin.

### Review Findings

- [x] [Review][Patch→Fixed] Filtre défensif masquait les chansons valides tant que le catalogue n'est pas chargé / si `getAllSongs` échoue [src/pages/MyPlaylistsPage.tsx]. **Résolu** : flag `songsLoaded` (vrai uniquement après chargement réussi) ; le filtre orphelin ne s'applique que `songsLoaded`. Avant chargement / en cas d'échec → on garde les UID (dégradé visible) plutôt que de cacher du contenu. Test ajouté (échec catalogue → contenu non effacé). _(Blind + Edge, Med.)_
- [x] [Review][Defer] Le formulaire d'édition re-sauvegarde un UID orphelin verbatim [src/pages/MyPlaylistsPage.tsx:99-107] — `handleEdit` recopie `songUids` tel quel ; un orphelin survit à un Update (pas de case à cocher → invisible). Bénin (l'orphelin reste orphelin, masqué en lecture ; le strip backend est le vrai GC). Cohérent avec la décision « migration différée ». — deferred, by-design
- [x] [Review][Defer] Les orphelins hérités restent émis par l'API playlist [backend/controllers/playlistcontroller.js:13-42] — `getAllPlaylists`/`getPlaylist` renvoient `songUids` brut ; seul l'UI filtre (AC3 = PARTIAL au niveau donnée). Acceptable par décision « migration différée », mais tout futur consommateur de l'API devrait refiltrer. — deferred, documented decision
- [x] [Review][Defer] `deleteSong` charge toutes les playlists du user et fait N updates [backend/controllers/songcontroller.js:205] — coût O(playlists) par suppression, négligeable à l'échelle actuelle ; une requête JSON ciblée (`song_uids @> ...`) serait plus tendue si ça grossit. — deferred, perf-only

## Dev Agent Record

### Completion Notes

- **Cause racine corrigée** : `deleteSong` retire désormais l'UID de toutes les playlists du user dans la même transaction que `song.destroy()` → plus de nouveaux orphelins.
- **Symptôme existant neutralisé** : `MyPlaylistsPage` filtre les UID non résolus avant rendu → un UID brut n'est plus jamais affiché, même pour les orphelins déjà en base (suppressions passées).
- **Migration de purge non faite** (choix) : superflue tant que l'UI filtre ; la donnée sale restante est inerte. À reconsidérer seulement si un futur consommateur lit `songUids` sans filtrer.
- Piège de test rencontré : le `describe('deleteSong')` ajouté était frère de `describe('songcontroller')`, donc hors de son `beforeEach(clearAllMocks)` → fuite de compteurs de mock entre tests. Corrigé par un `beforeEach` local.

## File List

- `backend/controllers/songcontroller.js` (modifié — import `Playlist` + nettoyage transactionnel dans `deleteSong`)
- `backend/__tests__/songcontroller.test.js` (modifié — mock `Playlist` + 4 tests `deleteSong`)
- `src/pages/MyPlaylistsPage.tsx` (modifié — filtrage défensif des UID orphelins)
- `src/__tests__/MyPlaylistsPage.test.tsx` (créé — 3 tests : « Artiste - Titre » + orphelin masqué + catalogue en échec ne vide pas la liste)

## Change Log

- 2026-06-11 — Story 5.6 : la suppression d'une chanson la retire des playlists (nettoyage transactionnel back) ; l'UI masque les UID orphelins (plus de hash visible). Back 110 ✓ / front 183 ✓ / typecheck 0. Statut → review.
- 2026-06-11 — Code review : patch appliqué (flag `songsLoaded` — ne pas masquer les chansons valides quand le catalogue n'est pas chargé / échoue). 3 dettes reportées dans `deferred-work.md`. Front 184 ✓. Statut → done.
