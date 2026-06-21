# Deferred Work

> **Rituel (acté rétro Epic 8, 2026-06-21)** : ce fichier passe en revue **avant le démarrage de chaque nouvelle epic**. Chaque item est tranché — _fix maintenant_ / _story planifiée_ / _gardé-avec-raison_ / _tué_. Il ne doit jamais redevenir un cimetière. Dernière passe : **2026-06-21**.

---

## 🔧 À traiter maintenant (fix immédiat)

_Vidé le 2026-06-21 : les 3 items (z-index Album/Languages, garde artiste `MyPlaylistsPage`, drop index redondant) traités dans la branche `fix/pre-epic7-quick-wins`. Cf. journal « Soldé » en bas._

---

## 📋 Stories à planifier

### Songlist — filtres instrument
- **Reformuler les deux libellés** (`SongsSidebar.tsx`) : « Filter by instrument » (l.143, instrument *du morceau*) vs « Filter by my instrument » (l.157, un de *mes* instruments) se ressemblent trop. Wording plus clair (ex. « Instrument du morceau » vs « Mon instrument »).
- **Filtre « chansons sans instrument »** : option pour afficher les morceaux liés à **aucun** instrument (repérer les orphelins). Probablement via une valeur spéciale « None » côté `SongsSidebar.tsx` + logique de filtrage (liste d'instruments vide). À cadrer côté UX avec la reformulation ci-dessus.

### Refacto `SessionHistoryCard` _(prérequis des deux suivantes)_
- Le rendu d'une session + ses entrées (en-tête date · instrument · durée, liste « played during X minutes ») est **dupliqué** : `MySessionsPage.tsx` (~785-835) et `MyHeatmapPage.tsx` (~435-480). Toute évolution doit être faite aux deux endroits (déjà vécu). Extraire un composant partagé (`SessionHistoryCard` / `SessionEntryLine`) prenant `session` + helpers + callbacks. À cadrer : les deux pages ont des actions légèrement différentes (Heatmap a aussi les plays hors-session).
- **Absorbe** : l'incohérence heatmap day-detail (`MyHeatmapPage.tsx:439-444` rend le titre seul, sans artiste, alors que l'historique est en « Artiste - Titre » depuis 5.5) — à unifier dans le composant partagé.

### Chanson cliquable dans l'historique de session _(après `SessionHistoryCard`)_
- Dans `MySessionsPage.tsx` (~818-833), chaque entrée affiche le label en texte statique (`{item.label}`). Le rendre **cliquable** pour ouvrir l'édition de la chanson (via `item.songUid`). Gérer : entrées orphelines (`songUid` null → pas de lien), navigation inter-pages (Sessions → Songs form).

### Nav mobile responsive + hamburger _(NFR3)_
- La nav du Header est `hidden md:flex` sans menu hamburger → sur mobile, **aucun** lien (Songs, Instruments, Playlists, Topics, Sessions, Heatmap). Cassée depuis l'épic 1, jamais réparée (la story 5.3 a réordonné le menu desktop mais pas la nav mobile). Story dédiée responsive + hamburger.

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
