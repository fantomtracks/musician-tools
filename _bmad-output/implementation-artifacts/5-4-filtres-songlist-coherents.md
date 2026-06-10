---
baseline_commit: 9ea22cf
---

# Story 5.4: Filtres Songlist cohérents (accordéons)

Status: done

## Contexte

Polish UI hors PRD (UI existante ; **CM2** : ne pas dégrader l'usage répertoire). Incohérences d'accordéon dans le panneau de filtres de la Songlist, relevées par northwood (2026-06-10).

## Story

As a utilisateur qui filtre son répertoire,
I want que tous les blocs de filtres se replient de la même façon,
so that le panneau de filtres est cohérent et prévisible.

## Acceptance Criteria

1. **Difficulty & Capo pliables** — Given les filtres « Filter by difficulty (max) » et « Filter by capo » (Guitar), When j'ouvre le panneau de filtres, Then ils sont présentés comme des accordéons (header cliquable + chevron) au même titre que Tuning / Technique / Genre / Language, avec état persisté (localStorage) comme les autres.
2. **Chevron Language cohérent** — Given le bloc « Filter by language », Then sa flèche utilise le même glyphe que les autres accordéons (`▾` ouvert / `▴` fermé, `text-xl`) — plus de chevron `▼` à rotation différent.
3. **Aucune régression** — le filtrage lui-même (sélection difficulté/capo/langue) reste inchangé ; les autres accordéons et la persistance ne régressent pas.

## Tasks / Subtasks

- [x] `Songs.tsx` : états `difficultyAccordionOpen` + `capoAccordionOpen` (défaut ouvert) + effets de persistance, passés à `SongsList`
- [x] `SongsList.tsx` : props `difficulty`/`capoAccordionOpen` (+ setters) au type et passés à `SongsSidebar`
- [x] `SongsSidebar.tsx` : « Filter by difficulty (max) » et « Filter by capo » enveloppés dans un accordéon (header + chevron) comme Tuning/Technique
- [x] `SongsSidebar.tsx` : chevron de « Filter by language » aligné sur le pattern commun (`▾`/`▴`, `text-xl`)
- [x] Vérifs : typecheck + tests (178) + lint

## Dev Notes

Capo inclus (sur demande de northwood). La dette « nav mobile cassée » reste par ailleurs ouverte (cf. deferred-work).
