---
baseline_commit: 1d28415
---

# Story 6.1: Durée de chanson → temps de session auto

Status: ready

## Story

As a musicien qui marque ses chansons jouées,
I want que la durée de la chanson alimente automatiquement le temps de ma session,
so that mon journal reflète mon temps de pratique sans saisie manuelle.

## Acceptance Criteria

1. **Durée optionnelle sur la chanson (FR24)** — Given le formulaire chanson, When je renseigne une durée (minutes), Then elle est persistée ; une chanson sans durée reste valide (rétrocompat, champ nullable).
2. **Pré-remplissage au Mark as Played (FR21 amendé)** — Given une chanson avec une durée, When je clique « Mark as Played Now », Then l'entrée créée dans la session du jour porte cette durée en minutes (et non plus « sans minutes »).
3. **Sans durée → comportement d'origine** — Given une chanson sans durée, When je la marque jouée, Then l'entrée est ajoutée sans minutes (FR21 d'origine).
4. **Cumul sur re-marquage (pas de doublon)** — Given la même chanson déjà entrée dans la session du jour, When je la re-marque jouée, Then aucune entrée dupliquée n'est créée **mais les minutes de l'entrée existante sont incrémentées** de la durée de la chanson.
5. **Éditable a posteriori** — Given une entrée pré-remplie, When j'édite la session, Then je peux corriger les minutes (le pré-remplissage n'est qu'une valeur initiale).
6. **Durée totale de session (FR13)** — Given des entrées portant des minutes, Then la durée totale suit FR13 (somme, surchargeable) ; aucune régression de l'édition de session.
7. **Aucune régression répertoire (CM2)** — création / édition / filtre des chansons inchangés hormis le nouveau champ.

## Tasks / Subtasks

- [ ] Backend — migration `add-duration-to-songs` : colonne `duration_minutes` INT NULL (pattern migrations existant, additive / idempotente)
- [ ] Backend — modèle `song.js` : champ `durationMinutes` (nullable, `field: 'duration_minutes'`)
- [ ] Backend — `songcontroller` : plomberie `durationMinutes` (create / update, garder la garde `req.body || {}`)
- [ ] Backend — `markSongPlayed` : entrée **créée** + chanson a une durée → `minutes = song.durationMinutes` ; entrée **déjà présente** (même `songUid`) → **incrémenter** ses minutes de `song.durationMinutes` (AC4) ; sinon comportement actuel. Dans la transaction existante. Respecter FR4 (label snapshot), FR19 (jour client), et la cohérence « dernier joué » (FR23, ne pas régresser 4.2)
- [ ] Frontend — `SongForm` : champ numérique « Duration (min) » optionnel + DTO + état
- [ ] Tests — back (markSongPlayed : pré-remplissage + cumul + sans durée) et front (champ durée)

## Dev Notes

Décision Correct Course (2026-06-10) : **pré-remplir mais éditable**. PRD amendé : **FR21** + **FR24** (cf. sprint-change-proposal-2026-06-10). Attention à la dette 4.1/4.2 (réutilisation d'entrée, SongPlay, recalcul « dernier joué »). northwood plus à l'aise front → back à piloter avec soin.
