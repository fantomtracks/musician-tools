# Deferred Work

> **Rituel (acté rétro Epic 8, 2026-06-21)** : ce fichier passe en revue **avant le démarrage de chaque nouvelle epic**. Chaque item est tranché — _fix maintenant_ / _story planifiée_ / _gardé-avec-raison_ / _tué_. Il ne doit jamais redevenir un cimetière. Dernière passe : **2026-06-26** (clôture Epic 7).

---

## 🔧 À traiter maintenant (fix immédiat)

_Vidé le 2026-06-21 : les 3 items (z-index Album/Languages, garde artiste `MyPlaylistsPage`, drop index redondant) traités dans la branche `fix/pre-epic7-quick-wins`. Cf. journal « Soldé » en bas._

---

## 📋 Stories à planifier

_Les 4 stories UI/confort (filtres Songlist, refacto SessionHistoryCard, chanson cliquable, nav mobile) ont été regroupées et **livrées dans l'Epic 9** (2026-06-21, branche `feat/epic-9-ui-polish`). Cf. journal « Soldé »._

### 🔐 Lot sécu → à fusionner dans le brief Epic 7
> ✅ **RÉSOLU — Epic 7 shippée (mergée local 2026-06-26).** Détail des résolutions dans le journal « Soldé » en bas. Vérifié dans le code le 2026-06-26.

### 🔐 Durcissement session — ✅ DEV FAIT le 2026-06-26 (branche `feat/session-hardening`, à merger)
> Issu de la review 7.3, élargi par 7.13. Implémenté : `sessionService.regenerateSession()` (promisifie `req.session.regenerate`) appelé dans `loginUser` ET `verifyEmail` avant de poser `loggedIn`/`user` → l'ID de session pré-auth + son token CSRF sont jetés. Côté front, `AuthContext` vide le cache CSRF (`clearCsrfToken`) au succès login + verify (`applyAuthenticatedUser`) → 1ʳᵉ mutation avec un token frais, pas de 403. Tests : usercontroller 25 ✓ (regenerate asserté), front 267 ✓, smoke-test login live OK. [usercontroller.js, sessionService.js, contexts/AuthContext.tsx]

### 🧹 Lot ménage dette technique (story planifiée — groupée 2026-06-26)
> Petits items inoffensifs (tout testé), à faire délibérément en un lot, pas en marge.
- **Helper `issueAndSend(uid, email, type)` + `validateNewPassword(pw, confirm)`** — le couple `issueToken+send` est désormais **5×** (createUser / resendVerificationPublic(7.13) / forgotPassword / requestEmailChange / register-verify) et la validation mdp ≥10+confirmation 2×. [usercontroller.js, accountcontroller.js]
- **Index non-unique `users_name` redondant** (couvert par `users_name_discriminator_unique`) → migration de drop. [migrations Users]
- **CHECK SQL `discriminator ~ '^[0-9]{4}$'`** — l'invariant 4 chiffres ne vit que dans le code. [models/user.js]
- **Garde format UUID incohérente** — song/instrument/playlist : `uid` non-UUID → 500 au lieu de 404 (cosmétique). Généraliser `UUID_PATTERN`→404. [song/instrument/playlist controllers]
- **`getCsrfToken` sans dédup en vol** — thundering herd au cold-start (inoffensif). [src/services/csrf.ts]

### 🎵 Créer une playlist à la volée depuis l'édition d'une chanson (story planifiée — 2026-06-26)
- Depuis la fiche d'édition d'une chanson, pouvoir **créer une nouvelle playlist et y ajouter la chanson** sans quitter l'écran (taper un nom inexistant → « Créer la playlist … » → créée + chanson ajoutée). Même pattern UX que le « créer un sujet à la volée » du sélecteur d'entrée (8.2). À cadrer : emplacement dans `SongForm` (une section playlists ?), création + ajout en une action, lien `playlist_songs` (FK 5.7), feedback. [Songs.tsx/SongForm, MyPlaylistsPage, playlistcontroller]

### 🐛 Navigation clavier cassée dans les comboboxes artiste/album/genre (bug — noté 2026-06-27)
- Dans `SongForm`, taper p.ex. « fun » dans Genre puis **flèche bas** ne surligne aucune suggestion et **Entrée soumet le formulaire** (retour à la liste) au lieu de sélectionner « funk ». Très frustrant. La gestion clavier (ArrowDown/Up + highlight + Entrée=sélection + `preventDefault`) existe sur **certains** champs (~`SongForm.tsx:247`, `:466`) mais **pas** artiste/album/genre → Entrée retombe sur le submit. Fix = uniformiser le pattern combobox (index surligné + Entrée sélectionne + preventDefault) sur tous les champs à suggestions. [src/components/SongForm.tsx]

## Deferred from: code review of 7-12 + 7-13 (2026-06-28)

> Issus de la review adversariale 3 couches. Aucun bloquant — tous les AC des deux stories sont satisfaits. Items reportés (les findings `decision`/`patch` restent dans les stories) :

