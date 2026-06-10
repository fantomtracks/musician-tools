# Sprint Change Proposal — 2026-06-10

**Projet :** musician-tools · **Auteur :** northwood (via Correct Course) · **Mode :** Batch
**Baseline :** `main` @ `1d28415` (v1.3.1 = `f1feee5`, tag `v1.3.1`)

---

## Section 1 — Issue Summary

Deux problèmes distincts ont déclenché cette correction de cap :

1. **Dérive de process.** Une série de changements a été conçue et livrée **hors du process BMAD** (pas de stories, pas de mise à jour du `sprint-status`, pas de rétro) :
   - **v1.3.1** — refonte de la saisie d'entrées de session (combobox unifié + artiste + layout), livrée et taguée.
   - **Polish Songlist & navigation** — clic-ligne, ordre du menu, suppression colonne « Actions », renommage « Songlist », colonne « Last played » (dans le working tree, **non committé**).
   - **Outillage** — workflow CI auto-tag/release + convention CHANGELOG `[Unreleased]`.

2. **Nouveau scope non planifié**, dont une idée qui **entre en conflit avec le PRD** :
   - **#2** Durée de chanson → le « Mark as Played » remplit automatiquement le temps de session — **conflit FR21** (« entrée sans minutes »).
   - **#3** Édition du profil utilisateur (name, email, mot de passe) — **hors scope du PRD** (l'auth est supposée préexistante).

Découvert : au fil d'une session de travail UI, en réalisant qu'aucun suivi n'avait été tenu.

---

## Section 2 — Impact Analysis

### Epic Impact
- **Epic 5 « Robustesse / confort » (in-progress)** : reçoit 2 stories rétroactives (déjà livrées) → 5.2 et 5.3.
- **Epic 4 « La capture sans effort » (done)** : impacté **indirectement** — l'AC4 de la story 4.1 (« pas d'entrée dupliquée », idempotent) est **amendée** par #2 (re-marquer accumule désormais des minutes). À documenter, pas à re-livrer.
- **Nouvel Epic 6 « Capture enrichie — durée de répertoire »** : porte #2 (story 6.1).
- **Nouvel Epic 7 « Compte utilisateur »** : porte #3 (story 7.1) — **hors PRD actuel**.

### Story Impact
| Story | Action | Statut cible |
|---|---|---|
| 5.2 — Saisie de session repensée (combobox) | Créer (rétroactif, documentaire) | done |
| 5.3 — Songlist & navigation au propre | Créer (rétroactif) | done après commit |
| 6.1 — Durée de chanson → temps de session auto | Créer | backlog → ready |
| 7.1 — Éditer mon profil | Créer | backlog (bloquée : voir handoff) |
| 4.1 — Mark as Played | Annoter AC4 (amendée par FR21 v1.3.x) | done (inchangé en code) |

### Artifact Conflicts (à mettre à jour)
- **PRD** : amender **FR21**, ajouter **FR24** (durée de chanson), maj de la *FR Coverage Map*.
- **epics.md** : ajouter Epic 6 + Epic 7 et leurs stories ; maj coverage.
- **sprint-status.yaml** : ajouter 5.2, 5.3 (done) ; epic-6/6.1, epic-7/7.1 (backlog).
- **deferred-work.md** : noter que la dette « nav mobile cassée » reste ouverte (la réorganisation du menu ne la résout pas).

### Technical Impact
- **#2 (back + front)** : migration `Songs.durationMinutes` (nullable), modèle Sequelize, DTO + champ dans `SongForm`, et `songcontroller.markSongPlayed` (pré-remplir/incrémenter les minutes de l'entrée). Interagit avec la dette 4.1/4.2 (réutilisation d'entrée, SongPlay, recalcul « dernier joué »).
- **#3 (back + sécurité + front)** : endpoints `PUT /profile` + `POST /change-password` (vérif mot de passe actuel via `validPassword`, unicité email/name), nouvelle page profil, lien dans le Header. northwood plus à l'aise en front → back piloté avec soin.

---

## Section 3 — Recommended Approach

**Direct Adjustment** (pas de rollback, pas de réduction de MVP) :
1. **Régulariser** le travail livré en stories rétroactives 5.2 / 5.3 + maj sprint-status (Minor, documentaire).
2. **Amender le PRD** pour #2 (FR21 + FR24), décision **« pré-remplir mais éditable »** validée avec northwood, puis livrer la story 6.1 (Moderate, back+front).
3. **Isoler #3** dans l'Epic 7 hors-PRD, **bloqué** tant qu'un mini product-brief + design sécurité n'est pas posé (Major).

Priorité (validée) : quick wins faits → **#2** → **#3**.

