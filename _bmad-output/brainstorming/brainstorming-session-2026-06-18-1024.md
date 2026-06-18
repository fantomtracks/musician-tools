---
stepsCompleted: [1, 2, 3, 4]
session_active: false
workflow_completed: true
inputDocuments: []
session_topic: 'Refonte de la gestion du temps dans les sessions de pratique (musician-tools)'
session_goals: 'Cadrer 3 pistes liées (auto-remplissage du temps d''entrée depuis la durée chanson ; suppression de la durée globale de session au profit du cumul des entrées ; création de topics à la volée dans le combobox d''entrée), explorer les enjeux (heatmap, migration de données, amendement PRD FR13, friction utilisateur) et dégager un phasage actionnable'
selected_approach: 'ai-recommended'
techniques_used: ['Question Storming', 'First Principles / Assumption Reversal', 'Pre-mortem / Failure Analysis']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** northwood
**Date:** 2026-06-18

## Session Overview

**Topic:** Refonte de la gestion du temps dans les sessions de pratique (musician-tools)

**Goals:** Cadrer 3 pistes liées issues de la story 6.1, explorer leurs enjeux (heatmap, migration, PRD FR13, friction), et dégager un phasage actionnable.

### Session Setup

Pistes de départ (à challenger / enrichir pendant la session) :
1. Auto-remplir le temps d'une entrée quand on choisit une chanson ayant une durée.
2. Supprimer le champ « durée » global de la session → total = somme des entrées (tout temps logué via entrées).
3. Créer des topics à la volée dans le combobox d'entrée pour fluidifier le logging-tout-en-entrée.

Enjeux identifiés à explorer : impact heatmap (agrégation `SUM(duration_minutes)` → somme des entrées), migration des sessions à durée non détaillée, amendement PRD (FR13 « surchargeable »), friction utilisateur (topic « Warmup / Free practice »), phasage.

## Technique Selection

**Approach:** AI-Recommended Techniques

**Recommended Techniques (3 phases):**

- **Question Storming** (`deep`) — Phase 1, poser le problème : générer uniquement des questions sur les 3 pistes et leurs inconnues (heatmap, migration, PRD, friction).
- **First Principles / Assumption Reversal** (`deep`) — Phase 2, challenger le fondamental : la session a-t-elle besoin d'une durée globale ? reconstruire le modèle cible depuis les vérités de base.
- **Pre-mortem / Failure Analysis** (`deep`) — Phase 3, dé-risquer + décider : imaginer l'échec post-livraison pour faire émerger les garde-fous et éclairer le phasage.

**AI Rationale:** sujet structurant avec inconnues réelles → faire émerger questions et risques avant de trancher ; converger sur un phasage actionnable en fin de séance.

## Technique Execution Results

### Phase 1 — Question Storming (amorcée puis dépassée)
Questions clés posées :
- Heatmap : que devient « le temps d'un jour » sans champ global, quand une entrée n'a pas de minutes ? (compter 0 vs exclure)
- Friction : coût du log « 20 min sans détail » dans le nouveau modèle vs aujourd'hui — ne pas casser le « log < 30s » (epic 2).
- Migration : sort du « temps non détaillé » des sessions existantes (perdre / convertir en entrée générique / garder en lecture seule).

### Phase 2 — First Principles / Assumption Reversal (décisions clés)
- **Vérité de base validée :** une session n'est qu'un regroupement (jour + instrument) ; le temps vit sur les entrées, pas sur le conteneur.
- **Décision (a) :** la pratique non structurée = une entrée sur un topic générique. → **Modèle « Tout est entrée »**, on supprime la durée globale.
- **Décision (i) :** le topic générique « Free practice » est un **topic système épinglé** par défaut (toujours là, pas à créer). → rend le modèle indolore.
- L'inline-creation de topic (#3) reste utile pour les *autres* topics ; le Free practice, lui, est fourni d'office.

### Phase 3 — Pre-mortem (dé-risquage)
- **Contrainte décisive :** app en **beta, 3-4 utilisateurs** → risque migration/historique **faible**. Pas besoin de migration réversible élaborée ni de backfill sophistiqué ; breaking changes tolérables.
- Reste surtout de la mécanique : heatmap (somme des entrées), retrait du champ global (UI+back), topic système, inline-creation, auto-remplissage du temps d'entrée depuis la durée chanson.

### Idées / décisions capturées
- **[Modèle #1] Tout est entrée** — session = regroupement ; une seule source de vérité pour le temps ; fin de la confusion total-vs-entrées.
- **[Modèle #2] Topic système « Free practice » épinglé** — log du temps libre sans créer de topic.
- **[Contrainte #1] Beta / 3-4 users** — risque faible → phasage agressif possible, migration simple.
- **À trancher (archi) :** topic système = seedé par user vs virtuel/built-in.


## Idea Organization and Prioritization

### Thèmes

**Thème 1 — Décisions produit (actées)**
- Modèle « Tout est entrée » : la session = un regroupement (jour + instrument) ; le temps vit sur les entrées ; suppression de la durée globale.
- Topic système « Free practice » épinglé par défaut pour le temps non structuré.

**Thème 2 — Mécanique à livrer**
- Auto-remplissage du temps d'une entrée depuis la durée de la chanson (si renseignée).
- Inline-creation de topic dans le combobox d'entrée.
- Heatmap : agréger la somme des `SessionItem.minutes` au lieu de `PracticeSession.duration_minutes`.
- Retrait du champ durée global (UI + back) + retrait de la sync `markSongPlayed → durationMinutes` devenue inutile.

**Thème 3 — Risques (dégonflés)**
- Beta / 3-4 utilisateurs → migration simple, breaking changes tolérables, pas de filet réversible élaboré.
- Décision archi en suspens : topic « Free practice » système **seedé par user** vs **virtuel/built-in**.

### Phasage recommandé

| Phase | Quoi | Dépend de | Risque |
|---|---|---|---|
| A | Auto-remplissage du temps d'entrée depuis la durée chanson | rien | faible |
| B | Topic « Free practice » système épinglé + inline-creation de topic | — | moyen |
| C | Suppression durée globale → total = somme des entrées + heatmap somme des entrées + migration | B | moyen (atténué par beta) |

Logique : A = quick win indépendant ; B rend le « tout-est-entrée » indolore ; C ne démarre qu'après B et commence par un amendement PRD (FR13 « surchargeable ») via correct-course.

## Session Summary and Insights

**Key Achievements:**
- Décision de modèle claire : « Tout est entrée », plus de durée globale de session.
- Le topic système « Free practice » épinglé identifié comme la clé qui rend le modèle indolore (et condition de l'inline-creation).
- Contexte beta / 3-4 users reconnu comme facteur décisif qui dégonfle le risque migration → phasage agressif possible.
- Un phasage A → B → C actionnable, avec dépendances et niveau de risque.

**Décision en suspens :** topic système seedé par user vs virtuel/built-in (à trancher en début de Phase B/C).

**Next steps proposés :**
1. `correct-course` — acter l'amendement FR13 (retrait du « surchargeable ») + cadrer la stratégie de migration beta.
2. `create-story` — découper les phases A / B / C en stories.
3. Phase A jouable presque immédiatement (quick win, indépendant).
