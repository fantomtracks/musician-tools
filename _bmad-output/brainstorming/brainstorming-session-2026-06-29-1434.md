---
stepsCompleted: [1]
inputDocuments: []
session_topic: "Auto-save de la fiche chanson"
session_goals: "Décider l'approche d'auto-save (déclencheur, feedback, erreurs/doublon en frappe, coût réseau, coexistence avec le Save explicite) et résoudre la détection isDirty fragile — assez d'idées pour cadrer une story."
selected_approach: ""
techniques_used: []
ideas_generated: []
context_file: "_bmad-output/implementation-artifacts/deferred-work.md (item prio 3)"
---

# Brainstorming — Auto-save de la fiche chanson

**Facilitator:** northwood
**Date:** 2026-06-29

## Session Overview

**Topic:** Auto-save de la fiche chanson (`Songs.tsx` / `SongForm`)

**Goals:** Décider de l'approche d'auto-save — déclencheur (blur / debounce / champ-par-champ), feedback (« Saved »/spinner/erreur), gestion des erreurs de validation et du doublon **en cours de frappe**, coût réseau, **coexistence ou suppression** du bouton Save explicite, et résolution de la détection `isDirty` fragile (`JSON.stringify(form)` vs snapshot). Sortir assez d'idées pour cadrer une story.

### Context Guidance
- Provenance : `deferred-work.md` (à brainstormer, **prio 3**).
- L'auto-save **rendrait caduque** la garde « modifs non enregistrées » du Mark as Played et **résoudrait** l'`isDirty` fragile.
- Contraintes repo : pas de lib de state ; `songService.updateSong` (PUT) ; pas de verrouillage optimiste (PUT silencieux si 0 row) ; doublon de chanson détecté serveur/UI ; toasts maison `setToastMessage`.

### Session Setup
_Facilitation : divergence d'abord, organisation ensuite. Pivots de domaine tous les ~10 idées (technique → UX → métier → edge cases)._

## Idées générées

### 🔑 Reframe (insight de northwood)
- **La fiche d'édition = atelier vivant pendant la pratique**, pas un formulaire à soumettre. northwood édite une chanson **pendant qu'il la joue** → il veut rester dessus, pas être ré-éjecté.
- Le vrai irritant : (1) Save **tout en bas** (loin), (2) Save **renvoie à la songlist** (= quitte alors qu'il joue).

### Idées (en vrac, technique 1)
1. **Auto-save « Google Docs »** (choix 🅰️) — sauvegarde en arrière-plan, plus de bouton Save explicite.
2. **Découpler « sauver » de « quitter »** — sauver ≠ revenir à la liste.
3. **Bouton sticky « Back to songlist »** — navigation explicite quand on VEUT partir (remplace le « Save = quitter »).
4. **Feedback discret « Saved ✓ »** (ambiant, non intrusif — il est en train de jouer).
5. **Sticky « Back to songlist » en HAUT** (fixe) — le bas est l'irritant.
6. **Erreur de save non bloquante** : petit **✗ discret à côté du champ fautif** (titre déjà pris, invalide…) ; **le reste continue de se sauver**. Pas de blocage.
7. **Édits = petits ajustements** (BPM, tag, note rapide), peu de frappe → un **save sur pause de frappe (debounce) / au blur** suffit largement (coût réseau négligeable).

### Pre-mortem (technique 2) — risques tranchés
- ① **Save silencieux qui rate** → 😱 : l'indicateur doit passer en **« ⚠️ pas sauvé / retente »** quand un save échoue (le « Saved ✓ » ne suffit pas).
- ② **Debounce pas vidé au « Back »** → 😱 : le bouton **Back to songlist doit forcer le flush du save** avant de naviguer.
- ③ **Deux appareils (last-write-wins)** → 🤷 : **report assumé** (solo/beta) — cohérent avec le bloc « gardés consciemment ».

## Synthèse — concept retenu

**« Atelier vivant + auto-save »** : la fiche chanson devient un espace qu'on ajuste pendant qu'on joue, qui se sauve tout seul, et qu'on quitte explicitement.

**Décisions actées :**
1. **Auto-save** : debounce sur changement (idle ~1-2 s) **+ flush au blur** **+ flush au départ** (clic « Back »).
2. **Suppression du bouton Save** (Save = automatique). La détection **`isDirty` fragile disparaît** (plus de notion modifié-vs-sauvé ; au pire dérivée de « save en attente »).
3. **Découpler sauver / quitter** : **bouton sticky « Back to songlist » en haut** (navigation explicite) — fini le « Save = ré-éjection ».
4. **Indicateur de statut ambiant** : `Saving… / Saved ✓ / ⚠️ Not saved — retry` (couvre ① + le feedback non intrusif).
5. **Erreur non bloquante par champ** : ✗ discret à côté du champ fautif (titre déjà pris…), le reste continue.
6. **Caduc** : la garde « modifs non enregistrées » du Mark as Played n'a plus lieu d'être.
7. **Reporté** : course 2-appareils (last-write-wins) — assumé à l'échelle beta.

### ⚠️ Décision ouverte (à trancher au cadrage story — terrain modèle/donnée)
**« Le reste continue de se sauver » vs un seul PUT global.** Aujourd'hui `updateSong` est un **PUT de toute la fiche** → un champ invalide (titre dupliqué) ferait **échouer tout le save**, pas juste le champ. Pour honorer le point 5, il faut choisir : (a) **save partiel** (PATCH champ par champ / exclure le champ fautif du payload jusqu'à correction), ou (b) garder le PUT global mais **tolérant** côté serveur (sauve les champs valides, ne rejette que l'unicité du titre). À trancher avec northwood au démarrage de la story.
