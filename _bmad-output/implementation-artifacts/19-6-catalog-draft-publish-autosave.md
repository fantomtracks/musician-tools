# Story 19.6: Catalog — brouillon / publication + autosave

Status: backlog

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curator**,
I want **catalog entries to autosave as I type and stay a private-to-the-Catalog *draft* until I explicitly Publish them**,
so that **I never lose work, I'm never blocked by a half-typed entry, and half-baked or duplicate entries never appear to users browsing the Catalog — the duplicate check happens at Publish, not on every keystroke**.

## Contexte / origine

Découvert en QA de 19-5 : le bandeau doublon (409) n'apparaît qu'**au Save**. northwood veut l'**autosave** (comme la fiche chanson) — mais le Catalog est **partagé**, donc autosave sans filet publierait des fiches à moitié tapées à tous les users. La réponse cohérente : un **statut brouillon/publié**. Autosave en continu sur un brouillon (invisible des users), puis **Publish** pour rendre public.

## Décisions d'archi (cadrage northwood, 2026-07-16)

1. **Statut = `publishedAt timestamp NULL`** sur `CatalogSong` : `NULL` = brouillon, non-null = publié (donne aussi la date de pub). Pas d'enum (extensible plus tard si besoin d'`archived`).
2. **Lectures publiques scopées `publishedAt IS NOT NULL`** : browse (`getCatalogList`), facettes (`getCatalogFacets`), détail (`getCatalogEntry`) et `addToSonglist` ne voient **jamais** les brouillons (un brouillon se comporte comme inexistant → 404 sur détail/add).
3. **Index unique canonique → PARTIEL** (`WHERE published_at IS NOT NULL`) : deux brouillons de la même chanson ne collisionnent pas ; le **409 se déplace au Publish** (pas à l'autosave).
4. **Autosave continu, PAS de bouton Save** — juste **Publish**. Le brouillon est créé en base **à la 1ʳᵉ frappe non vide** (pas de brouillon vide orphelin), puis PUT débounced à chaque changement.
5. **Brouillons partagés entre curateurs** : aucune colonne owner ajoutée (CatalogSong reste sans propriétaire). Tous les curateurs voient/éditent tous les brouillons ; badge « Draft » dans le hub.
6. **Doublon en *soft*** pendant l'édition (indice non bloquant « une fiche publiée similaire existe »), **bloquant seulement au Publish** (409 → bandeau ambre `DuplicateBanner`, réutilisé de 19-5).

## Acceptance Criteria

1. **Schéma brouillon** — `CatalogSong.publishedAt` (timestamp, nullable) ajouté par migration ; **les 7 fiches existantes reçoivent `publishedAt = createdAt`** (elles restent publiées/visibles). Modèle Sequelize mis à jour.
2. **Lectures publiques sans brouillons** — Given un user (curateur ou non), When il browse `/catalog`, cherche, voit les facettes, ouvre une fiche, ou fait « Add to my songlist », Then **aucun brouillon** n'apparaît ; un `uid` de brouillon en détail/add renvoie **404** (comportement « inexistant », cohérent §3).
3. **Index unique partiel** — L'index canonique global devient **partiel sur les publiées** ; deux **brouillons** de même (titre, artiste) coexistent sans 409 ; publier le second alors qu'un publié identique existe → **409** au Publish.
4. **Création = brouillon + autosave** — Given un curateur sur « New entry », When il tape le 1er contenu (titre ou artiste), Then une fiche **brouillon** (`publishedAt NULL`) est créée (POST) et l'écran passe en mode édition ; les changements suivants sont **autosavés** (PUT débounced ~800 ms), avec un indicateur d'état (« Saving… » / « Saved »). **Pas de bouton Save.**
5. **Publish** — Given un curateur sur un brouillon valide (au minimum un titre), When il clique **Publish**, Then `publishedAt` passe à maintenant (endpoint dédié), la fiche devient publique, retour au hub. Si un doublon **publié** existe → **409** → bandeau ambre, reste en brouillon.
6. **Hub : brouillons visibles + badgés** — Le hub `/catalog/manage` (curateur) liste **brouillons ET publiés**, les brouillons portant un badge « Draft ». Il utilise une **liste curateur incluant les brouillons** (les lectures publiques, elles, restent scopées publiées — cf. AC2). Un brouillon peut être **édité** (autosave) ou **supprimé** comme aujourd'hui.
7. **Doublon soft pendant l'édition** — Pendant l'édition d'un brouillon, taper un (titre, artiste) qui matche une fiche **publiée** affiche un indice **non bloquant** (« A "…" by … is already published in the Catalog »), sans empêcher l'autosave. Le blocage dur n'arrive qu'au Publish (AC5).
8. **Curateur bout-en-bout** — création/autosave/publish/liste-avec-brouillons gated `requireCurator` (403) ; l'UI n'expose rien de tout ça à un non-curateur ; les brouillons ne fuitent jamais côté lecture publique.

## Tasks / Subtasks (esquisse — à affiner en dev-story)

- [ ] **Backend — schéma & scoping**
  - [ ] Migration : `add-published-at-to-catalog-songs` (timestamp null) + backfill `published_at = created_at` pour l'existant. Modèle `catalogsong.js` +`publishedAt`.
  - [ ] Migration : remplacer l'index unique canonique par un **index partiel** `... WHERE published_at IS NOT NULL` (drop + recreate ; garder la discipline 23505→409). ⚠️ part en prod au merge.
  - [ ] Scoper `getCatalogList` / `getCatalogFacets` / `getCatalogEntry` / `addToSonglist` sur `publishedAt IS NOT NULL` (les 4 lectures publiques).
- [ ] **Backend — lifecycle brouillon**
  - [ ] `createCatalogEntry` crée un **brouillon** par défaut (`publishedAt = null`) au lieu de publier direct.
  - [ ] `POST /api/catalog/:uid/publish` (`publishCatalogEntry`) : valide (titre requis), set `publishedAt = now`, applique le check doublon **publié** (409). requireCurator.
  - [ ] Liste curateur incluant brouillons : param `?includeDrafts=1` gated requireCurator sur `getCatalogList` **ou** endpoint dédié `GET /api/catalog/manage` (à trancher en dev-story). N'expose les brouillons qu'aux curateurs.
  - [ ] Tests contrôleur : scoping lecture, index partiel (2 brouillons OK, publish-dup 409), publish, addToSonglist sur brouillon → 404.
- [ ] **Frontend — autosave & publish**
  - [ ] Hook autosave (débounce ~800 ms + AbortController + état saving/saved), calqué sur le pattern autosave de la fiche chanson (`SongsAutoSave`). Création lazy : 1ʳᵉ frappe non vide → `createCatalogEntry` (POST) → récupère l'uid → bascule en édition (URL `/catalog/admin/:uid`).
  - [ ] `CatalogAdmin` : retirer le bouton Save, ajouter **Publish** + indicateur autosave ; garder `DuplicateBanner` pour le 409 de Publish ; indice soft de doublon (check débounced vs published).
  - [ ] `catalogService` : `publishCatalogEntry(uid)` ; liste curateur avec brouillons ; (le PUT autosave réutilise `updateCatalogEntry`).
  - [ ] `CatalogManage` : badge « Draft » sur les lignes non publiées ; utiliser la liste curateur (brouillons inclus).
  - [ ] Tests : autosave (create lazy + PUT débounced), Publish (succès + 409), badge draft, non-fuite des brouillons en browse.

## Dev Notes

- **Interactions à ne pas casser** :
  - `getCatalogList` est **partagé** entre le browse public (`Catalog.tsx`) et le hub curateur (`CatalogManage.tsx`). Scoper la version publique sur published **casserait** l'affichage des brouillons dans le hub → il FAUT une variante curateur (param gated ou endpoint séparé). C'est le point d'attention n°1.
  - `addToSonglist` : un user ne doit pas pouvoir copier un brouillon (uid deviné) → 404. Le deep-clone existant (19-4) reste inchangé sinon.
  - `DuplicateBanner` (19-5) réutilisé tel quel pour le 409 de Publish.
  - Le bouton « New entry » du hub mène toujours à `/catalog/admin` (création) ; en mode création, la bascule vers `/catalog/admin/:uid` se fait après le POST lazy (navigate replace pour ne pas empiler l'historique).
- **Autosave — réutiliser le pattern chanson** : voir `SongsAutoSave.test.tsx` / la logique d'autosave de `Songs.tsx` (débounce + statut). Même ergonomie (Saving…/Saved), mais sur une ressource **partagée** → toujours en brouillon tant que non publié.
- **Migration en prod** : les 2 migrations (published_at + index partiel) partent en prod au merge (northwood). Backfill obligatoire pour ne pas masquer les fiches existantes.
- **Exception §3 inchangée** : les lectures restent non-scopées par user, on ajoute juste le filtre `publishedAt`. Aucune notion d'owner introduite (brouillons partagés).

### References
- [Source: `_bmad-output/implementation-artifacts/19-5-curateur-gerer-fiches.md` — hub, DuplicateBanner, CatalogAdmin bi-mode]
- [Source: `backend/controllers/catalogcontroller.js` — getCatalogList/Facets/Entry, addToSonglist, create/update, 23505→409]
- [Source: `backend/migrations/20260715000000-create-catalog-songs.js` — index unique canonique GLOBAL à rendre partiel]
- [Source: `_bmad-output/project-context.md` — Catalog : lecture non-scopée §3 (on ajoute le filtre publishedAt, pas d'owner)]
- [Source: `src/pages/Songs.tsx` + `src/__tests__/SongsAutoSave.test.tsx` — pattern autosave à reprendre]
- [Source: `src/components/DuplicateBanner.tsx` — bandeau ambre partagé]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-16 | 0.1 | Cadrage story (draft/publish + autosave) — décisions : publishedAt nullable, lectures scopées published, index unique partiel, autosave+Publish (create lazy 1ʳᵉ frappe), brouillons partagés, doublon soft puis 409 au Publish | northwood |
