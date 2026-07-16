# UX Design Validation Report — Musician Tools · Catalog (pool partagé)

Spine pair: `_bmad-output/planning-artifacts/ux-designs/ux-musician-tools-2026-07-12/{DESIGN.md, EXPERIENCE.md}`
Run date: 2026-07-12

## Reviewer files

- `review-rubric.md` — spine-pair rubric walk (8 dimensions)
- `review-accessibility.md` — WCAG 2.1 AA adversarial lens

> **Note.** All findings marked **[applied]** below were encoded into the spines in this finalize pass (2026-07-12). Findings marked **[deferred]** are documented here for story-dev and were intentionally left out of the apply set (they require implementation-time ARIA decisions, not new product scope). No overall grade — per-dimension verdicts and severity counts carry the picture.

## Synthesis

The spine pair is a **strong, ship-ready contract**: a consumer (architecture / story-dev) can source-extract cleanly, every `{path.to.token}` reference resolves, and the load-bearing decisions (order of Browse, inline-Add, calm-duplicate, snapshot invariant, 403-not-404, gradient tiles) are committed with DL-/FR- citations. Inheritance discipline is exemplary — no re-declared hex, all new surfaces map to concrete existing Tailwind classes verified in `src/index.css`. The two rubric gaps worth closing before stories — read-surface error / deleted-fiche-404 states, and the un-quantified gradient-tile contrast — were both addressed.

**Accessibility lens.** The pair inherits a solid a11y floor and handles the headline risks well (duplicate state is icon + text, icon-only Add carries a full `aria-label`, the swipe-only rail trap is defused, the import recap is `aria-live`). The *new* Catalog surfaces left open SPA/dynamic-content concerns the floor never faced: clickable card/row bodies nesting interactive Add buttons, no focus restore on back-navigation, un-announced search-to-collapse / no-results updates, and a gradient tile committing `text-white` with no numeric target. None are full blockers, but several are **high** because downstream code mirrors this spine verbatim — those were encoded into the Component Patterns, State Patterns, Accessibility Floor and DESIGN Colors/Components.

## Per-dimension verdicts

| # | Dimension | Verdict |
|---|---|---|
| 1 | Flow coverage | Strong |
| 2 | Token completeness | Adequate |
| 3 | Component coverage | Strong |
| 4 | State coverage | Adequate |
| 5 | Visual reference coverage | Strong |
| 6 | Bloat & overspecification | Strong |
| 7 | Inheritance discipline | Strong |
| 8 | Shape fit | Strong |

## Severity counts

| Severity | Count | Applied | Deferred |
|---|---|---|---|
| Critical | 0 | — | — |
| High | 4 | 4 | 0 |
| Medium | 5 | 3 | 2 |
| Low | 8 | 6 | 2 |

---

## Findings by severity

### High (4) — all applied

- **[High · applied] Nested interactive controls in clickable card/row body** — *review-accessibility.md; EXPERIENCE lines 82-83, DESIGN Components 61-62 / 67-68.*
  The clickable card/row body (→ detail route) wrapped an inline Add button and, in the duplicate case, a clickable `✓ Already in your songlist` badge. A `<button>`/`<a>` inside a clickable `<a>` is invalid HTML and breaks keyboard/SR activation.
  **Fix applied:** stretched-title-link pattern committed in DESIGN Components + a Do/Don't, and in EXPERIENCE Component Patterns (Collection card / Recently-added card / Catalog list row) + Accessibility Floor — the title is the navigation `<a>`; Add button and duplicate badge are siblings raised above it (`relative z-*`), independent tab stops, never descendants of the link.

- **[High · applied] Focus not restored on back-navigation** — *review-accessibility.md; EXPERIENCE lines 46, 110 (DL-10).*
  Back-nav from `/catalog/:uid` restored scroll + filters but not keyboard focus; `history.back()` on a data-router SPA leaves focus on `<body>`.
  **Fix applied:** Accessibility Floor + Interaction Primitives now require persisting the activating element's id/ref in history/router state and moving focus back to the originating row/card on return to Browse.

- **[High · applied] Search-to-collapse / no-results not announced (WCAG 4.1.3)** — *review-accessibility.md; EXPERIENCE lines 80, 95.*
  Search-to-collapse, live list filtering, and the no-results state were not announced to screen readers.
  **Fix applied:** the filterable list is wrapped in `aria-live="polite"` announcing the result count (and no-results); the collapse is a non-silent, focus-safe DOM change (collapse happens while focus is in the search field). Encoded in Accessibility Floor + the Search-to-collapse / Inline Add Component Pattern rows and the no-results State Pattern row.

