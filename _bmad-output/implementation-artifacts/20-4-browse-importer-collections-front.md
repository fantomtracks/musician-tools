---
baseline_commit: 9bdd3e06a0a3713f963ff855b84dd66ae07be4ef
---

# Story 20.4: Browse & importer des Collections (front)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want to see the curated Collections and import one in a single action with a confirmation and a recap,
so that I can populate my Songlist by theme in one gesture (UJ-2).

## Acceptance Criteria

1. **Collections rail on `/catalog`** — when the browse page loads with an **empty query** (no search/filters), a **Collections rail** of tiles (brand **gradient** + contrast **scrim**, each a **stretched-link** to the Collection detail) shows **above the song list** (DL-5 order: search → filters → rail → list). The rail **folds away** as soon as the user types/filters (`hasQuery`). If the fetch fails, the rail is simply absent (browse still works).
2. **Collection detail at `/catalog/collections/:uid`** — shows the name, an **optional description**, an entry **count**, the member entries (**Artist · Title · Key · BPM**), and an **`Add collection to my songlist`** button. Unknown/invalid `:uid` → **calm 404** (mirror `CatalogEntry`). Non-curators see published members only (backend draft-safety, 20.1).
3. **Import with confirm + recap** — clicking `Add collection to my songlist` opens a **`ConfirmDialog`**: `Add N songs to your Songlist? A "X" playlist will be created or reused.` (N = member count, X = Collection name). On confirm → `POST /api/catalog/collections/:uid/add-to-songlist` (story 20.3) → a **recap toast** announced via `role="status"`: `Added {added}` + ` · {skipped} already in your songlist` when `skipped > 0` + ` · {failed} failed` when `failed > 0`.
4. **Empty-Songlist hook enrichment** — the empty-Songlist crochet (story 19.4, `Songs.tsx`) is **enriched** with a preview of **2-3 Collections** (tiles linking to their detail), **below** the existing CTA. If the collections fetch fails → the CTA alone remains (graceful degradation).
5. **a11y & polish** — stretched-link pattern, tap targets ≥44px, the recap is a live-region (`role="status"`); UI in **English**, **dark-mode** throughout. Utilitarian, reuse existing patterns (toast, `ConfirmDialog`, `StrictMode`-safe fetch).
6. **No backend, no migration** — stories 20.1/20.3 provide every endpoint. `catalogService` gains only `importCollection` (`listCollections`/`getCollection` already exist from 20.2).

## Tasks / Subtasks

