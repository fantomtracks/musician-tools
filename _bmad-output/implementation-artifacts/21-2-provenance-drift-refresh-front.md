---
baseline_commit: 68e2cc9b5176aec01738ae0f862fdb6212b25fd5
---

# Story 21.2: Provenance + drift + Refresh (front, fiche Song)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
on the fiche of a song that came from the Catalog, I want to see where it came from and be told when the Catalog version has changed,
so that I can refresh my copy in one gesture.

## Acceptance Criteria

1. **Provenance + source link** — on an existing song's fiche (`/songs/:uid`), when `getSong` returns a `sourceCatalog` block (source still published), a **badge « Added from the Catalog »** and a **link to `/catalog/:uid`** (the source entry) are shown.
2. **Drift banner + Refresh** — when `sourceCatalog.drift === true`, a **banner** « A newer version of this song is in the Catalog » with a **Refresh** button appears (in addition to the badge).
3. **Refresh flow** — clicking Refresh opens a **`ConfirmDialog`**: « Update key, BPM, etc. to the Catalog version? Your instrument, tuning and notes are kept. » → on confirm, `POST /songs/:uid/refresh-from-catalog` (21.1) → the open form **reflects the new intrinsic values**, the drift banner **disappears** (drift now false), and a **success feedback** is shown (`role="status"`).
4. **Graceful degradation** — a song **not** from the Catalog, or whose source is **deleted/unpublished** (no `sourceCatalog` in `getSong`), shows **neither badge nor banner**. If the refresh fails because the source vanished (409 `source_unavailable`) or another error, a **clear error feedback** (distinct from success) is shown and the banner reflects reality.
5. **a11y + polish** — link + button ≥44px, live-region for the feedback, English, dark mode. Reuse `ConfirmDialog` and the toast/inline pattern. Do NOT bloat `Songs.tsx` — the feature is a self-contained component dropped into the fiche (one import + one element).
6. **Service** — `songService` gains `refreshSongFromCatalog(uid)` and the `Song` type gains the optional `sourceCatalog` block. No backend change (21.1 done).

## Tasks / Subtasks

