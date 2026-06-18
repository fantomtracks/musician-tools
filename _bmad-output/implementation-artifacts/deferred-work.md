# Deferred Work

## Deferred from: code review of story-6.1 (2026-06-18)

- **Désync du total de session au plafond 1440** (`songcontroller.js`, sync `markSongPlayed`) : si la somme des minutes d'entrées d'une session dépasse 1440 (>24h en une session), `session.durationMinutes` n'est plus mis à jour (gardé `<= 1440`), et au mark suivant `totalIsAuto` devient false (total ≠ somme) → le sync se fige définitivement pour cette session. Limitation du modèle minutes (cap 1440 hérité du contrôleur session), pré-existante au flux manuel ; atteignable seulement avec des durées de morceaux absurdes. À reprendre si on lève un jour le cap 1440 ou si on stocke les durées de session en secondes.
- **Détection « modifs non enregistrées » fragile** (`Songs.tsx`, garde Mark as Played) : `isDirty` compare `JSON.stringify(form)` à un snapshot. Un effet de `SongForm` (filtrage des techniques au montage) peut muter `form` après chargement → le dialogue « Save & mark as played » peut s'afficher alors qu'aucune modif utilisateur n'a eu lieu. Conséquence bénigne (la sauvegarde réécrit les mêmes valeurs), mais fix propre = comparaison normalisée champ-à-champ (réutiliser la normalisation de `saveSongEdits` pour baseline ET courant). À traiter avec le refacto auto-save si on le fait.
- **Course lost-update sur marquages concurrents** (`markSongPlayed`) : deux marquages simultanés (multi-onglets/appareils) même jour/instrument lisent le même `priorTotal` avant d'écrire → le total final peut perdre une contribution. Même thème que la course find-or-create déjà déférée (review 4.1) ; couvrable par un advisory lock keyed user+date+instrument si l'échelle le justifie.

## Demandes produit (northwood) — 2026-06-17

- **Chanson cliquable dans la prévisualisation de l'historique de session** : dans `MySessionsPage.tsx` (liste « Session history », ~ligne 818-833), chaque entrée affiche le label de la chanson en texte statique (`{item.label}`). northwood veut pouvoir **cliquer** sur la chanson pour l'ouvrir (édition de la chanson dans la Songlist, via `item.songUid`). À gérer : entrées orphelines (`songUid` null après suppression → pas de lien), et navigation inter-pages (Sessions → Songs form). Idée née pendant la story 6.1.
- **Refacto : bloc « session + entrées » dupliqué** (repéré northwood, 2026-06-18) : le rendu d'une session avec son en-tête (date · instrument · durée) et sa liste d'entrées (`played during X minutes`) existe en **double** — `MySessionsPage.tsx` (~785-835) et `MyHeatmapPage.tsx` (~435-480). Toute évolution d'affichage doit être faite aux deux endroits (déjà vécu : point médian + libellé « played during »). Extraire un composant partagé (ex. `SessionHistoryCard` / `SessionEntryLine`) prenant `session` + helpers (artiste, formatLastPlayed, callbacks Edit/Delete). À cadrer : les deux pages ont des actions légèrement différentes (Heatmap a aussi les plays hors-session). Bon candidat avant d'ajouter la « chanson cliquable » (sinon à câbler 2×).
- **Auto-save de la fiche chanson (à brainstormer)** : explorer une sauvegarde automatique au lieu du Save manuel — soit **au blur** (quand on quitte un champ), soit **en debounce ~3 s** après la dernière frappe. Rendrait la garde « modifs non enregistrées » du Mark as Played inutile (la fiche serait toujours à jour). À cadrer : feedback visuel (« Saved »), gestion des erreurs de validation/doublon en cours de frappe, coût réseau (1 PUT par champ), conflit avec le bouton Save explicite. À discuter en session brainstorm. Idée née pendant la story 6.1 (2026-06-18).

## Deferred from: code review of story-5.7 (2026-06-11)

- **Course concurrente add/remove playlist (lost update)** : `syncPlaylistSongs` fait `destroy`+`bulkCreate` sans `SELECT … FOR UPDATE` sur la playlist parente → 2 écritures concurrentes sur la même playlist = la dernière écrase. Risque quasi nul en mono-utilisateur ; à durcir (lock de ligne) si l'app devient multi-utilisateur/collaborative.
- **`songcontroller.getSong` sans contrôle d'ownership** (trou pré-existant, `songcontroller.js:65-76`) : 5.7 ne le reproduit pas, mais GET /api/songs/:uid reste accessible sans vérif. À corriger un jour (aligner sur le pattern 401→404→403).
- **Index `playlist_songs_playlist_uid` redondant** avec l'unique composite `(playlist_uid, song_uid)` : inoffensif, supprimable si on veut alléger.
- **Note (résolu avant merge, pas une dette)** : la story 5.7 exige un `make migrate` local + vérif que la FK `PlaylistSongs.song_uid` a bien `ON DELETE CASCADE` sur une vraie base (piège sync-first, cf. leçon rétro épic 4 / story 4.2).

