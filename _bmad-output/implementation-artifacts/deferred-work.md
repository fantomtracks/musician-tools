# Deferred Work

> **Rituel (acté rétro Epic 8, 2026-06-21)** : ce fichier passe en revue **avant le démarrage de chaque nouvelle epic**. Chaque item est tranché — _fix maintenant_ / _story planifiée_ / _gardé-avec-raison_ / _tué_. Il ne doit jamais redevenir un cimetière. Dernière passe : **2026-07-24 (post-Epic 21 mergé v2, pré-nouvelle epic)** — **7 items barrés (rattrapage : livrés mais jamais cochés)** : cluster « composants partagés Catalog↔Songlist » réellement résorbé — `useAutosave` (19.7), `useRowSelection` (19.9), `StickyActionBar` (19.10), `AutocompleteInput` (19.11) — normalisation saisie `language`/`bpm`/`pitchStandard` au Catalog (19.8), et **filtres Catalog à facettes/pills** (`a328aeb`, polish 19.3 — le bug casse/accent était déjà résolu par construction ; vérifié contre le code, pas seulement supposé) ; **3 correctifs QA Epic 21 déjà soldés** (flush autosave avant refresh, `normalizeMode`+backfill, `ConfirmDialog` en portail plein écran) ; **items OUVERTS restants** = un lot durcissement 500→4xx curateur-only (name non-string/>255, TOCTOU add-to-collection, resolveMirrorPlaylist) **gardés-avec-raison** (mono-user beta, surface curateur), + banner dup « already exists » stale (UX-LOW), + **db-restore** (action item rétro Epic 19/20 **toujours en attente**) ; tout le bloc pré-existant § 🧊 re-confirmé gardé (mono-user beta). Passe précédente : **2026-07-16 (pré-nouvelle epic v2, post-19.6)** — cluster « composants partagés Catalog↔Songlist » (hook autosave, multi-select, sticky, combobox) **⬆️ PROMU → story de refacto `19-7`** (résorbe la divergence qui a mordu en 19.6 → 4 patches) ; normalisation saisie (`language` non normalisé, `bpm`/`pitchStandard` non bornés, app-wide Song+Catalog) **⬆️ PROMU → story `19-8`** ; dup-check exact `(title,artist)` **foldé dans 19-7** ; **nouvel epic « lien fiche Catalog ↔ Song copiée » à cadrer** (après 19-7/19-8) ; tout le pré-existant non-Catalog (18.x error-boundary, 17.x, 16.1, 13.1, 11.1, 7.x, 14.x, 15.1 + bloc 🧊) **re-confirmé gardé-avec-raison** (mono-user beta) ; rien à fixer en urgence. Passe précédente : **2026-07-12 (pré-nouvelle epic, post-Epic 18)** — **2 items barrés** : « fiche chanson = vraie route » (livré Epic 18 / 18.1+18.2) et « back-button non gardé » (résolu Epic 18 / 18.2) ; les **4 nouveaux reports review 17.1 / 17.2 / 18.1** (409 mappé sur `error.name`, `toLowerCase()`≠SQL `lower()`, `beforeunload` draft add <1,2 s, error-boundary router non-brandée, wiring data-router non testé) **tranchés → gardés-avec-raison** (non-bloquants : latents sans trigger actuel, cosmétiques, ou couverts par tsc+QA ; mono-user beta) ; résidus 15.1 (register sans garde 429, a11y erreurs rouges) + tout le bloc § 🧊 **re-confirmés gardés** (mono-user beta) ; **1 item promu** : **« vraie landing page non-connecté »** sortie du deferred-work → **PRD backlog « Exclu (itérations futures) »**, séquencée **après le Catalog** (décision northwood : bâtir la vitrine quand il y a de la matière à montrer) ; **error-boundary router brandée** (`errorElement`, deferred 18.1) notée comme **quick-win possible à folder dans l'epic landing OU story polish** ; rien à fixer en urgence. Passe précédente : 2026-07-10 (pré-nouvelle epic, post-Epic 16) — 3 items soldés (artiste non-trimmé → 16.1, tuning basse → 16.2, oracle timing → 15.2), lot UX/UI mobile barré (Epic 14), report 16.1 titre legacy tout-espaces → gardé, rien promu. Avant : 2026-07-05 (post-rétro Epic 15 — A5 marqué résolu, livré Epic 15) ; 2026-07-05 (post-rétro Epic 14 — A5 promu, devenu Epic 15) ; 2026-07-04 (lot UX/UI mobile promu → Epic 14).

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
>
> ⬆️ **PROMU → Epic 14 « Confort mobile » (revue 2026-07-04, option 1 tranchée ; cadré `bmad-ux` + découpé `bmad-create-epics-and-stories`)**. Cadrage UX : `planning-artifacts/ux-designs/ux-musician-tools-2026-07-04/` (DESIGN.md + EXPERIENCE.md, status:final). Stories (dans `epics.md`) :
> - **14.1** favicon produit (quick-win)
> - **14.2** header overflow non-connecté (fix tactique : retirer/relayer les CTA _Sign in_ / _Create account_ ; V1 sobre)
> - **14.3** Songlist responsive (D2 tableau cap 65vh + en-tête sticky · D3 disclosure filtres <lg + compteur · D4 `min-w-0` + scroll horizontal)
> - **14.4** SongForm mobile (D8 `grid-cols-1 sm:grid-cols-3` + audit save-bar/playlist picker)
>
> La **vraie landing page** reste un sujet produit séparé (cf. § À brainstormer), **non incluse** dans cette epic.

