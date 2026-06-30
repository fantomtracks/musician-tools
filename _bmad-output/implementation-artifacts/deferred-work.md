# Deferred Work

> **Rituel (acté rétro Epic 8, 2026-06-21)** : ce fichier passe en revue **avant le démarrage de chaque nouvelle epic**. Chaque item est tranché — _fix maintenant_ / _story planifiée_ / _gardé-avec-raison_ / _tué_. Il ne doit jamais redevenir un cimetière. Dernière passe : **2026-06-28** (post-Epic 11 — cluster afterSync/parité-sync soldé par 11.1).

---

### 🧹 ESLint propre + pre-commit durci — ✅ RÉSOLU (2026-06-28, mergé en prod v1.8.0, ex-branche `chore/eslint-cleanup`)
> 3 erreurs ESLint pré-existantes (survie : le pre-commit ne lançait que les tests, pas ESLint).
- [x] `AuthContext.tsx` `no-useless-catch` → logout sans try/catch inutile.
- [x] `AuthContext.tsx` `react-refresh/only-export-components` → fichier scindé : `AuthContext.ts` (contexte + `useAuth` + types, pas de composant) / `AuthProvider.tsx` (le composant seul). Les 14 imports de `useAuth` inchangés (même chemin → `.ts`) ; seul `main.tsx` pointe vers `AuthProvider`.
- [x] `MyPlaylistsPage.tsx` `_uid` non utilisé → config ESLint honore la convention `_`-préfixe (`varsIgnorePattern: '^_'`).
- [x] `vite.config.ts` `@ts-nocheck` (4ᵉ, surfacée par `eslint .` au pre-commit) → override ESLint ciblé sur ce seul fichier (le `@ts-nocheck` du config Vite est volontaire) ; la règle reste stricte ailleurs.
- [x] **Pre-commit durci** : `set -e` + `npm run lint` (front) et `npm run lint` (back) ajoutés avant les tests → toute erreur ESLint/test bloque désormais le commit (corrige aussi le chaînage manquant de l'ancien hook). Front 290 verts, ESLint front+back clean.

_Vidé le 2026-06-21 : les 3 items (z-index Album/Languages, garde artiste `MyPlaylistsPage`, drop index redondant) traités dans la branche `fix/pre-epic7-quick-wins`. Cf. journal « Soldé » en bas._

---

## 📋 Stories à planifier

_Les 4 stories UI/confort (filtres Songlist, refacto SessionHistoryCard, chanson cliquable, nav mobile) ont été regroupées et **livrées dans l'Epic 9** (2026-06-21, branche `feat/epic-9-ui-polish`). Cf. journal « Soldé »._

### ⬆️ Promues à la revue deferred-work du 2026-06-28 — ✅ LES 3 SOLDÉES (vérifié 2026-06-29)
1. ~~**[prio 1] Fix UX vérif email — lien rouvert sur un 2e appareil**~~ — ✅ **RÉSOLU (Epic 12, story 12-1, `done`)** : `verifyEmail` renvoie `200 { alreadyVerified:true }` SANS ouvrir de session pour un token consommé-valide (vs 400 générique) ; front affiche « déjà vérifié, connecte-toi ». Sécu validée (pas d'oracle, single-use préservé). [`backend/controllers/usercontroller.js` verifyEmail, `src/pages/VerifyEmailPage.tsx`]
2. ~~**[prio 2] Tests front des branches vérif**~~ — ✅ **RÉSOLU (groupé dans 12-1)** : `LoginPage.test.tsx` couvre `needsVerification` (verify prompt + Resend) et `RegisterPage.test.tsx` couvre le Resend de l'écran pending (« story 12.1 test gap »). [`src/__tests__/LoginPage.test.tsx`, `RegisterPage.test.tsx`]
3. ~~**[prio 3] Auto-save fiche chanson**~~ — ✅ **RÉSOLU (Epic 13, story 13-1, `done`)** : brainstorm tenu le 2026-06-29 (`_bmad-output/brainstorming/`) → story auto-save (debounce + flush, `lastPlayed` exclu) + sticky Back + statut « Saving/Saved ». Review 3 couches (1 HIGH `lastPlayed` + 5 Med corrigés). Reports résiduels listés plus bas (section review 13-1). [`src/pages/Songs.tsx`, `src/components/SongForm.tsx`]

### 🎨 UX/UI mobile + assets — à cadrer en stories BMAD (notes 2026-06-29)
> Items relevés en session le 2026-06-29. **Aucun code livré** : une première passe a été tentée puis **revertée** (on partait en yolo sans cadrage) → à reprendre proprement via le process BMAD (stories). Les diagnostics ci-dessous restent valides, les pistes de fix sont indicatives.

- **Changer le favicon** : le favicon par défaut est encore en place, à remplacer par une icône propre au produit.
- **Header non connecté qui déborde sur mobile** : sur iPhone 13 (390px) les boutons _Sign in_ / _Create account_ sont posés directement dans la barre du header (pas de hamburger en non-connecté) → ils débordent à côté du titre + toggle dark. Piste explorée : **retirer ces boutons du header** en non-connecté et porter les CTA _Create account_ / _Sign in_ **dans la HomePage** (avec un padding pour ne pas coller au footer). ⚠️ Impacte `Header.test.tsx` (test « unauthenticated … sign-in actions remain » à inverser). [`src/App.tsx` HomePage, `src/components/Header.tsx`]
- **Songlist (page Songs) responsive mobile** : pouvoir **scroller verticalement à l'intérieur du tableau des chansons** (au lieu d'allonger toute la page), et empêcher les autres blocs (recherche, filtres, sidebar) de **déborder** en largeur. Pistes explorées : `min-w-0` sur la colonne contenu (gotcha flexbox), conteneur tableau en `overflow-auto` + `max-h-[~70vh]`, en-tête de tableau `sticky`. À cadrer : hauteur cible (vh fixe vs lock plein écran avec seul le tableau scrollable), comportement sidebar filtres empilée sur mobile. [`src/components/SongsList.tsx`, `SongsSidebar.tsx`]

### 🔐 Lot sécu → à fusionner dans le brief Epic 7
> ✅ **RÉSOLU — Epic 7 shippée (mergée local 2026-06-26).** Détail des résolutions dans le journal « Soldé » en bas. Vérifié dans le code le 2026-06-26.

### 🔐 Durcissement session — ✅ MERGÉ EN PROD (v1.6.0, merge `0d758eb`)
> Issu de la review 7.3, élargi par 7.13. Implémenté : `sessionService.regenerateSession()` (promisifie `req.session.regenerate`) appelé dans `loginUser` ET `verifyEmail` avant de poser `loggedIn`/`user` → l'ID de session pré-auth + son token CSRF sont jetés. Côté front, `AuthContext` vide le cache CSRF (`clearCsrfToken`) au succès login + verify (`applyAuthenticatedUser`) → 1ʳᵉ mutation avec un token frais, pas de 403. Tests : usercontroller 25 ✓ (regenerate asserté), front 267 ✓, smoke-test login live OK. [usercontroller.js, sessionService.js, contexts/AuthContext.tsx]

### 🧹 Lot ménage dette technique — ✅ RÉSOLU (2026-06-28, mergé en prod v1.8.0, ex-branche `chore/menage-dette-technique`)
> Les 5 items traités en un lot, un commit chacun. Back 238 verts, lint clean ; migrations validées en local (up→down→up).
- [x] **Helper `issueAndSend(type, {uid,email,payload})` + `validateNewPassword(pw, confirm)`** — couple issueToken+send centralisé (4×) dans `services/authFlows.js` ; validation mdp dédupliquée dans `utils/passwordPolicy.js`. Comportement/messages identiques. (item 1)
- [x] **Index `users_name` redondant droppé** — migration `20260628000000` idempotente (même pattern que le drop playlist_songs). (item 2)
- [x] **CHECK `users_discriminator_format`** — migration `20260628000100`, ajouté `NOT VALID` (enforce les nouveaux writes sans risque sur les rows legacy ; NULL autorisé). (item 3)
- [x] **Garde UUID→404 généralisée** — `backend/utils/uuid.js` partagé ; gardes ajoutées sur song/instrument/playlist ; topic+practicesession basculés dessus. (item 4)
- [x] **`getCsrfToken` dédup en vol** — promesse `inFlight` partagée pour les appels concurrents au cold-start. (item 5)

### 🔒 Lot parité-sync (unicité dev/CI) — ✅ RÉSOLU (Epic 11, story 11.1, 2026-06-28, mergé en prod v1.8.0, ex-branche `feat/epic-11-dette-technique`)
> Approche « migrations = source unique + garde fail-fast » : garde de boot `assertFunctionalIndexes` (`backend/utils/assertSchema.js`) branchée après `sync` dans `server.js` (échec clair si un index fonctionnel manque), **hook `afterSync` topic retiré** (≈68 lignes de SQL dupliquée), **aucun** hook playlists ajouté, CMD conteneur dev = `db:migrate && npm run dev` (ordonnancement prod). Garde validée sur la vraie base + listen gardé derrière la garde (review). **Net dette −.** Solde aussi les 2 items afterSync ci-dessous.

### 🎵 Créer une playlist à la volée depuis l'édition d'une chanson — ✅ LIVRÉ (Epic 10, story 10.2, 2026-06-28)
> Mergé en prod v1.8.0 (ex-branche `feat/epic-10-confort-playlists`). Option « Create playlist "…" » dans le picker de la fiche chanson (mirror 8.2), `PlaylistConflictError` + 409 backstop, combobox toujours rendu. Précédé de 10.1 (unicité nom playlist serveur, `lower(name)` + dédup RENAME). Review 3 couches : 1 HIGH (reseed-clobber) + patches corrigés. _Cadrage initial ci-dessous conservé pour provenance._
- Depuis la fiche d'édition d'une chanson, pouvoir **créer une nouvelle playlist et y ajouter la chanson** sans quitter l'écran (taper un nom inexistant → « Créer la playlist … » → créée + chanson ajoutée). Même pattern UX que le « créer un sujet à la volée » du sélecteur d'entrée (8.2). À cadrer : emplacement dans `SongForm` (une section playlists ?), création + ajout en une action, lien `playlist_songs` (FK 5.7), feedback. [Songs.tsx/SongForm, MyPlaylistsPage, playlistcontroller]

### 🐛 Navigation clavier comboboxes — ✅ RÉSOLU (2026-06-28, mergé en prod v1.8.0, ex-branche `fix/songform-combobox-keyboard`)
> Diagnostic affiné : les champs réellement cassés étaient **Genre, Languages et le Playlist picker** (aucun `onKeyDown` → flèches mortes + Entrée soumettait le form) ; artiste/album avaient déjà la nav clavier. Au-delà du bug initial, mise à niveau **des 6 comboboxes** sur un util partagé : nav clavier (flèches + Entrée sélectionne sans soumettre + Échap), scroll-into-view de l'option active, **état actif unifié souris/clavier** (un seul surlignage), **ARIA combobox éditable** (`aria-activedescendant`/`role`/`aria-selected`), options **hors tab-order** (`tabIndex=-1`) et **Tab ferme la liste net**. 286 tests front verts. [src/utils/comboboxKeyboard.ts, SongForm.tsx, Songs.tsx, MySessionsPage.tsx]

## Deferred from: code review of story-10.2 (2026-06-28)

> Review adversariale 3 couches. 1 bug HIGH corrigé (reseed clobber), 1 Med corrigé (filtre non trimmé). 2 reports :

- ~~**10-2 — Pas de garde anti-double-soumission sur `handleCreatePlaylist`**~~ — ✅ **RÉSOLU (lot petits-reports 2026-06-30, branche `fix/petits-reports-2026-06-30`)** : flag in-flight `creatingPlaylistRef` (miroir de `savingRef`), early-return si en vol, relâche en `finally` → un seul `createPlaylist` quel que soit le nombre de clics. Test no-op ajouté. [`src/pages/Songs.tsx` handleCreatePlaylist]
- **10-2 — Empty-state « No playlists found » trompeur** : taper le nom exact d'une playlist déjà sélectionnée cache l'option Create (correct) mais `filteredPlaylists` (exclut les sélectionnées) est vide → libellé « No playlists found » alors qu'elle existe et est cochée. Cosmétique. [`src/pages/Songs.tsx` picker empty-state]

## Deferred from: code review of story-12.1 (2026-06-29)

> Review 3 couches. Sécurité validée (pas de session sur token consommé, pas d'oracle). 2 patches appliqués (CTA loggé + test stale). 1 report :

- ~~**12-1 — Flux change-email (jumeau) garde le souci 2e-appareil**~~ — ✅ **RÉSOLU (lot petits-reports 2026-06-30, branche `fix/petits-reports-2026-06-30`)** : `confirmEmailChange` a désormais le fallback `findConsumedToken` (miroir 12.1) ; sur un lien consommé dont le changement a réussi (`user.email === payload.pendingEmail`), renvoie `200 { alreadyChanged }` SANS ré-ouvrir de session ni re-switcher → front « Email already updated / sign in ». `findConsumedToken` retourne le `payload`. Garde anti-faux-positif (consume-ok/switch-ko → 400). Review 3 couches OK. [`backend/controllers/usercontroller.js` confirmEmailChange + `src/pages/VerifyEmailPage.tsx`]
  - ⏳ **Résidu reporté (review 2026-06-30, beta)** : closure `isAuthenticated` périmée dans `VerifyEmailPage` (`AuthProvider` hydrate l'user dans un `useEffect` qui tourne après l'effet de montage de l'enfant) → un user **loggé dans le même navigateur** qui re-clique un lien change consommé voit « Sign in » au lieu de « Go to the app », et l'email caché n'est pas rafraîchi avant reload. Racine **pré-existante** (7.11), **UX-only**, étroit. Fix propre = gater l'effet sur `!loading` ou lire l'auth en lazy. [`src/pages/VerifyEmailPage.tsx` branche change-email, `src/contexts/AuthProvider.tsx`]
  - ⏳ **Résidu reporté (review 2026-06-30, beta)** : confirm **concurrent** du même token valide (2 clics cross-device dans la ms entre le consume du gagnant et son `User.update`) → le perdant lit `email` encore ancien → 400 au lieu de « already updated ». Transitoire, rarissime à l'échelle mono-user. Fix éventuel : transaction consume+update. [`backend/controllers/usercontroller.js` confirmEmailChange]

## Deferred from: code review of story-13.1 (2026-06-29)

> Review 3 couches sur l'auto-save. 1 HIGH (clobber lastPlayed) + 5 Med corrigés. 3 reports :

- **13-1 — Doublon résolu sans édition du form** : si le jumeau d'un titre dupliqué est supprimé ailleurs, `liveDuplicate` repasse à null mais l'effet d'auto-save (deps `[form, editingUid, editBaselineJson]`) ne re-tourne pas → le titre tapé (corrigé) n'est pas réécrit. Rarissime à l'échelle mono-user. [`src/pages/Songs.tsx` autoSaveSong/effet debounce]
- ~~**13-1 — Warning doublon = bannière, pas ✗ discret**~~ — 🚫 **CLOS PAR DÉCISION (northwood, 2026-06-30)** : la bannière ambre convient dans les deux modes (création **et** édition) ; le « ✗ discret » de l'AC8 n'est pas souhaité. Pas de code. [`src/components/SongForm.tsx:353-371`]
- **13-1 — Seed playlist vs toggle avant chargement** : toggler une playlist avant que `playlists` ait chargé peut être clobbé par le re-seed (`seededPlaylistsForEditRef` ne verrouille qu'une fois `playlists.length > 0`). Pré-existant (Epic 10). [`src/pages/Songs.tsx` effet de seed]

## Deferred from: code review of story-11.1 (2026-06-28)

> Review 3 couches. 2 patches appliqués (garde gating `app.listen` ; requête `pg_indexes` qualifiée). 1 report :

- **11-1 — CMD Docker dev en shell-form → SIGTERM non transmis à nodemon** : `CMD npx sequelize-cli db:migrate && npm run dev` tourne sous `/bin/sh -c` (PID 1 = sh, ne forwarde pas SIGTERM) → `docker stop` attend ~10 s puis SIGKILL, pas d'arrêt gracieux du conteneur dev. **Pré-existant** (l'ancien `CMD npm run dev` était déjà shell-form) ; **dev-only** (prod = exec-form `["node","server.js"]`). À durcir avec une exec-form + `exec` si ça gêne. [`backend/Dockerfile:14`]

## Deferred from: code review of story-10.1 (2026-06-28)

> Review adversariale 3 couches (Blind / Edge / Auditor). Aucun bloquant, les 6 AC satisfaites. 2 patches appliqués dans la story ; 1 report :

- ~~**10-1 — Pas de hook `afterSync` de parité sur Playlist**~~ — ✅ **RÉSOLU par Epic 11 (11.1)** : la garde fail-fast de boot couvre topics **et** playlists ; pas de hook ajouté. Cf. « Lot parité-sync » ci-dessus.

## Deferred from: code review of 7-12 + 7-13 (2026-06-28)

> Issus de la review adversariale 3 couches. Aucun bloquant — tous les AC des deux stories sont satisfaits. Items reportés (les findings `decision`/`patch` restent dans les stories) :

- ~~**7-12 — Hook `afterSync` duplique la migration**~~ — ✅ **RÉSOLU par Epic 11 (11.1)** : le hook `afterSync` a été **retiré** de `topic.js` (fin de la SQL dupliquée) ; remplacé par la garde fail-fast de boot. Cf. « Lot parité-sync » ci-dessus.
- **7-12 — Migration hardcode `public.unaccent`** : `'public.unaccent'::regdictionary` casse si l'extension est installée dans un schéma `extensions` dédié (PG managé). Prod actuelle OK (citext 7.2 déjà dans `public`), mais hypothèse d'environnement non gardée. [`backend/migrations/20260625000000-topics-name-ci-unaccent.js:84`]
- **7-12 — Tests collision casse/accent tautologiques** : mockent `Topic.create` → testent le mapping 23505→409, pas le folding réel (validé seulement par migration locale). Le projet mocke les modèles, donc un vrai test de folding demanderait une DB. [`backend/__tests__/topiccontroller.test.js:13-26`]
- ~~**7-13 — Token consommé sur 2e device → « invalid/expired » malgré succès**~~ — ✅ **RÉSOLU par Epic 12 (12-1)** (= prio 1 ci-dessus). Le backend distingue désormais consommé-valide (`alreadyVerified`) d'invalide.
- **7-13 — Oracle de timing sur `resendVerificationPublic`** : l'envoi email n'est awaité (avant `res.json`) que sur la branche existant-non-vérifié → la latence distingue « compte non vérifié » de « inconnu/vérifié » malgré le body uniforme. Même résidu accepté que `forgotPassword`. [`backend/controllers/usercontroller.js:260-279`]
- ~~**7-13 — UI vérif Login/Register sans test front**~~ — ✅ **RÉSOLU par Epic 12 (12-1)** (= prio 2 ci-dessus). `LoginPage.test.tsx` + `RegisterPage.test.tsx` couvrent `needsVerification` et Resend.

---

## 💭 À brainstormer

- ~~**Auto-save de la fiche chanson**~~ — ✅ **RÉSOLU (Epic 13, story 13-1, `done`)** : brainstorm tenu le 2026-06-29 puis story livrée (debounce + flush au blur, `lastPlayed` exclu, statut « Saving/Saved », sticky Back). Review 3 couches (1 HIGH + 5 Med corrigés). Reports résiduels → section review 13-1 ci-dessous.
- **Vraie landing page non-connecté** (note 2026-06-29) : aujourd'hui la HomePage déconnectée = logo + pitch d'une ligne. À cadrer : une vraie page qui **explique le projet et donne envie de s'inscrire** — sections valeur/features (suivi songs, tempos, tonalités, heatmap de pratique, playlists), visuels/captures, social proof éventuel, CTA répétés. Sujet produit + design avant code. Englobe le placement des CTA _Create account_ / _Sign in_ (cf. item « Header non connecté qui déborde sur mobile »). [`src/App.tsx` HomePage → probablement une vraie page `LandingPage.tsx`]
- **A5 (rétro Epic 7) — signal UX du rate-limit légitime** : un user légitime rate-limité (login, resend…) reçoit un `429 detail-free` volontaire (choix anti-oracle 7.4) → l'UI ressemble à une erreur normale, c'est confus. À cadrer : peut-on donner un indice minimal (« trop de tentatives, réessaie plus tard ») **après authentification réussie** ou sur un canal qui ne crée pas d'oracle d'énumération, sans affaiblir l'anti-bruteforce ?

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

- ~~**Invalider les tokens `change_email` périmés à chaque nouvelle demande**~~ — ✅ **RÉSOLU (lot petits-reports 2026-06-30, branche `fix/petits-reports-2026-06-30`)** : `authTokenService.invalidatePendingTokens(uid, 'change_email')` (`update {usedAt} where {userUid,type,usedAt:null}`) appelé dans `requestEmailChange`. **Affiné en review** : couplé à l'émission (dans `!taken`, avant `issueAndSend`) → une demande vers une adresse **prise** ne tue plus un lien valide précédent sans le remplacer. Review 3 couches OK. [accountcontroller.js + authTokenService.js]

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
