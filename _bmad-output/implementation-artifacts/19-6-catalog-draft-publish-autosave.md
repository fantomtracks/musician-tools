# Story 19.6: Catalog — brouillon / publication + autosave

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curator**,
I want **catalog entries to autosave as I type and stay a private-to-the-Catalog *draft* until I explicitly Publish them**,
so that **I never lose work, I'm never blocked mid-typing by a duplicate error, and half-baked or duplicate entries never appear to users browsing the Catalog — the duplicate check happens at Publish, not on every keystroke**.

## Contexte / origine

Découvert en QA de 19-5 : le bandeau doublon (409) n'apparaît qu'**au Save**. northwood veut l'**autosave** (comme la fiche chanson) — mais le Catalog est **partagé**, donc autosave sans filet publierait des fiches à moitié tapées. Réponse cohérente : un **statut brouillon/publié**. Autosave continu sur un brouillon (invisible des users), puis **Publish** pour rendre public. Story de la ligne **v2** (branche `feat/19-6-catalog-draft-publish` partie de `v2` ; release groupée 2.0.0).

## Décisions d'archi (cadrage northwood 2026-07-16 — VERROUILLÉES)

1. **Statut = `CatalogSong.publishedAt`** (timestamp nullable) : `NULL` = brouillon, non-null = publié (+ date de pub). Pas d'enum.
2. **Lectures PUBLIQUES scopées `publishedAt IS NOT NULL`** : browse, facettes, détail public, add-to-songlist ne voient jamais les brouillons.
3. **Index unique canonique → PARTIEL** (`WHERE published_at IS NOT NULL`) : 2 brouillons de même (titre, artiste) coexistent ; le **409 se déplace au Publish**.
4. **Autosave continu, PAS de bouton Save** — juste **Publish**. Brouillon créé **lazy à la 1ʳᵉ frappe non vide** (POST → uid → `navigate(replace)` vers `/catalog/admin/:uid` → PUT débounced + indicateur Saving/Saved).
5. **Brouillons PARTAGÉS** entre curateurs — **aucune colonne owner** (CatalogSong reste sans propriétaire) ; badge « Draft » au hub.
6. **Doublon soft** pendant l'édition (indice non bloquant, check vs publiés), **bloquant seulement au Publish** (409 → `DuplicateBanner`, réutilisé de 19-5).

## Acceptance Criteria

1. **Schéma brouillon** — migration `add-published-at-to-catalog-songs` : colonne `published_at` (timestamptz, nullable). **Backfill : `published_at = created_at` pour toutes les fiches existantes** (elles restent publiées/visibles). Modèle `catalogsong.js` +`publishedAt` (`field: 'published_at'`, `DataTypes.DATE`, allowNull). `down` = removeColumn.
2. **Index unique partiel** — migration `make-catalog-canonical-index-partial` : `DROP INDEX catalog_songs_title_artist_ci` puis `CREATE UNIQUE INDEX … ON "CatalogSongs" (lower(title), COALESCE(lower(artist),'')) WHERE published_at IS NOT NULL`. `down` = recreate global. Deux **brouillons** de même clé coexistent (aucun 409) ; publier le 2ᵉ alors qu'un publié identique existe → **409**.
3. **Lectures publiques sans brouillons** — `getCatalogList` (browse), `getCatalogFacets`, et `addToSonglist` ne renvoient/traitent que des **publiées** (`publishedAt IS NOT NULL`). Un `uid` de brouillon en add-to-songlist → **404**. Le détail public `getCatalogEntry` → **404** sur un brouillon **pour un non-curateur** (cf. AC7 pour le cas curateur).
4. **Création = brouillon + autosave** — Given un curateur sur « New entry », When il tape le 1er contenu (titre ou artiste), Then une fiche **brouillon** est créée (POST, `publishedAt` NULL par défaut) **une seule fois**, l'URL passe à `/catalog/admin/:uid` (`navigate(replace)`), et les changements suivants sont **autosavés** (PUT débounced) avec indicateur **Saving… / Saved ✓**. **Aucun bouton Save.**
5. **Publish** — Given un curateur sur un brouillon avec au moins un **titre**, When il clique **Publish**, Then `POST /api/catalog/:uid/publish` set `publishedAt = now`, la fiche devient publique, retour au hub. Si un **publié** de même (titre, artiste) existe → **409** → `DuplicateBanner`, la fiche **reste brouillon**. Titre vide → **400**, pas de publication.
6. **Hub : brouillons visibles + badgés** — `/catalog/manage` (curateur) liste **brouillons ET publiés** via une **liste curateur incluant les brouillons** ; les non publiés portent un badge « Draft ». Éditer (clic ligne, autosave) et supprimer (multi-select) marchent sur brouillons comme publiés.
7. **Édition curateur d'un brouillon** — `getCatalogEntry` sert un brouillon **au curateur** (pour l'éditer via `/catalog/admin/:uid`) mais **404 au non-curateur**. (C'est l'exception qui empêche de scoper aveuglément le détail — cf. Dev Notes, décision à trancher.)
8. **Doublon soft en édition, dur au Publish** — Pendant l'édition, taper un (titre, artiste) matchant une fiche **publiée** affiche un indice **non bloquant** (« A "…" by … is already published in the Catalog »), sans bloquer l'autosave. Le blocage dur n'arrive qu'au Publish (AC5).
9. **Curateur bout-en-bout** — création/autosave/publish/liste-avec-brouillons gated `requireCurator` (403) ; l'UI n'expose rien à un non-curateur ; les brouillons ne fuitent jamais en lecture publique.

