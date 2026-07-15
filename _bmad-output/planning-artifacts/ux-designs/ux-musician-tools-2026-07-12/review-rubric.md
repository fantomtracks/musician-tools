# Spine Pair Review — musician-tools Catalog

## Overall verdict

The spine pair is a **strong, ship-ready contract**: a consumer (architecture / story-dev) can source-extract cleanly, every `{path.to.token}` reference resolves, and the load-bearing decisions (order of Browse, inline-Add, calm-duplicate, snapshot invariant, 403-not-404, gradient tiles) are committed with DL-/FR- citations. The inheritance discipline is exemplary — no re-declared hex, all new surfaces map to concrete existing Tailwind classes that were verified to exist in `src/index.css`. Two gaps are worth closing before stories: **read-surface error / deleted-fiche-404 states are unspecified** (the spine leans hard on Epic-18 deep-linking but never says what a shared link to a deleted `/catalog/:uid` renders), and the **brand-gradient tile contrast is asserted, not quantified** — the light-mode `brand-500` end measures ≈4.27:1 against white, under AA for the small counter text.

## 1. Flow coverage — strong

Checked all three PRD UJs and FR-1..FR-13 against EXPERIENCE Key Flows + State/Component patterns. All three UJs (Léa/UJ-1, Marc/UJ-2, northwood/UJ-3) have a Key Flow with named protagonist, numbered steps, an explicit **Climax** beat, and a failure/edge path (DL-11 duplicate, best-effort import, FR-13 refusal). Every FR is represented behaviorally somewhere in the spine.

### Findings
- **low** FR-8 requires a Collection to display "son nom, sa description éventuelle et le nombre de chansons"; the Collection card spec surfaces only name + count, and the Collection detail layout (`/catalog/collections/:uid`) is never given a component/visual spec that includes `description` (DESIGN.md Components; EXPERIENCE IA line 39). *Fix:* add one line to the Collection-detail treatment noting the optional description renders at the top of the page.

## 2. Token completeness — adequate

Every frontmatter token (colors ×4, spacing ×3, breakpoints ×1, components ×8) is defined; every `{colors.*}` / `{spacing.*}` / `{components.*}` reference in DESIGN prose resolves; every new color maps to a concrete Tailwind class. `{design_ref}` in EXPERIENCE resolves to `./DESIGN.md`. Inherited classes (`card-base`, `badge-success`, `btn-primary`, `.text-gradient`, etc.) were confirmed present in `src/index.css`.

