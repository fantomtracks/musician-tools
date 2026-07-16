---
baseline_commit: e3e1d8a8757123dd1ab5316d2d90c38a6dbe8a7f
---
# Story 19.6: Catalog — brouillon / publication + autosave

Status: done

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
2. ⚠️ **[ANNULÉ — cf. Révision post-QA : unicité GLOBALE, index jamais rendu partiel, migrations collapsées]** ~~**Index unique partiel**~~ — migration `make-catalog-canonical-index-partial` : `DROP INDEX catalog_songs_title_artist_ci` puis `CREATE UNIQUE INDEX … ON "CatalogSongs" (lower(title), COALESCE(lower(artist),'')) WHERE published_at IS NOT NULL`. `down` = recreate global. Deux **brouillons** de même clé coexistent (aucun 409) ; publier le 2ᵉ alors qu'un publié identique existe → **409**.
3. **Lectures publiques sans brouillons** — `getCatalogList` (browse), `getCatalogFacets`, et `addToSonglist` ne renvoient/traitent que des **publiées** (`publishedAt IS NOT NULL`). Un `uid` de brouillon en add-to-songlist → **404**. Le détail public `getCatalogEntry` → **404** sur un brouillon **pour un non-curateur** (cf. AC7 pour le cas curateur).
4. **Création = brouillon + autosave** — Given un curateur sur « New entry », When il tape le 1er contenu (titre ou artiste), Then une fiche **brouillon** est créée (POST, `publishedAt` NULL par défaut) **une seule fois**, l'URL passe à `/catalog/admin/:uid` (`navigate(replace)`), et les changements suivants sont **autosavés** (PUT débounced) avec indicateur **Saving… / Saved ✓**. **Aucun bouton Save.**
5. **Publish** — Given un curateur sur un brouillon avec au moins un **titre**, When il clique **Publish**, Then `POST /api/catalog/:uid/publish` set `publishedAt = now`, la fiche devient publique, retour au hub. Si un **publié** de même (titre, artiste) existe → **409** → `DuplicateBanner`, la fiche **reste brouillon**. Titre vide → **400**, pas de publication.
6. **Hub : brouillons visibles + badgés** — `/catalog/manage` (curateur) liste **brouillons ET publiés** via une **liste curateur incluant les brouillons** ; les non publiés portent un badge « Draft ». Éditer (clic ligne, autosave) et supprimer (multi-select) marchent sur brouillons comme publiés.
7. **Édition curateur d'un brouillon** — `getCatalogEntry` sert un brouillon **au curateur** (pour l'éditer via `/catalog/admin/:uid`) mais **404 au non-curateur**. (C'est l'exception qui empêche de scoper aveuglément le détail — cf. Dev Notes, décision à trancher.)
8. ⚠️ **[RÉVISÉ — cf. Révision post-QA : doublon = blocage DUR (autosave bloqué + Publish masqué), pas soft]** **Doublon soft en édition, dur au Publish** — Pendant l'édition, taper un (titre, artiste) matchant une fiche **publiée** affiche un indice **non bloquant** (« A "…" by … is already published in the Catalog »), sans bloquer l'autosave. Le blocage dur n'arrive qu'au Publish (AC5).
9. **Curateur bout-en-bout** — création/autosave/publish/liste-avec-brouillons gated `requireCurator` (403) ; l'UI n'expose rien à un non-curateur ; les brouillons ne fuitent jamais en lecture publique.

## Tasks / Subtasks

- [x] **Task 1 — Migration + modèle `publishedAt`** (AC: 1)
  - [x] Migration `…-add-published-at-to-catalog-songs.js` : `addColumn('CatalogSongs','published_at',{ type: Sequelize.DATE, allowNull: true })` + `UPDATE "CatalogSongs" SET published_at = "createdAt" WHERE published_at IS NULL` (backfill). `down` : removeColumn.
  - [x] `backend/models/catalogsong.js` : `publishedAt: { type: DataTypes.DATE, allowNull: true, field: 'published_at' }`.
  - [x] Valider sur base dev (colonne + backfill : les 7 fiches restent visibles).

