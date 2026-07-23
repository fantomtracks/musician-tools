---
baseline_commit: 385d1217384e98a752db39a6819261f2c7580ce5
---

# Story 21.1: Provenance + drift + refresh (backend)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want my copied song to know its source Catalog entry and whether that entry has changed,
so that I can refresh my copy to the Catalog version.

## Acceptance Criteria

1. **Migration + backfill (idempotent)** — `Songs.source_catalog_synced_at` (DATE, nullable) is added (guarded via `describeTable`). Existing copies (`source_catalog_uid` NOT NULL, `source_catalog_synced_at IS NULL`) are **backfilled** to the source `CatalogSong."updatedAt"` if resolvable, else `Songs."createdAt"` — so **no legacy copy shows a false "update available"**. Ships to **PROD** at merge (idempotent + dev-tested).
2. **Stamp at copy time** — `buildSongFromCatalog` sets `sourceCatalogSyncedAt = catalog.updatedAt` (covers both the *Add* path 19.4 and the *import* path 20.3).
3. **`getSong` enriched** — `GET /api/songs/:uid` (scoped `userUid` → 404) of a Song with `sourceCatalogUid` set **and** the source **published** returns an extra `sourceCatalog: { uid, updatedAt, drift }`, where `drift = CatalogSong.updatedAt > Song.sourceCatalogSyncedAt`. If the source is **absent or a draft** (`publishedAt IS NULL`) → the `sourceCatalog` field is **omitted** (graceful; the Catalog read is NON-scoped, §3). The rest of the response is unchanged.
4. **Refresh endpoint** — **`POST /api/songs/:uid/refresh-from-catalog`** (auth, scoped `userUid` → **404** for not-yours/unknown):
   - Song has no `sourceCatalogUid` → **409** (`not_from_catalog`).
   - Source absent or draft → **409** (`source_unavailable`) — the copy is untouched.
   - Otherwise the **intrinsic** fields are **overwritten** from the current Catalog entry (JSON **deep-cloned**): `key, bpm, mode, timeSignature, durationSeconds, language, genre, streamingLinks, pitchStandard`. The **personal** fields (`capo, notes, instrument, instrumentTuning, instrumentDifficulty, technique, instrumentLinks, myInstrumentUid, lastPlayed`) and the **identity** fields (`title, artist, album`) are **left untouched**. `sourceCatalogSyncedAt = CatalogSong.updatedAt`. Returns the updated Song.
5. **Tests** — backend (mocked models): `getSong` drift true/false + omitted when source draft/absent ; refresh overwrites intrinsic **and preserves personal/identity** (assert the `update` payload) ; 404 (not yours) ; 409 (no source / source unavailable). Plus a **dev-DB smoke** for the migration + backfill.

## Tasks / Subtasks

