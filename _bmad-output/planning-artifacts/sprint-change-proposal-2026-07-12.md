# Sprint Change Proposal — Catalog : attributs instrument hors du modèle canonique

- **Date** : 2026-07-12
- **Auteur** : northwood (via bmad-correct-course)
- **Statut** : appliqué
- **Scope** : Minor (correction PRD + addendum, pré-implémentation)
- **Artefacts touchés** : `prds/prd-musician-tools-2026-07-12/prd.md`, `prds/prd-musician-tools-2026-07-12/addendum.md`
- **Source de la décision** : UX DL-17 (`ux-designs/ux-musician-tools-2026-07-12/.decision-log.md`)

## 1. Résumé du problème

Pendant la phase UX du Catalog, il est apparu que le modèle canonique `CatalogSong` — défini dans le PRD (FR-2) et l'addendum comme un **calque complet** des colonnes de `Song` — embarquait des attributs qui ne sont **pas des propriétés de la chanson partagée** mais du **rapport d'un utilisateur à son instrument** : `instrument`, `instrumentDifficulty` (difficulté), `instrumentTuning` (accordage), `capo`, `technique`, `instrumentLinks`.

Or le Catalog v1 pose **une fiche canonique par chanson (titre+artiste)**. Une même chanson se joue sur plusieurs instruments, avec des difficultés/accordages différents selon le joueur : ces attributs n'ont de sens qu'**une fois la chanson copiée dans la Songlist perso**. Les exposer/filtrer au niveau Catalog est une erreur de modèle (que faudrait-il stocker comme « difficulté » d'une fiche partagée ?).

Découvert au moment de valider les maquettes UX (filtres Browse + grille de la fiche détail affichaient « Instrument » et « Difficulté »).

## 2. Analyse d'impact

- **Epics** : aucun impact — le Catalog **n'a pas encore d'epics**.
- **Stories** : aucune — pas de stories Catalog générées.
- **Architecture** : **pas encore d'architecture Catalog** ; l'addendum (piste forte pour `bmad-create-architecture`) est corrigé en amont → l'archi partira du bon modèle.
- **PRD** : FR-2 (jeu de filtres), UJ-1/UJ-3 (mentions d'accordage dans les parcours), JTBD fonctionnel, décision « champs canoniques vs perso-only » (§8.5), question ouverte tri/filtre (§8.2).
- **Addendum** : liste de colonnes `CatalogSong`.
- **UX** : **déjà corrigé** (DL-17/DL-18 ; spines + maquettes régénérées). Ce proposal met le PRD/addendum en **cohérence** avec l'UX.
- **Impact technique** : positif — moins de colonnes sur `CatalogSong`, moins de champs à copier à l'`Add`, filtres/index sur des axes intrinsèques (`key`, `mode`, `timeSignature`, `genre`).

## 3. Approche recommandée

**Direct Adjustment** — corriger PRD + addendum en place, aucun rollback ni replan (rien n'est implémenté). Effort : faible. Risque : faible (aucune donnée en prod, aucun code). Timeline : nulle.

## 4. Propositions de changement détaillées (appliquées)

### PRD — `prd.md`
| # | Section | Avant → Après |
|---|---------|---------------|
| ① | **FR-2** (§4.1) | Filtres `instrument, difficulté, clé, accordage, genre` → `clé, mode, signature rythmique, genre` (intrinsèques) ; note explicite que instrument/difficulté/accordage sont **perso**, non stockés/filtrés au Catalog. |
| ② | **UJ-1** (§2.3, chemin Léa) | Fiche affichée « clé Em, BPM ~84, ~~accordage standard~~, lien YouTube ». |
| ③ | **UJ-1** (résolution) | Léa ajuste son accordage **dans sa Songlist** (attribut perso, après l'ajout). |
| ④ | **UJ-3** (chemin curateur) | « complète clé/mode/~~accordages~~ ». |
| ⑤ | **JTBD fonctionnel** (§2.1) | « déjà remplie (BPM, clé, ~~accordage,~~ liens) ». |
| ⑥ | **Question ouverte §8.2** | Marquée **tranchée** (DL-15 : tri artiste→titre ; filtres key/mode/timeSignature/genre). |
| ⑦ | **Décision §8.5** | « champs canoniques vs perso-only » corrigée : les 6 attributs instrument sont **exclus** (comme `myInstrumentUid`), plus « copiés mais éditables ». |

### Addendum — `addendum.md`
| # | Section | Avant → Après |
|---|---------|---------------|
| ⑧ | **Colonnes `CatalogSong`** | « Colonnes calquées sur `Song` » (calque complet) → **« sous-ensemble intrinsèque »** : retrait de `instrument`, `instrumentDifficulty`, `instrumentTuning`, `capo`, `technique`, `instrumentLinks` de la liste canonique ; ajoutés aux **Exclus (perso-only)**. Filtres Browse = `key · mode · timeSignature · genre` + texte. |

**Modèle canonique final** : `title` (req), `artist`, `album`, `key`, `bpm`, `mode`, `timeSignature`, `durationSeconds`, `language`, `genre`, `streamingLinks`, `pitchStandard`.

## 5. Handoff

- **Classification** : Minor.
- **Prochaine étape** : `bmad-create-architecture` pour le Catalog — repartira du modèle corrigé (`CatalogSong` = sous-ensemble intrinsèque ; index/filtres sur `key`/`mode`/`timeSignature`/`genre`).
- **Critère de succès** : aucun des 6 attributs instrument ne réapparaît dans le modèle canonique ni dans les filtres Browse en aval (archi, epics, stories). La copie `Add` clone l'`instrument*` **depuis rien** au Catalog ; ces champs se remplissent côté perso après l'ajout (comme aujourd'hui sur une Song).
- **Note** : les spines UX (DL-17) gagnent déjà sur conflit ; ce proposal aligne le contrat PRD pour que l'aval ne réintroduise pas les champs.
