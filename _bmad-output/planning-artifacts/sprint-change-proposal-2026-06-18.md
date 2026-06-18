# Sprint Change Proposal — 2026-06-18

**Auteur :** northwood
**Déclencheur :** Brainstorm du 2026-06-18 (`_bmad-output/brainstorming/brainstorming-session-2026-06-18-1024.md`), lui-même issu de la story 6.1 (durée de chanson → temps de session).
**Ampleur :** Majeure (suppression d'un champ de données + amende une hypothèse du PRD + touche un epic livré).

---

## 1. Issue Summary

La story 6.1 a fait apparaître une **double source de vérité** pour le temps d'une session : la durée **globale** (`PracticeSession.durationMinutes`, surchargeable — FR13) et la **somme des minutes des entrées** (`SessionItem.minutes`). Cette dualité a généré plusieurs incohérences successives (total < somme des entrées ; total non alimenté par « Mark as Played » ; calage/plancher à rajouter).

**Décision produit (brainstorm) :** passer au modèle **« Tout est entrée »** — une session n'est qu'un regroupement (jour + instrument), le temps vit **uniquement** sur les entrées. La durée totale est **toujours** la somme des minutes des entrées (plus de surcharge globale). Le temps non structuré (« j'ai juste joué ») se loggue via une **entrée sur un topic système « Free practice »** épinglé.

**Contexte atténuant :** application en **beta, 3-4 utilisateurs** → migration simple, breaking changes tolérables, pas besoin de filet réversible élaboré.

## 2. Impact Analysis

### Epics
- **Epic 2 (Journal de sessions)** — `FR13` (durée pré-calculée **surchargeable**) est amendé : la surcharge disparaît. Critère d'acceptation « je peux la surcharger » (epics.md:230) à retirer/reformuler. Epic déjà livré → **refactor**, pas re-build.
- **Epic 3 (Heatmap)** — l'agrégation `SUM(duration_minutes)` doit devenir la **somme des `SessionItem.minutes`** (jointure). Epic livré → changement ciblé sur le contrôleur heatmap.
- **Epic 6 (Capture enrichie — FR24)** — la durée de chanson alimente non seulement « Mark as Played » mais aussi le **pré-remplissage du temps d'une entrée créée manuellement**. Extension de FR24.
- **Nouvel Epic 8 (proposé)** — « Refonte temps de session : tout est entrée », porte les 3 phases A/B/C.

### Artefacts (PRD)
- **FR6, FR10, FR13, FR14, FR15** à amender (cf. §4). FR8/FR12 : ajout du topic système + inline-creation (nouveaux FR25/FR26).

### Architecture / Données
- **Suppression** de l'usage de `PracticeSession.durationMinutes` comme champ saisi. Colonne : conservée puis retirée (migration), ou conservée en dérivé (à trancher). Recommandé : **retirer** la colonne après bascule (beta).
- **Retrait** de la sync `markSongPlayed → durationMinutes` ajoutée en 6.1 (devient inutile).
- **Heatmap** : requête d'agrégation à réécrire (somme des entrées par jour).
- **Décision archi en suspens :** topic système « Free practice » = **seedé par user** (ligne `Topics` créée d'office) vs **virtuel/built-in** (pas en base, injecté côté serveur/UI). À trancher en début de Phase B.

### UX
- Formulaire de session : **suppression du champ « Duration »** global. Le total devient un **affichage dérivé** (lecture seule) = somme des entrées.
- Combobox d'entrée : topic « Free practice » **épinglé en tête** + option **« Create topic … »** quand la recherche ne matche rien.
- Entrée chanson : **auto-remplissage** des minutes depuis la durée de la chanson (si renseignée, champ vide).

### Tests / autres
- Tests session (front + back) à retravailler (le plancher/override saute). Heatmap tests à ajuster (nouvelle agrégation). `project-context.md` à mettre à jour (modèle de données).

## 3. Recommended Approach

**Option retenue : Hybride — Direct Adjustment + petit rollback ciblé.**
- **Direct Adjustment** : amender FR + epics, ajouter l'Epic 8 phasé A/B/C.
- **Rollback ciblé** : le calage/plancher de session (commits `380e8c4` + `cbd6676`) et la sync `markSongPlayed → durationMinutes` (partie de `5cc43dc`) deviennent **obsolètes** — à retirer lors de la Phase C plutôt qu'à conserver.

**Rationale :** les décisions produit sont déjà prises (brainstorm) ; le contexte beta autorise une bascule franche ; le découpage A/B/C limite le risque (A indépendant, B prérequis de C).

**Phasage :**
| Phase | Contenu | Dépend de | Risque |
|---|---|---|---|
| **A** | Auto-remplissage des minutes d'une entrée depuis la durée chanson (sélection manuelle) | — | Faible |
| **B** | Topic système « Free practice » épinglé + inline-creation de topic dans le combobox | — | Moyen |
| **C** | Suppression durée globale → total = somme des entrées ; heatmap somme les entrées ; migration ; retrait sync/plancher devenus inutiles | **B** | Moyen (atténué beta) |

## 4. Detailed Change Proposals

### PRD — `prds/prd-musician-tools-2026-06-06/prd.md`

**FR6**
- OLD : « …date…, instrument, **durée totale**. Aucune durée minimale… »
- NEW : « …date…, instrument. (Plus de durée globale saisie : le temps se loggue via les entrées — cf. FR13.) Aucune durée minimale… »

**FR10**
- OLD : « …éditable a posteriori : date, **durée**, instrument, entrées, notes. »
- NEW : « …éditable a posteriori : date, instrument, entrées (dont leurs minutes), notes. »

**FR13** _(amendé 2026-06-18 — retrait du « surchargeable »)_
- OLD : « `[ASSUMPTION]` Si toutes les entrées portent des minutes, la durée totale de la session est pré-calculée comme leur somme ; l'utilisateur peut la surcharger. »
- NEW : « La durée totale d'une session est **toujours** la somme des minutes de ses entrées (pas de durée globale surchargeable). Le temps non structuré se loggue comme une **entrée** sur le topic système « Free practice » (FR25). Une entrée sans minutes compte 0. »

**FR14**
- OLD : « …liste antichronologique avec date, **durée**, instrument, entrées. »
- NEW : « …liste antichronologique avec date, durée **(= somme des entrées, dérivée)**, instrument, entrées. »

**FR15** _(précision)_
- NEW (ajout) : « Les **minutes totales** d'un jour = somme des minutes des entrées de ses sessions. Une session sans minutes (ex. « Mark as Played » sans durée) allume toujours le jour à l'intensité minimale (inchangé). »

**FR24** _(amendé 2026-06-18 — extension)_
- NEW (ajout) : « La durée d'une chanson pré-remplit aussi les minutes d'une **entrée créée manuellement** dans une session quand on sélectionne cette chanson (valeur initiale, éditable), pas uniquement au « Mark as Played ». »

**FR25** _(nouveau)_
- « Un topic **système « Free practice »** est fourni d'office et **épinglé en tête** du sélecteur d'entrée, pour logguer du temps de pratique non structuré sans créer de topic. »

**FR26** _(nouveau)_
- « Depuis le sélecteur d'entrée, l'utilisateur peut **créer un nouveau topic à la volée** (quand sa recherche ne correspond à aucun topic existant), sans quitter le formulaire de session. »

### Epics — `epics.md`
- L. 30 / 78 / 230 / 486 : retirer « surchargeable » / « je peux la surcharger » → « total = somme des entrées (dérivé) ».
- L. 89-90 (FR24) : étendre au pré-remplissage d'entrée manuelle.
- **Ajouter Epic 8** « Refonte temps de session — tout est entrée » (FRs : FR13 amendé, FR15 précisé, FR24 étendu, FR25, FR26), avec stories :
  - **8-1** Auto-remplissage des minutes d'entrée depuis la durée chanson _(Phase A)_.
  - **8-2** Topic système « Free practice » épinglé + inline-creation de topic _(Phase B)_.
  - **8-3** Suppression de la durée globale + heatmap somme des entrées + migration + retrait sync/plancher _(Phase C)_.

### Architecture / Données (à acter en story 8-3)
- Heatmap : `SUM(session_items.minutes)` par jour (jointure `PracticeSessions`), au lieu de `SUM(duration_minutes)`.
- Retirer l'usage saisi de `PracticeSession.durationMinutes` ; migration de suppression de colonne (beta : pas de backfill complexe — le delta « non détaillé » des sessions existantes est accepté comme perdu, ou converti en une entrée « Free practice » one-shot, à confirmer).
- Retirer la sync `markSongPlayed → durationMinutes` (6.1) et le calage/plancher session (commits `380e8c4`, `cbd6676`).

## 5. Implementation Handoff

**Classification :** Majeure → mais owner solo (northwood). Pas d'escalade PM/Architecte distincte.

**Plan :**
1. **PO/PM (northwood + agent)** : valider ce proposal → appliquer les edits PRD + epics → `sprint-status.yaml` : ajouter `epic-8` + `8-1/8-2/8-3` en `backlog`.
2. **`create-story`** : générer 8-1 (Phase A) en premier (quick win, indépendant).
3. **Dev** : implémenter 8-1, puis 8-2, puis 8-3 (8-3 après 8-2).

**Décision à trancher avant 8-2/8-3 :** topic « Free practice » seedé-par-user vs virtuel/built-in.

**Critères de succès :** plus aucune durée globale saisie ; total session = somme des entrées partout (liste, heatmap, édition) ; logguer du temps libre ≤ 30 s ; aucune régression heatmap/dernier-joué ; FR13 amendé reflété dans PRD + epics.
