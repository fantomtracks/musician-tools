---
baseline_commit: c46bbfe0251db64ed5e3da50dff0131c398212a1
---

# Story 20.3: Import endpoint — non-atomique + playlist miroir (backend)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want to import all the entries of a Collection into my Songlist in one action,
so that I can populate my Songlist by theme (UJ-2) and get a mirror personal Playlist of that Collection for free.

## Acceptance Criteria

1. **Endpoint** — `POST /api/catalog/collections/:uid/add-to-songlist` (authenticated user; it writes the USER's own Songlist, NOT the Catalog → `authsess` only, **no** `requireCurator`). Unknown/invalid `:uid` → calm **`404`**. CSRF is applied app-wide to mutations.
2. **Mirror Playlist created or reused** — a personal Playlist **named after the Collection** is created, or **reused** if the user already has one with that name (case-insensitive `lower(name)`, reusing the Epic 10 functional unique index `playlists_user_uid_name_ci` + the create-then-catch-23505 mechanic). The Playlist belongs to the importing user.
3. **Each entry is an autonomous unit** — every **published** member entry is copied into the Songlist reusing the story 19.4 Add mechanic (`buildSongFromCatalog` deep-clone + `Song.create`, per-user duplicate index → 23505). Draft members (`publishedAt IS NULL`) are **not** importable (consistent with 19.4) and are excluded from the batch.
4. **Skip-at-insert but attach-all** — entries already in the user's Songlist are **skipped** at insert (23505 → the existing Song is looked up), but **all** batch songs (newly added **and** skipped) are **attached** to the mirror Playlist, **idempotently** on `(playlist_uid, song_uid)`.
5. **Best-effort, non-atomic** — if one entry fails, the batch is **NOT** aborted; there is **NO enclosing transaction**. Response: `{ added, skipped, failed, playlistUid }`.
6. **Idempotent re-import** — re-importing the same Collection creates **no** duplicate Song and **no** duplicate Playlist entry (playlist reused, songs skipped, attaches are no-ops).
7. **Tests (backend, mocked models)** — skip-duplicate + playlist attach; best-effort with a failing entry (batch continues, `failed` counted); idempotence (re-import → all skipped, no dup); 404 unknown collection; draft members excluded.

## Tasks / Subtasks

- [ ] **Task 1 — Import handler in `catalogcontroller.js`** (AC: #1–#6)
  - [x] `importCollectionToSonglist(req, res, next)`: 401/404 guards; load published members via `memberSongInclude(false)`; create-or-reuse playlist; best-effort loop (added/skipped/failed); idempotent attach; `res.json({ added, skipped, failed, playlistUid })`.
  - [x] Reuses `buildSongFromCatalog` + `findExistingUserSong` (19.4) — no reimplementation.
  - [x] `importCollectionToSonglist` exported.
- [x] **Task 2 — Create-or-reuse mirror Playlist** (AC: #2, #6)
  - [x] `Playlist, PlaylistSong` added to the models require.
  - [x] `resolveMirrorPlaylist(userId, name)`: create → on 23505 reuse via `lower(name)` (`playlists_user_uid_name_ci`). Mirror of `playlistcontroller.createPlaylist`.
  - [x] 0-member collection still creates/reuses the playlist (validated by unit test + real smoke).
- [x] **Task 3 — Idempotent attach (NOT `syncPlaylistSongs`)** (AC: #4, #5, #6)
  - [x] `PlaylistSong.findOrCreate` on the composite unique — additive, no wipe.
  - [x] `position` seeded from `PlaylistSong.count`, incremented per created row.
  - [x] `syncPlaylistSongs` NOT used (anchored comment explains why).
- [x] **Task 4 — Route** (AC: #1)
  - [x] `POST /collections/:uid/add-to-songlist` in the `/collections` block, `authsess` only (not `requireCurator`).
- [x] **Task 5 — Backend tests** (`backend/__tests__/catalogimportcontroller.test.js`, 8 tests) (AC: #7)
  - [x] Happy path (2 added); skip-duplicate + attach; best-effort (failed++, no 500); idempotence (reused playlist, 2 skipped, no dup); 404 unknown + invalid uid; draft exclusion (`memberSongInclude(false)` asserted); empty collection.
  - [x] Real end-to-end smoke on dev DB (throwaway published entries): import#1 `{added:2}`, import#2 `{added:0,skipped:2}` same playlistUid, full cleanup, 0 residue — validates the real Sequelize paths mocks don't (include+where, `Playlist.create` on `lower(name)`, `PlaylistSong.findOrCreate` composite, idempotence).

### Review Findings

_Code review 2026-07-21 (3 layers). Auditor: 7/7 ACs fully implemented, no anti-pattern contradiction (no transaction, no requireCurator, no syncPlaylistSongs, drafts excluded). 0 decision-needed, 1 patch, 1 defer, 6 dismissed._

- [x] [Review][Patch] Attach loop is not best-effort — a transient error (or a concurrent-import `findOrCreate` unique race on `(playlist_uid, song_uid)`) in the attach phase throws to the outer catch → 500 **after** songs are already imported, discarding the `{added,skipped,failed}` counts [backend/controllers/catalogcontroller.js attach loop] — flagged by all 3 layers (Med). **FIXED**: per-song try/catch around the attach (error → log + continue; songs stay in the Songlist; re-import is idempotent), response contract preserved. Added 2 tests (failing-attach no-500 + `position` seed/increment). Backend 356✓.
- [x] [Review][Defer] `resolveMirrorPlaylist`: a 23505 whose conflicting playlist is deleted before the folded `findOne` rethrows → 500 [backend/controllers/catalogcontroller.js `resolveMirrorPlaylist`] — deferred, narrow race (conflicting name deleted mid-request), acknowledged in the code comment, succeeds on retry, no data harm.

_Dismissed (6): `findExistingUserSong` `.catch(()=>null)` miscounts a transient-error resolve as `failed` (consistent with 19.4 `addToSonglist`, negligible best-effort accounting edge); `position` seeded from `count` vs `max+1` (the app keeps playlist positions contiguous via `syncPlaylistSongs`; sparse positions only arise from out-of-band SQL); empty-collection creates a stray playlist (intentional/spec'd, test asserts it); some tests use inline `mockNext()` (404 tests capture next; happy/best-effort assert not-called — coverage adequate); `logger` not mocked in tests (consistent with the other catalog suites); response omits a `total` echo (invariant `added+skipped+failed = members` verified correct by two layers; the response shape is AC-locked)._

## Dev Notes

### Scope boundary (read first)
**Backend only.** No frontend. This story delivers ONE endpoint + its tests. The browse/import **front** (rail, detail page, ConfirmDialog, toast recap, enrich the empty-Songlist hook) is story **20.4**. **Imposed order 20.1 → {20.2, 20.3} → 20.4** (sprint-status): 20.3 is independent of 20.2; 20.4 depends on both. Story 20.1 (Collections model + join + compose) is **done** and provides the tables this reads.

### Reuse — do NOT reinvent
This endpoint composes two existing, stable mechanics. Reuse them; do not rewrite.

- **The Add mechanic (story 19.4)** lives in the SAME file. Reuse the module-internal helpers directly:
  - `buildSongFromCatalog(catalog, userUid)` — 1:1 intrinsic copy with `structuredClone` on the JSON fields and `sourceCatalogUid` provenance. [Source: backend/controllers/catalogcontroller.js `buildSongFromCatalog`]
  - `findExistingUserSong(userUid, title, artist)` — per-user folded lookup matching the Epic 17 unique index `(user_uid, lower(title), COALESCE(lower(artist),''))`. Used to resolve the existing Song on a 23505 skip. [Source: backend/controllers/catalogcontroller.js `findExistingUserSong`]
  - The 23505 → duplicate-song pattern is already in `addToSonglist` (19.4) — mirror its `error.name === 'SequelizeUniqueConstraintError'` handling. [Source: backend/controllers/catalogcontroller.js `addToSonglist`]
- **Playlist create-or-reuse (Epic 10)** — mirror `playlistcontroller.createPlaylist`: attempt `Playlist.create`, on `SequelizeUniqueConstraintError` resolve the existing playlist by `lower(name)`. The functional unique index is `playlists_user_uid_name_ci` on `(user_uid, lower(name))` (migration 20260628000200), NOT expressible in the model DSL. `foldedNameMatch` in `playlistcontroller` shows the exact expression to replicate. [Source: backend/controllers/playlistcontroller.js `createPlaylist` / `foldedNameMatch` / `findExistingByName`]
- **Playlist attach** — the join `PlaylistSong` has composite unique `(playlist_uid, song_uid)` (story 5.7). `findOrCreate` on it is the idempotent additive attach. Do NOT reuse `syncPlaylistSongs` (transactional destroy+rebuild — see Task 3 warning). [Source: backend/models/playlistsong.js, backend/controllers/playlistcontroller.js `syncPlaylistSongs`]
- **The member list** — reuse `memberSongInclude(false)` from story 20.1 to fetch the Collection's **published** members with full attributes (needed for `buildSongFromCatalog`). [Source: backend/controllers/catalogcontroller.js `memberSongInclude`, `getCollection`]

### Non-atomic / best-effort — the crux (AC #5)
The whole point of this story is a **best-effort** import: **no enclosing `sequelize.transaction`**. Each entry is copied independently; a failure on one (DB hiccup, unexpected constraint) increments `failed` and the loop continues. This is the OPPOSITE of `playlistcontroller`, which wraps its playlist mutations in `sequelize.transaction`. A reviewer will (correctly) flag a missing transaction on most write endpoints — here its ABSENCE is the requirement, by design (epics.md § Epic 20: "import NON-ATOMIQUE best-effort, pas de transaction englobante"). Add an anchoring comment so it is not "fixed" in review.

### Response contract (AC #5) — lock it
`{ added, skipped, failed, playlistUid }` where:
- `added` = entries newly `Song.create`d.
- `skipped` = entries already in the user's Songlist (23505 → existing Song looked up). **Attached to the playlist too.**
- `failed` = entries that errored (or whose existing Song couldn't be resolved after a 23505). **NOT attached.**
- `playlistUid` = the mirror Playlist's uid (created or reused).
- Invariant: `added + skipped + failed` = number of **published** members processed. Draft members are excluded upstream and not counted.

### Draft-safety (consistency with 19.4 / 19.6)
Only **published** member entries are importable. A draft catalog entry is not public (19.6) and `addToSonglist` (19.4) rejects it — so the import must never copy a draft into a user's Songlist. Fetch members via `memberSongInclude(false)` (published-only). A curator importing gets the same published-only batch (drafts are not real content to import).

### Files being modified — current state & what to preserve
- **`backend/controllers/catalogcontroller.js`** (UPDATE): holds the whole Catalog layer incl. story 20.1 Collections handlers and the 19.4 Add helpers. Append `importCollectionToSonglist` + `resolveMirrorPlaylist`; add `Playlist, PlaylistSong` to the models require; export the new handler. Preserve everything else.
- **`backend/routes/catalog.js`** (UPDATE): add the one POST route inside the `/collections` block. `/collections/:uid/add-to-songlist` is a 3-segment path — no collision with `/:uid` — but keep it grouped with the other `/collections` routes for clarity. [Source: backend/routes/catalog.js]

### Project rules that bite here (project-context.md)
- **Backend = JavaScript CommonJS.** `require`/`module.exports`, no `.ts`, no ESM.
- **Controller pattern**: `req.session.user` → 401; `isUuid` → 404; raw-JSON responses. This endpoint writes the user's OWN songlist/playlist, so it is `authsess`-gated and user-scoped by construction (Songs/Playlists carry `userUid`) — NOT a Catalog write, so NOT `requireCurator`. [project-context.md §Framework, §Catalog exceptions]
- **`Playlist` uses `underscored: true`** (unlike Songs) and has a legacy `songUids` JSON column defaulting to `[]` — the join `PlaylistSongs` is the source of truth (5.7); leave `songUids` at its default, do not maintain it here. [backend/models/playlist.js]
- **Two Jest suites**; backend tests mock models via `jest.mock('../models')` — no real DB. Follow the existing `catalogcollectioncontroller.test.js` / `catalogcontroller.test.js` mock style (mock `CatalogCollection`, `CatalogSong`, `Song`, `Playlist`, `PlaylistSong`, `User`). [project-context.md §Testing]
- **No new dependencies.** Node 22 native, Sequelize 6, Express 4 only.

### Testing standards
- Extend `backend/__tests__/catalogcollectioncontroller.test.js` with a new `describe('importCollectionToSonglist')`, or add `backend/__tests__/catalogimportcontroller.test.js`. Mock `Song.create` to resolve (added) or reject with `{ name: 'SequelizeUniqueConstraintError' }` (skip) / a generic Error (failed). Mock `PlaylistSong.findOrCreate` → `[row, true|false]`. Mock `CatalogCollection.findByPk` to return `{ uid, name, songs: [...] }` or `null` (404).
- The non-atomic best-effort behavior is fully unit-testable with mocks (no real DB needed) — unlike 20.1's FK CASCADE. Assert the loop continues past a rejecting `Song.create` and the response counts are exact.
- Backend suite currently **346/346**; keep it green. `cd backend && npm test` + `npm run lint` (backend has its own ESLint config).

### Project Structure Notes
- Modified: `backend/controllers/catalogcontroller.js`, `backend/routes/catalog.js`.
- New: a backend test (new file or extend the collections test).
- **No migration** — this story reuses existing tables (`Songs`, `Playlists`, `PlaylistSongs`, `CatalogCollections`, `CatalogCollectionSongs`). Nothing ships to prod DB.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 20.3: Import endpoint — non-atomique + playlist miroir (backend)] — ACs, response shape, best-effort/non-atomic constraint, idempotence.
- [Source: backend/controllers/catalogcontroller.js] — `buildSongFromCatalog`, `findExistingUserSong`, `addToSonglist` (19.4), `memberSongInclude`/`getCollection` (20.1).
- [Source: backend/controllers/playlistcontroller.js] — `createPlaylist` 23505 reuse, `foldedNameMatch`, `findExistingByName`, `syncPlaylistSongs` (the one NOT to reuse).
- [Source: backend/models/playlist.js, backend/models/playlistsong.js] — `playlists_user_uid_name_ci` note, composite unique `(playlist_uid, song_uid)`.
- [Source: backend/routes/catalog.js, backend/routes/index.js] — route block ordering, app-wide CSRF.
- [Source: _bmad-output/implementation-artifacts/20-1-fondation-collections-composition.md] — Collections model/join, `memberSongInclude`, draft-safety pattern.
- [Source: _bmad-output/project-context.md] — CommonJS, controller/auth conventions, Playlist `underscored`, testing rules.

## Change Log

- 2026-07-21 — Story implemented (dev-story). Import endpoint + mirror playlist in `catalogcontroller.js` + route + 8 tests. Backend 354✓, lint✓. Real end-to-end smoke on dev DB (seed → import ×2 → cleanup, 0 residue). Status → review.
- 2026-07-21 — Code review (3 layers). Auditor 7/7 ACs. 1 patch applied (attach loop made best-effort: per-song try/catch, +2 tests), 1 deferred (resolveMirrorPlaylist 23505+null race), 6 dismissed. Backend 356✓, lint✓. Status → done.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Debug Log References

- Real smoke on dev DB (throwaway published entries, unique titles so the user can't pre-own them): `IMPORT#1 {added:2,skipped:0,failed:0,playlistUid:…}`, `IMPORT#2 {added:0,skipped:2,failed:0,playlistUid:<same>}` (idempotent), `CLEANUP songs=2 playlist=1 collection=1 entries=2`, `RESIDUE songs=0 catalog=0`. Confirms the real Sequelize paths the mocked unit tests can't exercise: the `songs` include + published-only where, `Playlist.create` hitting the `playlists_user_uid_name_ci` functional index (create-or-reuse), `Song.create` from `buildSongFromCatalog` with the user FK, and `PlaylistSong.findOrCreate` on the composite unique.

### Completion Notes List

- All 7 ACs satisfied. Backend **354/354** (+8), lint clean. No migration (reuses existing tables).
- **Best-effort / non-atomic is the design (AC #5):** NO `sequelize.transaction`; a per-entry failure increments `failed` and the loop continues. Anchored with a comment so it is not "fixed" in review (contrast with `playlistcontroller`, which is transactional).
- **Skip-but-attach (AC #4):** a 23505 on `Song.create` resolves the existing Song via `findExistingUserSong` and still attaches it to the mirror playlist. If the existing row can't be resolved (concurrent delete), it counts as `failed` (not attached).
- **Attach is additive (AC #6):** `PlaylistSong.findOrCreate` on `(playlist_uid, song_uid)`; deliberately NOT `syncPlaylistSongs` (transactional destroy+rebuild would wipe user-added songs and break best-effort). Position seeded from the current count.
- **Draft-safety:** only published members imported (`memberSongInclude(false)`), consistent with 19.4/19.6.
- **Response contract:** `{ added, skipped, failed, playlistUid }`, invariant `added+skipped+failed = published members`.
- On branch `feat/epic-20-collections` (baseline `c46bbfe`, the 20.1 commit). NOT committed yet — awaiting review. Never touches `main`.

### File List

**New**
- `backend/__tests__/catalogimportcontroller.test.js`

**Modified**
- `backend/controllers/catalogcontroller.js` (added `importCollectionToSonglist` + `resolveMirrorPlaylist` helper + `Playlist, PlaylistSong` require + export)
- `backend/routes/catalog.js` (added `POST /collections/:uid/add-to-songlist`, `authsess` only)