- ~~**Changer le favicon**~~ (✅ Epic 14 / 14-1) : le favicon par défaut est encore en place, à remplacer par une icône propre au produit.
- ~~**Header non connecté qui déborde sur mobile**~~ (✅ Epic 14 / 14-2) : sur iPhone 13 (390px) les boutons _Sign in_ / _Create account_ sont posés directement dans la barre du header (pas de hamburger en non-connecté) → ils débordent à côté du titre + toggle dark. Piste explorée : **retirer ces boutons du header** en non-connecté et porter les CTA _Create account_ / _Sign in_ **dans la HomePage** (avec un padding pour ne pas coller au footer). ⚠️ Impacte `Header.test.tsx` (test « unauthenticated … sign-in actions remain » à inverser). [`src/App.tsx` HomePage, `src/components/Header.tsx`]
- ~~**Songlist (page Songs) responsive mobile**~~ (✅ Epic 14 / 14-3 + 14-4) : pouvoir **scroller verticalement à l'intérieur du tableau des chansons** (au lieu d'allonger toute la page), et empêcher les autres blocs (recherche, filtres, sidebar) de **déborder** en largeur. Pistes explorées : `min-w-0` sur la colonne contenu (gotcha flexbox), conteneur tableau en `overflow-auto` + `max-h-[~70vh]`, en-tête de tableau `sticky`. À cadrer : hauteur cible (vh fixe vs lock plein écran avec seul le tableau scrollable), comportement sidebar filtres empilée sur mobile. [`src/components/SongsList.tsx`, `SongsSidebar.tsx`]

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

## Deferred from: code review of story-18.1 (2026-07-11)

> Review 3 couches. Acceptance Auditor 4/4 ACs, 0 violation. Edge Case Hunter (accès projet) : migration fidèle, 7 frontières confirmées équivalentes, aucun bug. 1 patch (commentaires) appliqué, 2 defer :

- **18-1 — Le data-router installe une error boundary par défaut (non brandée)** : une erreur de rendu d'une page routée affiche désormais la page d'erreur générique de react-router (« Unexpected Application Error! », non stylée, remplace le chrome) là où `<BrowserRouter>` laissait un écran blanc. **Amélioration de facto** mais changement vs « zéro comportement » et non-brandé. Candidat : un `errorElement` brandé sur la route racine (nouveau périmètre — l'app n'avait aucune UI d'erreur avant ; à faire en 18.2 ou suite). 🧊 **Gardé-avec-raison** (non bloquant, plutôt une amélioration). [`src/router.tsx` route racine]
- **18-1 — Wiring data-router + gate loading + ancêtre LeaveGuardProvider non couverts par un test** : `createMemoryRouter`/`RouterProvider` exigent les primitives Fetch (`Request`) absentes de jsdom → le smoke test passe par `useRoutes` (arbre de routes seulement) et mocke `RootLayout`. Le code de prod est **vérifié correct** par la review. Un vrai test du data-router demanderait un polyfill Fetch (nouvelle dép). 🧊 **Gardé-avec-raison** — couvert par tsc + QA manuelle ; à revisiter si on ajoute un polyfill Fetch au socle de test. [`src/__tests__/router.test.tsx`]

## Deferred from: code review of story-17.2 (2026-07-11)

> Review 3 couches. Acceptance Auditor : tous les volets OK. 1 HIGH + 3 patches appliqués ; Edge Case Hunter a réfuté 2 « High » du Blind (faux positifs). 2 defer :

- **17-2 — `beforeunload` ne couvre pas un draft add titré-mais-pas-encore-créé** (fenêtre < 1.2s avant le premier CREATE) : refresh/fermeture d'onglet dans cette fenêtre perd la saisie sans prompt natif (le guard `beforeunload` early-return quand `editingUid === null`). 🧊 **Gardé-avec-raison** : cohérent avec le modèle auto-save (rien n'est persisté avant le débounce), fenêtre marginale, mono-user beta. [`src/pages/Songs.tsx` effet beforeunload]
- ~~**17-2 — Bouton back navigateur / popstate non gardé par le guard de nav**~~ — ✅ **RÉSOLU (Epic 18, 18.2)** : la migration data-router + `useBlocker` garde désormais le back-button/popstate comme toute autre sortie (le guard maison a été remplacé). [`src/pages/Songs.tsx` useBlocker]

## Deferred from: code review of story-17.1 (2026-07-10)

> Review 3 couches (Blind / Edge Case / Acceptance). **Acceptance Auditor : 0 violation** (7/7 ACs + 4 décisions verrouillées). Aucun High. Migration validée sur base dev (merge réel + rejet 23505 + idempotence). 1 patch appliqué (tests renforcés), 2 defer :

- **17-1 — Le 409 doublon est mappé sur `error.name` seul, pas sur le nom de contrainte** : `respondDuplicateSong` mappe tout `SequelizeUniqueConstraintError` en `{ error: 'duplicate_song' }` sans vérifier `error.parent.constraint === 'songs_user_uid_title_artist_ci'`. **Aucun trigger actuel** (seuls la PK et le nouvel index sont uniques sur `Songs` ; une collision de PK est inatteignable via `UUIDV4`) et **cohérent avec le mirror** `topiccontroller`/`playlistcontroller` (qui keyent aussi sur `error.name`). 🧊 **Gardé-avec-raison** — à revisiter **si** un 2e index unique atterrit un jour sur `Songs` (alors gater sur le nom de contrainte). [`backend/controllers/songcontroller.js` respondDuplicateSong]
- **17-1 — JS `toLowerCase()` ≠ SQL `lower()` pour la casse locale (Turkish-i, Unicode)** : pour un doublon dont le titre/artiste folde différemment en V8 vs Postgres, l'index **rejette bien** la collision (23505, unicité intacte) mais le lookup d'enrichissement renvoie `song: null` → le front 17.2 ne pourra pas pointer la chanson existante pour ces entrées exotiques. Impact **purement cosmétique** (enrichissement du 409) ; **même folding client-side que 7.12/10.1** ; mono-user beta. 🧊 **Gardé-avec-raison.** [`backend/controllers/songcontroller.js` findExistingByTitleArtist]

## Deferred from: code review of story-16.1 (2026-07-09)

> Review 3 couches. 9/9 ACs + 5/5 invariants OK, aucun scope creep. 1 décision (trim JS/SQL), 2 patches (à trancher), 1 report :