## Deferred from: code review of story-5.6 (2026-06-11)

- **Édition de playlist ne nettoie pas les orphelins** (`MyPlaylistsPage.tsx:99-107`) : `handleEdit` recopie `songUids` verbatim → un UID orphelin survit à un Update (invisible, pas de case à cocher). Bénin (masqué en lecture, le strip backend reste le vrai GC), cohérent avec « migration différée ». À reprendre si on veut un self-heal côté édition.
- **API playlist émet encore les orphelins hérités** (`playlistcontroller.js:13-42`) : `getAllPlaylists`/`getPlaylist` renvoient `songUids` brut ; seul l'UI filtre. AC3 résolu côté UX, pas côté donnée. Tout futur consommateur de l'API devra refiltrer — ou alors faire une migration de purge / un filtrage serveur.
- **`deleteSong` : scan O(playlists) + N updates** (`songcontroller.js:205`) : négligeable à l'échelle actuelle ; envisager une requête JSON ciblée (`song_uids @> ...`) si le nombre de playlists explose.

## Deferred from: code review of story-5.5 (2026-06-11)

- **Heatmap day-detail incohérent avec l'historique** : `MyHeatmapPage.tsx:439-444` rend les mêmes `session.items` en titre seul (sans artiste, séparateur `—`). Après 5.5, l'historique de session est en « Artiste - Titre » mais la heatmap reste en « Titre ». Candidate à une story d'extension si « Artiste - Titre partout » doit couvrir la heatmap. *(Statut : décision en attente côté story 5.5 — voir Review Findings.)*
- **Libellé « Frankenstein » chanson renommée** (`MySessionsPage.tsx:822-827`) : titre = snapshot FR4 figé, artiste = catalogue live → une chanson renommée affiche `ArtisteLive - AncienTitre`. Préexistant ; l'ordre artiste-d'abord le rend plus visible. À traiter seulement si l'on décide de snapshotter aussi l'artiste (gros changement modèle/FR4).
- **`MyPlaylistsPage` non gardé sur artiste vide** (`MyPlaylistsPage.tsx:132,307-322`) : `${artist} - ${title}` sans garde → artiste `""` affiche un « - Titre » orphelin. Préexistant, hors périmètre 5.5. Aligner sur le pattern gardé de `formatSongLabel` si on touche les playlists.

## Note Correct Course (2026-06-10)

- **Nav mobile toujours cassée** : la story 5.3 a réordonné/renommé le menu desktop (« Songlist »), mais la nav reste `hidden md:flex` sans menu hamburger → sur mobile, toujours aucun lien (NFR3). Réordonner ≠ réparer. Dette inchangée, candidate à une story dédiée (nav responsive + hamburger).

## Deferred from: code review of 2-3-consulter-mon-historique-de-sessions (2026-06-07)

- Ordre de saisie des entrées de session : `bulkCreate` horodate tout le batch au même instant, donc le GET ne peut pas restituer l'ordre de saisie (tiebreak `uid` = déterministe mais arbitraire). Restituer fidèlement l'ordre nécessite une colonne `position` sur `SessionItems` — à considérer avec la story 2.4 (édition des entrées) si l'ordre devient éditable/important.

## Deferred from: code review of 2-1-creer-une-session-de-pratique (2026-06-07)

- Migrations create-table : le `down: dropTable` peut détruire une table créée par `sequelize.sync` (pas par le `up` gardé) — perte de données si un `db:migrate:undo` tournait en prod. Pattern identique sur toutes les migrations du projet ; le rollback n'est pas utilisé (release_command = migrate up only). À trancher si on introduit un jour des rollbacks.
- Garde `req.body || {}` absente des contrôleurs préexistants (topiccontroller, instrumentcontroller, songcontroller…) : un POST/PUT avec Content-Type non-JSON laisse `req.body` undefined → destructuring → 500 au lieu de 400. Corrigé dans practicesessioncontroller (2.1) ; à généraliser.

## Deferred from: code review of 1-2-gerer-ma-bibliotheque-de-sujets (2026-06-07)

