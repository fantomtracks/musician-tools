# ADR — Lien Catalog ↔ Song copiée (provenance + refresh de drift)

_Date : 2026-07-21 · Décideur : northwood · Facilitation : Claude · Cible : nouvel epic (Epic 21), sur `v2`._

## Contexte

Depuis l'Epic 19 (story 19.4), copier une fiche Catalog dans sa Songlist crée une **Song perso = snapshot déconnecté** : deep-clone des champs intrinsèques + `sourceCatalogUid` (pointeur **souple, sans FK**). Aujourd'hui `sourceCatalogUid` est **posé à la copie mais lu nulle part** (write-only, ni back ni front). L'import de Collection (20.3) pose le même pointeur.

Le curateur peut **corriger** une fiche Catalog après coup (tonalité, BPM…). Les copies perso ne le savent pas. L'epic **expose le lien** et permet de **rafraîchir** une copie quand sa source a évolué.

## Décision (niveau de valeur : **Niveau 2 — drift/refresh**)

On garde le modèle **snapshot** (les copies restent indépendantes par défaut) mais on ajoute une **connexion optionnelle et explicite** : détecter que la source a changé, et proposer un **Refresh** que l'utilisateur déclenche.

### D1 — Détection du drift : par **timestamp**
- Nouvelle colonne `Songs.sourceCatalogSyncedAt` (DATE, nullable), posée **à la copie** = `CatalogSong.updatedAt` courant (dans `buildSongFromCatalog` → chemins 19.4 *add* ET 20.3 *import*).
- **Drift** = la source existe, est **publiée**, et `CatalogSong.updatedAt > Song.sourceCatalogSyncedAt`.
- Pas de diff champ-par-champ (sur-ingénierie pour une beta indie).
- **Backfill migration** : pour les copies existantes (sourceCatalogUid non nul), `sourceCatalogSyncedAt = source.updatedAt` courant si la source est résolvable, sinon = `Song.createdAt`. → **pas de faux « update available »** sur les copies legacy.

### D2 — Politique de conflit : **Refresh écrase les champs intrinsèques** (tranché northwood)
- Refresh remet les **champs intrinsèques** à la version Catalog : `key, bpm, mode, timeSignature, durationSeconds, language, genre, streamingLinks, pitchStandard` (deep-clone des JSON, comme `buildSongFromCatalog`).
- Les **champs perso sont TOUJOURS préservés** : `instrument, instrumentTuning, instrumentDifficulty, capo, technique, instrumentLinks, notes, lastPlayed, myInstrumentUid` — et bien sûr `title/artist/album` (identité) restent inchangés.
- Action **explicite + ConfirmDialog** (« Update key, BPM… to the Catalog version? Your instrument, tuning and notes are kept. »). Pas d'UI de merge.
- Après Refresh : `sourceCatalogSyncedAt = CatalogSong.updatedAt` (le drift retombe à faux).
- ⚠️ Les edits intrinsèques perso sont perdus au Refresh — assumé (c'est un choix explicite de l'utilisateur).

### D3 — Où on surface le drift : **fiche Song**
- Bannière sur la fiche Song (`/songs/:uid`) : « A newer version of this song is in the Catalog » + bouton **Refresh**.
- Songlist gardée propre pour l'instant (un indicateur discret pourra venir plus tard, hors périmètre).

### D4 — Provenance / navigation (Niveau 1 inclus)
- Badge/mention « Added from the Catalog » sur la fiche Song quand `sourceCatalogUid` est posé **et** la source est encore publiée.
- Lien **Song → fiche source** (`/catalog/:uid`). Le retour fiche Catalog → « in your songlist » existe déjà (`useSonglistMatcher`, 19.4).

### D5 — Source supprimée / dépubliée : **dégradation propre**
- Si la source n'existe plus ou est repassée en brouillon (`getCatalogEntry` → 404 pour l'utilisateur) : **pas** de badge provenance, **pas** de lien, **pas** de drift/Refresh. La Song reste intacte (le pointeur souple pend, inoffensif).

## Impact modèle / API

- **Migration** : `add-source-catalog-synced-at-to-songs` (nullable DATE + backfill idempotent, cf. D1). ⚠️ part en prod au merge (via v2).
- **`buildSongFromCatalog`** (catalogcontroller) : poser `sourceCatalogSyncedAt = catalog.updatedAt`.
- **Lecture Song enrichie** : `getSong` renvoie, quand `sourceCatalogUid` posé + source publiée, un bloc `sourceCatalog: { uid, updatedAt, drift: boolean }` (lecture Catalog **non scopée** §3, additive). Sinon champ absent.
- **Refresh** : `POST /api/songs/:uid/refresh-from-catalog` — scopé `userUid` (7.5, 404 si pas à toi/inconnu) ; 404/409 si la source n'existe plus / est brouillon ; sinon overwrite intrinsèque + maj `sourceCatalogSyncedAt`, renvoie la Song.

## Découpage proposé (à confirmer via `create-epics`)

- **21-1 (back)** : migration `sourceCatalogSyncedAt` + backfill ; `buildSongFromCatalog` pose la colonne ; `getSong` renvoie `sourceCatalog{uid,updatedAt,drift}` ; endpoint `refresh-from-catalog` (overwrite intrinsèque, préserve perso, 404/409 source absente/brouillon). Tests mockés + smoke base dev.
- **21-2 (front)** : sur la fiche Song — badge provenance + lien source (Niv.1) + bannière drift + **Refresh** (ConfirmDialog → `refreshSongFromCatalog` service → maj état). Dégradation propre (D5). Tests.

_(Optionnel : scinder Niv.1 provenance/nav en 21-2 et drift/Refresh en 21-3 si on veut livrer la provenance d'abord. À trancher en create-epics.)_

## Réutilise / cohérent avec

- Pattern contrôleur scopé `userUid` → 404 (7.5) pour Refresh ; exception §3 lecture Catalog non-scopée pour lire la source.
- `buildSongFromCatalog` (champs intrinsèques + deep-clone) réutilisé pour l'overwrite.
- `ConfirmDialog`, patterns fiche Song (Epic 18 data-router), `useSonglistMatcher`.
- Migration idempotente + testée base dev (discipline 17/19/20).

## Notes / risques

- **Rouvre le snapshot de 19.4** de façon **additive** (le défaut reste snapshot ; la connexion est opt-in par action). Pas de régression sur l'existant.
- Backfill = source.updatedAt → aucune copie legacy ne clignote « update available » à tort.
- `title/artist` jamais touchés par Refresh (l'unicité per-user 17.1 sur (title,artist) n'est donc pas affectée).
- Contenu réel quasi inexistant en prod (catalog vide) → la valeur ne se manifeste qu'après curation ; cohérent avec la séquence « v2 rempli avant 2.0.0 ».