### Findings
- **medium** The tile contrast target is asserted but not quantified: "le texte de la tuile … passe en `text-white` pour tenir le contraste … dans les deux thèmes" (DESIGN.md line 37) gives no ratio, and white on the light-mode start shade `brand-500` (#4f6cff) measures **≈4.27:1** — below AA 4.5:1 for the counter set in `meta`/small. The dark end (`purple-600` ≈5.4:1) and dark-mode (`brand-600`) pass; the light-mode brand end is the weak point on the emotional centerpiece surface. *Fix:* state a concrete target (e.g. ≥4.5:1 body / ≥3:1 large-bold) and either start the light gradient at `brand-600` or guarantee the counter is large/bold — or add a bottom scrim under the text.
- **low** Two tokens describe the transient "Added" state differently: `{colors.add_added_flash}` = `bg-green-500 text-white` (cited in prose, line 39/73) but `components.add_button_added` = `badge-success` (`bg-green-100 text-green-700`, line 24) — a source-extractor keying on the component token gets the pale badge, the prose gets the bright flash. *Fix:* make `components.add_button_added` reference `{colors.add_added_flash}` (or drop the unused component token).
- **low** `colors.add_already` (= `badge-success`, line 11) is defined but never referenced by `{path}` in prose — the "already" state is expressed instead through `components.add_button_already`. Dangling/duplicative. *Fix:* delete or reference it.

## 3. Component coverage — strong

Every named component has a visual row in DESIGN.md.Components and a behavioral row in EXPERIENCE.md.Component Patterns (or an equivalent pattern block) with real rules: Collection card, Recently-added card, Collections rail / Recently-added strip, Catalog list row, Add button (3 states), Add collection button, Catalog detail layout, Curator entry form, Collection composer. Inherited `ConfirmDialog` / toast handled by reference.

### Findings
- **low** Component names drift between the two files: "Recently-added **song** card" (DESIGN) vs "Recently-added card" (EXPERIENCE); "**Catalog** entry form" (DESIGN + IA) vs "**Curator** entry form" (EXPERIENCE); "Collection composer" (DESIGN) vs "**Curator** composer" (EXPERIENCE). Same components, but an extractor matching on exact names sees mismatches. *Fix:* pick one label per component and use it verbatim in both files.

## 4. State coverage — adequate

Walked each IA surface for empty / cold-load / no-results / error / 403 / duplicate. Browse has empty (seed), cold-load (skeleton), no-results, and duplicate covered; admin has 403 and FR-13-refusal; the empty-Songlist hook even specifies graceful degradation on Catalog-fetch failure. The systematic gap is **error and deep-link-404 states on the read surfaces**.

### Findings
- **medium** No **error** state for the Browse list fetch and no **404 / gone** state for `/catalog/:uid` or `/catalog/collections/:uid` on a bad or **deleted** uid — despite the spine building deep-linkable, shareable routes (DL-9/DL-10) and explicitly allowing a curator to delete fiches (FR-11/FR-12) with dangling provenance tolerated. A shared link to a deleted fiche has undefined behavior a story-dev must invent, and it interacts with the Epic-18 404 scoping the spine leans on. *Fix:* add rows for "Detail — uid not found / deleted → 404 (Epic-18 scoped)" and "Browse/Collection — fetch error → retry affordance".
- **low** Collection detail (`/catalog/collections/:uid`) has no **empty** (0-song Collection) or **cold-load** state. *Fix:* one line each, or note it inherits the list skeleton.

## 5. Visual reference coverage — strong

`.working/flow-browse-catalog-2026-07-12.excalidraw` is present and linked inline at the relevant section (EXPERIENCE IA, line 50) with "Le spine gagne sur conflit." Spines-win-on-conflict is stated (DESIGN header, EXPERIENCE header + IA ref). No `key-*.html` mocks exist yet — noted as **pending**, not a miss.

### Findings
- (none)

## 6. Bloat & overspecification — strong

Low bloat. No pixel specs where tokens suffice; DESIGN carries appropriate editorial voice, EXPERIENCE stays behavioral. The invented "Copy semantics & provenance" section earns its place by committing the *invisible-provenance* UX invariant (never render `sourceCatalogUid`), which is a UX rule beyond the raw FRs. Mild restatement of the addendum deep-clone detail there, but it is load-bearing enough to keep.

### Findings
- (none)

## 7. Inheritance discipline — strong

`sources` frontmatter resolves (prd.md, addendum.md, 07-04 EXPERIENCE.md all exist); DESIGN `inherits` names the 07-04 responsive delta and the Tailwind theme. Glossary is identical across spines and sources (Songlist / Catalog / Collection / Add to my songlist / Add collection to my songlist); "Library" is never used (CLAUDE.md respected). EXPERIENCE defers token refs wholesale to `{design_ref}` rather than restating values — clean.

### Findings
- **low** UJ flow titles are paraphrased, not verbatim from the PRD ("Léa ajoute une chanson déjà remplie en dix secondes" → "Léa ajoute « Zombie » en dix secondes"). Each cites its UJ-n tag so traceability holds, but the names aren't verbatim. *Fix:* optional — align headers or accept the tagged paraphrase.

## 8. Shape fit — strong

DESIGN.md sections are in canonical order (Colors → Layout & Spacing → Shapes → Components → Do's and Don'ts); Typography and Elevation are omitted appropriately (pure inheritance); Brand & Style is folded into the "Identité visuelle inchangée" intro blockquote. EXPERIENCE.md carries all required defaults (Foundation, IA, Voice & Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Responsive & Platform, Key Flows) plus one earned invented section. Responsive is present and breakpoint-triggered (`lg` layout / `sm` grid).

### Findings
- (none)

## Mechanical notes

- **Cross-refs / frontmatter:** all `{path}` references resolve; `sources` and `inherits` all point at existing files. No broken links.
- **Token redundancy:** `colors.add_already` and `components.add_button_already` both = `badge-success`; `components.add_button_added` (`badge-success`) contradicts the prose-cited `colors.add_added_flash` (`bg-green-500 text-white`) for the same transient state — reconcile.
- **Rationale inaccuracy (cosmetic):** DESIGN.md line 37 calls the tile gradient "le **même gradient** que `.text-gradient`", but `.text-gradient` is `bg-gradient-to-r from-brand-600 to-purple-600` whereas the tile token is `bg-gradient-to-br from-brand-500 to-purple-600` — different direction and start shade. The concrete token is authoritative and correct; only the prose claim of sameness is loose.
- **Name drift:** Recently-added (song) card / Catalog vs Curator entry form / Collection vs Curator composer — unify labels across the pair.