- [x] **Task 1 — Migration `add-source-catalog-synced-at-to-songs`** (AC: #1)
  - [x] `20260722000000-add-source-catalog-synced-at-to-songs.js` : `describeTable` guard → `addColumn` DATE nullable ; `down` gardé (mirror 19.4 add-column).
  - [x] Backfill idempotent (`COALESCE(source.updatedAt, Song.createdAt)` WHERE source_catalog_uid NOT NULL AND synced_at IS NULL), pas de FK.
  - [x] **Validé base dev** : 5 copies backfillées (3 = `source.updatedAt` exact, drift=0 ; 2 dangling → `createdAt`) ; replay = no-op.
- [x] **Task 2 — Model + stamp at copy** (AC: #2)
  - [x] `song.js` : attribut `sourceCatalogSyncedAt` (field `source_catalog_synced_at`).
  - [x] `buildSongFromCatalog` pose `sourceCatalogSyncedAt: catalog.updatedAt` (couvre *Add* 19.4 + *import* 20.3) ; assertion ajoutée au test `addToSonglist`.
- [x] **Task 3 — `getSong` enrichment** (AC: #3)
  - [x] `sourceCatalog{uid,updatedAt,drift}` quand source publiée (lecture §3 non-scopée) ; omis si brouillon/absente ; `CatalogSong` ajouté à l'import du contrôleur.
  - [x] Draft-safety : pas de `sourceCatalog` pour source draft/absente.
- [x] **Task 4 — `refreshSongFromCatalog` + route** (AC: #4)
  - [x] Handler : scopé userUid (404) ; 409 `not_from_catalog` / `source_unavailable` ; overwrite intrinsèque (deep-clone JSON) + `sourceCatalogSyncedAt`, préserve perso/identité ; exporté.
  - [x] Route `POST /:uid/refresh-from-catalog` (authsess).
- [x] **Task 5 — Backend tests** (AC: #5) — +9 tests
  - [x] `getSong` : drift true/false, omis si draft/absent, inchangé sans sourceCatalogUid.
  - [x] `refreshSongFromCatalog` : overwrite intrinsèque + **préserve perso/identité** (assertion payload sans capo/notes/title/artist) + deep-clone ; 404 ; 409 ×2.
  - [x] Note : backfill (AC #1) validé par smoke base dev, pas par la suite mockée. + **smoke end-to-end réel** (drift true → refresh → key/bpm écrasés, capo préservé → drift false).

### Review Findings

_Code review 2026-07-23 (3 layers). Auditor: 5/5 ACs fully satisfied, intrinsic set exact, scoping/§3/draft-safety correct, no High. 0 decision-needed, 3 patch, 0 defer, 5 dismissed. **All 3 patches applied**: backfill fixed to `Songs."createdAt"` (was hiding real legacy drift — ADR corrected + dev-DB re-validated, 5/5 = createdAt); `getSong` catch now logs the source-lookup failure (no longer silent); +1 test for the draft-source `source_unavailable` branch. Backend 366✓, lint✓._

- [x] [Review][Patch] **Backfill hides real drift on legacy copies** — `synced_at = source.updatedAt` (current) stamps a legacy copy made from v1 (source since edited to v2) as v2 → `drift=false` forever, though it IS stale [backend/migrations/20260722000000-…] — Blind + Edge (Med). Fix: backfill = `Songs."createdAt"` (the copy moment ; if the source was edited after, drift=true — correct). **Corrects the ADR's backfill rationale** (createdAt does not produce false positives; source.updatedAt hid true drift). Update the ADR note + the dev-DB re-validation.
- [x] [Review][Patch] `getSong` `.catch(() => null)` **silently swallows a real DB error** on the Catalog lookup → `sourceCatalog` omitted with no log, indistinguishable from "no source" (and inconsistent with refresh, which surfaces the same fault) [backend/controllers/songcontroller.js `getSong`] — Blind + Edge (Med). Fix: log in the catch (keep graceful degradation, but not silent).
- [x] [Review][Patch] The `source_unavailable` **draft** branch is untested — the test only covers `findByPk → null` (gone), not `publishedAt: null` (draft); a regression dropping the `publishedAt` check would pass [backend/__tests__/songcontroller.test.js] — Blind (Low). Fix: add a draft-source test.

_Dismissed (5): timestamp-drift over-reports on a non-intrinsic edit (album/title bump → phantom "update available" → harmless refresh clears it) — the ADR **deliberately** chose timestamp over field-diff (field-diff = over-engineering) ; refresh overwrites the user's intrinsic edits with no drift-gate/confirm — **by design** (northwood's D2 "overwrite intrinsic" ; the ConfirmDialog + drift-gating live on the front 21-2 ; a no-drift refresh is a harmless idempotent no-op) ; `synced_at` NULL → `drift=true` default (safe over-alert ; no NULLs remain after the in-migration backfill ; all copy paths go through `buildSongFromCatalog`) ; `album` copied at build but not refreshed (album is **identity** per ADR — same as title/artist, intentional) ; unbatched full-table backfill UPDATE (negligible at this app's scale, one-time, same style as the 5.7 playlist backfill)._

## Dev Notes

### Scope boundary
**Backend only.** The front (provenance badge + source link + drift banner + Refresh ConfirmDialog on the Song fiche) is story **21-2**. Imposed order **21-1 → 21-2**. This story is **additive** — it does not change the default snapshot behavior of 19.4; the connection is opt-in via the new Refresh action.

### Locked design (ADR 2026-07-21)
[Source: _bmad-output/planning-artifacts/architecture-catalog-song-link-2026-07-21.md]
- Drift by **timestamp** (`sourceCatalogSyncedAt`), NOT field-by-field diff.
- Refresh **overwrites intrinsic**, **preserves personal + identity**. Explicit action (the front confirms).
- Backfill = `source.updatedAt` → no false drift on legacy copies.
- Source deleted/unpublished → graceful (no `sourceCatalog`, refresh 409).

### The intrinsic vs personal split — get this exactly right
The **intrinsic** fields (copied 1:1 from a CatalogSong, DL-17) are the ONLY ones Refresh overwrites: `key, bpm, mode, timeSignature, durationSeconds, language, genre, streamingLinks, pitchStandard`. This is the SAME set as `catalogcontroller.INTRINSIC_FIELDS` + `key`/`mode` (mirror `buildSongFromCatalog`), MINUS `title/artist/album` (identity — never touched, so per-user uniqueness on `(title,artist)` from Epic 17 is unaffected). Everything else on the Song is **personal** and preserved. [Source: backend/controllers/catalogcontroller.js `INTRINSIC_FIELDS`/`buildSongFromCatalog`, backend/models/song.js]

### Files being modified — current state
- **`backend/controllers/songcontroller.js`** (UPDATE): `getSong` is a simple scoped `findOne` → `res.json(song)` (7.5 pattern). Enrich the response only (do not change the 404/scoping). Add `refreshSongFromCatalog`. Preserve `createSong`/`updateSong`/`markSongPlayed`/etc. Add `CatalogSong` to the `require('../models')` destructure. [Source: backend/controllers/songcontroller.js `getSong` L87]
- **`backend/controllers/catalogcontroller.js`** (UPDATE): one line in `buildSongFromCatalog` (`sourceCatalogSyncedAt: catalog.updatedAt`). Do NOT touch the rest.
- **`backend/models/song.js`** (UPDATE): one attribute added.
- **`backend/routes/songs.js`** (UPDATE): one route added (`authsess`, among `/:uid/...`).

### Reuse — do NOT reinvent
- **Migration add-column** pattern: copy `backend/migrations/20260715000200-add-source-catalog-uid-to-songs.js` (describeTable guard, no FK, guarded down). Add the backfill UPDATE after. [Source: same file]
- **Controller pattern** (project-context.md): `req.session.user` → 401 ; `isUuid` → 404 ; **scoped** `findOne({ where: { uid, userUid } })` → 404 (7.5, no 403). The Refresh writes the user's OWN Song → `authsess` only. The Catalog **read** inside is NON-scoped (§3 exception — a shared entry). Raw-JSON responses ; `structuredClone` for JSON deep-clone (Node 22, already used in `buildSongFromCatalog`). [project-context.md §Framework, §Catalog]
- **`isUuid`**, `createError`, `logger` already imported in songcontroller.

### Project rules that bite here (project-context.md)
- **Backend = CommonJS**, no `.ts`, no ESM. **All English** (code comments too). [§Language]
- **Migration idempotence mandatory** + tested on the dev DB (Postgres 5433, `NODE_ENV=development`) before "done" — it ships to prod at merge. camelCase timestamp columns (`"createdAt"`/`"updatedAt"`) — both Songs and CatalogSongs use `timestamps:true` WITHOUT `underscored`. [§Framework, §Env]
- **Two Jest suites**; backend tests mock `../models` (`jest.mock('../models')`), no real DB. Follow `songcontroller.test.js` / `catalogcollectioncontroller.test.js` style. [§Testing]
- **`structuredClone`** the JSON fields (language/genre/streamingLinks) on refresh so the Song and the shared CatalogSong never share a reference (same as `buildSongFromCatalog`). [backend/controllers/catalogcontroller.js]

### Testing standards
- Extend `backend/__tests__/songcontroller.test.js` (add `getSong` drift cases + a `refreshSongFromCatalog` describe) or a new file. Mock `CatalogSong.findByPk`, `Song.findOne`, and the instance `.update`/`.toJSON`. Backend suite currently **356/356** — keep green (`cd backend && npm test`, `npm run lint`).
- The migration backfill can't be exercised under mocked models → dev-DB smoke (seed a Song with `source_catalog_uid` + a CatalogSong, run migrate, assert `source_catalog_synced_at` = the catalog's `updatedAt`), mirroring how 19.1/20.1 validated migrations on dev.

### Project Structure Notes
- New: `backend/migrations/20260722000000-add-source-catalog-synced-at-to-songs.js` (+ its dev-DB smoke, ad-hoc).
- Modified: `backend/models/song.js`, `backend/controllers/songcontroller.js`, `backend/controllers/catalogcontroller.js`, `backend/routes/songs.js`, backend test(s).
- ⚠️ **Migration part en PROD au merge** (via v2). Backfill idempotent, testé local.

### References
- [Source: _bmad-output/planning-artifacts/architecture-catalog-song-link-2026-07-21.md] — decisions (drift timestamp, refresh overwrite-intrinsic/preserve-personal, backfill, graceful degrade).
- [Source: _bmad-output/planning-artifacts/epics.md#Story 21.1: Provenance + drift + refresh (backend)] — ACs, field lists, endpoint contract.
- [Source: backend/controllers/songcontroller.js `getSong`] — the scoped read to enrich.
- [Source: backend/controllers/catalogcontroller.js `buildSongFromCatalog`/`INTRINSIC_FIELDS`] — the copy mechanic + intrinsic set to mirror.
- [Source: backend/migrations/20260715000200-add-source-catalog-uid-to-songs.js] — add-column idempotent pattern (soft, no FK).
- [Source: backend/models/song.js] — Song attributes (intrinsic vs personal), timestamps.
- [Source: backend/routes/songs.js] — where to add the refresh route.
- [Source: _bmad-output/project-context.md] — CommonJS, controller/scoping/§3-Catalog, migration idempotence, testing rules.

## Change Log

- 2026-07-21 — Story implemented (dev-story). Migration `source_catalog_synced_at` + backfill · `buildSongFromCatalog` stamp · `getSong` drift enrichment · `POST /songs/:uid/refresh-from-catalog` + route + 9 tests. Backend 365✓, lint✓. Migration + drift/refresh validated on dev DB (real smoke). Status → review.
- 2026-07-23 — Code review (3 layers). Auditor 5/5 ACs, no High. 3 patches applied (backfill → `createdAt` [was hiding legacy drift], `getSong` catch logs, +draft-source test), 5 dismissed. ADR backfill note corrected. Backend 366✓, lint✓, dev DB re-validated. Status → done.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Debug Log References

- `make migrate` → column added + backfill. Dev DB check: 5 catalog-copies backfilled; the 3 with a resolvable source got `synced_at = source."updatedAt"` exactly (drift=0, no false "update available"); the 2 dangling ones fell back to `Song."createdAt"`. Replay = "already up to date" (idempotent).
- Real end-to-end smoke (throwaway published CatalogSong + a Song copy with an old `synced_at` + `capo=4`, cleaned up): `GET` → `sourceCatalog.drift=true`, key='C'; `POST refresh-from-catalog` → 200, key='F#', bpm=90 (overwritten from Catalog), **capo=4 preserved**; `GET` again → `drift=false` (synced_at bumped). Confirms the real Sequelize paths the mocked suite can't (findByPk + Date comparison + `song.update` persisting intrinsic-only + `.toJSON()` enrichment shape).

### Completion Notes List

- All 5 ACs satisfied. Backend **365/365** (+9), lint clean. **Additive strict** on 19.4 — the default snapshot is unchanged; the connection is opt-in via Refresh.
- **Intrinsic vs personal split (the crux):** Refresh overwrites ONLY `key, bpm, mode, timeSignature, durationSeconds, pitchStandard` (via `INTRINSIC_REFRESH_FIELDS`) + deep-cloned `language, genre, streamingLinks`. `title/artist/album` (identity → uniqueness 17.1 unaffected) and all personal fields (`capo, notes, instrument, tuning, …`) are never in the update payload — asserted in the test.
- **Draft-safety:** `getSong` omits `sourceCatalog` for a draft/absent source (no leak); `refresh` returns `409 source_unavailable`. Catalog read is NON-scoped (§3).
- **Backfill = `source.updatedAt`** → no legacy copy flags a false drift (validated on dev DB).
- ⚠️ **Migration ships to PROD at merge** (via v2). Idempotent + dev-tested.
- On branch `feat/epic-21-catalog-song-link` (off v2, baseline `385d121`). NOT committed — awaiting review. Never touches `main`.

### File List

**New**
- `backend/migrations/20260722000000-add-source-catalog-synced-at-to-songs.js`

**Modified**
- `backend/models/song.js` (`sourceCatalogSyncedAt` attribute)
- `backend/controllers/catalogcontroller.js` (`buildSongFromCatalog` stamps the column)
- `backend/controllers/songcontroller.js` (`CatalogSong` import + `getSong` enrichment + `refreshSongFromCatalog` + export)
- `backend/routes/songs.js` (refresh route)
- `backend/__tests__/songcontroller.test.js` (CatalogSong mock + 9 tests)
- `backend/__tests__/catalogcontroller.test.js` (AC2 stamp assertion + fixture `updatedAt`)