- [x] **Task 2 — Index canonique PARTIEL** (AC: 2)
  - [x] Migration `…-make-catalog-canonical-index-partial.js` : `DROP INDEX IF EXISTS catalog_songs_title_artist_ci;` puis `CREATE UNIQUE INDEX IF NOT EXISTS catalog_songs_title_artist_ci ON "CatalogSongs" (lower(title), COALESCE(lower(artist), '')) WHERE published_at IS NOT NULL;`. `down` : drop + recreate la version globale (sans WHERE).
  - [x] Smoke base dev : 2 brouillons même (titre,artiste) OK ; publier le 2ᵉ avec un publié identique → 23505.
  - [x] ⚠️ Prérequis : Task 1 (la colonne doit exister avant l'index partiel). Ordre des timestamps de migration.

- [x] **Task 3 — Backend : scoping lectures publiques** (AC: 3, 9)
  - [x] `getCatalogList` : ajouter au tableau `and` un `{ publishedAt: { [Op.not]: null } }` **sauf** en mode curateur-avec-brouillons (Task 4). [ancre : `backend/controllers/catalogcontroller.js` ~ `const and = [];` … `const where = and.length ? …`]
  - [x] `getCatalogFacets` : ajouter `AND published_at IS NOT NULL` aux requêtes SQL (scalar + genre). [même fichier, `getCatalogFacets`]
  - [x] `addToSonglist` : si la fiche est un brouillon (`publishedAt == null`) → **404** (un user ne copie pas un brouillon deviné). [`addToSonglist`, après le findByPk]
  - [x] Tests contrôleur : browse/facets/add masquent les brouillons.

- [x] **Task 4 — Backend : liste curateur avec brouillons + lifecycle** (AC: 4, 5, 6, 7, 9)
  - [x] **Liste curateur** : param `?includeDrafts=1` sur `getCatalogList`, **honoré uniquement si `req.user.isCurator`** (sinon ignoré → jamais de fuite). Route inchangée (authsess) — le filtre `publishedAt` n'est pas ajouté quand includeDrafts + curateur. (Alternative : endpoint dédié `GET /api/catalog/manage` gated requireCurator — trancher en tête de dev-story, cf. Dev Notes.)
  - [x] **`getCatalogEntry` (AC7)** : un brouillon (`publishedAt == null`) → renvoyé **si `req.user?.isCurator`**, sinon **404**. (Route reste authsess ; on lit `req.user`.) Décision alternative dans Dev Notes.
  - [x] **`createCatalogEntry`** : ne set PAS `publishedAt` → défaut NULL = brouillon (comportement automatique une fois la colonne là). Vérifier que le 409-on-create ne se déclenche plus (index partiel → drafts non indexés) : c'est attendu.
  - [x] **`publishCatalogEntry`** (`POST /api/catalog/:uid/publish`, requireCurator) : titre requis sinon 400 ; `entry.update({ publishedAt: new Date() })` ; sur 23505 → `respondDuplicateCatalogEntry` (409, réutilisé). Route dans `backend/routes/catalog.js` (à côté des autres write, gated authsess+requireCurator).
  - [x] Tests : publish OK, publish-dup 409, publish titre-vide 400, getCatalogEntry brouillon curateur vs non-curateur (200/404), liste curateur includeDrafts (curateur voit brouillons, non-curateur non).

- [x] **Task 5 — Service front** (AC: 4, 5, 6)
  - [x] `catalogService` : `publishCatalogEntry(uid)` (POST publish ; 409 → `CatalogConflictError`, 400 → erreur validation) ; liste curateur avec brouillons (`listCatalog({ includeDrafts: true, … })` → ajoute `includeDrafts=1`). `CatalogSong` type +`publishedAt?: string | null`.
  - [x] Tests service (mock fetch + CSRF) : publish 200/409/400 ; list includeDrafts passe le param.

- [x] **Task 6 — CatalogAdmin : autosave + Publish** (AC: 4, 5, 7, 8)
  - [x] Reprendre le pattern autosave de `Songs.tsx` : `saveStatus: 'idle'|'saving'|'saved'|'error'`, `savingRef` (anti-double-vol), `saveTimerRef` (débounce ~1200ms), `autoSaveRef` (dernière closure). **StrictMode-safe**.
  - [x] **Create lazy** : en mode création (pas d'uid), à la 1ʳᵉ frappe non vide → POST `createCatalogEntry` **une seule fois** (guard `creatingRef`) → `navigate('/catalog/admin/'+uid, { replace: true })` → bascule autosave PUT.
  - [x] Retirer le bouton **Save** ; ajouter **Publish** (valide titre) + indicateur autosave. Garder `DuplicateBanner` pour le 409 de Publish ; **indice soft** de doublon (check débounced vs publiés — via un léger `getCatalogEntry`/list, ou un endpoint de check ; option simple : réutiliser la recherche `listCatalog({search})`).
  - [x] Le bouton **Delete** (19-5) reste. Cancel → hub.

- [x] **Task 7 — CatalogManage : badge Draft + liste curateur** (AC: 6)
  - [x] Utiliser `listCatalog({ includeDrafts: true, … })` ; afficher un badge « Draft » sur les lignes `publishedAt == null`.

- [x] **Task 8 — Tests front** (AC: 4, 5, 6, 8)
  - [x] CatalogAdmin autosave (create-lazy + PUT débounced + statut), Publish (succès nav + 409 reste brouillon + 400 titre vide), indice soft. CatalogManage badge Draft. Non-fuite brouillons en browse (Catalog.test). **Sous StrictMode** (leçon rétro 19).

## Révision post-QA (northwood 2026-07-16) — unicité GLOBALE

Retournement de modèle décidé en QA : **aucun doublon (titre, artiste) possible, brouillons INCLUS** (le point-7 « 2 brouillons identiques coexistent » n'était pas voulu).
- **Index → GLOBAL** — après la 2ᵉ passe de revue, les migrations partiel→global ont été **collapsées** : l'index canonique reste **GLOBAL depuis 19.1** (jamais rendu partiel), seule la migration `published_at` (20260716000100) est conservée. La base impose l'unicité sur **toutes** les fiches (brouillons inclus). AC2 (index partiel) et décision #3 (409 au Publish) **annulés** ; le 409 de `publishCatalogEntry` devient un backstop inatteignable (commenté comme tel).
- **Doublon = blocage dur** (plus de « soft hint ») : un check `listCatalog({ includeDrafts })` (brouillons + publiées) détecte tout (titre, artiste) existant → **autosave bloqué** (`dupRef`) + **bouton Publish masqué** + bandeau « already exists in the Catalog ». Le 409 (index global) reste le **backstop** serveur. AC8 (soft) → hard block.
- Conséquence assumée : impossible de créer un brouillon d'une chanson **déjà publiée** (édition directe = live, décision inchangée).
- Fichiers : +`backend/migrations/20260716000300-...js` ; `CatalogAdmin.tsx` (dup-check → curator list, `dupRef`/`dupMessage`, autosave bloqué, Publish masqué). Front 411✓ back 303✓ tsc✓ lint✓.

### Review Findings — 2ᵉ passe (post-QA, modèle global)

Re-review 3 couches après la révision « unicité globale ». Acceptance **9/9 (modèle révisé)**, zéro faille de correctness. 4 patches, 1 defer, 2 dismiss.

- [x] [Review][Patch] F1 (Med) — `dupRef` reste coincé `true` si le dup-check erreur/abort → réinitialiser `dupRef=false` en tête d'effet (fail-open, l'index serveur est le backstop) [src/pages/CatalogAdmin.tsx]
- [x] [Review][Patch] F2 (Med) — flush au démontage crée un brouillon abandonné en mode création → ne flusher que si `workingUid` existe (jamais de create au démontage) [src/pages/CatalogAdmin.tsx]
- [x] [Review][Patch] F5/FA/FB/FC/F6 — migrations 200→300 s'annulent + commentaires « partial index » trompeurs → **collapse** (undo 200/300, garder la seule migration `published_at`, l'index reste GLOBAL de 19-1) + fixer les commentaires modèle/publish [backend/migrations/*, backend/models/catalogsong.js, backend/controllers/catalogcontroller.js]
- [x] [Review][Patch] F-D (Low) — barrer/annoter AC2 & AC8 (renvoyer à la Révision) pour ne pas induire l'ancien modèle [ce fichier]

Defer : F3 — le dup-check proactif (`search` substring + `limit:10`) peut rater un doublon sur un titre courant → l'autosave part et le **backstop 409 serveur** bloque (~1.2s + 1 requête ratée). Correctness garantie ; l'amélioration = un endpoint de check exact `(title, artist)`. → deferred-work.
Dismiss : F4 (le serveur `normalizeText` trim titre/artiste à l'écriture → aucune clé non-trimmée persistée ; `foldedKey` trim = cohérent) ; F7 (garde auto-fill `saving`→`publishing` : `autoSave` ne fait jamais `setForm`, l'ancien hazard ne s'applique plus).

### Review Findings — 1ère passe

Revue 3 couches — Acceptance **9/9 AC SATISFIED**, aucune décision verrouillée violée. Fil rouge : l'autosave a divergé des gardes de `Songs.tsx`. 4 patches, 6 dismiss.

- [x] [Review][Patch] F1 (Med) — autosave d'une fiche **publiée** en collision : 409 silencieux + re-tire à chaque frappe → surfacer le bandeau (`CatalogConflictError` dans le catch autoSave) + suppression via `conflictKeyRef` [src/pages/CatalogAdmin.tsx]
- [x] [Review][Patch] F2 (Med) — create-lazy avec titre vide (artiste d'abord) → exiger un **titre** avant tout autosave (comme Songs) [src/pages/CatalogAdmin.tsx]
- [x] [Review][Patch] F3 (Med) — PUT no-op redondant à l'ouverture d'une fiche → garde **baseline** (skip si form == dernier sauvé/chargé) + « Saved ✓ » [src/pages/CatalogAdmin.tsx]
- [x] [Review][Patch] F4 (Med) — autosave en attente perdu sur navigation → **flush** au démontage si dirty [src/pages/CatalogAdmin.tsx]

Dismiss : F5 doublon-draft sur retry réseau (rare, drafts dédupent au publish) ; F6 `isRequestCurator` avale l'erreur DB (fail-closed, aucune fuite) ; F7 curateur sur détail public d'un brouillon → Add 404 (curateur-only, pas une fuite) ; F8 ordering publish vs autosave (savingRef → inoffensif) ; F9 backfill camelCase `"createdAt"` (vérifié correct : timestamps:true sans underscored ; migrations vertes) ; F10 « Saved ✓ » (replié dans F3).

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

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- Migrations validées base dev : `published_at` + backfill (fiches existantes → publiées) ; index PARTIEL (`WHERE published_at IS NOT NULL`) — smoke SQL : 2 brouillons même (titre,artiste) coexistent, publier un 2ᵉ avec un publié identique → 23505.
- Back **21 suites / 303 tests** (+9 : scoping browse/facets/add, getCatalogEntry role-branch curateur/non-curateur, getCatalogList includeDrafts gated, publish 200/409/400). Front **410** (+ CatalogAdmin autosave/publish 10, catalogService publish+includeDrafts 8, CatalogManage badge). tsc + eslint (front & back) propres.

### Completion Notes List

- **Découverte clé** : `req.user` n'existe pas — l'user est sur **`req.session.user`** (uid). Helper `isRequestCurator(req)` (lookup `User.findByPk`) appelé **paresseusement** — seulement sur `?includeDrafts=1` ou l'accès à un brouillon par uid — donc les lectures publiques normales ne paient aucune requête en plus.
- **Task 3/4 (back)** : scoping `publishedAt IS NOT NULL` sur getCatalogList (sauf includeDrafts+curateur), getCatalogFacets (SQL), addToSonglist (404 brouillon) ; `getCatalogEntry` role-branch (brouillon → 404 sauf curateur) ; `createCatalogEntry` crée un brouillon par défaut (publishedAt NULL, index partiel → plus de 409 au create) ; `publishCatalogEntry` (POST /:uid/publish, 400 titre vide, 409 dup publié via `respondDuplicateCatalogEntry`).
- **Task 6 (front)** : autosave repris du pattern Songs (`saveStatus`, `savingRef`, débounce 1200ms, `autoSaveRef`) ; **create-lazy** (1ʳᵉ frappe non vide → POST → `navigate(replace)` /catalog/admin/:uid) avec `justCreatedRef` anti-clobber du pré-remplissage (robuste au remount ET au param-update) ; **plus de bouton Save** ; **Publish** (si brouillon) = flush update + publish + retour hub ; indice **soft** doublon (check débounced vs publiés) sous le titre, bandeau **dur** (`DuplicateBanner`) au 409 de Publish. **Décision northwood** : éditer une fiche déjà publiée = autosave direct sur le public (pas de révision brouillon).
- **Forks tranchés** : role-branch dans getCatalogEntry (vs endpoint dédié) ; param `?includeDrafts=1` gated (vs endpoint /manage) — les deux « reco » du cadrage retenues.
- Aucun changement au deep-clone d'addToSonglist (19-4) hormis le garde brouillon→404. `DuplicateBanner`/`ConfirmDialog` réutilisés.

### File List

- `backend/migrations/20260716000100-add-published-at-to-catalog-songs.js` (NEW — seule migration conservée après le collapse review ; l'index canonique reste GLOBAL de 19.1, jamais rendu partiel)
- `backend/models/catalogsong.js` (UPDATE — +publishedAt)
- `backend/controllers/catalogcontroller.js` (UPDATE — scoping + isRequestCurator + role-branch + publishCatalogEntry)
- `backend/routes/catalog.js` (UPDATE — route publish)
- `backend/__tests__/catalogcontroller.test.js` (UPDATE — +9 tests, fixtures publishedAt, mock User)
- `src/services/catalogService.ts` (UPDATE — publishCatalogEntry + includeDrafts + type publishedAt)
- `src/pages/CatalogAdmin.tsx` (UPDATE — autosave + create-lazy + Publish, retrait Save, indice soft)
- `src/pages/CatalogManage.tsx` (UPDATE — includeDrafts + badge Draft)
- `src/__tests__/CatalogAdmin.test.tsx` (UPDATE — réécrit autosave/publish, fake timers, StrictMode)
- `src/__tests__/catalogService.test.ts` (UPDATE — +publish +includeDrafts)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-16 | 0.1 | Cadrage esquisse (draft/publish + autosave) | northwood |
| 2026-07-16 | 0.2 | create-story dev-ready — dev notes ancrées au code (points d'injection getCatalogList/Facets/Entry, SQL index partiel, modèle field:, pattern autosave Songs), 2 forks tranchés (reco role-branch + param includeDrafts), tasks concrètes → ready-for-dev | northwood |
| 2026-07-16 | 0.3 | dev-story — 8 tasks : 2 migrations (published_at + index partiel), scoping back + lifecycle (publish/role-branch/includeDrafts), service, CatalogAdmin autosave+Publish (create-lazy, plus de Save, indice soft), hub badge Draft. Back 303✓ front 410✓ tsc✓ lint✓ → Status review | northwood |
| 2026-07-16 | 0.4 | Code review 3 couches (Acceptance 9/9) → 4 patch appliqués (réalignement autosave sur Songs.tsx : F1 conflit surfacé+suppression, F2 titre requis, F3 garde baseline anti-PUT-redondant + « Saved ✓ », F4 flush au démontage) + 6 dismiss ; +1 test F1. Back 303✓ front 411✓ tsc✓ lint✓ → Status done | northwood |
| 2026-07-16 | 0.5 | Révision QA — unicité GLOBALE (index partiel → global, migration 20260716000300 + dédup) : aucun doublon (brouillons inclus), doublon = blocage dur (autosave bloqué + Publish masqué + bandeau) au lieu du soft hint. Front 411✓ back 303✓ tsc✓ lint✓ | northwood |
| 2026-07-16 | 0.6 | Code review 2ᵉ passe (post-QA, 9/9) → 4 patch (F1 dupRef fail-open ; F2 flush edit-only anti-brouillon-fantôme ; collapse migrations partiel→global → 1 seule migration published_at, index reste global ; F-D doc AC2/AC8) + 1 defer (F3 dup-check best-effort) + 2 dismiss. Front 411✓ back 305✓ tsc✓ lint✓ | northwood |
