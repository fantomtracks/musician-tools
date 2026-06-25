# Deferred Work

> **Rituel (acté rétro Epic 8, 2026-06-21)** : ce fichier passe en revue **avant le démarrage de chaque nouvelle epic**. Chaque item est tranché — _fix maintenant_ / _story planifiée_ / _gardé-avec-raison_ / _tué_. Il ne doit jamais redevenir un cimetière. Dernière passe : **2026-06-21**.

---

## 🔧 À traiter maintenant (fix immédiat)

_Vidé le 2026-06-21 : les 3 items (z-index Album/Languages, garde artiste `MyPlaylistsPage`, drop index redondant) traités dans la branche `fix/pre-epic7-quick-wins`. Cf. journal « Soldé » en bas._

---

## 📋 Stories à planifier

_Les 4 stories UI/confort (filtres Songlist, refacto SessionHistoryCard, chanson cliquable, nav mobile) ont été regroupées et **livrées dans l'Epic 9** (2026-06-21, branche `feat/epic-9-ui-polish`). Cf. journal « Soldé »._

### 🔐 Lot sécu → à fusionner dans le brief Epic 7
> **Décision 2026-06-21** : ces dettes sécu sont le **périmètre du design sécurité qui bloque l'Epic 7** (compte utilisateur). À traiter dans le brief Epic 7, pas en story autonome.
- **`getSong` sans contrôle d'ownership** (`songcontroller.js:65-76`) : GET /api/songs/:uid accessible sans vérif. Aligner sur 401→404→403.
- **`markSongPlayed` stocke `instrumentUid` sans vérifier l'ownership** (pré-existant).
- **403 vs 404 = oracle d'énumération** : un user authentifié distingue « existe mais pas à moi » de « n'existe pas » (pattern maison, instrument/topic/song identiques). Trancher app-wide : 404 partout ou `where: { uid, userUid }`.
- **Posture CSRF** : routes mutantes sur cookie de session sans token CSRF ni vérif d'origine. Vérifier SameSite (express-session) + stratégie app-wide.
- **Garde `req.body || {}` absente** des contrôleurs préexistants (topic/instrument/song…) : POST/PUT non-JSON → `req.body` undefined → 500 au lieu de 400. Corrigé dans practicesession (2.1), à généraliser. → **story planifiée : Epic 7, AC d'audit story 7.5** (2026-06-21).
- **Unicité topic insensible casse/accents (gap AC10, 8-2)** : dédoublonnage garanti client seulement (`foldForSearch`) ; index `(user_uid, name)` sensible. Correctif = `citext`/`LOWER()` serveur — touche la feature topics entière. → **story planifiée : Epic 7, story 7.12** (2026-06-21).

---

## 💭 À brainstormer