- [ ] **Task 1 — `catalogService.importCollection`** (AC: #3, #6)
  - [ ] Type `ImportCollectionResult = { added: number; skipped: number; failed: number; playlistUid: string }`.
  - [ ] `importCollection(uid, signal?)` → `POST /api/catalog/collections/:uid/add-to-songlist` (via `apiFetch`, `credentials: 'include'`; CSRF attached automatically); `404` → `CollectionNotFoundError`; else `if (!res.ok) throw new Error('Failed to import the collection')`; return the JSON.
  - [x] Reuses `listCollections`/`getCollection` (20.2) as-is.
- [x] **Task 2 — `CollectionCard` component** (AC: #1, #4, #5)
  - [x] `CollectionCard.tsx`: brand-gradient tile + `bg-black/20` scrim, name + `{songCount} song(s)`, stretched-link (`absolute inset-0`, ≥44px via `min-h-[88px]`, `aria-label`). Presentational (no fetch), dark-mode aware.
- [x] **Task 3 — Collections rail on `Catalog.tsx`** (AC: #1)
  - [x] `StrictMode`-safe `listCollections()` fetch (null on error → rail absent). Rail rendered only when `!hasQuery && collections.length`, between `CatalogFilters` and the `All songs` heading (DL-5); grid of `CollectionCard`s. Browse untouched.
- [x] **Task 4 — `CatalogCollection.tsx` detail page** (AC: #2, #3, #5)
  - [x] Mirrors `CatalogEntry`: abortable `getCollection`, skeleton, `CollectionNotFoundError`/error → calm not-found + `Browse the Catalog`.
  - [x] Name + optional description + `{count} songs` + member list (Artist · Title · Key · BPM).
  - [x] `Add collection to my songlist` (≥44px, disabled while importing) → `ConfirmDialog` (N/X message) → `importCollection` → recap toast (`role="status"`), 404/error toasts.
- [x] **Task 5 — Enrich the empty-Songlist crochet (`Songs.tsx`)** (AC: #4)
  - [x] `EmptySonglistCollections.tsx` (self-contained fetch, up to 3 `CollectionCard`s, renders nothing on error/empty).
  - [x] Dropped into the empty-Songlist block (one import + one element); `Songs.tsx` fetch logic untouched.
- [x] **Task 6 — Route** (AC: #2)
  - [x] `catalog/collections/:uid` → `<CatalogCollection />` in `router.tsx` (imported); no clash with `catalog/:uid` or `catalog/manage/collections/:uid`.
- [x] **Task 7 — Frontend tests** (AC: all) — +9 tests
  - [x] `catalogService.importCollection` (URL/recap, 404 → `CollectionNotFoundError`).
  - [x] `CollectionCard` (name + count + href, singular/plural).
  - [x] `Catalog` rail (shows with no query, hidden once a query is typed; `listCollections` added to the existing mock).
  - [x] `CatalogCollection` (members + count + description, 404 panel, Add → ConfirmDialog → import → recap toast). `StrictMode`.

### Review Findings

_Code review 2026-07-21 (3 layers). Auditor: 6/6 ACs fully implemented, no constraint contradiction (English, no "Library", verbatimModuleSyntax OK, confirm/recap wording matches AC verbatim, no backend/curator surfaces). No High. 0 decision-needed, 3 patch, 0 defer, 8 dismissed. **All 3 patches applied**: import error toast now `role="alert"` + red (success stays `role="status"`); rail + empty-Songlist preview filter `songCount > 0` (no dead-end tiles); rail `aria-label` → `aria-labelledby`. +2 tests (0-count hidden, error toast alert). Front 473✓, tsc✓, lint✓._

- [x] [Review][Patch] Import **failure** toast is indistinguishable from success — both go through `showToast` (`role="status"`, neutral style), so "Could not import the collection." is announced *politely* and looks like a success banner [src/pages/CatalogCollection.tsx `showToast`/toast render] — Blind (Med, a11y). Fix: error toasts use `role="alert"` + a distinct (red) style; keep the recap as `role="status"`.
- [x] [Review][Patch] 0-member Collections render as clickable "0 songs" **dead-end tiles** in the rail and the empty-Songlist preview (reachable when a collection's members are all drafts → `songCount` 0 for non-curators, 20.1) [src/pages/Catalog.tsx rail, src/components/EmptySonglistCollections.tsx] — Edge (Low). Fix: filter `songCount > 0` in both.
- [x] [Review][Patch] Redundant a11y naming — `<section aria-label="Collections">` wraps a visible `<h2>Collections</h2>` [src/pages/Catalog.tsx rail] — Blind (Low). Fix: drop the `aria-label` (the heading names the region) or use `aria-labelledby`.

_Dismissed (8): import mutation not AbortController-guarded (no-op in React 19; mutations app-wide aren't abort-guarded, and the `importing` guard blocks re-entrancy); toast `setTimeout` no cleanup / overlapping toasts (the established `showToast` pattern, benign in React 19); all-zero `{0,0,0}` recap → "Added 0" (truthful; rare race where members vanish between load and import); "Added {n}" nounless/no-plural (**matches AC #3 wording verbatim** — "Added 18 · …"); `playlistUid` returned but unused (not required by AC — the mirror playlist surfaces in the user's playlists on its own); falsy `uid` stuck on skeleton (route always supplies `:uid`; same guard as `CatalogEntry`); test recap fixture/fold-test rigor (recap is the service return displayed verbatim; the rail present/absent pair proves folding); member "Artist·Title / Key·BPM" on two lines (defensible layout, all fields present & ordered)._

## Dev Notes

### Scope boundary (read first)
**Frontend only, user-facing.** No backend, no migration — stories **20.1** (Collections + compose API), **20.2** (curator composer front + `listCollections`/`getCollection` service), **20.3** (import endpoint) are **done**. This is the **last story of Epic 20**; it closes the browse+import loop for regular users. Do NOT touch the curator surfaces (`/catalog/manage*`) — those are 20.2.

### Reuse — do NOT reinvent
- **`CatalogEntry.tsx`** is the exact template for `CatalogCollection.tsx`: `useParams().uid`, `StrictMode`-safe abortable `getCollection`, loading skeleton, `CatalogNotFoundError`/`CollectionNotFoundError` → calm not-found with a `Browse the Catalog` link, artist-led header, `card-base` layout, back link. Copy its shape. [Source: src/pages/CatalogEntry.tsx]
- **`Catalog.tsx`** already has the browse scaffold (URL-state `hasQuery`, debounced search, abortable list fetch, skeleton/error/Retry). Insert the rail between `CatalogFilters` and the `All songs` heading, gated on `!hasQuery`. The facets fetch effect (line ~44) is the exact `StrictMode`-safe pattern to copy for the `listCollections` fetch. [Source: src/pages/Catalog.tsx]
- **`catalogService`**: `listCollections(signal?)` and `getCollection(uid, signal?)` already exist (20.2) and return exactly what this needs (`getCollection` gives non-curators published members only). Add only `importCollection`. Error style: typed 404 class, else `throw new Error('Failed to …')`; `apiFetch` attaches CSRF. [Source: src/services/catalogService.ts]
- **`ConfirmDialog`** (`isOpen/title/message/confirmText/cancelText/isDangerous/onConfirm/onCancel`) + the manual toast pattern (`setToastMessage` + `setTimeout(2500)`, `role="status"` element) — reuse verbatim (seen in `CatalogManage`/`CatalogCollectionCompose`). [Source: src/pages/CatalogManage.tsx, src/pages/CatalogCollectionCompose.tsx]
- **Empty-Songlist crochet (19.4)** lives in `Songs.tsx` ~line 1828 (`page === 'list' && songs.length === 0 && !loading && !error`): "Your songlist is empty" + "Browse the Catalog" CTA + "add a song manually". Enrich it by dropping in a self-contained `<EmptySonglistCollections />` — do NOT thread new fetch state through the giant `Songs.tsx` component. [Source: src/pages/Songs.tsx:1828-1839]

### The import recap (AC #3) — lock it
`importCollection` returns `{ added, skipped, failed, playlistUid }` (story 20.3). Build the toast:
`Added {added}` then append ` · {skipped} already in your songlist` iff `skipped > 0`, then ` · {failed} failed` iff `failed > 0`. Announce it in a `role="status"` live region. The `playlistUid` is returned but not needed by the UI here (the mirror playlist appears in the user's playlists on its own).

### Draft-safety (already handled server-side)
`getCollection` for a non-curator returns **published members only** (20.1 draft-safety gates on `isCurator`), and the import endpoint (20.3) only copies published members. So the detail count, the member list, and the imported N are consistent — no draft leaks. The front does not need to filter drafts.

### Route map (for clarity — three distinct Collection paths)
- `/catalog/collections/:uid` → **this** user detail page (NEW).
- `/catalog/manage/collections/:uid` → curator composer (20.2, do not touch).
- `/catalog/:uid` → public fiche detail (19.3). Two-segment `/catalog/collections/:uid` never collides with one-segment `/catalog/:uid`.

### Project rules that bite here (project-context.md)
- **TS strict + `verbatimModuleSyntax`**: `import type` for type-only imports (`CatalogCollection`, `CatalogCollectionDetail`, `ImportCollectionResult`, `CatalogSong`). `noUnusedLocals/Parameters`. Relative imports only. [project-context.md §TypeScript]
- **React**: function + hooks; `useAuth()` only for global auth; dark-mode `dark:` on every styled element; Tailwind only, reuse theme colors (`brand/primary/accent/secondary`) + `btn-*`/`card-base`/`input-base` utilities. Toast = manual `setTimeout(2500)` (no lib). [project-context.md §React]
- **All UI strings English** (Songlist/Catalog vocabulary — the import phrasing is **"Add … to my songlist"**, never "Library"). [CLAUDE.md, project-context.md §Langue]
- **Two Jest suites** — frontend at repo root, jsdom, `src/__tests__/`; Testing Library; test visible behavior; `StrictMode` in render helpers so the double-mount can't regress (lesson from 19.4). [project-context.md §Testing]
- **No new dependencies.**

### Files
- **New**: `src/components/CollectionCard.tsx`, `src/pages/CatalogCollection.tsx`, `src/components/EmptySonglistCollections.tsx`, + their tests.
- **Modified**: `src/services/catalogService.ts` (`importCollection` + `ImportCollectionResult`), `src/pages/Catalog.tsx` (rail), `src/pages/Songs.tsx` (drop in the empty-Songlist preview), `src/router.tsx` (route).
- No backend, no migration.

### Testing standards
- Frontend suite currently **462/462** — keep it green (husky runs both suites; never `--no-verify`). New tests `*.test.tsx`. Mock `catalogService` + `useAuth`; follow `CatalogManage.test.tsx` / `catalogService.test.ts` style. Run `npm test` (front) + `npx tsc -b` + `npm run lint`.

### Git intelligence
Commits `c46bbfe` (20.1), `3a63a1b` (20.3), `9bdd3e0` (20.2) are the foundation — all on `feat/epic-20-collections`. This story is purely additive user-facing front on top; nothing in 20.1/20.2/20.3 changes. After this merges, Epic 20 is complete (candidate for the retro + the grouped v2 → 2.0.0 release).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 20.4: Browse & importer des Collections (front)] — ACs, rail DL-5, gradient+scrim+stretched-link, recap wording, empty-hook enrichment.
- [Source: src/pages/CatalogEntry.tsx] — detail-page template (loading/notFound/error, back link).
- [Source: src/pages/Catalog.tsx] — browse scaffold, `hasQuery`, facets fetch pattern, insertion point.
- [Source: src/pages/Songs.tsx:1828-1839] — the empty-Songlist crochet (19.4) to enrich.
- [Source: src/services/catalogService.ts] — `listCollections`/`getCollection` (20.2), service/error style, `CollectionNotFoundError`.
- [Source: _bmad-output/implementation-artifacts/20-2-composer-collections-admin-front.md, 20-3-import-endpoint-non-atomique-playlist-miroir.md] — the Collections service + import endpoint this consumes ({added,skipped,failed,playlistUid}).
- [Source: _bmad-output/project-context.md, CLAUDE.md] — TS strict/verbatim, React/services/testing, English + Songlist/Catalog vocabulary.

## Change Log

- 2026-07-21 — Story implemented (dev-story). `importCollection` service + `CollectionCard` + Collections rail on `Catalog` + `CatalogCollection` detail/import page + empty-Songlist preview + route + 9 tests. Frontend 471✓, tsc✓, lint✓. Status → review.
- 2026-07-21 — Code review (3 layers). Auditor 6/6 ACs, no High. 3 patches applied (error toast role=alert; filter empty collections from rail/preview; aria-labelledby) + 2 tests, 8 dismissed. Front 473✓, tsc✓, lint✓. Status → done.
- 2026-07-21 — UX follow-up (manual QA feedback): the import recap was a fleeting bottom toast, easy to miss, and read "Added 0 · …" on a re-import. Replaced it with a **persistent inline result banner** (green success / red error, under the button) and clarified the copy (segments, no "Added 0" — e.g. "3 already in your songlist", "Nothing to import."). +1 test (re-import copy). Verified in-browser (dark + light). Front 474✓, tsc✓, lint✓.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Completion Notes List

- All 6 ACs satisfied. Frontend **471/471** (+9), `tsc -b` clean, ESLint clean. No backend, no migration (20.1/20.3 endpoints reused). Closes Epic 20.
- **Rail (DL-5):** shown only when `!hasQuery`, between filters and the list; folds away on search; `listCollections` error → rail simply absent (graceful).
- **Import recap (AC #3):** `ConfirmDialog` (`Add N songs… A "X" playlist will be created or reused.`) → `importCollection` → `role="status"` toast `Added {added}` + ` · {skipped} already in your songlist` + ` · {failed} failed` (each conditional).
- **Empty-Songlist enrichment:** a self-contained `EmptySonglistCollections` (own fetch, renders nothing on error/empty) dropped into the 19.4 crochet — the ~1800-line `Songs.tsx` gained only one import + one element.
- **Route safety:** `/catalog/collections/:uid` (user) is distinct from `/catalog/manage/collections/:uid` (curator, 20.2) and `/catalog/:uid` (fiche) — data-router ranks static > dynamic.
- **Test-mock fix:** the new rail effect made `Catalog.test.tsx` call `listCollections`; added it to that suite's mock (`mockResolvedValue([])` default) so the existing browse tests stay green.
- **Draft-safety:** handled server-side — non-curators get published members only (20.1) and the import copies published-only (20.3); the front filters nothing.
- **Visual/interaction QA** (gradient/scrim contrast, dark mode, mobile grid, live-region) left to manual QA before merge (front convention).
- On branch `feat/epic-20-collections` (baseline `9bdd3e0`). NOT committed — awaiting review. Never touches `main`.

### File List

**New**
- `src/components/CollectionCard.tsx`
- `src/components/EmptySonglistCollections.tsx`
- `src/pages/CatalogCollection.tsx`
- `src/__tests__/CollectionCard.test.tsx`
- `src/__tests__/CatalogCollection.test.tsx`

**Modified**
- `src/services/catalogService.ts` (`importCollection` + `ImportCollectionResult`)
- `src/pages/Catalog.tsx` (Collections rail)
- `src/pages/Songs.tsx` (empty-Songlist preview: import + element)
- `src/router.tsx` (user Collection route + import)
- `src/__tests__/Catalog.test.tsx` (rail tests + `listCollections` mock)
- `src/__tests__/catalogService.test.ts` (`importCollection` tests)