- [x] **Task 1 — `songService` type + method** (AC: #6)
  - [x] `Song` type gains `sourceCatalog?: { uid; updatedAt; drift }`.
  - [x] `refreshSongFromCatalog(uid)` (POST) + typed `RefreshFromCatalogError` (`source_unavailable` / `not_from_catalog`), generic error otherwise.
- [x] **Task 2 — `CatalogSourceBanner` component** (AC: #1–#5)
  - [x] `{ songUid, onRefreshed? }`; `StrictMode`-safe abortable `getSong` → `sourceCatalog`; renders nothing when absent/error.
  - [x] Provenance badge « Added from the Catalog » + `<Link>` to `/catalog/:uid`; drift banner + Refresh only when `drift`.
  - [x] Refresh → `ConfirmDialog` → `refreshSongFromCatalog` → success (drift cleared, `role="status"`, `onRefreshed(updated)`) ; `source_unavailable`/error → `role="alert"` + (source_unavailable) badge/banner removed. Component stays mounted for the error feedback.
- [x] **Task 3 — Wire into the Song fiche** (`Songs.tsx`) (AC: #1, #3, #5)
  - [x] Import + `{editingUid && <CatalogSourceBanner songUid={editingUid} onRefreshed={s => buildFormFromSong(s, false)} />}` between the `cameFromDuplicate` notice and `<SongForm>`. `Songs.tsx` gained only the import + this element.
- [x] **Task 4 — Frontend tests** (AC: all) — +8 tests
  - [x] `songService.test.ts` (new, 4): refresh URL/return, 409 `source_unavailable`/`not_from_catalog` typed error, generic error.
  - [x] `CatalogSourceBanner.test.tsx` (4): renders nothing without `sourceCatalog`; badge+link (no banner) when not drifted; drift→Refresh→confirm→success (banner clears + `onRefreshed` + `role="status"`); `source_unavailable`→`role="alert"` + badge removed. `StrictMode`.
  - [x] Fixed 3 pre-existing Songs suites whose partial `songService` mock lacked `getSong` (retro action #2 — the banner now fetches it): added a benign default.

### Review Findings

_Code review 2026-07-24 (3 layers). Auditor: 6/6 ACs (AC5 partial — the provenance link isn't ≥44px). 2 High (single reused instance / no `key`). 0 decision-needed, 4 patch, 1 defer, 6 dismissed._

- [x] [Review][Patch] **Stale/contaminated banner across song switches** — the banner is one reused instance (`{editingUid && <CatalogSourceBanner songUid={editingUid}/>}`, no `key`) and the fetch effect never resets `source` on `songUid` change → the previous song's badge/drift shows during the new fetch (and persists if the new `getSong` errors, since `.catch` is silent). Worse: an **in-flight Refresh confirmed on song A, then navigating to B**, resolves `onRefreshed(updatedA)` → `buildFormFromSong(updatedA)` **overwrites B's open form** [src/pages/Songs.tsx banner render, src/components/CatalogSourceBanner.tsx effect + handleRefresh] — Edge (High×2). Fix: `key={editingUid}` on the banner (fresh state per song) **+** a `mountedRef` unmount guard so a resolved refresh/getSong after nav-away does not `setState`/`onRefreshed`.
- [x] [Review][Patch] **`not_from_catalog` 409 leaves the drift banner as a dead-end** — only `source_unavailable` clears `source`; a `not_from_catalog` (the copy's `sourceCatalogUid` became null server-side) falls to the generic error but keeps the banner + Refresh → every retry re-hits the 409 [src/components/CatalogSourceBanner.tsx handleRefresh catch] — Edge (Med). Fix: clear `source` on **both** 409 codes (the link is gone/invalid either way).
- [x] [Review][Patch] `getSong` `.catch(() => {})` **swallows real errors silently** (same as the 21.1 finding) — a transient failure looks like "not a Catalog copy", no log [src/components/CatalogSourceBanner.tsx effect] — Blind + Edge (Low/Med). Fix: log in the catch.
- [x] [Review][Patch] Provenance **link is not a ≥44px target** (AC5 requires it) — inline text link vs the Refresh button's `min-h-[44px]` [src/components/CatalogSourceBanner.tsx provenance block] — Auditor (Med, AC5). Fix: render it as a ≥44px tappable target (inline-flex + min-h/padding).
- [x] [Review][Defer] **Refresh can drop unsaved form edits / revert the autosave baseline** — Refresh doesn't flush the pending autosave; a narrow window (drift + unsaved edits + Refresh before the ~1.2s debounce) makes the server refresh run against the old DB row and `onRefreshed → buildFormFromSong` overwrite the just-typed personal edits (and an in-flight autosave can revert the refreshed baseline) [src/components/CatalogSourceBanner.tsx handleRefresh + src/pages/Songs.tsx autosave] — Edge (Med/High) — **deferred**: real but narrow window; the correct fix (flush pending autosave before refresh, or reseed only the intrinsic form fields) touches the delicate Songs.tsx autosave coordination and is better done deliberately. Tracked in deferred-work.

_Dismissed (6): double-click the dialog Refresh → 2 POSTs (refresh is **idempotent** — same intrinsic overwrite, same reseed; harmless) ; banner drift is a point-in-time snapshot not re-synced on in-session edits (a fiche is a point-in-time view; re-navigating refreshes it) ; success feedback doesn't auto-dismiss (minor; clears on song change) ; "abortable" comment overstates (getSong takes no signal — the guard is unmount-safety only, cosmetic wording) ; the `{}` `getSong` mock in the 3 Songs suites asserts nothing (deliberate band-aid for the partial-mock fragility, retro action #2 ; the banner reads `sourceCatalog ?? null`) ; the 409 body `.catch(() => ({}))` fallback is untested (defensive, low value)._

## Dev Notes

### Scope boundary
**Frontend only.** Backend (21.1: `getSong` `sourceCatalog{uid,updatedAt,drift}` + `POST /songs/:uid/refresh-from-catalog`) is **done** and committed (`68e2cc9`). This closes Epic 21. Do NOT touch the backend. Imposed order 21.1 → 21.2 (satisfied).

### The reseed problem — do it right (AC #3)
The fiche form was seeded (from `getSong` or the list `record`) BEFORE the refresh. After a successful refresh the server changed the intrinsic fields, so the open form is stale. The banner returns the **updated Song** from `refreshSongFromCatalog` and calls `onRefreshed(updatedSong)`; `Songs.tsx` re-seeds the form with the existing **`buildFormFromSong`** helper (no extra fetch). This updates key/bpm/… in place. Personal fields were preserved server-side, so re-seeding shows them unchanged. [Source: src/pages/Songs.tsx `buildFormFromSong`, the getSong seeding effect ~L775-799]

### Why a self-contained component (retro lesson)
`Songs.tsx` is ~2000 lines; the Epic 20 retro flagged adding fetch/state to it as a smell. Mirror the **`EmptySonglistCollections`** approach (story 20.4): a small component that owns its own `getSong` fetch + `ConfirmDialog` + refresh call + feedback, and renders nothing when irrelevant. `Songs.tsx` gains only an import + one element. [Source: src/components/EmptySonglistCollections.tsx pattern, src/pages/Songs.tsx:1986-1994 insertion point]

### Reuse — do NOT reinvent
- **`songService.getSong`** already exists and (since 21.1) returns `sourceCatalog` when applicable — the banner reuses it (a second `getSong` for the fiche is acceptable; the form path sometimes seeds from the cached list `record` which has NO `sourceCatalog`, so the banner must fetch its own). [Source: src/services/songService.ts `getSong`]
- **`ConfirmDialog`** (`isOpen/title/message/confirmText/cancelText/isDangerous/onConfirm/onCancel`) — reuse verbatim. [Source: src/components/ConfirmDialog.tsx]
- **Feedback pattern**: success = `role="status"`, error = `role="alert"` + distinct (red) style — the exact split adopted in 20.4 `CatalogCollection` (avoid a neutral toast for errors). [Source: src/pages/CatalogCollection.tsx result banner]
- **`StrictMode`-safe abortable fetch** — mirror `CatalogEntry`/`CatalogCollection` (AbortController, abort on unmount). [Source: src/pages/CatalogEntry.tsx]

### Files being modified — current state
- **`src/pages/Songs.tsx`** (UPDATE, minimal): the fiche renders `<h1>Edit song</h1>` then optional `cameFromDuplicate` notice then `<SongForm>` (L1986-1995). Insert the banner between the notice and `<SongForm>`, gated on `editingUid`. `buildFormFromSong(song, fromDuplicate)` seeds the form from a Song — reuse it in `onRefreshed`. Do NOT change the getSong seeding effect, the autosave, or anything else. [Source: src/pages/Songs.tsx]
- **`src/services/songService.ts`** (UPDATE): add the type field + the method. Match the existing service style (`apiFetch`, `credentials:'include'`, typed errors, `if (!res.ok) throw`). [Source: src/services/songService.ts]

### Project rules that bite here (project-context.md)
- **TS strict + `verbatimModuleSyntax`**: `import type` for the `Song` type. `noUnusedLocals/Parameters`. Relative imports. [§TypeScript]
- **React**: function + hooks; `dark:` on every styled element; Tailwind only + theme colors + `btn-*`/`card-base`. Toast/inline = manual pattern (no lib). [§React]
- **All UI strings English** (Songlist/Catalog vocabulary — « Catalog », « songlist »; never « Library »). [CLAUDE.md, §Langue]
- **Two Jest suites**; frontend at repo root, `src/__tests__/`, Testing Library, `StrictMode` in render helpers. Mock `songService` + `useAuth` if needed. [§Testing]
- **No new dependencies.**

### Testing standards
- Frontend suite currently **474/474** — keep green (husky runs both suites; never `--no-verify`). New tests `*.test.tsx`. Follow `catalogService.test.ts` (service) and `CatalogCollection.test.tsx` (component + ConfirmDialog + feedback) styles. Run `npm test` + `npx tsc -b` + `npm run lint`.
- The banner does its own `getSong` — a `Songs.tsx` fiche test already mocks `songService.getSong`, so the banner mounting there is covered (it renders nothing without `sourceCatalog`). Still, prefer testing the banner **in isolation** (mock `songService.getSong` + `refreshSongFromCatalog`).

### Project Structure Notes
- New: `src/components/CatalogSourceBanner.tsx` + its test.
- Modified: `src/services/songService.ts` (type + method), `src/pages/Songs.tsx` (import + one element), + the service test.
- No backend, no migration, no route change (`/songs/:uid` exists).

### Git intelligence
Last commit `68e2cc9` (21.1) is the backend this consumes — `getSong.sourceCatalog` + the refresh endpoint. On branch `feat/epic-21-catalog-song-link`. Additive front work; nothing in 21.1 changes.

### References
- [Source: _bmad-output/planning-artifacts/architecture-catalog-song-link-2026-07-21.md] — locked decisions (drift, refresh overwrite-intrinsic/preserve-personal, graceful degrade, confirm copy).
- [Source: _bmad-output/planning-artifacts/epics.md#Story 21.2: Provenance + drift + Refresh (front, fiche Song)] — ACs, banner/Refresh, confirm wording.
- [Source: _bmad-output/implementation-artifacts/21-1-provenance-drift-refresh-back.md] — the `sourceCatalog{uid,updatedAt,drift}` contract + the refresh endpoint (409 `not_from_catalog`/`source_unavailable`, returns updated Song).
- [Source: src/pages/Songs.tsx:1986-1994] — the fiche insertion point + `buildFormFromSong` reseed hook.
- [Source: src/services/songService.ts] — service style, `getSong`, `Song` type.
- [Source: src/components/EmptySonglistCollections.tsx] — the self-contained-component precedent (20.4).
- [Source: src/pages/CatalogCollection.tsx] — success/error feedback split (role=status vs role=alert), ConfirmDialog usage.
- [Source: _bmad-output/project-context.md, CLAUDE.md] — TS strict/verbatim, React/services/testing, English + vocabulary.

## Change Log

- 2026-07-23 — Story implemented (dev-story). `songService.refreshSongFromCatalog` + `Song.sourceCatalog` type · new `CatalogSourceBanner` (provenance + drift + Refresh) · wired into the Song fiche (1 import + 1 element) · 8 tests + fixed 3 partial-mock Songs suites. Frontend 482✓, tsc✓, lint✓. Closes Epic 21. Status → review.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Debug Log References

- Fresh full run surfaced 3 pre-existing Songs suites crashing on `songService.getSong is not a function` — the new self-contained banner fetches `getSong` on every fiche render, but those suites' partial `songService` mocks omitted it. **Exactly the Epic 20 retro action #2 (partial-mock fragility).** Fixed by adding a benign `getSong: jest.fn().mockResolvedValue({})` default to each (renders nothing without `sourceCatalog`); the deep-link tests' per-test overrides still win.
- One self-caught bug during TDD: on `source_unavailable` I `setSource(null)`, which made the whole component early-return (`if (!source) return null`) and swallowed the error feedback — the banner test caught it (empty DOM). Fixed: `if (!source && !feedback) return null` + guard the badge/banner blocks on `source`.

### Completion Notes List

- All 6 ACs satisfied. Frontend **482/482** (+8), `tsc -b` clean, ESLint clean. No backend. **Closes Epic 21.**
- **Self-contained component (retro lesson):** `CatalogSourceBanner` owns its own `getSong` fetch + `ConfirmDialog` + refresh + feedback and renders nothing when irrelevant; `Songs.tsx` gained only an import + one element (mirrors `EmptySonglistCollections`).
- **Reseed after Refresh:** the refresh returns the updated Song → `onRefreshed(updated)` → `buildFormFromSong` re-seeds the open form in place (no extra fetch); personal fields preserved server-side (21.1).
- **Feedback split (20.4 lesson):** success `role="status"` green / error `role="alert"` red. `source_unavailable` removes the badge/banner (source gone) while keeping the error visible.
- **Graceful degradation:** a song that isn't a Catalog copy, or whose source is draft/absent (`getSong` omits `sourceCatalog`), renders nothing.
- **Visual/interaction QA** (dark mode, mobile, the actual drift → Refresh → form-updates flow in the browser) left to manual QA before merge (front convention; the dev server was stopped). The 21.1 real smoke already proved the drift/refresh backend end-to-end.
- On branch `feat/epic-21-catalog-song-link` (baseline `68e2cc9`). NOT committed — awaiting review. Never touches `main`.

### File List

**New**
- `src/components/CatalogSourceBanner.tsx`
- `src/__tests__/CatalogSourceBanner.test.tsx`
- `src/__tests__/songService.test.ts`

**Modified**
- `src/services/songService.ts` (`sourceCatalog` type + `refreshSongFromCatalog` + `RefreshFromCatalogError`)
- `src/pages/Songs.tsx` (import + one element in the fiche)
- `src/__tests__/SongsMarkAsPlayedDirty.test.tsx`, `SongsPlaylistInlineCreate.test.tsx`, `SongsAutoSave.test.tsx` (add `getSong` to the partial mock)