### Décision PRD validée (#2 / FR21)
**Pré-remplir mais éditable** : si la chanson porte une durée (FR24), l'entrée créée par « Mark as Played » est **pré-remplie** avec cette durée en minutes (éditable a posteriori) ; sans durée → comportement d'origine (sans minutes). Re-marquer la même chanson dans la session du jour **n'ajoute pas de doublon mais incrémente** les minutes de l'entrée existante (le temps s'additionne). La durée totale de session suit **FR13**.

---

## Section 4 — Detailed Change Proposals

### 4.1 PRD — FR21 (amendé)
> **AVANT.** FR21 : Cliquer « Mark as Played Now » crée la session du jour pour l'instrument (si absente) ou la complète : la chanson est ajoutée comme entrée, **sans minutes**. Le jour est la date locale (FR19).
>
> **APRÈS.** FR21 : Cliquer « Mark as Played Now » crée la session du jour pour l'instrument (si absente) ou la complète. **Si la chanson porte une durée (FR24), l'entrée est pré-remplie avec cette durée en minutes (éditable a posteriori via l'édition de session) ; sinon l'entrée est ajoutée sans minutes.** Re-marquer la même chanson dans la session du jour **n'ajoute pas d'entrée dupliquée mais incrémente** les minutes de l'entrée existante de la durée de la chanson. La durée totale de session suit FR13. Le jour est la date locale de l'appareil (FR19).

### 4.2 PRD — FR24 (nouveau)
> **FR24** : L'utilisateur peut renseigner une **durée optionnelle (minutes)** sur une chanson de son répertoire (champ dans le formulaire chanson). Cette durée alimente le pré-remplissage du temps de session au « Mark as Played » (FR21). Une chanson sans durée se comporte comme avant (CM2 : aucune régression du répertoire existant).

### 4.3 PRD — FR Coverage Map (ajouts)
> `FR24: Epic 6 - Durée de chanson (champ optionnel) alimentant le pré-remplissage du temps de session`
> `FR21 (amendé): Epic 4 + Epic 6 - Mark as Played pré-remplit/incrémente les minutes depuis la durée de chanson`

### 4.4 Story 4.1 — annotation AC4
> Note ajoutée : « **Amendé (FR21 v1.3.x, Epic 6)** : re-marquer la même chanson dans la session du jour n'ajoute pas de doublon **mais incrémente les minutes de l'entrée existante** de la durée de la chanson (si renseignée). L'idempotence stricte d'origine devient un cumul de durée. »

### 4.5 Nouvelles stories (fichiers à créer)
- **5.2 — Saisie de session repensée (combobox unifié)** — `Status: done` (rétroactif). AC = combobox groupé Recent/Songs/Topics, filtre instantané accent-insensible + artiste, navigation clavier, artiste affiché (vue + picker), submit pleine largeur, Remove rouge, fix z-index dropdown. Réf : `f1feee5`, tag v1.3.1.
- **5.3 — Songlist & navigation au propre** — `Status: ready` (code prêt, **à committer**). AC = clic-ligne ouvre l'édition, checkbox seule pour la sélection, colonne Actions retirée, renommage « Songlist » (menu/titre/bouton retour), bouton « ← Songlist », colonne « Last played » réduite/alignée droite.
- **6.1 — Durée de chanson → temps de session auto** — `Status: ready`. Back : migration `durationMinutes` (nullable) + modèle + DTO + `markSongPlayed` (pré-remplir/incrémenter). Front : champ durée dans `SongForm`. Respect FR4 (snapshot label), FR19 (date locale), FR23 (recalcul « dernier joué »).
- **7.1 — Éditer mon profil (name, email, mot de passe)** — `Status: backlog` (**bloquée**). Endpoints `PUT /profile` + `POST /change-password` (vérif mot de passe actuel, unicité), page profil, lien Header.

### 4.6 sprint-status.yaml (ajouts)
```yaml
  # Epic 5
  5-2-saisie-de-session-repensee-combobox: done
  5-3-songlist-et-navigation-au-propre: ready   # à passer done au commit

  # Epic 6: Capture enrichie — durée de répertoire
  epic-6: backlog
  6-1-duree-de-chanson-temps-de-session-auto: ready

  # Epic 7: Compte utilisateur (hors PRD initial)
  epic-7: backlog
  7-1-editer-mon-profil: backlog
```

---

## Section 5 — Implementation Handoff

| Lot | Scope | Routage |
|---|---|---|
| Régularisation 5.2/5.3 + sprint-status + commit des quick wins | **Minor** | Developer (direct) |
| PRD FR21/FR24 + Story 6.1 | **Moderate** | PRD edit (PM) → Developer |
| Epic 7 / Story 7.1 (profil) | **Major** | **Bloqué** : product-brief + design sécurité (PM/Architect) avant dev |

**Critères de succès :**
- sprint-status reflète l'état réel (5.2 done, 5.3 done après commit, 6.1/7.1 plannifiées).
- PRD cohérent (FR21 amendé, FR24 ajouté, coverage à jour) — plus aucune contradiction avec le code de #2 à venir.
- #3 ne part pas en dev sans cadrage (évite une surface d'auth non spécifiée/non sécurisée).