- **Auto-save de la fiche chanson** : sauvegarde auto au blur ou en debounce ~3 s, au lieu du Save manuel. Rendrait la garde « modifs non enregistrées » du Mark as Played inutile. **Résout aussi** la détection `isDirty` fragile (`Songs.tsx` : `JSON.stringify(form)` vs snapshot, qu'un effet de `SongForm` peut fausser). À cadrer : feedback visuel (« Saved »), erreurs de validation/doublon en cours de frappe, coût réseau, conflit avec le bouton Save explicite.

---

## 🧊 Gardés consciemment — report assumé (mono-utilisateur beta)

> **Décision 2026-06-21** : reports assumés en bloc tant que l'app reste mono-user beta (3-4 users). À remonter en « story planifiée » si l'app devient multi-user/collaborative ou si l'un mord en réel.

**Concurrence / lost-update** (couvrables par advisory lock si l'échelle le justifie) :
- Course `markSongPlayed` sur marquages concurrents même jour/instrument (`priorTotal` lu avant écriture).
- Course find-or-create de session (double-clic multi-appareils).
- Course add/remove playlist : `syncPlaylistSongs` fait `destroy`+`bulkCreate` sans `SELECT … FOR UPDATE` (`playlistcontroller`).
- Anti-doublon d'entrée (AC4) et calcul de `position` via count non atomiques.
- Pas de verrouillage optimiste : PUT sur entité modifiée concurremment → 200 sans persister (UPDATE 0 rows silencieux).

**Performance scale-gated** :
- `deleteSong` : scan O(playlists) + N updates (`songcontroller.js:205`). Envisager `song_uids @> …` si le nombre de playlists explose.

**Orphelins playlist (JSON, GC backend = source de vérité)** :
- Édition de playlist ne nettoie pas les orphelins (`MyPlaylistsPage.tsx:99-107`, `handleEdit` recopie verbatim).
- API `getAllPlaylists`/`getPlaylist` émettent les `songUids` bruts (`playlistcontroller.js:13-42`) ; seul l'UI filtre. Tout futur consommateur API devra refiltrer.

**Modèle / affichage** :
- Libellé « Frankenstein » d'une chanson renommée (`MySessionsPage.tsx:822-827`) : titre = snapshot FR4 figé, artiste = catalogue live. Fix = snapshotter aussi l'artiste (gros changement modèle/FR4).
- Ordre de saisie des entrées non restitué : `bulkCreate` horodate tout le batch pareil ; restituer l'ordre nécessite une colonne `position` sur `SessionItems`.
- `lastPlayed` global non mis à jour par les plays de journal : le « dernier joué par instrument » dérivé fait foi ; le global n'est qu'un départage de secours.
- Éditer la DATE d'une session aplatit les plays mark-as-played à midi UTC (perte du départage intra-jour). Rare ; justesse au jour préservée.
- Un mark-as-played qui réutilise une entrée existante crée un 2ᵉ SongPlay lié au même `sessionItemUid`. Défendable (deux lectures réelles).
- Suppression d'une chanson → CASCADE SongPlays → la heatmap déjà chargée garde une case allumée « No practice » jusqu'au refetch. Rare, auto-guéri.

**Migrations / patterns** :
- `down: dropTable` peut détruire une table créée par `sequelize.sync` — perte de données si un `db:migrate:undo` tournait en prod. Rollback non utilisé (release = migrate up only).
- Édition inline (Songs/Instruments) : cliquer Edit sur une autre ligne jette les modifs non sauvées sans confirmation.

---

## ✅ Soldé / retiré le 2026-06-21 (journal — pas de suppression silencieuse)

**Epic 9 — Robustesse / confort UI (branche `feat/epic-9-ui-polish`, 2026-06-21) :**
- **9.1 Nav mobile + hamburger** → **livré** : `Header.tsx` avec liens dédupliqués + bouton hamburger `md:hidden`, panneau déroulant (clic/Échap), a11y ; tests `Header.test.tsx` + stub `matchMedia` au setup.
- **9.2 Filtres Songlist** → **livré** : libellés « Song's instrument » / « My instrument » + option « No instrument » (sentinelle `NO_INSTRUMENT`, sous-filtres par instrument neutralisés) ; tests filtres.
- **9.3 Refacto `SessionHistoryCard`** → **livré** : composant partagé `SessionHistoryCard` + `SessionEntryLine` (MySessions + MyHeatmap dé-dupliqués). _(L'incohérence artiste heatmap day-detail était en fait déjà résolue ; seules les `plays` projetées restent en titre seul, volontairement plus sobres.)_
- **9.4 Chanson cliquable** → **livré** : libellé chanson de l'historique → édition (`/songs` + `state.editUid`) ; bénéficie aussi à la heatmap via le composant partagé ; tests `SessionHistoryCard.test.tsx`.

**Quick wins pre-Epic 7 (branche `fix/pre-epic7-quick-wins`, 2026-06-21) :**
- **Bug z-index Album → Languages** → **fixé** : conteneur album passé en `relative z-30` + dropdown en `z-50` (`SongForm.tsx`) ; il stacke désormais au-dessus du bloc Languages (`z-20`). Typecheck + tests verts.
- **`MyPlaylistsPage` garde artiste vide** → **fixé** : helper local `formatSongLabel` (drop du « - » si artiste vide), appliqué aux 5 occurrences (titre, recherche, tri, rendu). Tests verts.
- **Index `playlist_songs_playlist_uid` redondant** → **droppé** : migration `20260621000000-drop-redundant-playlist-songs-index` (idempotente, up/down testées localement) + retrait du modèle `playlistsong.js`. Couvert par l'unique composite `(playlist_uid, song_uid)`.
- **Durée auto via scraper SongBPM** → **livré** : `fetchFromSongBpm` extrait `Duration` (parse `m:ss`/`h:mm:ss` → secondes), `durationSeconds` propagé via `fetchSongMetadata` → `songService.lookupMetadata` → `Songs.tsx handleAutoFill` (sans écraser une saisie, ajouté à `hasUsefulData`). Alimente le champ durée d'Epic 6 / story 8.1.


- **Désync du total au plafond 1440** (sync `markSongPlayed → durationMinutes`) → **caduc** : Epic 8 (story 8-3) a supprimé cette sync. Le bug n'existe plus.
- **`song.lastPlayed` cohérence bidirectionnelle** (review 4-1) → **résolu** en 4.2 (recalcul à la création/suppression/déplacement de session).
- **Contrat FR4 — snapshot `topicName` sur SessionItem** → **tenu** depuis l'Epic 2 ; contrat honoré, plus une dette.
- **2 edges migration 8-3** (INNER JOIN sur topic système ; idempotence par valeur) → **clos** : migration one-shot déjà jouée proprement en prod sur la vraie base ; instance morte.
- **Note 5.7 (vérif FK CASCADE sur vraie base avant merge)** → était une exigence pré-merge, satisfaite ; pas une dette.
- **Nav mobile (note Correct Course 2026-06-10)** → fusionnée avec la story « Nav mobile responsive + hamburger » ci-dessus (doublon retiré).

## Deferred from: code review of story-7.1 (2026-06-23)

- ~~**Pré-flight env dans le Makefile**~~ — ✅ **RÉSOLU le 2026-06-23** (même branche que 7.1). Cible `check-env` ajoutée (vérifie `backend/.env` + `SESSION_SECRET` non vide) et branchée en prérequis de `setup`/`start`/`up`/`restart`/`rebuild-backend`/`reset-db` : message explicite au lieu d'un crash-loop silencieux. [Makefile]

## Deferred from: code review of story-7.2 (2026-06-23)

- **Grandfathering `email_verified` non rejouable après 7.9** — `UPDATE … SET email_verified=true WHERE email_verified=false` (backfill 7.2) re-vérifierait à tort de vrais comptes non vérifiés si la migration était **rejouée manuellement** une fois la vérif d'email (7.9) en place. Risque nul en flux normal (migration jouée une fois) ; à garder en tête si on rejoue `20260623000100` à la main plus tard. [20260623000100-backfill-users-beta.js]
- **Index non-unique `users_name` redondant** — l'index composite `users_name_discriminator_unique` a `name` en colonne de tête, rendant l'index `users_name` redondant (même cas que le nettoyage 20260621 sur PlaylistSongs). Inoffensif ; à dropper dans une future migration de ménage. [migrations Users]
- **Format du discriminator non contraint en DB** — l'invariant « 4 chiffres zero-paddés » vit dans le code (backfill + futur register 7.7), pas dans un CHECK SQL. 7.7 (register handle) est le bon endroit pour figer le format ; un CHECK `discriminator ~ '^[0-9]{4}$'` pourrait y être ajouté. [models/user.js]

## Deferred from: code review of story-7.8 (2026-06-25)

- **Boucle d'attribution de discriminator dupliquée** — la mécanique « essayer un discriminator, retry random sur collision `(name, discriminator)` » existe désormais en double : `usercontroller.createUser` (7.7, sur `User.create`) et `accountcontroller.updateName` (7.8, sur `user.update`). Extraction non triviale (create vs update = opérations différentes) ; envisager un helper d'ordre supérieur `withFreeDiscriminator(fn)` si une 3ᵉ occurrence apparaît. Inoffensif (les deux copies sont testées). [usercontroller.js, accountcontroller.js]

## Deferred from: code review of story-7.5 (2026-06-23)

- **Garde de format UUID incohérente** — `topic`/`session` rejettent un `uid` malformé en **404** via `UUID_PATTERN` avant la requête ; `song`/`instrument`/`playlist` (et l'`instrumentUid` de `markSongPlayed`) n'ont pas cette garde → un `uid` non-UUID atteint Postgres (colonne `uuid`) et lève une erreur de syntaxe → **500** au lieu de 404. Pré-existant (déjà le cas avec `findByPk`), pas une régression 7.5 ; ce n'est pas une faille (entrée garbage), juste un 500 cosmétique. Fix = généraliser `UUID_PATTERN`→404 sur ces routes (ou un middleware de validation de param). [songcontroller, instrumentcontroller, playlistcontroller]

## Deferred from: code review of story-7.3 (2026-06-23)

- **Fixation de session (login/register ne régénèrent pas la session)** — `loginUser`/`createUser` posent `loggedIn`/`user` sur la session pré-auth existante sans `req.session.regenerate()`. L'id de session **et** le token CSRF mintés avant authentification survivent au passage authentifié → fenêtre de session-fixation. Pré-existant (le login n'a jamais régénéré) ; 7.3 ne fait qu'y ajouter le token. Fix = `regenerate()` au login/register puis re-mint du token. Relève d'une **passe durcissement session** (cf. NFR-S1 / proche de 7.8 invalidation de sessions). [backend/controllers/usercontroller.js]
- **`getCsrfToken` sans dé-duplication en vol** — au cold-start, N mutations concurrentes déclenchent N `GET /api/csrf-token` au lieu d'un seul (thundering herd). Corriger en mémorisant la promesse en cours. Inoffensif (toutes obtiennent un token valide). [src/services/csrf.ts]
- **`withCsrfHeader` suppose des headers objet simple** — un appelant passant un `Headers` ou un tableau `[[k,v]]` perdrait ses headers (dont `Content-Type`) au spread. Non atteint aujourd'hui (tous les services passent un objet littéral) ; latent. [src/services/apiFetch.ts]
