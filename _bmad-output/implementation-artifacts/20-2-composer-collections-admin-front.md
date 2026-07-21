---
baseline_commit: 3a63a1bca9717dec95fbc5a4e9f825c407768308
---

# Story 20.2: Composer des Collections (admin front)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curator**,
I want a front-end surface to list, create, and **compose** Collections (add/remove catalog entries by search),
so that I can build themed repertoires without drag-and-drop, from within the existing Catalog curation hub.

## Acceptance Criteria

1. **Collections live in the `/catalog/manage` hub** — the hub gains an **Entries | Collections** tab switch. The **Collections** tab lists existing Collections (name + entry count), with a **New collection** action (create by name). Non-curators are redirected (privilege gate, not a 404), same as the existing hub.
2. **Composer page** at `/catalog/manage/collections/:uid` — shows the Collection's name, its member entries (Artist · Title · Key · BPM, with a **Draft** badge for unpublished members — the curator sees drafts), and lets the curator **rename** and **delete** the Collection (delete via `ConfirmDialog`). Unknown/invalid `:uid` → calm not-found.
3. **Add by search (keyboard, no drag)** — a search typeahead finds catalog entries by title/artist (server-side, curator sees drafts); selecting a result (click **or** Enter on the highlighted row) **adds** it to the Collection. Keyboard navigation reuses the shared `comboboxKeyboard` utils (`DL-14`: no drag-and-drop). Adding is idempotent (backend `findOrCreate`).
4. **Remove** — each member row has a **Remove** button that detaches it from the Collection (the catalog entry itself is untouched).
5. **Multi-appartenance** — the UI never prevents a curator from adding an entry that already belongs to another Collection (FR-12); it is a normal add.
6. **`catalogService` carries the curator Collections methods** — `listCollections`, `createCollection`, `getCollection`, `updateCollection`, `deleteCollection`, `addSongToCollection`, `removeSongFromCollection`, plus a `CollectionNotFoundError`.
7. **UI in English, utilitarian posture, dark-mode**; existing patterns reused (toast, `ConfirmDialog`, `StrictMode`-safe fetch effect). No backend change, no migration (stories 20.1/20.3 cover the API).

## Tasks / Subtasks

