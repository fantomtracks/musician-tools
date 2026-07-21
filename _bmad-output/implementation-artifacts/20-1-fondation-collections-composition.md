---
baseline_commit: 3bb40d89b491f5e46c52a87ebcd97dfdacc803a3
---

# Story 20.1: Fondation Collections + composition (backend)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curator**,
I want to create Collections and add/remove catalog entries to them through the API,
so that catalog songs can be grouped by theme (the shared, curated repertoires users will import in Epic 20's later stories).

## Acceptance Criteria

1. **Migrations** — running them creates two tables, **idempotently** (safe to replay; prod runs migrations then `sync({alter:false})` at boot):
   - `CatalogCollections` (`uid` UUID PK, `name` NOT NULL, `description` nullable TEXT, `createdAt`/`updatedAt`).
   - `CatalogCollectionSongs` join (`uid` UUID PK, `collection_uid` FK → `CatalogCollections`, `catalog_song_uid` FK → `CatalogSongs`) with a **composite UNIQUE** index on `(collection_uid, catalog_song_uid)`. Both FKs **`onDelete: 'CASCADE'`**.
2. **Create + compose (curator)** — a curator creates a Collection (`201`), then adds catalog entries to it. A single catalog entry may belong to **multiple** Collections (multi-appartenance, FR-12). Re-adding the same entry to the same Collection is **idempotent** (no `500`, no duplicate row).
3. **Hard cleanup on entry delete** — when a curator **deletes a catalog entry** (`DELETE /api/catalog/:uid`, story 19.1), every `CatalogCollectionSongs` row referencing it is **removed** (hard cleanup via FK CASCADE — no dead references). This is the **opposite regime** from `Songs.sourceCatalogUid` (soft, no FK, story 19.4) — deliberate.
4. **Deleting a Collection** cascades: its join rows are removed (FK CASCADE on `collection_uid`); the referenced catalog entries themselves are **untouched**.
5. **Write gate** — a **non-curator** attempting ANY Collection write (create / update / delete / add / remove) gets **`403`** (via `requireCurator`), NOT a 404 (Collections are readable by every logged-in user, cf. §3). CSRF applies app-wide to mutations.
6. **Read endpoints (any logged-in user, NON scoped `userUid`, §3)**:
   - `GET /api/catalog/collections` → list of `{ uid, name, description, songCount }`.
   - `GET /api/catalog/collections/:uid` → detail: the Collection + its member catalog entries; unknown/invalid `:uid` → **calm `404`** (same shape as `getCatalogEntry`).
7. **Draft-safety of members (regression guard, story 19.6)** — a Collection's member list and `songCount` expose **published entries only** to non-curators; a curator (session `isCurator`) sees drafts too. A draft catalog entry (`publishedAt IS NULL`) must never leak its existence through a Collection.

## Tasks / Subtasks

- [x] **Task 1 — Migrations (2 files, idempotent)** (AC: #1, #3, #4)
  - [x] `backend/migrations/20260721000000-create-catalog-collections.js`: `showAllTables()` guard → `createTable('CatalogCollections', { uid, name, description TEXT, createdAt, updatedAt })`, camelCase timestamps.
  - [x] `backend/migrations/20260721000100-create-catalog-collection-songs.js`: `showAllTables()` guard → `createTable` with both FKs `onDelete CASCADE`; composite UNIQUE `catalog_collection_songs_unique` guarded individually via `showIndex`.
  - [x] Both `down()` guarded symmetrically (`showAllTables` before `dropTable`).
  - [x] Validated on the dev DB: `make migrate` (both applied), `migrate:undo` ×2 (down OK), redo (clean = a single composite index), and `sync({alter:false})` with the models loaded (no duplicate index on the prod path).
- [x] **Task 2 — Models (2 files)** (AC: #1, #2)
  - [x] `backend/models/catalogcollection.js`: `belongsToMany(CatalogSong, { through: CatalogCollectionSong, as: 'songs' })`.
  - [x] `backend/models/catalogcollectionsong.js`: `collectionUid`/`catalogSongUid` FKs onDelete CASCADE, composite unique index, `belongsTo` both sides.
  - [x] `models/catalogsong.js` left untouched (belongsToMany on the Collection side only). Associations load verified.
- [x] **Task 3 — Controller handlers (extend `catalogcontroller.js`, additive)** (AC: #2, #5, #6, #7)
  - [x] `createCollection` (name required → 400; else 201).
  - [x] `updateCollection` (isUuid/findByPk → 404; name/description update).
  - [x] `deleteCollection` (404 guards; destroy → cascade cleanup).
  - [x] `addSongToCollection` (both UUIDs validated; 404 if collection/entry absent; `findOrCreate` → 201 created / 200 idempotent).
  - [x] `removeSongFromCollection` (idempotent destroy).
  - [x] `getCollections` (list + `songCount`, draft-safe via `isRequestCurator`).
  - [x] `getCollection` (404 guards; member include filtered to published-only for non-curators).
  - [x] All new handlers exported.
- [x] **Task 4 — Routes (extend `routes/catalog.js`)** (AC: #5, #6)
  - [x] `/collections` block registered **before** `GET /:uid` (no param capture).
  - [x] Writes → `authsess, requireCurator`; reads → `authsess` only.
- [x] **Task 5 — Verify the 19.1 delete cascade (AC #3)**
  - [x] `deleteCatalogEntry` unchanged; comment anchor added noting the join cascades. Cascade confirmed by dev-DB smoke test.
- [x] **Task 6 — Backend tests** (`backend/__tests__/catalogcollectioncontroller.test.js`, 17 tests)
  - [x] Create 201 / missing name 400.
  - [x] Add song: 201 / idempotent 200 / 404 (unknown collection, unknown entry, invalid uid). Multi-appartenance validated by the dev-DB smoke test.
  - [x] Non-curator write → 403 delivered by wiring `requireCurator` (own middleware suite `requirecurator.test.js`); routes verified by read.
  - [x] `getCollections` returns `songCount`; `getCollection` unknown/invalid uid → 404.
  - [x] Draft-safety: `getCollection` non-curator sets the published-only include filter; curator does not.
  - [x] Test file notes FK CASCADE is validated by the dev-DB smoke test, not the mocked suite.

### Review Findings

_Code review 2026-07-21 (3 layers: Blind Hunter / Edge Case Hunter / Acceptance Auditor). Auditor: 7/7 ACs fully satisfied, no spec violation. 0 decision-needed, 2 patch, 2 defer, 5 dismissed._

- [x] [Review][Patch] Un-indexed FK `catalog_song_uid` → deleting a catalog entry (19.1) cascades on a non-index-leftmost column (seq scan + row locks on `CatalogCollectionSongs`); add a standalone index while the table is empty [backend/migrations/20260721000100-create-catalog-collection-songs.js] — **FIXED**: added `catalog_collection_songs_catalog_song_uid` index (guarded via `showIndex`); re-applied + verified on dev DB.
- [x] [Review][Patch] `getCollections` eager-loads FULL member `CatalogSong` rows only to take `.length`; restrict the count include to `attributes: ['uid']` [backend/controllers/catalogcontroller.js `getCollections` / `memberSongInclude`] — **FIXED**: `memberSongInclude` now takes an `extra` arg; `getCollections` passes `{ attributes: ['uid'] }`.
- [x] [Review][Defer] Truthy non-string / over-255 `name` yields a 500 instead of 400 [backend/controllers/catalogcontroller.js `createCollection`/`updateCollection`] — deferred, app-wide `normalizeText` behavior (identical in `createCatalogEntry`/`createSong`); harden in the shared helper, not this story
- [x] [Review][Defer] add-to-collection TOCTOU: a concurrent delete between the existence check and `findOrCreate` surfaces as 500, not 404 [backend/controllers/catalogcontroller.js `addSongToCollection`] — deferred, rare curator-only race, no data corruption

_Dismissed (5): FK-CASCADE not in mocked unit suite (by design per project mocked-model rule + dev-DB smoke test); draft-hiding tests assert include shape not SQL outcome (inherent to mocked models, same bar as 19.6); description create/update asymmetry (false positive — blank `description` folds to `null` and DOES clear on update); partial out-of-order migration `down` FK failure (reverse-order undo is the CLI default; matches `playlist_songs`); model inline unique index + `sync` duplicate (benign, documented, mirrors `PlaylistSong`, prod path validated)._

## Dev Notes

### Scope boundary (read first)
**Backend only.** No frontend, no service, no UI. The curator composer UI is story **20.2**; the import endpoint + mirror playlist is **20.3**; the browse/import front is **20.4**. This story delivers: 2 migrations, 2 models, controller CRUD + compose, routes, tests. **Imposed order 20.1 → {20.2, 20.3} → 20.4** (sprint-status).

### Reuse — do NOT reinvent
This story is a near-mirror of the existing Catalog write layer (story 19.1) plus the existing join-table pattern (`PlaylistSongs`, story 5.7). **Copy those patterns; do not invent new ones.**

- **Idempotent create-table migration** — copy the exact shape of `backend/migrations/20260715000000-create-catalog-songs.js`: `showAllTables()` guard around `createTable`, camelCase `createdAt`/`updatedAt` columns, functional/extra indexes added separately with `IF NOT EXISTS` / `showIndex` guard, symmetric guarded `down()`. [Source: backend/migrations/20260715000000-create-catalog-songs.js]
- **Composite-unique join table (FK CASCADE)** — copy `backend/migrations/20260611000000-create-playlist-songs.js` and `backend/models/playlistsong.js`: FK columns snake_case (`collection_uid`, `catalog_song_uid`) with `references` + `onDelete: 'CASCADE'`; composite unique index guarded individually via `showIndex` ("sync may have created the table without indexes"); model declares the composite unique in `indexes` + `belongsTo` on each side. The playlist join comment states the intent verbatim: the FK cascade "kills the orphan-UID class of bugs" — that IS our hard cleanup (AC #3/#4). [Source: backend/migrations/20260611000000-create-playlist-songs.js, backend/models/playlistsong.js]
- **Controller conventions** — mirror `catalogcontroller.js`: `req.session.user` presence, `isUuid(req.params.uid)` → `404`, `findByPk` → `404`, raw-JSON responses (no `{data:...}` envelope; delete → `{ message: '...' }`), `try/catch → next(createError(500, ...))`, `logger.error`. The list endpoint may use an envelope like `getCatalogList` does, but AC #6 only needs a plain array — keep it a plain array unless pagination is added later. [Source: backend/controllers/catalogcontroller.js]
- **`isRequestCurator(req)` already exists** in `catalogcontroller.js` (lazy `User.findByPk` → `isCurator`) — reuse it for the draft-safety branch (AC #7). Do not write a second curator lookup. [Source: backend/controllers/catalogcontroller.js `isRequestCurator`]
- **`requireCurator` middleware** already returns the deliberate **403** (not 404) for non-curators — just wire it onto the write routes; do not re-implement the gate, and do NOT "fix" its 403 to a 404 in review (named exception, project-context.md §Catalog). [Source: backend/middleware/requirecurator.js]
- **`normalizeText`** (trim; `''`→`null`; `undefined`→untouched) is defined at the top of `catalogcontroller.js` — reuse for `name`/`description`. [Source: backend/controllers/catalogcontroller.js]

### Files being modified — current state & what to preserve
- **`backend/controllers/catalogcontroller.js`** (UPDATE): a large module holding the full Catalog write/read/add layer. **Preserve all existing exports and behavior**; append the new handlers and add them to `module.exports`. Do not touch `createCatalogEntry`/`updateCatalogEntry`/`deleteCatalogEntry`/`addToSonglist`/`getCatalogList`/`getCatalogEntry`/`getCatalogFacets`/`getCatalogExists`/`publishCatalogEntry` beyond the one comment anchor near `deleteCatalogEntry`.
- **`backend/routes/catalog.js`** (UPDATE): route order is load-bearing. Sub-paths (`/facets`, `/exists`) are declared **before** `/:uid` precisely so they aren't captured as a uid. Insert the `/collections` block **before** `router.get('/:uid', ...)`. The single-segment `GET /:uid` would otherwise swallow `GET /collections`. [Source: backend/routes/catalog.js]

### Route/param collision — critical
`GET /:uid` (a single path segment) matches `GET /collections`. `PUT /:uid` matches `PUT /collections`. Therefore **every `/collections*` route must be registered before the bare `/:uid` routes**. Two-segment paths (`/collections/:uid`) don't collide with `/:uid`, but keep the whole block together and above `/:uid` for clarity.

### Draft-safety detail (AC #7) — do not skip
Catalog entries have a draft/published lifecycle since story 19.6 (`publishedAt` NULL = draft, invisible to non-curators; a draft must not be discoverable, even by guessing its uid). A Collection may contain a draft entry. If `getCollection`/`getCollections` returned draft members to a non-curator, it would **leak a draft's existence** — a real regression against 19.6. So filter members/`songCount` to `publishedAt IS NOT NULL` for non-curators (curators see all). Implement via the association `include` with a `where: { publishedAt: { [Op.not]: null } }` (non-curator) or unfiltered (curator). `Op` is already imported in the controller. [Source: backend/controllers/catalogcontroller.js `getCatalogEntry` draft branch, models/catalogsong.js `publishedAt`]

### Data-shape decisions (locked)
- Table names: **PascalCase plural** `CatalogCollections`, `CatalogCollectionSongs` (matches `CatalogSongs`, `PlaylistSongs`, `Playlists`).
- FK columns: **snake_case** `collection_uid`, `catalog_song_uid` (matches `playlist_uid`/`song_uid`).
- `description`: **TEXT** nullable (a description can exceed a STRING's practical use; TEXT is the safe choice for free prose).
- **No name-uniqueness on `CatalogCollections`** — AC does not require it. The *personal mirror playlist* uniqueness (`lower(name)`) is a story 20.3 concern (reuses Epic 10 `createPlaylist`/`PlaylistConflictError`), NOT a Collection-name constraint here. Do not add a unique index on collection name.
- Compose idempotency: rely on `findOrCreate` against the composite-unique key; do not catch-and-swallow a raw `23505` unless `findOrCreate` proves awkward with the mock (it shouldn't).

### Project rules that bite here (project-context.md)
- **Backend = JavaScript CommonJS.** `require`/`module.exports` only. No `.ts` files, no ESM. [project-context.md §Language]
- **Models auto-load** by reading `backend/models/` — creating the two model files is enough to register them; `models/index.js` wires associations by calling each model's `associate(models)`. [project-context.md §Framework]
- **All English**, code + comments (even though old files carry stray French comments — do not imitate that). [project-context.md §Langue]
- **Migration idempotence is mandatory** (`describeTable`/`showAllTables`/`showIndex` guards) — every migration merged to `main` ships to prod and runs against the live DB, then `sync({alter:false})`. Test locally first (Postgres on port **5433**, `NODE_ENV=development`). [project-context.md §Framework, §Env]
- **Two Jest suites, never mixed.** Backend tests live in `backend/__tests__/`, run with `cd backend && npm test`, models mocked via `jest.mock('../models')` — no real DB. Follow that pattern for the new controller tests. [project-context.md §Testing]
- **404/scoping exceptions for Catalog are assumed and named** — reads non-scoped, writes 403 (not 404). Collections inherit this (shared data). Do not flag or "fix" them. [project-context.md §Catalog]

### Testing standards
- New test file `backend/__tests__/catalogcollectioncontroller.test.js` (or extend `catalogcontroller.test.js`), Jest node env, `jest.mock('../models')` — assert controller behavior against mocked `CatalogCollection`/`CatalogCollectionSong`/`CatalogSong`. Backend currently green at **329/329**; keep it green (husky pre-commit runs both suites — never `--no-verify`).
- FK CASCADE (AC #3/#4) can't be exercised under mocked models → validate it by the dev-DB smoke test (Task 1) and state that explicitly in the test file, mirroring how 19.1 validated its functional index on the dev DB.
- Run `cd backend && npm run lint` (backend has its own ESLint config; the root ESLint only covers `.ts/.tsx`).

### Git intelligence (recent branch = v2 Catalog cluster)
Last commits are the 19.7–19.12 shared-components refactors (all `done`, just merged into `v2`). Epic 19 (19.1–19.12) is the direct foundation: `CatalogSong` model, `catalogcontroller`, `requireCurator`, the canonical global unique index, draft/publish (19.6), and `sourceCatalogUid` soft provenance (19.4). This story is **additive** on top of all of it — nothing in Epic 19 changes.

### Project Structure Notes
- New: `backend/migrations/20260721000000-create-catalog-collections.js`, `backend/migrations/20260721000100-create-catalog-collection-songs.js`, `backend/models/catalogcollection.js`, `backend/models/catalogcollectionsong.js`, `backend/__tests__/catalogcollectioncontroller.test.js`.
- Modified: `backend/controllers/catalogcontroller.js`, `backend/routes/catalog.js`.
- Migration timestamps `20260721000000`/`...000100` sort after all existing Catalog migrations (`20260716000100` is the latest). Adjust only if a later-dated migration lands first.
- ⚠️ **These 2 migrations ship to PROD at merge** (idempotent + dev-tested). No data backfill needed (new empty tables).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 20.1: Fondation Collections + composition (backend)] — ACs, FR-12, hard-cleanup wording, file hints.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 20: Catalog — Collections] — reuse of `createPlaylist`/`PlaylistConflictError` (20.3), Add mechanic (19.4).
- [Source: backend/migrations/20260715000000-create-catalog-songs.js] — idempotent create-table + functional-index pattern.
- [Source: backend/migrations/20260611000000-create-playlist-songs.js, backend/models/playlistsong.js] — composite-unique join table with FK CASCADE.
- [Source: backend/controllers/catalogcontroller.js] — controller conventions, `isRequestCurator`, `normalizeText`, draft branch.
- [Source: backend/routes/catalog.js] — route ordering (`/facets`/`/exists` before `/:uid`).
- [Source: backend/middleware/requirecurator.js] — the deliberate 403 write gate.
- [Source: _bmad-output/project-context.md] — CommonJS/model-autoload/migration-idempotence/testing/Catalog-exceptions rules.

## Change Log

- 2026-07-21 — Story implemented (dev-story). 2 migrations + 2 models + controller CRUD/compose + routes + 17 tests. Backend 346✓, lint✓. Migrations + FK CASCADE validated on dev DB. Status → review.
- 2026-07-21 — Code review (3 layers). Auditor 7/7 ACs. 2 patches applied (index on `catalog_song_uid`; `getCollections` counts via `attributes:['uid']`), 2 deferred (app-wide `normalizeText` validation; add TOCTOU), 5 dismissed. Backend 346✓, lint✓, dev DB re-verified. Status → done.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Debug Log References

- `make migrate` → both migrations applied on dev DB.
- Observed a transient DUPLICATE composite unique index (`..._key` constraint alongside `catalog_collection_songs_unique`) on the first apply. Root cause: **nodemon (in the backend container) auto-restarted when the model files were written, so `sync({alter:false})` created the table with an inline unique constraint BEFORE `make migrate` ran** — the exact race the `showIndex` guard is designed for (see `playlist_songs`). Confirmed benign for prod: `migrate:undo ×2` (down OK) → redo yields a **single** composite index, and an explicit `sync({alter:false})` with the models loaded (the prod boot order: migrate → sync) adds **no** duplicate. Dev DB left clean.
- FK CASCADE smoke test (SQL): entry in two collections → deleting the entry clears both join rows (AC #3); deleting a collection clears its join row while the entry survives (AC #4); composite unique rejects a re-add; 0 residual rows.

### Completion Notes List

- All 7 ACs satisfied. Backend suite **346/346** (+17), backend lint clean.
- **Scope decision honored:** full CRUD on Collections (create/update/delete) + compose (add/remove), per the epic's "CRUD Collections + compose" wording — richer than the lighter detailed ACs, to avoid 20.2 rework. No name-uniqueness on Collections (that's a 20.3 mirror-playlist concern).
- **Draft-safety (AC #7):** `getCollection`/`getCollections` filter member entries to `publishedAt IS NOT NULL` for non-curators via the association include (`required:false` so a drafts-only collection still returns with an empty member list). Prevents a draft entry leaking through a Collection (regression guard vs 19.6).
- **Hard cleanup (AC #3/#4)** is declarative — FK `onDelete CASCADE` on both join columns (mirror of `PlaylistSongs`), so `deleteCatalogEntry` needed no code change (only a comment anchor). Validated on dev DB (cannot be exercised under mocked-model unit tests — noted in the test file).
- **403 write gate (AC #5):** delivered by wiring the existing `requireCurator` on the `/collections` write routes (its own suite `requirecurator.test.js` covers the 403); no route-integration test added (consistent with the Epic 19 test bar — controllers unit-tested with mocked models, middleware tested separately).
- ⚠️ **2 migrations ship to PROD at merge** (idempotent + dev-tested). New empty tables, no backfill.
- On branch `feat/epic-20-collections` (off `v2`). NOT committed yet — awaiting review. Never touches `main`.

### File List

**New**
- `backend/migrations/20260721000000-create-catalog-collections.js`
- `backend/migrations/20260721000100-create-catalog-collection-songs.js`
- `backend/models/catalogcollection.js`
- `backend/models/catalogcollectionsong.js`
- `backend/__tests__/catalogcollectioncontroller.test.js`

**Modified**
- `backend/controllers/catalogcontroller.js` (added 7 Collection handlers + `memberSongInclude` helper + require + exports + comment anchor on `deleteCatalogEntry`)
- `backend/routes/catalog.js` (added the `/collections` route block before `/:uid`)