- **7-12 — Hook `afterSync` duplique la migration** : re-exécute `CREATE EXTENSION` + `f_unaccent` + dédoublonnage + index sur chaque DB construite par `sync({alter:false})`, exige le privilège `CREATE EXTENSION` au boot et ne drop pas l'index legacy `topics_user_uid_name` (dev/CI gardent les 2 index). Prod OK (chemin migration). Dette de maintenance : 2 copies de la SQL de dédup à garder en phase. [`backend/models/topic.js:54-121`]
- **7-12 — Migration hardcode `public.unaccent`** : `'public.unaccent'::regdictionary` casse si l'extension est installée dans un schéma `extensions` dédié (PG managé). Prod actuelle OK (citext 7.2 déjà dans `public`), mais hypothèse d'environnement non gardée. [`backend/migrations/20260625000000-topics-name-ci-unaccent.js:84`]
- **7-12 — Tests collision casse/accent tautologiques** : mockent `Topic.create` → testent le mapping 23505→409, pas le folding réel (validé seulement par migration locale). Le projet mocke les modèles, donc un vrai test de folding demanderait une DB. [`backend/__tests__/topiccontroller.test.js:13-26`]
- **7-13 — Token consommé sur 2e device → « invalid/expired » malgré succès** : après vérification sur l'appareil A, rouvrir le même lien sur le téléphone B (jamais loggé) affiche une erreur, le backend ne distinguant pas un token consommé-valide d'un token invalide. UX trompeuse. [`src/pages/VerifyEmailPage.tsx:53-61`]
- **7-13 — Oracle de timing sur `resendVerificationPublic`** : l'envoi email n'est awaité (avant `res.json`) que sur la branche existant-non-vérifié → la latence distingue « compte non vérifié » de « inconnu/vérifié » malgré le body uniforme. Même résidu accepté que `forgotPassword`. [`backend/controllers/usercontroller.js:260-279`]
- **7-13 — UI vérif Login/Register sans test front** : seul `VerifyEmailPage` a une couverture automatisée ; les branches `needsVerification` (Login) et le bouton Resend (Register) ne sont pas testées. Dans le plan de test déclaré de la story. [`src/pages/LoginPage.tsx` / `RegisterPage.tsx`]

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

## ✅ Soldé / retiré le 2026-06-26 (journal — clôture Epic 7)

**Lot sécu pré-Epic-7 → résolu par l'Epic 7 (vérifié dans le code 2026-06-26) :**
- **`getSong` / `markSongPlayed` ownership** → **7.5** : `findOne({ where:{ uid, userUid } })` ; instrument vérifié owned avant attache. [songcontroller.js:87, 265]
- **Oracle 403 vs 404** → **7.5** : collapse en 404 sauf le 403 « topic système » légitime (seul `createError(403` restant = topiccontroller). 
- **Posture CSRF** → **7.3** : token synchronizer sur toutes les mutations `/api` (middleware csrf).
- **Garde `req.body || {}`** → **7.5** : généralisée (topic/user/song… renvoient 400 et non 500 sur corps non-JSON).
- **Unicité topic casse/accents** → **7.12** : index fonctionnel unique `(user_uid, lower(f_unaccent(name)))` + hook afterSync.
- **Résidu anti-énum register (7.7)** → **7.13** : hard email gate, register/login uniformes (plus de session auto au register).

> Items de review 7.x restés ouverts après l'Epic 7 : **regroupés en 2 stories planifiées** ci-dessus — _Durcissement session_ (session-fixation 7.3) et _Lot ménage dette technique_ (helper issueAndSend/validateNewPassword 7.10, index users_name 7.2, CHECK discriminator 7.2, garde UUID 7.5, dédup getCsrfToken 7.3). Les entrées détaillées ci-dessous restent comme provenance.

## Deferred from: code review of story-7.1 (2026-06-23)

- ~~**Pré-flight env dans le Makefile**~~ — ✅ **RÉSOLU le 2026-06-23** (même branche que 7.1). Cible `check-env` ajoutée (vérifie `backend/.env` + `SESSION_SECRET` non vide) et branchée en prérequis de `setup`/`start`/`up`/`restart`/`rebuild-backend`/`reset-db` : message explicite au lieu d'un crash-loop silencieux. [Makefile]

## Deferred from: code review of story-7.2 (2026-06-23)

- **Grandfathering `email_verified` non rejouable après 7.9** — `UPDATE … SET email_verified=true WHERE email_verified=false` (backfill 7.2) re-vérifierait à tort de vrais comptes non vérifiés si la migration était **rejouée manuellement** une fois la vérif d'email (7.9) en place. Risque nul en flux normal (migration jouée une fois) ; à garder en tête si on rejoue `20260623000100` à la main plus tard. [20260623000100-backfill-users-beta.js]
- **Index non-unique `users_name` redondant** — l'index composite `users_name_discriminator_unique` a `name` en colonne de tête, rendant l'index `users_name` redondant (même cas que le nettoyage 20260621 sur PlaylistSongs). Inoffensif ; à dropper dans une future migration de ménage. [migrations Users]
- **Format du discriminator non contraint en DB** — l'invariant « 4 chiffres zero-paddés » vit dans le code (backfill + futur register 7.7), pas dans un CHECK SQL. 7.7 (register handle) est le bon endroit pour figer le format ; un CHECK `discriminator ~ '^[0-9]{4}$'` pourrait y être ajouté. [models/user.js]

