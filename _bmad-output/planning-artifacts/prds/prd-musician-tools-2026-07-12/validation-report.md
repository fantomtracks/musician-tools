# Validation Report — PRD Catalog (musician-tools)

- **PRD :** `_bmad-output/planning-artifacts/prds/prd-musician-tools-2026-07-12/prd.md`
- **Rubric :** `.claude/skills/bmad-prd/assets/prd-validation-checklist.md`
- **Run at :** 2026-07-12T15:00:10+0200
- **Grade :** Fair

## Overall verdict

Sur la forme, le PRD est solide et prêt pour l'aval : thèse claire (« friction zéro » à l'onboarding), features et métriques cohérentes, opens honnêtement documentés, addendum qui isole le « comment » et acte la rupture mono-user → partagé. Le *rubric walker* note les 7 dimensions strong/adequate, 0 finding high/critical.

La passe adversariale déplace nettement le tableau : sous une forme propre, plusieurs décisions fondatrices sont présentées comme acquises alors qu'elles sont des questions ouvertes bloquantes (mapping champ-par-champ Catalog→Song, stabilité de l'uid canonique dont dépend la provenance, choix 403-vs-404 admin), plus des métriques dimensionnées pour une échelle que le produit n'a pas (N≈4) et une promesse UX Collections qui s'évapore à l'import.

**Note du validateur (vérification code `backend/models/song.js`) :** les 3 CRITICAL de l'adversarial sont recalibrés. Les colonnes existent déjà dans `Song` (`genre`/`language` en JSONB, `timeSignature`, `mode`, `durationSeconds`, `key`, `album`) → **aucune migration de `Song`, aucune perte silencieuse de données** ; le framing « data-loss » est surestimé. Reste un vrai écart : les noms/formes proposés pour `CatalogSong` divergent de `Song` (`instrumentTypes`≠`instrument`, `difficulty`≠`instrumentDifficulty`, `tunings`≠`instrumentTuning`, `youtubeUrl`/`spotifyUrl` vs `streamingLinks` JSONB) → FR-4 est une copie **avec transformation de forme**, pas 1:1. Net : les CRITICAL deviennent des HIGH/MEDIUM à trancher avant les epics ; aucun n'est un défaut bloquant-cassé. D'où la note **Fair**.

## Dimension verdicts

- Decision-readiness — strong
- Substance over theater — strong
- Strategic coherence — adequate
- Done-ness clarity — strong
- Scope honesty — strong
- Downstream usability — strong
- Shape fit — strong

## Findings by severity

*(Sévérités adjugées par le validateur. Le classement d'origine de l'adversarial est indiqué quand il diffère.)*

### Critical (0)

Aucun après adjudication. L'adversarial avait classé C1–C3 en CRITICAL ; la vérification du modèle `Song` les ramène à HIGH/MEDIUM (voir ci-dessous). Ce ne sont pas des défauts bloquants-cassés, mais des **décisions à prendre avant `bmad-create-epics-and-stories`**.

### High (7)

**[Adversarial C1 · orig. critical]** — Mapping de champs Catalog→Song non figé (FR-4, §8.5, addendum)
Les colonnes existent (pas de migration/perte) mais les noms/formes divergent (`instrumentTypes`≠`instrument`, `difficulty`≠`instrumentDifficulty`, `tunings`≠`instrumentTuning`, URLs scalaires vs `streamingLinks` JSONB) ; sémantique `difficulty` objective (Catalog) vs par-instrument (perso).
Fix : figer un tableau de correspondance nom→nom→transformation en architecture ; aligner le nommage `CatalogSong` sur `Song`.

**[Adversarial C2 · orig. critical]** — Identité canonique globale variant-hostile, sans workflow de correction (FR-13, §4.4/§6.2, addendum)
« Miroir Epic 17 » est trompeur : Epic 17 = per-user, index Catalog = global (1ʳᵉ fiche verrouille la clé pour tous). Impossible de seeder studio vs live / standard vs drop-D. Variantes en v2 = changer la clé unique = migration sur donnée partagée en prod.
Fix : assumer explicitement le choix v1 + décrire un workflow de correction/merge, ou introduire un discriminant de variante dès v1.

**[Adversarial H1]** — Anti-oracle 403/404 cargo-culté sur l'admin (FR-10, addendum §Autorisation)
Le Catalog est publiquement lisible → rien à cacher ; 404 sur la route d'écriture = théâtre. Décision de sécu conceptuelle (403 franc), pas d'implémentation.
Fix : trancher 403 en amont, purger l'AC indécise de FR-10.

**[Adversarial H2]** — SM-1 mesure la couverture déguisée en adoption, gonflable par imports batch (§7)
Coverage ≠ adoption ; 1 import Collection = 20 adds d'un clic → franchit >50 % trivialement, récompense le remplissage vide (contre SM-C1).
Fix : découpler adoption/couverture ; exclure/compter à part les imports batch ; qualifier « une fois seedé ».

