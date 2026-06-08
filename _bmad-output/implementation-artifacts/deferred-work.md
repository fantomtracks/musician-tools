# Deferred Work

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