- **[High · applied] Gradient tile commits `text-white` with no numeric contrast target** — *both reviewers; DESIGN.md line 37 / token `collection_tile_gradient`.*
  White on the lightest stop `brand-500` (#4f6cff) measures ≈4.27:1 — below AA 4.5:1 for the `meta`-sized counter; contrast varies across the gradient.
  **Fix applied:** DESIGN Colors commits explicit targets (counter ≥4.5:1; name ≥3:1 if ≥18.66px bold, else ≥4.5:1) and adds a `components.collection_card_scrim` token (`bg-gradient-to-t from-black/40`) behind the text block, verified against the lightest stop in both themes; a Do/Don't reinforces it.

### Medium (5) — 3 applied, 2 deferred

- **[Medium · applied] No error / deleted-uid 404 state on read surfaces** — *review-rubric.md; EXPERIENCE State Patterns, `/catalog/:uid`, `/catalog/collections/:uid`.*
  No error state for the Browse fetch and no 404/gone state for a bad or deleted uid, despite deep-linkable shareable routes (DL-9/DL-10) and curator deletion.
  **Fix applied:** new State Patterns rows — detail uid not-found/deleted → calm 404 (`This song is no longer in the Catalog.` + Browse link), deleted Collection equivalent (`This collection is no longer in the Catalog.`), and a generic fetch-error row with a `Retry` affordance; strings added to Voice & Tone.

- **[Medium · applied] ≥44px target conflicts with compact/icon-only Add** — *review-accessibility.md; floor line 122 vs DESIGN 72, 74.*
  The icon-only `+` in a dense row cell and the clickable `badge-success` duplicate state would render below 44px.
  **Fix applied:** reconciled once in Accessibility Floor — both keep a ≥44×44px hit area (min-h/min-w or padding), no silent shrink; DESIGN Add-button spec updated to remove the contradiction.

- **[Medium · applied] Single-add toasts / optimistic relabel not announced** — *review-accessibility.md; EXPERIENCE lines 97, 112 vs floor line 123.*
  Only the import recap was `aria-live`; single-add success/error toasts and the `✓ Added → Already` relabel were not committed as announced.
  **Fix applied:** the shared toast container carries `role="status" aria-live="polite"` for all toasts and the button's accessible-name change is stated as SR-perceivable. Encoded in Accessibility Floor + the Ajout OK / Inline Add / Collection import rows.

- **[Medium · deferred] ConfirmDialog return-focus + dialog semantics not asserted** — *review-accessibility.md; floor line 123.*
  Focus-trap + `Esc` + safe default are committed, but return-focus-to-trigger and `role="dialog"` + `aria-modal="true"` + `aria-labelledby` are not.
  **Deferred:** documented for story-dev — implementation-time assertion on the reused `ConfirmDialog.tsx`; outside this pass's apply set.

- **[Medium · deferred] Curator form error states not specified for assistive tech** — *review-accessibility.md; EXPERIENCE line 103; floor line 124.*
  Required-title validation and the 409 duplicate message aren't ARIA-covered beyond "don't regress inherited SongForm ARIA".
  **Deferred:** documented for story-dev — associate field errors via `aria-invalid` + `aria-describedby`; render 409 as `role="alert"` with focus move.

### Low (8) — 6 applied, 2 deferred

- **[Low · applied] FR-8 Collection description not surfaced** — *review-rubric.md; DESIGN Components, EXPERIENCE IA line 39.*
  **Fix applied:** added a "Collection detail route" treatment in DESIGN.md and lines in EXPERIENCE IA + Component Patterns — the optional `description` renders at the top of the Collection detail page (omitted when absent).

- **[Low · applied] `add_button_added` vs `add_added_flash` divergence** — *review-rubric.md; DESIGN frontmatter lines 10, 24.*
  **Fix applied:** reconciled into one token — `components.add_button_added` now references `{colors.add_added_flash}`.

- **[Low · applied] Dangling `colors.add_already` token** — *review-rubric.md; DESIGN frontmatter line 11.*
  **Fix applied:** removed (the "already" state is expressed via `components.add_button_already`).

- **[Low · applied] Component name drift between files** — *review-rubric.md; DESIGN / EXPERIENCE.*
  **Fix applied:** unified verbatim to **Recently-added card**, **Curator entry form**, **Curator composer** across both files (frontmatter comments, Components, Component Patterns, IA, Key Flows).

- **[Low · applied] Collection detail lacks empty / cold-load state** — *review-rubric.md; `/catalog/collections/:uid`.*
  **Fix applied:** State Patterns row added — empty Collection (`This collection is empty for now.`) and cold-load reusing the list skeleton.

- **[Low · applied] UJ flow titles paraphrased, not verbatim** — *review-rubric.md; EXPERIENCE Key Flows.*
  **Fix applied:** all three Key Flow titles aligned verbatim to the PRD UJ-1/UJ-2/UJ-3 phrasing (Léa / Marc / northwood).

- **[Low · applied] `<lg` card-fallback must keep list/item semantics** — *review-accessibility.md; DESIGN line 47.*
  **Fix applied:** folded into the rail-semantics Accessibility Floor bullet — the card-grid fallback keeps the same list/item structure as the rails.

- **[Low · deferred] Keyboard scroll of rails vs snap** — *review-accessibility.md; rail cards `snap-x snap-mandatory`.*
  **Deferred:** documented for story-dev — `scroll-margin`, visible focus ring, optional arrow-key nav.

- **[Low · deferred] 403 curator state not focus-managed / announced** — *review-accessibility.md; EXPERIENCE line 101.*
  **Deferred:** documented for story-dev — move focus to the message heading and/or `role="alert"`.

> Count note: the two deferred lows are listed under the Low group above alongside the six applied lows (8 total; the summary table counts 6 applied + 2 deferred).

## Mechanical notes

- All `{path}` references resolve; `sources` and `inherits` point at existing files. No broken links.
- Token redundancy resolved: `colors.add_already` removed; `components.add_button_added` now references the single `colors.add_added_flash` token.
- Rationale corrected (cosmetic): DESIGN no longer claims the tile gradient is "the same gradient" as `.text-gradient` — they differ in direction and start shade (`from-brand-600` vs `from-brand-500`); the concrete token is authoritative.
- Visual references: the stale `.working/` wireframe path was repointed to `wireframes/`, and the three promoted mocks (`mockups/key-browse-catalog.html`, `mockups/key-catalog-detail.html`, `mockups/key-import-dialog.html`) plus the wireframe were linked inline at their relevant spine sections in both files.