**[Adversarial H4]** — La valeur des Collections s'évapore à l'import (§4.3, FR-9, UJ-2, §8.6)
Import « Rock 90 » → 20 chansons en vrac sans regroupement thématique ; le climax d'UJ-2 promet une cohérence non livrée. Mapping Collection→Playlist relégué en v2.
Fix : trancher Collection→regroupement perso (UX) avant de figer FR-9.

**[Adversarial H3]** — Goulot un-seul-curateur + volume de seed indécis (UJ-3, §8.4, SM-1/SM-4)
« Une fois seedé » n'a pas de définition ; CSV import (seul levier réaliste) repoussé ; SM-4 sans cible ni capacité de production estimée.
Fix : décider volume de seed cible + pipeline (saisie/auto-fill/CSV).

**[Adversarial H5]** — La garde de doublon rate sur les données saisies avant le Catalog (FR-6/FR-9)
Normalisation non partagée : « Zombie / Cranberries » vs « Zombie / The Cranberries » → doublon silencieux, ou fusion agressive perçue comme un bug (SM-C2). Récap « 18 added, 2 already » faussable dans les deux sens.
Fix : spécifier la normalisation exacte + comportement sur near-miss.

### Medium (8)

**[Adversarial C3 · orig. critical]** — Provenance fragile si delete+recreate d'une fiche (§4.5, NFR-4)
Partiellement réfutable : une édition in-place (UPDATE) préserve l'uid ; le risque tient seulement si la curation supprime-recrée.
Fix : poser par contrat « uid stable, jamais delete+recreate une fiche référencée », ou assumer provenance best-effort.

**[Rubric]** — Cibles de métriques molles (§7, SM-2/SM-3/SM-4) : baseline + cibles chiffrées manquantes.

**[Adversarial M1]** — Import best-effort sans seau « failed » dans le récap (ni idempotence/perf du lot).

**[Adversarial M2]** — `sourceCatalogVersion` « Optionnel » (§8.1) mais listé comme conséquence testable de FR-4 → contradiction.

**[Adversarial M3]** — NFR-2 promet la scalabilité sans conception (pas de cache/invalidation).

**[Adversarial M4]** — Plusieurs « Consequences testable » non testables (codes/champs indécis : FR-10, FR-4).

**[Adversarial M5]** — Lecture Catalog non scopée `userUid` viole la règle de `project-context.md` → sera flaggée régression 7.5 à chaque story tant qu'une exception nommée n'y est pas inscrite.

**[Adversarial M6]** — Copie snapshot = deep-clone des JSON + respect convention colonnes (renforcé par la vérif code).

### Low (9)

- **[Rubric]** FR-2 recherche sans borne perf/résultat.
- **[Rubric]** FR-1/NFR-2 « paginé ou virtualisé » laissé ouvert.
- **[Rubric]** Roundtrip Assumptions Index incomplet (§0/§6.1 sans tag inline).
- **[Rubric]** Verbe « Add collection to my songlist » non glossé (§3).
- **[Rubric]** Références « 10.1/17.1 » cryptiques (nommer « Epic 17 »).
- **[Adversarial L1]** Narratif « zéro SQL » de UJ-3 faux à la racine (rôle posé à la main en base).
- **[Adversarial L2]** Course browse→Add (fiche supprimée entre-temps) non spécifiée côté UI.
- **[Adversarial L3]** Search/browse sur donnée partagée = surface de scraping (non-problème à N≈4).
- **[Adversarial L4]** Métriques chiffrées sur N≈4 = bruit statistique (fausse rigueur).

## Ce qui doit bouger AVANT les epics (synthèse)

1. Figer le mapping champ-par-champ Catalog→Song (H/C1) + aligner le nommage `CatalogSong` sur `Song`.
2. Trancher l'identité canonique : variant-hostile assumé + workflow de correction, et stabilité de l'uid pour la provenance (H/C2, M/C3).
3. Décider 403 vs 404 sur l'admin comme décision de sécu conceptuelle (H1) + purger les AC non testables (M4).
4. Redéfinir SM-1 (découpler adoption/couverture, neutraliser le gonflage batch, qualifier « seedé ») (H2, H3).
5. Trancher Collection→regroupement perso avant de figer FR-9 (H4).

## Mechanical notes

- Roundtrip Assumptions Index incomplet (§0/§6.1 sans tag inline).
- Verbe d'import « Add collection to my songlist » non glossé.
- Références « 10.1/17.1 » cryptiques → nommer « Epic 17 ».
- ID continuity OK (FR-1→13, UJ-1→3, SM-1→4 + C1/C2, NFR-1→6).

## Reviewer files

- `review-rubric.md`
- `review-adversarial-general.md`