- [ ] **Task 1 — `catalogService` Collections methods + types** (AC: #6)
  - [ ] Types: `CatalogCollection = { uid; name; description?: string | null; songCount: number }` (list shape) and `CatalogCollectionDetail = { uid; name; description?: string | null; songs: CatalogSong[] }` (detail shape). Reuse the existing `CatalogSong` type for members.
  - [ ] `CollectionNotFoundError extends Error` (mirror `CatalogNotFoundError`) — thrown on 404 from detail/add/remove.
  - [ ] Methods (all via `apiFetch`, `credentials: 'include'`; `apiFetch` attaches CSRF on mutations):
    - all 7 methods implemented as specified.
  - [x] Error style matches the existing catalogService (typed 404 classes, else `throw new Error('Failed to …')`).
- [x] **Task 2 — `/catalog/manage` Entries | Collections tabs** (AC: #1)
  - [x] `?tab=collections` URL-state tab switch (default Entries, unchanged). Entries tab wrapped so it only renders on `tab === 'entries'`.
  - [x] Collections tab: `StrictMode`-safe `listCollections()` fetch; list of `{ name, entry count }` (row → composer); empty state.
  - [x] New collection: inline name input + button → `createCollection(name)` → navigate to the new composer; empty name disabled.
  - [x] Entries tab (search/table/bulk-delete/pager) untouched — 447 existing tests still green.
- [x] **Task 3 — Composer page `CatalogCollectionCompose.tsx`** (AC: #2, #4, #5)
  - [x] Role-gate after hooks; `StrictMode`-safe `getCollection(uid)`; `CollectionNotFoundError` → calm not-found; other error → Retry.
  - [x] Header: inline rename (`updateCollection`) + Delete collection (`ConfirmDialog` → `deleteCollection` → back to hub).
  - [x] Members list (Artist · Title · Key · BPM + Draft badge); Remove → `removeSongFromCollection` (optimistic, revert on error), toast.
  - [x] Local state kept in sync on add/remove; toast on each action.
- [x] **Task 4 — Add-by-search typeahead (reuse `comboboxKeyboard`)** (AC: #3)
  - [x] Debounced (280ms) `listCatalog({ search, includeDrafts: true, sort: 'artist', limit: 10 })`, abort superseded.
  - [x] Listbox wired with the shared `comboboxKeyboard` utils (NOT `AutocompleteInput` — options are fiches with an Add action).
  - [x] Results exclude current members; click or Enter → `addSongToCollection`; idempotent server-side. No drag (DL-14); ≥44px targets, listbox a11y.
- [x] **Task 5 — Route** (AC: #2)
  - [x] `catalog/manage/collections/:uid` → `<CatalogCollectionCompose />` added to `router.tsx` (imported), no clash with `catalog/:uid`.
- [x] **Task 6 — Frontend tests** (AC: all)
  - [x] `catalogService` Collections methods (URL/method/body, 404 → `CollectionNotFoundError`) — 6 tests appended to `catalogService.test.ts`.
  - [x] `CatalogManageCollections.test.tsx` (3): lists collections + count, New collection creates+navigates, empty state.
  - [x] `CatalogCollectionCompose.test.tsx` (6): renders members, non-curator redirect, 404 panel, search→add, Remove, Delete→confirm→hub. `StrictMode` throughout.

### Review Findings

_Code review 2026-07-21 (3 layers). Auditor: 7/7 ACs fully implemented, no constraint contradiction (no drag, no French UI, comboboxKeyboard used, verbatimModuleSyntax OK, no 20.4/backend). 0 decision-needed, 5 patch, 0 defer, 7 dismissed. **All 5 patches applied** (optimistic-mutation composer hardening): render-time member exclusion + drop `collection` dep + abort-on-cleanup; remove-revert at index; add dedupe in updater; in-flight `useRef` guards on rename + create; honest create/update return types. +2 tests strengthened (add asserts `listCatalog` called once + no `option`; Remove asserts the Remove button disappears). Front 462✓, tsc✓, lint✓._

- [x] [Review][Patch] Search effect keyed on `collection` → after every add/remove it refetches `listCatalog` and reopens the just-closed dropdown; a stale in-flight result can also re-show a just-added member [src/pages/CatalogCollectionCompose.tsx search effect] — flagged by Blind + Edge (Med). Fix: exclude current members at **render** time (filter the mapped results against `memberIds`), drop `collection` from the effect deps.
- [x] [Review][Patch] In-flight search fetch not aborted on unmount/supersession — cleanup only `clearTimeout` [src/pages/CatalogCollectionCompose.tsx search effect] — Blind + Edge (Med). Fix: abort `searchAbortRef.current` in the effect cleanup → no setState-after-unmount / stale paint.
- [x] [Review][Patch] `removeEntry` revert appends the entry to the tail, losing its original position on a failed DELETE [src/pages/CatalogCollectionCompose.tsx `removeEntry`] — Edge (Med). Fix: capture the index and splice it back.
- [x] [Review][Patch] Add is not deduped in the state updater → a fast double-add of the same entry duplicates the member (duplicate React key) [src/pages/CatalogCollectionCompose.tsx `addEntry`] — Edge (Med). Fix: `setCollection(prev => prev.songs.some(s => s.uid===entry.uid) ? prev : {...})`.
- [x] [Review][Patch] Double-submit via rapid Enter — rename (`saveRename` not guarded by `savingName` on Enter) and New-collection create (`handleCreateCollection` guard reads render-time `creating`, and there is NO name-uniqueness backstop → a duplicate Collection) [src/pages/CatalogCollectionCompose.tsx `saveRename`; src/pages/CatalogManage.tsx `handleCreateCollection`] — Edge (Med/Low). Fix: in-flight `useRef` guards.
- [x] [Review][Patch] Also fix return-type honesty (`createCollection`/`updateCollection` typed `CatalogCollectionDetail` but the API returns the row without `songs`) and strengthen 2 tests (add asserts the dropdown closes + no 2nd search; Remove asserts the row disappears) — folded into the cluster above.

_Dismissed (7): toast `setTimeout` has no cleanup / overlapping toasts clear early (the project's established toast pattern — "reuse as-is" per project-context, benign); `getCollection` fires before the role-gate redirect (consistent with `CatalogManage`; the read is auth-allowed anyway, the server is the real gate); `memberIds` `new Set` per render (not a defect); Enter with no highlight is a no-op / Enter during pending debounce (the shared `comboboxKeyboard`/`AutocompleteInput` behavior, backend idempotent); `removeSongFromCollection` has no 404→`CollectionNotFoundError` branch (the backend `destroy` never 404s on remove — the branch would be dead); entries fetch runs while on the Collections tab + stale `?search`/`?page` linger (harmless — wasted request / cosmetic URL)._

## Dev Notes

### Scope boundary (read first)
**Frontend only.** No backend, no migration — stories **20.1** (Collections model + CRUD + compose API) and **20.3** (import endpoint) are **done** and provide every endpoint this consumes. This story is the **curator** composer. The **user-facing** browse/import front (Collections rail on `/catalog`, the `/catalog/collections/:uid` detail page, ConfirmDialog import, toast recap) is story **20.4** — do NOT build any of that here. **Imposed order 20.1 → {20.2, 20.3} → 20.4**; 20.2 and 20.3 are independent, both now available for 20.4.

### Architecture decision (locked with the user, 2026-07-21)
The curator Collections surface lives **inside the existing hub**, not on the fiche form (`CatalogAdmin.tsx`, which the epic hint named, is the *entry* form — a Collections composer there would be wrong):
```
/catalog/manage
  ├─ Entries  (existing: search + table + bulk delete)
  └─ Collections (NEW: list + New collection)
        └─ /catalog/manage/collections/:uid  = composer (search + Add / Remove, rename, delete)
```
Scope is **list + create + compose + rename + delete** — deliberately NOT create-only. This avoids repeating the 19.2→19.5 miss (the fiche admin shipped create-only and needed a whole follow-up story to add list/edit/delete). The backend CRUD (20.1) already supports all of it.

### Reuse — do NOT reinvent
- **`CatalogManage.tsx`** is the model for everything: the `StrictMode`-safe fetch effect (`abortRef` + `AbortController`, abort on unmount/supersede), the `?search`/`?page` URL-state via `useSearchParams`, the `setToastMessage` + `setTimeout(2500)` toast, the `ConfirmDialog` (isDangerous) delete flow, and the role gate `if (!user?.isCurator) return <Navigate to="/" replace />` placed AFTER hooks. Copy these patterns. [Source: src/pages/CatalogManage.tsx]
- **`utils/comboboxKeyboard`** (story 19.11) provides `handleComboKeyDown`, `comboboxInputAria`, `comboboxOptionAria`, `useScrollHighlightIntoView` — reuse these for the fiche-search typeahead's keyboard/a11y. The `AutocompleteInput` component wraps them for a **string** picker (artist/album) and is NOT reusable here (options are fiches with an Add action). [Source: src/components/AutocompleteInput.tsx, src/utils/comboboxKeyboard.ts]
- **`catalogService.listCatalog`** already supports `{ search, includeDrafts, sort, limit }` + an `AbortSignal` — use it for the typeahead search (curator → `includeDrafts: true`). [Source: src/services/catalogService.ts `listCatalog`]
- **`ConfirmDialog`** props: `isOpen/title/message/confirmText/cancelText/isDangerous/onConfirm/onCancel` — reuse for the delete-collection confirm. [Source: src/pages/CatalogManage.tsx usage]
- **Draft badge** markup is already in `CatalogManage` (the amber "Draft" span for `publishedAt == null`) — copy it for member/result rows. [Source: src/pages/CatalogManage.tsx]

### Backend API contract (stories 20.1 / 20.3, already shipped)
- `GET /api/catalog/collections` → `[{ uid, name, description, songCount }]` (curator/any auth; songCount is published-only for non-curators, but the curator hub sees the true count).
- `POST /api/catalog/collections` `{ name, description? }` → `201` the collection (curator; 400 if name empty; 403 non-curator).
- `GET /api/catalog/collections/:uid` → `{ uid, name, description, songs: CatalogSong[] }`; the curator sees **draft** members (20.1 draft-safety gates on `isCurator`); `404` unknown.
- `PUT /api/catalog/collections/:uid` `{ name?, description? }` → the updated collection (400 if name blanked).
- `DELETE /api/catalog/collections/:uid` → `{ message }` (cascades the join rows; entries untouched).
- `POST /api/catalog/collections/:uid/songs` `{ catalogSongUid }` → `201` created / `200` already present (idempotent); `404` if collection/entry unknown.
- `DELETE /api/catalog/collections/:uid/songs/:catalogSongUid` → `{ message }` (idempotent).
All curator writes are `requireCurator` server-side (403) + CSRF app-wide; `apiFetch` attaches the token.

### Project rules that bite here (project-context.md)
- **TypeScript strict + `verbatimModuleSyntax`**: type-only imports MUST be `import type { X }` (e.g. `import type { CatalogSong } from '../services/catalogService'`). `noUnusedLocals/Parameters` — no dead vars, `tsc -b` fails otherwise. Relative imports only (no path aliases). [project-context.md §TypeScript]
- **React**: function + hooks; state from `useState`/`useMemo`; the ONLY global context is `AuthContext` (`useAuth()` for `user.isCurator`). Dark mode via `dark:` classes on every styled element. Tailwind only, reuse `brand/primary/accent/secondary` + the `btn-primary`/`btn-secondary`/`input-base` utility classes seen in `CatalogManage`. [project-context.md §React]
- **All user-facing strings in English** (Songlist/Catalog vocabulary — never "Library"); code comments in English. [project-context.md §Langue, CLAUDE.md]
- **Services**: one `xxxService` object per domain, raw `fetch` via `apiFetch`, `credentials: 'include'`, `if (!res.ok) throw new Error(...)` (no error-body parsing except the typed 409/404 classes). [project-context.md §Services]
- **Two Jest suites** — frontend config at repo root, jsdom, tests in `src/__tests__/` (or beside the component like `AutocompleteInput.test.tsx`), run with `npm test` at the root. Testing Library, test visible behavior. `tsconfig.test.json` is CommonJS — don't copy test import patterns into app code. [project-context.md §Testing]

### Files
- **New**: `src/pages/CatalogCollectionCompose.tsx`, its test.
- **Modified**: `src/services/catalogService.ts` (add methods/types/error), `src/pages/CatalogManage.tsx` (tabs + Collections list + New collection), `src/router.tsx` (route), plus the `catalogService` test.
- No backend, no migration.

### Testing standards
- Frontend suite currently **447/447** — keep it green (husky pre-commit runs both suites; never `--no-verify`). New tests `*.test.ts(x)`.
- Follow `src/__tests__/CatalogManage.test.tsx` (StrictMode + MemoryRouter + Routes) and `src/__tests__/catalogService.test.ts` for style. Run `npm test` (front) + `tsc -b` (via `npm run build` or the editor) + `npm run lint` (root ESLint covers `.ts/.tsx`).

### Git intelligence
Recent commits `c46bbfe` (20.1 backend) and `3a63a1b` (20.3 backend) are the foundation this consumes — both on `feat/epic-20-collections`. This story is purely additive front work on top; nothing in 20.1/20.3 changes.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 20.2: Composer des Collections (admin front)] — ACs, no-drag (DL-14), comboboxKeyboard reuse, multi-appartenance, English/utilitarian.
- [Source: src/pages/CatalogManage.tsx] — hub patterns (fetch effect, URL-state, toast, ConfirmDialog, role gate, draft badge).
- [Source: src/services/catalogService.ts] — service style, error classes, `listCatalog`.
- [Source: src/components/AutocompleteInput.tsx, src/utils/comboboxKeyboard.ts] — the shared combobox keyboard utils (reuse the utils, not the component).
- [Source: src/router.tsx] — route ordering for catalog paths.
- [Source: _bmad-output/implementation-artifacts/20-1-fondation-collections-composition.md, 20-3-import-endpoint-non-atomique-playlist-miroir.md] — the backend Collections API this consumes.
- [Source: _bmad-output/project-context.md] — TS strict/verbatim, React/services/testing conventions, English rule.

## Change Log

- 2026-07-21 — Story implemented (dev-story). catalogService Collections methods + `CatalogManage` Entries|Collections tabs + new `CatalogCollectionCompose` page + route + 15 tests. Frontend 462✓, tsc✓, lint✓. Status → review.
- 2026-07-21 — Code review (3 layers). Auditor 7/7 ACs. 5 patches applied (optimistic-mutation hardening: no-refetch/abort search, remove-revert-at-index, add dedupe, rename/create in-flight guards, honest return types) + 2 tests strengthened, 7 dismissed. Front 462✓, tsc✓, lint✓. Status → done.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Completion Notes List

- All 7 ACs satisfied. Frontend **462/462** (+15), `tsc -b` clean, ESLint clean. No backend, no migration.
- **IA (locked with northwood):** curator Collections live in the `/catalog/manage` hub via an Entries|Collections tab (`?tab=collections` URL-state); the composer is a separate route `/catalog/manage/collections/:uid`. The epic's `CatalogAdmin.tsx` hint was the *fiche* form — deliberately not used.
- **Scope = list + create + compose + rename + delete** (not create-only) to avoid repeating the 19.2→19.5 follow-up miss.
- **Combobox:** the fiche-search typeahead reuses the shared `utils/comboboxKeyboard` helpers (`handleComboKeyDown<CatalogSong>` etc.), NOT the `AutocompleteInput` component (which is a string picker for artist/album). Results exclude current members; add on click or Enter; `onMouseDown preventDefault` keeps input focus so the blur-close doesn't cancel the click.
- **Optimistic add/remove** with revert-on-error + toast; role gate after hooks; `StrictMode`-safe abortable fetches (mirror `CatalogManage`). Draft badge shown to the curator.
- **Visual/interaction QA** (dark mode, keyboard focus flow, mobile) is left to manual QA before merge (front convention; unit tests + tsc cover the logic).
- On branch `feat/epic-20-collections` (baseline `3a63a1b`). NOT committed — awaiting review. Never touches `main`.

### File List

**New**
- `src/pages/CatalogCollectionCompose.tsx`
- `src/__tests__/CatalogCollectionCompose.test.tsx`
- `src/__tests__/CatalogManageCollections.test.tsx`

**Modified**
- `src/services/catalogService.ts` (Collections types + `CollectionNotFoundError` + 7 methods)
- `src/pages/CatalogManage.tsx` (Entries|Collections tab, Collections list + New collection)
- `src/router.tsx` (composer route + import)
- `src/__tests__/catalogService.test.ts` (6 Collections method tests)