- **16-1 — Titre legacy tout-espaces → `''` par la migration de nettoyage** : `trim('   ')=''` ; une ligne pré-existante au titre tout-espaces (ASCII) devient `title=''` (valide sous NOT NULL, mais que `createSong` refuserait en 400). Donnée **déjà invalide** avant la migration (l'ancien `if(!title)` acceptait un titre truthy tout-espaces) ; la story ne visait que le dédoublonnage d'espaces, pas la réparation des titres vides. Pré-existant, hors périmètre. Fix éventuel : un balayage dédié des titres vides/blancs (produit : que faire d'une chanson sans titre ?), pas un patch de cette migration. [`backend/migrations/20260709000000-trim-song-text-fields.js` UPDATE title] — 🧊 **Tranché passe 2026-07-10 : gardé-avec-raison** (pré-existant, hors périmètre 16.1, mono-user beta ; un vrai balayage des titres vides serait une story produit dédiée si le cas se présente).

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
- ~~**13-1 — Politique doublon « freeze identité, sauve le reste » (décision 🅰️)**~~ — 🔁 **RÉVISÉE par Epic 17 / 17.2 (2026-07-10)** : la décision 🅰️ (sur collision en **édition**, retirer `title`/`artist` du payload mais continuer à sauver les autres champs) est **abandonnée**. 17.2 pose une **politique doublon unique dans toute l'app** : sur collision (titre+artiste, garde client `findDuplicateSong` OU backstop 409 serveur 17.1), **aucune persistance** — ni création ni update, ni identité ni autres champs — bannière « not saved — already exists » (statut `conflict`), jusqu'à différenciation. Bloquer = refuser d'écrire, jamais supprimer/corrompre. [`src/pages/Songs.tsx` autoSaveSong]
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
- ~~**7-13 — Oracle de timing sur `resendVerificationPublic`**~~ — ✅ **RÉSOLU (Epic 15, story 15-2, `done`)** : latence égalisée sur `resendVerificationPublic` **ET** `forgotPassword` (fire-and-forget anti-timing), corps de réponse uniformes préservés ; couvre NFR-S4. [`backend/controllers/usercontroller.js`]
- ~~**7-13 — UI vérif Login/Register sans test front**~~ — ✅ **RÉSOLU par Epic 12 (12-1)** (= prio 2 ci-dessus). `LoginPage.test.tsx` + `RegisterPage.test.tsx` couvrent `needsVerification` et Resend.

---

## 💭 À brainstormer

- ~~**Fiche chanson = vraie route (`/songs/:uid`)**~~ — ✅ **LIVRÉ (Epic 18, 18.1 migration data-router + 18.2 route-ify + `useBlocker`, mergé main… à pousser)** : `/songs` · `/songs/new` · `/songs/:uid` (editingUid dérivé de l'URL) ; refresh reste sur la chanson ; **back-button navigateur gardé** par `useBlocker` ; **guard maison 17.2 supprimé** (`LeaveGuardContext`/`Provider`/`GuardedLink` supprimés) ; deep-link 404 scopé (7.5). Ferme les 3 symptômes + la dette du guard. _Cadrage ADR ci-dessous conservé pour provenance._ — ⬆️ **CADRÉ EN ADR (2026-07-11)** : `_bmad-output/planning-artifacts/architecture-song-route-2026-07-11.md`. Décision northwood : **migrer vers data-router** (`createBrowserRouter`/`RouterProvider`) → débloque `useBlocker` → **supprime le guard maison 17.2** + ferme refresh + back-button. Découpage : **Epic 18, 2 stories** (1 migration data-router pure sans changement de comportement ; 2 route-ify le form `/songs/new` + `/songs/:uid` + swap guard→`useBlocker`). **Prochaine étape : `bmad-create-epics-and-stories`.** _Cadrage initial ci-dessous conservé pour provenance._ (signalé northwood 2026-07-11, QA 17.2) : aujourd'hui l'ouverture d'une chanson n'est qu'un état local dans la route `/songs` → **rafraîchir la page pendant qu'on est sur une chanson renvoie à la songlist** (l'`editingUid`/`page:'form'` n'est pas dans l'URL). Pré-existant (déjà le cas depuis 13.1), pas une régression 17.2. 🔗 **Synergie forte** : router-ifier le formulaire (route `/songs/:uid`, ou migrer `main.tsx` vers `createBrowserRouter`/data-router) fermerait **3 items d'un coup** — (a) ce refresh-persistence, (b) le **back navigateur non gardé** (deferred 17.2 : `useBlocker` deviendrait dispo), (c) le `useBlocker` indisponible du guard de nav (deferred 17.2). Sujet **archi routing** (chemin sensible, touche toute la nav) → cadrage design-avant-code. [`src/main.tsx` BrowserRouter, `src/App.tsx` routes, `src/pages/Songs.tsx` `page`/`editingUid`]
- ~~**Auto-save de la fiche chanson**~~ — ✅ **RÉSOLU (Epic 13, story 13-1, `done`)** : brainstorm tenu le 2026-06-29 puis story livrée (debounce + flush au blur, `lastPlayed` exclu, statut « Saving/Saved », sticky Back). Review 3 couches (1 HIGH + 5 Med corrigés). Reports résiduels → section review 13-1 ci-dessous.
- ~~**Vraie landing page non-connecté**~~ — ⬆️ **PROMU → PRD backlog « Exclu (itérations futures) » (2026-07-12)**, séquencée **après le Catalog** (collection partagée de chansons) : décision northwood — attendre d'avoir de la matière à montrer avant de bâtir la vitrine. Sujet produit + design-avant-code → brainstorm/UX quand le Catalog sera en place. _Cadrage initial conservé pour provenance._ (note 2026-06-29) : aujourd'hui la HomePage déconnectée = logo + pitch d'une ligne. À cadrer : une vraie page qui **explique le projet et donne envie de s'inscrire** — sections valeur/features (suivi songs, tempos, tonalités, heatmap de pratique, playlists), visuels/captures, social proof éventuel, CTA répétés. Englobe le placement des CTA _Create account_ / _Sign in_ (cf. item « Header non connecté qui déborde sur mobile »). [`src/App.tsx` HomePage → probablement une vraie page `LandingPage.tsx`]
- ~~**🐛 Nom d'artiste non trimmé → doublons en prod**~~ — ✅ **LIVRÉ (Epic 16, story 16-1, `done`, mergé main v1.11.0)** : trim `artist`/`album`/`title` au create+update (helper `normalizeText`) + migration idempotente `20260709000000` de nettoyage. Review 3 couches OK (9/9 ACs). _Cadrage ci-dessous conservé pour provenance._ (VRAI BUG signalé northwood 2026-07-05 : « michael jackson » vs « michael jackson  » avec espace final) : `artist` (et `album`, `title`) sont stockés **verbatim** depuis `req.body` **sans `.trim()`** (`songcontroller.js` createSong ~134 / updateSong ~187), contrairement à `language`/`instrumentType` qui le sont. Un espace en fin de saisie crée une valeur distincte → 2 « artistes » dans la liste des distincts (suggestions/filtres). **Pas 🧊 — à corriger.** Deux volets : **(1) saisie** — `.trim()` sur `artist`/`album`/`title` au create + update (trivial, miroir du trim `language`) ; **(2) données prod existantes** — migration **idempotente** one-off `UPDATE "Songs" SET artist = TRIM(artist) WHERE artist <> TRIM(artist)` (idem album/title) pour collapser les doublons déjà en base (artist étant une string libre par chanson, trimmer suffit — pas de merge FK). ⚠️ Toute migration part en prod → tester en local avant merge. [`backend/controllers/songcontroller.js` createSong ~110-134 / updateSong ~171-187 + nouvelle migration `backend/migrations/`]
- **Auto-création du formulaire « nouvelle chanson » — retirer le bouton `Add` (suite Epic 13)** — ⬆️ **PROMU → Epic 17 (cadré 2026-07-10, `epics.md § Epic 17`, backlog)** : stories 17.1 unicité chanson serveur (merge FK ciblé + index unique + 409) → 17.2 auto-création front + blocage doublon symétrique. Issu du brainstorm `_bmad-output/brainstorming/brainstorming-session-2026-07-10-0810.md` (First Principles + Reverse Brainstorming, 14 décisions verrouillées). **3 décisions ouvertes tranchées northwood 2026-07-10** : clé doublon **casse-insensible** ; **interroger la prod d'abord** avant de dimensionner le merge FK ; **blocage doublon symétrique** (durcit 13.1 : la décision du 30/06 « prévient mais sauve » devient « bloque » **aussi en édition** — AC dédiée en 17.2). ⚠️ 17.1 rouvre le merge FK esquivé par 16.1 ; ferme l'item 🧊 course find-or-create chansons. _Cadrage brainstorm conservé ci-dessous pour provenance._ Design tranché : titre = identité (artiste facultatif) ; création au débounce (calque 13.1) ; anti-vide par régimes (Seuil 1) ; popup titre-vide à la navigation ; bascule add→edit invisible + verrou in-flight ; **doublon = clé (titre+artiste), blocage symétrique création+édition (durcit 13.1) + garde serveur (index unique + 409, mirror 10.1)**. ⚠️ Périmètre à ne pas cacher : revisite la décision 13.1 du 30/06 (« prévient mais sauve » → « bloque »), rouvre le merge FK esquivé par 16.1 (interroger la prod d'abord), casse-insensible à confirmer, ferme la course find-or-create chansons (item 🧊). _Cadrage initial NON-PROMU du 2026-07-09 conservé pour provenance ci-dessous._ (demandé northwood, 2026-07-05) : l'auto-save 13.1 est **édition-only** ; la **création** garde un bouton `Add` explicite (`SongForm.tsx:835-853`, mode `add` = submit qui **crée** la chanson). northwood veut la création **sans bouton**, cohérente avec l'édition. ⚠️ **Retirer `Add` tel quel casse la création** (plus aucune soumission) → il faut **étendre l'auto-save/auto-création au mode `add`**. À cadrer AVANT code (mirror du brainstorm 13.1) : **(a)** déclencheur de création (titre non vide ? autre champ requis ?) ; **(b)** ne **pas** créer de chanson vide si on quitte sans rien taper ; **(c)** transition `add → edit` (récupérer l'UID créé, l'auto-save 13.1 prend le relais, MAJ URL/state). Petit sujet mais design-avant-code. [`src/components/SongForm.tsx` bas de form mode `add`, `src/pages/Songs.tsx` flux create/onSubmit]
- ~~**Tuning basse demi-ton en dessous (`Eb Ab Db Gb`) manquant**~~ — ✅ **LIVRÉ (Epic 16, story 16-2, `done`, mergé main v1.11.0)** : ajout `EbAbDbGb` (4c) **ET** `BbEbAbDbGb` (5c) « Half-step down » au bloc Bass (décision northwood : les deux, parité guitare). Additif pur, review clean (0 finding). _Cadrage ci-dessous conservé pour provenance._ (demandé northwood, 2026-07-05) : ajouter l'option de tuning **`EbAbDbGb` (Half-step down)** pour la **Bass** (4-cordes) dans `instrumentTuningsMap` — la guitare a déjà son demi-ton (`EbAbDbGbBbEb`), mais la basse n'a que EADG / BEADG / BEADGC / DADG. **Quick-win** (aucun cadrage, aucun impact modèle — juste une option d'affichage). [`src/constants/instrumentTypes.ts` bloc `Bass` ~45-51]
- ~~**A5 (rétro Epic 7) — signal UX du rate-limit légitime**~~ — ✅ **RÉSOLU (Epic 15 : stories 15.1 signal UX 429 + 15.2 oracle de timing, `done` 2026-07-05 ; couvre NFR-S1 + NFR-S4).** _Cadrage conservé pour provenance :_ un user légitime rate-limité (login, resend…) reçoit un `429 detail-free` volontaire (choix anti-oracle 7.4) → l'UI ressemble à une erreur normale, c'est confus. À cadrer : peut-on donner un indice minimal (« trop de tentatives, réessaie plus tard ») **après authentification réussie** ou sur un canal qui ne crée pas d'oracle d'énumération, sans affaiblir l'anti-bruteforce ?
  - 🔗 **Rattaché à cette epic (décision 2026-07-05) : le résidu 7-13 « oracle de timing `resendVerificationPublic` »** (l'envoi email n'est awaité que sur la branche existant-non-vérifié → la latence distingue les cas malgré le body uniforme ; même famille que `forgotPassword`). Même tension anti-oracle que A5 → à traiter dans le même cadrage sécu/UX du rate-limit + anti-énumération. [`backend/controllers/usercontroller.js:260-279`]
  - Petit epic, **sécu-sensible** : cadrage archi/sécu (comment donner l'indice sans rouvrir d'oracle) **avant** d'écrire les stories.
  - ✅ **CADRAGE VERROUILLÉ (2026-07-05)** — insight clé : améliorer le message 429 est du **pur UX sans coût sécu** (le 429 est déjà observable ; il ne révèle pas l'existence d'un compte ; le seul secret à garder = `Retry-After`/fenêtre exacte, qui aide au *pacing*). État actuel : `createError(429)` → body `{message:"Too Many Requests"}` **remonte déjà brut** à l'écran via `authService throw new Error(body.message)`, dans le même slot que « Invalid credentials ». Décisions tranchées :
    - **15.1 Signal UX 429** : détecter le 429 par `response.status` (pas `body.message`), mapper à un message clair **traduit** (site EN → « Too many attempts. Please try again in a few minutes. »), le distinguer visuellement, sur login / forgot-password / resend / change-password / change-email. **Rester detail-free** : message *qualitatif*, aucun `Retry-After`/compte à rebours. Surfacé **inline au point d'échec** (pas de report post-auth — inutile, l'inline ne fuite rien).
    - **15.2 Oracle de timing** : égaliser la latence de `resendVerificationPublic` **ET `forgotPassword`** (même résidu accepté, même famille anti-énum) pour que toutes les branches répondent en ~même temps (fire-and-forget ou await sur toutes les branches). [`backend/controllers/usercontroller.js` resendVerificationPublic ~260-279 + forgotPassword]
    - **Next : `bmad-create-epics-and-stories`** (Epic 15 + 2 stories) puis cycle create-story → dev-story. Fichiers de réf : `backend/middleware/ratelimiters.js`, `src/services/authService.ts`, `src/services/apiFetch.ts`, `src/pages/{Login,ForgotPassword,Register,VerifyEmail}Page.tsx`.

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
- ~~**Index non-unique `users_name` redondant**~~ — ✅ **RÉSOLU (lot ménage dette technique, migration `20260628000000`)**. [migrations Users]
- ~~**Format du discriminator non contraint en DB**~~ — ✅ **RÉSOLU (lot ménage, CHECK `users_discriminator_format` `NOT VALID`, migration `20260628000100`)**. [models/user.js]

## Deferred from: code review of story-7.8 (2026-06-25)

- **Boucle d'attribution de discriminator dupliquée** — la mécanique « essayer un discriminator, retry random sur collision `(name, discriminator)` » existe désormais en double : `usercontroller.createUser` (7.7, sur `User.create`) et `accountcontroller.updateName` (7.8, sur `user.update`). Extraction non triviale (create vs update = opérations différentes) ; envisager un helper d'ordre supérieur `withFreeDiscriminator(fn)` si une 3ᵉ occurrence apparaît. Inoffensif (les deux copies sont testées). [usercontroller.js, accountcontroller.js]

## Deferred from: code review of story-7.11 (2026-06-25)

- ~~**Invalider les tokens `change_email` périmés à chaque nouvelle demande**~~ — ✅ **RÉSOLU (lot petits-reports 2026-06-30, branche `fix/petits-reports-2026-06-30`)** : `authTokenService.invalidatePendingTokens(uid, 'change_email')` (`update {usedAt} where {userUid,type,usedAt:null}`) appelé dans `requestEmailChange`. **Affiné en review** : couplé à l'émission (dans `!taken`, avant `issueAndSend`) → une demande vers une adresse **prise** ne tue plus un lien valide précédent sans le remplacer. Review 3 couches OK. [accountcontroller.js + authTokenService.js]

## Deferred from: code review of story-7.10 (2026-06-25)

- ~~**Validation « nouveau mot de passe » triplée + paire `issueToken+send` (4 occurrences)**~~ — ✅ **RÉSOLU (lot ménage dette technique : `utils/passwordPolicy.validateNewPassword` + `services/authFlows.issueAndSend`)**. [usercontroller.js, accountcontroller.js]

## Deferred from: code review of story-7.5 (2026-06-23)

- ~~**Garde de format UUID incohérente**~~ — ✅ **RÉSOLU (lot ménage dette technique : `backend/utils/uuid.js` partagé, gardes ajoutées song/instrument/playlist ; topic/practicesession basculés dessus)**. [songcontroller, instrumentcontroller, playlistcontroller]

## Deferred from: code review of story-7.3 (2026-06-23)

- ~~**Fixation de session (login/register ne régénèrent pas la session)**~~ — ✅ **RÉSOLU (Durcissement session, v1.6.0 — `sessionService.regenerateSession()` au login ET verify avant de poser `loggedIn`/`user`)**. [backend/controllers/usercontroller.js]
- ~~**`getCsrfToken` sans dé-duplication en vol**~~ — ✅ **RÉSOLU (lot ménage dette technique : promesse `inFlight` partagée)**. [src/services/csrf.ts]
- **`withCsrfHeader` suppose des headers objet simple** — un appelant passant un `Headers` ou un tableau `[[k,v]]` perdrait ses headers (dont `Content-Type`) au spread. Non atteint aujourd'hui (tous les services passent un objet littéral) ; latent. [src/services/apiFetch.ts]

## Deferred from: manual QA of story-7.7 (2026-06-26)

- ~~**Différentiel de comportement register (résidu anti-énumération assumé)**~~ — ✅ **RÉSOLU le 2026-06-26 par la story 7.13** (hard email gate). Register n'auto-connecte plus : email neuf et email existant renvoient désormais la **même** réponse générique `{auth:false, pending:true}` sans session → plus de différentiel observable. La connexion exige la vérification de l'email. [usercontroller.js — voir 7-13-hard-email-verification-gate.md]

## Deferred from: code review of 14-1-favicon-produit (2026-07-04)

- **Favicon SVG-only, sans fallback raster / apple-touch-icon** — `index.html:5` ne déclare qu'un favicon `image/svg+xml`. Contextes sans support du favicon SVG (vieux Safari, bookmark écran d'accueil iOS) n'affichent pas d'icône produit. Pré-existant (l'ancien `vite.svg` était aussi SVG-only) et sanctionné par l'AC2 (SVG seul autorisé) — donc non bloquant. Enhancement futur possible : ajouter `apple-touch-icon.png` (180×180) + éventuel `favicon-32.png` dans `public/` et les déclarer.

## Deferred from: code review of 14-2-header-overflow-non-connecte (2026-07-04)

- **Couplage test↔module — `HomePage` exporté depuis `App.tsx`** — `HomePage.test.tsx` importe `HomePage` via `../App`, ce qui évalue tout le graphe de modules de `App.tsx` (toutes les pages, contexts, Footer) à l'import, juste pour tester un composant. Vert aujourd'hui (aucun effet de bord au chargement ; `tsc -b` exit 0). Fragile à terme : une future page ajoutant un effet de bord au module-load casserait ce test sans rapport. Durcissement optionnel : extraire `HomePage` dans son propre fichier (`src/pages/HomePage.tsx`) et l'importer directement dans App.tsx + le test. Non bloquant, pas de régression actuelle.

## Deferred from: code review of 14-3-songlist-responsive (2026-07-04)

- ~~**En-tête de tableau sticky — fond sur `<thead>` plutôt que sur les cellules `<th>`**~~ — ✅ **CADUC (2026-07-04)** : la décision D2 (cap `max-h-[65vh]` + en-tête `sticky`) a été **retirée lors de la QA manuelle de l'Epic 14** (northwood) — le tableau ne scrolle plus qu'en horizontal (`overflow-x-auto`), la page scrolle verticalement normalement. Plus d'en-tête sticky → ce durcissement n'a plus d'objet.

## Deferred from: code review of 15-1-signal-ux-rate-limit (2026-07-05)

- **`authService.register` sans garde 429 (asymétrie avec `login`)** — `register` utilise un `fetch` brut (comme `login`) mais n'a pas reçu le check `if (response.status === 429) throw new RateLimitError()`. Aujourd'hui `/auth/register` n'a **pas** de limiter → ne peut pas se déclencher. Latent : si un limiter anti-abus est ajouté à register (suite naturelle), le 429 tomberait dans le `throw new Error('Registration failed')` générique en **rouge** au lieu de l'amber rate-limit. Fix trivial le jour où register est rate-limité (1 ligne, miroir de login). Non bloquant, pas de bug actuel. [src/services/authService.ts:51-74]
- **Asymétrie a11y : erreurs rouges sans role live-region** — les nouveaux affichages amber (rate-limit) reçoivent `role="status"` (`aria-live=polite`), mais les erreurs **rouges** credential/champ sur les mêmes éléments n'ont **aucun** role → silencieuses au lecteur d'écran, alors que l'info moins grave (rate-limit) est annoncée. Pattern **pré-existant** (les divs rouges n'ont jamais eu de role) — pas une régression de 15.1. Durcissement optionnel transverse : donner `role="alert"` aux erreurs dures. Non bloquant. [src/pages/{Login,ForgotPassword,Profile}Page.tsx]

## Deferred from: code review of story-19.1 (2026-07-15)

- ~~**[LOW] `language` non normalisé au Catalog**~~ — ✅ **RÉSOLU (19.8)** : `normalizeLanguage` partagé appliqué au Catalog. _(archive)_ — `catalogcontroller.createCatalogEntry`/`updateCatalogEntry` stocke `language` brut, alors que `songcontroller` applique `normalizeLanguage` (array trimmé, title-case). Cosmétique (pas de crash), donnée saisie par le curateur. À traiter dans le form d'admin Catalog (story 19-2) ou en suivi backend. Sans correctif, la valeur brute est copiée 1:1 dans les Songlists perso à l'Add (19-4).

## Deferred from: code review of story-19.2 (2026-07-15)

- ~~**[MED] `bpm` / `pitchStandard` non normalisés côté serveur (Catalog ET Songs)**~~ — ✅ **RÉSOLU (19.8)** : `normalizeInt(min,max)` partagé (reject-to-null), appliqué bpm 1..1000 / pitchStandard 380..500 côté Song ET Catalog. _(archive)_ — `catalogcontroller.pickIntrinsic` (comme `songcontroller.createSong`) passe `bpm`/`pitchStandard` bruts dans les colonnes INTEGER : une valeur négative est persistée telle quelle, un décimal / hors-INT4 lève `SequelizeDatabaseError` → 500. Ce n'est PAS une régression 19.2 (le Song perso a le même comportement depuis toujours), d'où le defer. À traiter **app-wide** (helper `normalizeInt(min,max)` partagé, appliqué à bpm/pitchStandard côté Song ET Catalog) le jour où on durcit la saisie numérique. `durationSeconds` est déjà borné (1..86400) des deux côtés.

## Deferred from: code review of story-19.3 (2026-07-15)

- ✅ **RÉSOLU (2026-07-15, en QA Epic 19)** : facettes + pills livrées — endpoint `GET /api/catalog/facets` (valeurs distinctes genre/key/mode/timeSignature du Catalog) + composant `CatalogFilters` (pills multi-select, valeurs réelles → plus de problème de casse), filtres backend multi-valeurs (`Op.in` scalaires, `Op.or` de `@>` pour genre = match ANY). Front 383✓ back 294✓. _(Item initial ci-dessous, conservé pour provenance.)_
- ~~**[MED] Filtres Catalog en égalité sensible à la casse/aux accents**~~ — ✅ **RÉSOLU (commit `a328aeb`, polish story 19.3)** : endpoint `GET /api/catalog/facets` (valeurs distinctes présentes, published-only hors curateur) + `CatalogFilters` en **pills multi-select** — sélectionner une pill envoie la valeur EXACTE stockée → plus aucun mismatch casse/accent (résolu par construction). _(archive)_ — `catalogcontroller.getCatalogList` filtre `key`/`mode`/`timeSignature` en égalité stricte et `genre` en `Op.contains` JSONB, alors que la recherche titre/artiste est foldée (`f_unaccent`+`lower`). Un utilisateur qui tape « rock » (données « Rock ») ou « em » (données « Em ») dans un filtre obtient 0 résultat silencieusement. Le **vrai fix** = transformer ces filtres texte en **facettes/selects** peuplées des valeurs distinctes réellement présentes au Catalog (`SELECT DISTINCT key/mode/timeSignature`, genres agrégés) — ce qui élimine le problème de casse par construction et améliore l'UX. Plus gros que 19-3 (endpoint de facettes + UI selects). À cadrer en polish Catalog (ou une story dédiée avant l'ouverture large). En attendant, les filtres restent des inputs texte utilitaires (documenté 19-3).

## Deferred from: QA/dev Epic 19 + 19.6 — dette DRY Catalog ↔ Songlist (2026-07-16)

- ~~**[MED] Logique d'autosave dupliquée (Songs.tsx ↔ CatalogAdmin.tsx)**~~ — ✅ **RÉSOLU (19.7)** : hook partagé `useAutosave` extrait, Songs ET CatalogAdmin alignés dessus. _(archive)_ — l'autosave (`saveStatus`/`savingRef`/`creatingRef`/débounce 1200ms/baseline anti-no-op/create-lazy/flush au démontage) est **répliquée** dans `CatalogAdmin.tsx` depuis `Songs.tsx`. La code-review 19.6 a montré le risque concret : la copie avait **divergé** et perdu 4 gardes (F1 conflit surfacé, F2 titre requis, F3 baseline, F4 flush) → 4 patches. **Le vrai fix** = extraire un hook partagé `useAutosave({ save, create, debounceMs })` (statut + refs + baseline + flush) et y **aligner Songs ET Catalog** → une seule source de vérité, plus de divergence. Bloqueur : l'autosave de `Songs.tsx` est entangé dans une page de ~1800 lignes → refacto à cadrer (story dédiée), pas un bricolage. [src/pages/Songs.tsx, src/pages/CatalogAdmin.tsx]
- ~~**[MED] Multi-sélection de liste dupliquée (SongsList.tsx ↔ CatalogManage.tsx)**~~ — ✅ **RÉSOLU (19.9)** : hook partagé `useRowSelection`, Songlist ET Catalog alignés. _(archive)_ — checkboxes + select-all + barre « Delete selected » + clic-ligne-ouvre sont ré-implémentés inline dans `CatalogManage`, calqués sur `SongsList`. Déjà relevé en rétro Epic 19 (motif dupliqué à 2 endroits = signal, cf. rendu session Epic 8/9). Extraire un composant `<MultiSelectTable>`/hook `useRowSelection` partagé, ou assumer explicitement la duplication. [src/components/SongsList.tsx, src/pages/CatalogManage.tsx]
- ~~**[LOW] Barre d'action sticky dupliquée (Songs.tsx ↔ CatalogAdmin.tsx)**~~ — ✅ **RÉSOLU (19.10)** : composant partagé `StickyActionBar`. _(archive)_ — le conteneur sticky (`sticky top-16 z-20 … backdrop-blur border …` + bouton « ← Back to … ») est recopié tel quel. Extraction cheap en `<StickyActionBar>` (conteneur + slot back + slot actions) le jour où un 3ᵉ écran le réutilise. Faible valeur seul. [src/pages/Songs.tsx, src/pages/CatalogAdmin.tsx]
- ~~**[LOW] Autocomplete Catalog en `<datalist>` natif, pas le combobox custom de la Songlist**~~ — ✅ **RÉSOLU (19.11)** : composant partagé `AutocompleteInput` (combobox artiste/album), Catalog aligné. _(archive)_ — les champs Artist/Album du form Catalog utilisent un `<datalist>` HTML natif (menu navigateur) au lieu du combobox stylé de `SongForm` (dropdown + nav clavier + ARIA + `suggestedArtists`/`suggestedAlbums`). Fonctionnellement OK (suggère les valeurs existantes du Catalog, brouillons inclus). northwood valide le natif pour l'instant. À unifier le jour où on extrait le combobox partagé (même famille que la dette multi-select / composants Catalog↔Songlist). [src/pages/CatalogAdmin.tsx, src/components/SongForm.tsx]

## Deferred from: code review of story-19.6 (2ᵉ passe, 2026-07-16)

- ~~**[UX] Dup-check Catalog proactif best-effort (peut rater sur un titre courant)**~~ — **RÉSOLU par story 19-12 (2026-07-16)** : endpoint `GET /api/catalog/exists` (curateur, réutilise `findExistingByTitleArtist`) → le front `checkCatalogExists` fait un check **exact** `(title, artist)` foldé, remplace le `listCatalog`+substring+limit10+fold client. Blocage fiable et immédiat. [src/pages/CatalogAdmin.tsx, backend/controllers/catalogcontroller.js]

## Deferred from: code review of story-19.12 (2026-07-16)

- **[UX-LOW] Banner « already exists » stale sur erreur réseau réelle** — l'effet dup-check du form Catalog fait `.catch(() => { /* leave state as-is */ })` : sur une erreur réseau *réelle* (pas un abort), `dupRef` a déjà repassé `false` en tête d'effet (fail-open) mais `dupMessage` reste affiché → l'UI montre le banner rouge « …already exists… » alors que l'autosave est débloqué. **Pré-existant** (le catch était identique avant 19.12) et **bénin** (l'index unique GLOBAL 409 reste le backstop au save — aucun doublon créé). Amélioration : distinguer `AbortError` du vrai échec (`if (err.name === 'AbortError') return;`) et clear `dupMessage` sur échec réseau réel pour aligner l'UI sur le comportement fail-open. [src/pages/CatalogAdmin.tsx]

## Deferred from: code review of story 20-1 (2026-07-21)

- **[VALIDATION-MED] `name` non-string / >255 → 500 au lieu de 400** — `createCollection`/`updateCollection` valident le nom via `normalizeText` puis `if (!name)`. `normalizeText` laisse les non-strings intacts : `{name: 123}` est persisté en `"123"`, `{name: []}`/`{name: {}}` lèvent une erreur DB → **500** au lieu d'un **400**. Idem pour un nom >255 (colonne `STRING`/VARCHAR(255)). **Pré-existant app-wide** : `createCatalogEntry` et `createSong` ont exactement le même contrat `normalizeText` sur `title`. Le vrai fix (typeof string + borne longueur) appartient au helper partagé `normalizeText`, pas à la story Collections — à trancher app-wide si on durcit la validation d'entrée. Surface curateur uniquement, clients JSON envoient des strings. [backend/controllers/catalogcontroller.js `createCollection`/`updateCollection`, backend/utils/normalize.js `normalizeText`]
- **[ROBUSTNESS-LOW] TOCTOU add-to-collection → 500 au lieu de 404** — `addSongToCollection` vérifie l'existence (Collection + fiche) PUIS `findOrCreate`. Si un autre curateur supprime la collection/fiche entre le check et l'insert, l'INSERT viole la FK (23503, ≠ `SequelizeUniqueConstraintError` récupérée par `findOrCreate`) → **500** au lieu d'un **404** propre. Course **rare, curateur-only, sans corruption** (la FK protège l'intégrité). Fix éventuel : `catch` `SequelizeForeignKeyConstraintError` → 404. [backend/controllers/catalogcontroller.js `addSongToCollection`]

## Deferred from: code review of story 20-3 (2026-07-21)

- **[ROBUSTNESS-LOW] `resolveMirrorPlaylist` : 23505 puis `findOne` null → 500** — à l'import d'une Collection, la playlist miroir est créée-ou-réutilisée : si `Playlist.create` échoue en `SequelizeUniqueConstraintError` mais que la playlist en conflit est **supprimée** dans la fenêtre avant le `findOne` foldé (`lower(name)`), `existing` est null et l'erreur est re-levée → **500**. Course **très étroite** (playlist de même nom supprimée en plein import), **réussit au retry** (plus aucune playlist de ce nom), **sans corruption**. Le commentaire du code acte déjà le rethrow. Fix éventuel : retry `create` une fois, ou reconcilier. [backend/controllers/catalogcontroller.js `resolveMirrorPlaylist`]

## Deferred from: code review of story 21-2 (2026-07-24)

- ~~**[DATA-LOSS-MED/HIGH — fenêtre étroite] Refresh-from-Catalog peut écraser des edits non sauvegardés**~~ — ✅ **RÉSOLU (2026-07-24, suite immédiate de la review 21.2)** : le `CatalogSourceBanner` reçoit une prop `beforeRefresh?: () => Promise<boolean>` qu'il **attend AVANT le POST de refresh** ; la fiche y branche `flushBeforeRefresh` qui **attend d'abord un autosave en vol** (`savingRef`, boucle bornée à 100×50 ms anti-hang) **puis flush l'écriture débouncée en attente** (`flushAutoSave`). La ligne DB est donc à jour quand le refresh serveur la lit → les champs perso non sauvés sont préservés. Si le flush **échoue** (`false`), le refresh est **annulé** (feedback « Could not save your changes — refresh cancelled. ») plutôt que de risquer la perte. +3 tests banner (ordre flush→POST, annulation sur false, + not_from_catalog). _Contexte d'origine : refresh sans flush → le serveur lisait la vieille ligne, renvoyait les vieux champs perso, `buildFormFromSong(updated)` réécrivait le form ; un autosave en vol pouvait aussi rétablir l'ancienne baseline._ [src/components/CatalogSourceBanner.tsx `handleRefresh`, src/pages/Songs.tsx `flushBeforeRefresh`]

## Found during: QA manuel navigateur Epic 21 (2026-07-24)

- ~~**[DISPLAY-MED] `mode` des copies Catalog en minuscule → select Mode affiché vide**~~ — ✅ **RÉSOLU tout de suite (décision northwood : fix maintenant + backfill)** : le Catalog stockait `mode` en minuscule (`major`) alors que le `<select>` Mode (Song ET Catalog, options `src/utils/songFieldOptions.ts` `modeOptions` capitalisées) matche sur la valeur EXACTE → toute copie Catalog affichait un Mode **vide** (donnée non perdue : l'état form React gardait la valeur brute, l'autosave la re-postait ; mais casse incohérente pouvant aussi fausser le filtre `mode` du Catalog). **Oubli de 19.8** (qui avait normalisé bpm/pitchStandard/language, pas `mode`). Fix : `normalizeMode` ajouté à `backend/utils/normalize.js` (mappe vers l'orthographe canonique, insensible à la casse ; inconnu → title-case, jamais perdu ; `undefined` passthrough PUT partiel), appliqué aux écritures **Song** (create+update) **et Catalog** ; migration idempotente `20260724000000-normalize-mode-casing.js` backfille l'existant (Songs + CatalogSongs). +6 tests `normalizeMode` ; vérifié end-to-end au navigateur (Mode « Major » s'affiche). [backend/utils/normalize.js, backend/controllers/songcontroller.js, backend/controllers/catalogcontroller.js, backend/migrations/20260724000000-normalize-mode-casing.js]