- 403 vs 404 sur PUT/DELETE = oracle d'énumération (un utilisateur authentifié peut distinguer « existe mais pas à moi » de « n'existe pas »). Pattern maison (instrumentcontroller identique, imposé par le spec). À trancher globalement : retourner 404 dans les deux cas ou requête `where: { uid, userUid }`.
- Posture CSRF : toutes les routes mutantes (topics, instruments, playlists, songs) reposent sur le cookie de session sans token CSRF ni vérification d'origine visible. Vérifier la config SameSite du cookie (express-session) et décider d'une stratégie app-wide.
- Pas de verrouillage optimiste : PUT sur une entité supprimée/modifiée concurremment répond 200 sans persister (UPDATE 0 rows silencieux). App-wide, course rare.
- Édition inline : cliquer Edit sur une autre ligne jette les modifications non sauvées sans confirmation (pattern MyInstrumentsPage identique).

## Contrat FR4 pour l'Epic 2 (issu de la story 1.2 — NE PAS PERDRE)

- Les sujets (Topics) sont en **hard delete**. Pour que FR4 tienne (« la suppression d'un sujet ne troue jamais l'historique »), les entrées de session de l'Epic 2 (SessionItem) DOIVENT **snapshotter le nom du sujet** (champ dénormalisé `topicName`) en plus de la FK nullable — une session passée affiche toujours le nom même si le sujet est supprimé, et l'entrée reste reclassable (FR4). À intégrer dès la conception du modèle SessionItem (story 2.2).

## Deferred from: code review of 1-1-creer-un-sujet-de-travail (2026-06-07)

- Session serveur expirée → page morte : `isAuthenticated` vient du localStorage (AuthContext), pas du cookie ; un 401 sur les fetchs affiche un bandeau d'erreur sans chemin de re-login. Pré-existant et transverse (Songs, Instruments, Playlists, Topics, Sessions, Heatmap). Piste : intercepter `res.status === 401` dans les services → redirect /login. **PRIORITÉ EN HAUSSE (2026-06-07)** : vécu en réel par northwood sur la heatmap (« Heatmap could not be loaded. » alors que c'était un simple 401 après un restart nodemon qui vide le MemoryStore) — 3ᵉ manifestation. Candidat sérieux pour une mini-story dédiée avant ou pendant l'Epic 4.
- `loading` partagé entre chargement initial et create : la table disparaît pendant un POST lent. Pattern maison hérité de MyInstrumentsPage — à corriger globalement si on touche à ces pages.
- Aucune navigation mobile : la nav du Header est `hidden md:flex` sans menu hamburger — sur mobile, aucun lien vers /songs, /my-instruments, /my-playlists, /my-topics. Pré-existant ; pertinent pour NFR3 de l'epic 2/3 (responsive complet).

## Deferred from: code review of 3-3-ma-grille-a-deja-une-histoire-retro-import (2026-06-07)

- Suppression d'une chanson → CASCADE sur ses SongPlays → la heatmap déjà chargée garde une case allumée (playCount > 0) dont le panneau dit « No practice » jusqu'au prochain refetch (changement d'année ou delete de session). Rare, auto-guéri au refresh. Piste si ça mord : bump de heatmapVersion à l'ouverture d'un panneau vide inattendu, ou refetch au focus de l'onglet.

## Deferred from: code review of 4-1-mark-as-played-remplit-mon-journal (2026-06-08)

- `song.lastPlayed` horodaté serveur + double-écriture front/back + incohérence sur un playedOn rétroactif → cohérence bidirectionnelle traitée en 4.2 (recalcul du dernier joué à la création/suppression/déplacement de session).
- Course résiduelle find-or-create de session (double-clic multi-appareils) après sérialisation du marquage en masse : couvrable par un verrou applicatif (advisory lock keyed user+date+instrument) si l'échelle le justifie un jour.
- `markSongPlayed` stocke `instrumentUid` sans vérifier l'ownership (incohérence pré-existante, identique avant 4.1).
- Anti-doublon d'entrée (AC4) et calcul de `position` via count non atomiques sous concurrence ; pas de contrainte unique car une session peut légitimement contenir deux fois la même chanson (saisie manuelle) et il peut exister plusieurs sessions même jour/instrument.

## Deferred from: code review of 4-2-mon-dernier-joue-ne-ment-jamais (2026-06-08)

- Éditer la DATE d'une session aplatit les plays mark-as-played (heure réelle) à midi UTC sur la nouvelle date (perte du départage intra-jour). Rare ; justesse au jour préservée ; le départage global du tri rattrape. Piste si gênant : préserver l'heure d'origine en ne déplaçant que la partie date.
- Un mark-as-played qui réutilise une entrée existante crée un 2e SongPlay lié au même sessionItemUid (plusieurs events par entrée). Défendable (deux lectures réelles) ; cosmétique dans l'historique des plays.
- Les plays de journal ne mettent pas à jour Song.lastPlayed (global). Le « dernier joué par instrument » dérivé fait foi ; le global n'est qu'un départage de secours. À unifier si un jour Song.lastPlayed redevient autoritaire.