## Tasks / Subtasks

- [ ] **Task 1 — Migration + modèle `publishedAt`** (AC: 1)
  - [ ] Migration `…-add-published-at-to-catalog-songs.js` : `addColumn('CatalogSongs','published_at',{ type: Sequelize.DATE, allowNull: true })` + `UPDATE "CatalogSongs" SET published_at = "createdAt" WHERE published_at IS NULL` (backfill). `down` : removeColumn.
  - [ ] `backend/models/catalogsong.js` : `publishedAt: { type: DataTypes.DATE, allowNull: true, field: 'published_at' }`.
  - [ ] Valider sur base dev (colonne + backfill : les 7 fiches restent visibles).

- [ ] **Task 2 — Index canonique PARTIEL** (AC: 2)
  - [ ] Migration `…-make-catalog-canonical-index-partial.js` : `DROP INDEX IF EXISTS catalog_songs_title_artist_ci;` puis `CREATE UNIQUE INDEX IF NOT EXISTS catalog_songs_title_artist_ci ON "CatalogSongs" (lower(title), COALESCE(lower(artist), '')) WHERE published_at IS NOT NULL;`. `down` : drop + recreate la version globale (sans WHERE).
  - [ ] Smoke base dev : 2 brouillons même (titre,artiste) OK ; publier le 2ᵉ avec un publié identique → 23505.
  - [ ] ⚠️ Prérequis : Task 1 (la colonne doit exister avant l'index partiel). Ordre des timestamps de migration.

- [ ] **Task 3 — Backend : scoping lectures publiques** (AC: 3, 9)
  - [ ] `getCatalogList` : ajouter au tableau `and` un `{ publishedAt: { [Op.not]: null } }` **sauf** en mode curateur-avec-brouillons (Task 4). [ancre : `backend/controllers/catalogcontroller.js` ~ `const and = [];` … `const where = and.length ? …`]
  - [ ] `getCatalogFacets` : ajouter `AND published_at IS NOT NULL` aux requêtes SQL (scalar + genre). [même fichier, `getCatalogFacets`]
  - [ ] `addToSonglist` : si la fiche est un brouillon (`publishedAt == null`) → **404** (un user ne copie pas un brouillon deviné). [`addToSonglist`, après le findByPk]
  - [ ] Tests contrôleur : browse/facets/add masquent les brouillons.

- [ ] **Task 4 — Backend : liste curateur avec brouillons + lifecycle** (AC: 4, 5, 6, 7, 9)
  - [ ] **Liste curateur** : param `?includeDrafts=1` sur `getCatalogList`, **honoré uniquement si `req.user.isCurator`** (sinon ignoré → jamais de fuite). Route inchangée (authsess) — le filtre `publishedAt` n'est pas ajouté quand includeDrafts + curateur. (Alternative : endpoint dédié `GET /api/catalog/manage` gated requireCurator — trancher en tête de dev-story, cf. Dev Notes.)
  - [ ] **`getCatalogEntry` (AC7)** : un brouillon (`publishedAt == null`) → renvoyé **si `req.user?.isCurator`**, sinon **404**. (Route reste authsess ; on lit `req.user`.) Décision alternative dans Dev Notes.
  - [ ] **`createCatalogEntry`** : ne set PAS `publishedAt` → défaut NULL = brouillon (comportement automatique une fois la colonne là). Vérifier que le 409-on-create ne se déclenche plus (index partiel → drafts non indexés) : c'est attendu.
  - [ ] **`publishCatalogEntry`** (`POST /api/catalog/:uid/publish`, requireCurator) : titre requis sinon 400 ; `entry.update({ publishedAt: new Date() })` ; sur 23505 → `respondDuplicateCatalogEntry` (409, réutilisé). Route dans `backend/routes/catalog.js` (à côté des autres write, gated authsess+requireCurator).
  - [ ] Tests : publish OK, publish-dup 409, publish titre-vide 400, getCatalogEntry brouillon curateur vs non-curateur (200/404), liste curateur includeDrafts (curateur voit brouillons, non-curateur non).

- [ ] **Task 5 — Service front** (AC: 4, 5, 6)
  - [ ] `catalogService` : `publishCatalogEntry(uid)` (POST publish ; 409 → `CatalogConflictError`, 400 → erreur validation) ; liste curateur avec brouillons (`listCatalog({ includeDrafts: true, … })` → ajoute `includeDrafts=1`). `CatalogSong` type +`publishedAt?: string | null`.
  - [ ] Tests service (mock fetch + CSRF) : publish 200/409/400 ; list includeDrafts passe le param.

- [ ] **Task 6 — CatalogAdmin : autosave + Publish** (AC: 4, 5, 7, 8)
  - [ ] Reprendre le pattern autosave de `Songs.tsx` : `saveStatus: 'idle'|'saving'|'saved'|'error'`, `savingRef` (anti-double-vol), `saveTimerRef` (débounce ~1200ms), `autoSaveRef` (dernière closure). **StrictMode-safe**.
  - [ ] **Create lazy** : en mode création (pas d'uid), à la 1ʳᵉ frappe non vide → POST `createCatalogEntry` **une seule fois** (guard `creatingRef`) → `navigate('/catalog/admin/'+uid, { replace: true })` → bascule autosave PUT.
  - [ ] Retirer le bouton **Save** ; ajouter **Publish** (valide titre) + indicateur autosave. Garder `DuplicateBanner` pour le 409 de Publish ; **indice soft** de doublon (check débounced vs publiés — via un léger `getCatalogEntry`/list, ou un endpoint de check ; option simple : réutiliser la recherche `listCatalog({search})`).
  - [ ] Le bouton **Delete** (19-5) reste. Cancel → hub.

- [ ] **Task 7 — CatalogManage : badge Draft + liste curateur** (AC: 6)
  - [ ] Utiliser `listCatalog({ includeDrafts: true, … })` ; afficher un badge « Draft » sur les lignes `publishedAt == null`.

- [ ] **Task 8 — Tests front** (AC: 4, 5, 6, 8)
  - [ ] CatalogAdmin autosave (create-lazy + PUT débounced + statut), Publish (succès nav + 409 reste brouillon + 400 titre vide), indice soft. CatalogManage badge Draft. Non-fuite brouillons en browse (Catalog.test). **Sous StrictMode** (leçon rétro 19).

## Dev Notes

### Points d'ancrage backend (lus)
- `getCatalogList` construit `const and = [...]` puis `const where = and.length ? { [Op.and]: and } : undefined` → **injecter `{ publishedAt: { [Op.not]: null } }` dans `and`** pour le public ; l'omettre pour curateur+includeDrafts. [`backend/controllers/catalogcontroller.js`]
- `getCatalogFacets` = SQL brut (`scalar()` + genre) → ajouter `AND published_at IS NOT NULL`.
- `createCatalogEntry` : `CatalogSong.create({...})` sans `publishedAt` → NULL = brouillon **automatique** une fois la colonne créée. Le `respondDuplicateCatalogEntry` (409) devient inatteignable au create (index partiel) — OK, le laisser.
- `respondDuplicateCatalogEntry` (23505 → 409 + entry) : **réutilisé tel quel par `publishCatalogEntry`** (c'est là que la contrainte partielle mord).
- Index canonique actuel (migration `20260715000000`) : `CREATE UNIQUE INDEX catalog_songs_title_artist_ci ON "CatalogSongs" (lower(title), COALESCE(lower(artist), ''))`. La nouvelle migration ne fait qu'ajouter `WHERE published_at IS NOT NULL`.
- Modèle : `underscored` par `field:` explicite (ex. `time_signature`, `duration_seconds`) + `timestamps` camelCase (`createdAt`/`updatedAt`). → `publishedAt` avec `field: 'published_at'`.

### ⚠️ Décision à trancher en tête de dev-story (2 forks)
1. **Détail brouillon curateur (AC7)** : soit **role-branch dans `getCatalogEntry`** (`if (draft && !req.user?.isCurator) 404`) — moins de code, `catalogService.getCatalogEntry` inchangé côté front ; soit **endpoint curateur dédié** (`GET /api/catalog/:uid/edit`, requireCurator) — séparation plus nette. **Reco : role-branch** (le front CatalogAdmin appelle déjà `getCatalogEntry`).
2. **Liste avec brouillons (AC6)** : soit **`?includeDrafts=1` gated `req.user.isCurator`** sur `getCatalogList` — moins de duplication ; soit **endpoint `GET /api/catalog/manage`** requireCurator. **Reco : le param gated** (strippé/ignoré pour non-curateur → aucune fuite).

### Pièges (leçons rétro Epic 19)
- **StrictMode par défaut sur TOUS les nouveaux tests composant** (action rétro 19 #3). L'autosave a des effets/timers → double-mount à couvrir.
- **`mx-auto` sur enfant flex = shrink-to-fit** : déjà réglé par `w-full` sur les conteneurs Catalog (ne pas régresser).
- **Autosave = ressource PARTAGÉE** : tant que `publishedAt` est NULL, invisible des users. Ne jamais publier implicitement — Publish est le seul geste qui rend public.
- **Create-lazy idempotent** : guard `creatingRef` pour ne POSTer qu'un seul brouillon même si plusieurs frappes arrivent avant la réponse ; `navigate(replace)` pour ne pas empiler l'historique.
- **Ordre migrations** : `published_at` (Task 1) AVANT l'index partiel (Task 2). ⚠️ les 2 partent en prod au release 2.0.0 (backfill obligatoire).

### Project Structure Notes
- **UPDATE back** : `backend/controllers/catalogcontroller.js`, `backend/models/catalogsong.js`, `backend/routes/catalog.js`. **NEW back** : 2 migrations.
- **UPDATE front** : `src/services/catalogService.ts`, `src/pages/CatalogAdmin.tsx`, `src/pages/CatalogManage.tsx` (badge), éventuellement `src/pages/Catalog.tsx` (aucun changement si le scoping est back-only). Tests associés.
- Aucun changement au deep-clone d'`addToSonglist` (19-4) hormis le garde brouillon→404.

### References
- [Source: `19-5-curateur-gerer-fiches.md` — CatalogAdmin bi-mode, DuplicateBanner, hub multi-select]
- [Source: `backend/controllers/catalogcontroller.js` — getCatalogList/Facets/Entry, addToSonglist, create/update, respondDuplicateCatalogEntry]
- [Source: `backend/migrations/20260715000000-create-catalog-songs.js` — index canonique à rendre partiel]
- [Source: `backend/models/catalogsong.js` — pattern `field:` underscored]
- [Source: `src/pages/Songs.tsx` (~L936 `autoSaveSong`, L1024 `autoSaveRef`, L1038 débounce 1200ms) + `src/__tests__/SongsAutoSave.test.tsx` — pattern autosave à reprendre]
- [Source: `src/components/DuplicateBanner.tsx` / `ConfirmDialog.tsx` — réutilisés]
- [Source: `_bmad-output/project-context.md` — lecture non-scopée §3 : on ajoute le filtre publishedAt, pas d'owner]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-16 | 0.1 | Cadrage esquisse (draft/publish + autosave) | northwood |
| 2026-07-16 | 0.2 | create-story dev-ready — dev notes ancrées au code (points d'injection getCatalogList/Facets/Entry, SQL index partiel, modèle field:, pattern autosave Songs), 2 forks tranchés (reco role-branch + param includeDrafts), tasks concrètes → ready-for-dev | northwood |