## Deferred from: code review of story-7.8 (2026-06-25)

- **Boucle d'attribution de discriminator dupliquée** — la mécanique « essayer un discriminator, retry random sur collision `(name, discriminator)` » existe désormais en double : `usercontroller.createUser` (7.7, sur `User.create`) et `accountcontroller.updateName` (7.8, sur `user.update`). Extraction non triviale (create vs update = opérations différentes) ; envisager un helper d'ordre supérieur `withFreeDiscriminator(fn)` si une 3ᵉ occurrence apparaît. Inoffensif (les deux copies sont testées). [usercontroller.js, accountcontroller.js]

## Deferred from: code review of story-7.11 (2026-06-25)

- **Invalider les tokens `change_email` périmés à chaque nouvelle demande** — demander un changement vers A puis B laisse `token_A` valide 1 h (design payload-autoritatif : chaque token confirme SON adresse). Durcissement : à chaque `requestEmailChange`, marquer `usedAt` les anciens tokens `change_email` non utilisés du user. Faible sévérité (expiration 1 h, initié par l'user). [accountcontroller.js + authTokenService]

## Deferred from: code review of story-7.10 (2026-06-25)

- **Validation « nouveau mot de passe » triplée + paire `issueToken+send` (4 occurrences)** — la règle « ≥10 + confirmation » (messages identiques) existe dans `accountcontroller.changePassword` (7.8) **et** `usercontroller.resetPassword` (7.10) (register valide la longueur seule) ; et le couple best-effort `issueToken(type) + send<X>Email` se répète désormais **4×** (`createUser`/`resendVerification`/`forgotPassword`/`requestEmailChange` de 7.11). Extraire un `validateNewPassword(pw, confirm)` + un `MIN_PASSWORD_LENGTH`, et un `issueAndSend(uid, email, type)` — à faire délibérément (touche des contrôleurs de stories déjà mergées), pas en marge d'une revue. Inoffensif (tout est testé). [usercontroller.js, accountcontroller.js]

## Deferred from: code review of story-7.5 (2026-06-23)

- **Garde de format UUID incohérente** — `topic`/`session` rejettent un `uid` malformé en **404** via `UUID_PATTERN` avant la requête ; `song`/`instrument`/`playlist` (et l'`instrumentUid` de `markSongPlayed`) n'ont pas cette garde → un `uid` non-UUID atteint Postgres (colonne `uuid`) et lève une erreur de syntaxe → **500** au lieu de 404. Pré-existant (déjà le cas avec `findByPk`), pas une régression 7.5 ; ce n'est pas une faille (entrée garbage), juste un 500 cosmétique. Fix = généraliser `UUID_PATTERN`→404 sur ces routes (ou un middleware de validation de param). [songcontroller, instrumentcontroller, playlistcontroller]

## Deferred from: code review of story-7.3 (2026-06-23)

- **Fixation de session (login/register ne régénèrent pas la session)** — `loginUser`/`createUser` posent `loggedIn`/`user` sur la session pré-auth existante sans `req.session.regenerate()`. L'id de session **et** le token CSRF mintés avant authentification survivent au passage authentifié → fenêtre de session-fixation. Pré-existant (le login n'a jamais régénéré) ; 7.3 ne fait qu'y ajouter le token. Fix = `regenerate()` au login/register puis re-mint du token. Relève d'une **passe durcissement session** (cf. NFR-S1 / proche de 7.8 invalidation de sessions). [backend/controllers/usercontroller.js]
- **`getCsrfToken` sans dé-duplication en vol** — au cold-start, N mutations concurrentes déclenchent N `GET /api/csrf-token` au lieu d'un seul (thundering herd). Corriger en mémorisant la promesse en cours. Inoffensif (toutes obtiennent un token valide). [src/services/csrf.ts]
- **`withCsrfHeader` suppose des headers objet simple** — un appelant passant un `Headers` ou un tableau `[[k,v]]` perdrait ses headers (dont `Content-Type`) au spread. Non atteint aujourd'hui (tous les services passent un objet littéral) ; latent. [src/services/apiFetch.ts]

## Deferred from: manual QA of story-7.7 (2026-06-26)

- ~~**Différentiel de comportement register (résidu anti-énumération assumé)**~~ — ✅ **RÉSOLU le 2026-06-26 par la story 7.13** (hard email gate). Register n'auto-connecte plus : email neuf et email existant renvoient désormais la **même** réponse générique `{auth:false, pending:true}` sans session → plus de différentiel observable. La connexion exige la vérification de l'email. [usercontroller.js — voir 7-13-hard-email-verification-gate.md]
