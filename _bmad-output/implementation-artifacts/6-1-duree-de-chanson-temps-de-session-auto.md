---
baseline_commit: 1d28415
---

# Story 6.1: Durée de chanson → temps de session auto

Status: done

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

- [x] Backend — migration `add-duration-to-songs` : colonne `duration_minutes` INT NULL (pattern migrations existant, additive / idempotente)
- [x] Backend — modèle `song.js` : champ `durationMinutes` (nullable, `field: 'duration_minutes'`)
- [x] Backend — `songcontroller` : plomberie `durationMinutes` (create / update, garder la garde `req.body || {}`)
- [x] Backend — `markSongPlayed` : entrée **créée** + chanson a une durée → `minutes = song.durationMinutes` ; entrée **déjà présente** (même `songUid`) → **incrémenter** ses minutes de `song.durationMinutes` (AC4) ; sinon comportement actuel. Dans la transaction existante. Respecter FR4 (label snapshot), FR19 (jour client), et la cohérence « dernier joué » (FR23, ne pas régresser 4.2)
- [x] Frontend — `SongForm` : champ numérique « Duration (min) » optionnel + DTO + état
- [x] Tests — back (markSongPlayed : pré-remplissage + cumul + sans durée) et front (champ durée)

### Review Findings

- [x] [Review][Patch] Coercition défensive du résultat de `SessionItem.sum` (pg renvoie les SUM en string) — `Number(await SessionItem.sum(...)) || 0` pour éviter une concaténation `'4'+5='45'` corrompant le total de session [backend/controllers/songcontroller.js] — appliqué (2026-06-18)
- [x] [Review][Defer] Désync du total de session au plafond 1440 (>24h accumulés) — limitation du modèle minutes, quasi inatteignable [backend/controllers/songcontroller.js] — deferred
- [x] [Review][Defer] Détection « dirty » via `JSON.stringify(form)` fragile (faux positif bénin de dialogue) [src/pages/Songs.tsx] — deferred
- [x] [Review][Defer] Course lost-update sur marquages concurrents (même `priorTotal`) [backend/controllers/songcontroller.js] — deferred
- [x] [Review][Patch] Contraindre le champ Duration côté client (`step={1}` + `max={1440}`) pour aligner la validation sur le serveur et éviter la perte silencieuse de valeur (décimale ou hors-plage → `null` sans feedback) [src/components/SongForm.tsx] — appliqué (2026-06-17)

## Dev Notes

Décision Correct Course (2026-06-10) : **pré-remplir mais éditable**. PRD amendé : **FR21** + **FR24** (cf. sprint-change-proposal-2026-06-10). Attention à la dette 4.1/4.2 (réutilisation d'entrée, SongPlay, recalcul « dernier joué »). northwood plus à l'aise front → back à piloter avec soin.

## Dev Agent Record

### Implementation Plan

- **Schéma** : nouvelle colonne `Songs.duration_minutes` (INT NULL) via migration idempotente (garde `describeTable`, pattern `add-capo`) + champ modèle `durationMinutes` (`field: 'duration_minutes'`).
- **Contrôleur** : normaliseur `normalizeDurationMinutes` (calqué sur `normalizeCapo` — `undefined` = champ absent, hors-plage → `null`, borne 1..1440) branché dans `createSong` / `updateSong`.
- **`markSongPlayed`** : calcul d'un `playedDuration` (entier > 0 sinon `null`) dans la transaction existante. Entrée **créée** → `minutes = playedDuration` (AC2/AC3) ; entrée **déjà présente** + durée → `item.update({ minutes: (existant ?? 0) + playedDuration })` (AC4, cumul sans doublon). Aucune touche à l'ordre session→item→play (cascade FR23/4.2 préservée), au snapshot `label` (FR4) ni au jour client (FR19).
- **Frontend** : `durationMinutes?: number | null` sur le type `Song` (donc `CreateSongDTO`), `initialSong` + `handleChange` (parsing comme `bpm`), champ `<input type="number" name="durationMinutes">` « Duration (min) » dans l'accordéon Details. Édition (`...song`) et submit (`...form`) propagent le champ sans changement.

### Completion Notes

- AC1 → AC7 couverts. AC5 (éditable a posteriori) et AC6 (total session FR13) ne nécessitent **aucune** modification du chemin d'édition de session : `minutes` reste une valeur initiale modifiable, et la somme FR13 est inchangée — confirmé par l'absence de régression sur la suite `practicesessioncontroller`.
- Le pré-remplissage est **purement défensif** : seul un entier > 0 alimente les minutes ; toute autre valeur retombe sur le comportement « sans minutes » d'origine (AC3).
- Migration **testée localement** sur la base dev (Postgres 5433) : cycle `up` → `undo` → `up` → second `up` (no-op) OK.
- Tests : backend `songcontroller` 27/27 (suite complète 130/130), frontend `SongForm` + suite complète 195/195, `tsc -b` clean, lint backend clean, lint des 3 fichiers source frontend clean. Les erreurs ESLint résiduelles (`AuthContext.tsx`, `MyPlaylistsPage.tsx`, `vite.config.ts`, `as any` des helpers de test) sont **préexistantes** et hors périmètre de cette story.

### File List

- `backend/migrations/20260617000000-add-duration-to-songs.js` (nouveau — colonne `duration_seconds`)
- `backend/models/song.js` (modifié)
- `backend/controllers/songcontroller.js` (modifié)
- `backend/__tests__/songcontroller.test.js` (modifié)
- `src/services/songService.ts` (modifié)
- `src/pages/Songs.tsx` (modifié)
- `src/components/SongForm.tsx` (modifié)
- `src/utils/duration.ts` (nouveau — parse/format m:ss ↔ secondes)
- `src/__tests__/duration.test.ts` (nouveau)
- `src/__tests__/SongForm.test.tsx` (modifié)

### Note post-review — passage à la seconde (m:ss)

Sur demande de northwood après la review : la durée est désormais stockée en **secondes** (`duration_seconds`), pour permettre la saisie au format **m:ss** (ex. `3:30`). Règle de saisie retenue (sans ambiguïté) : **m:ss** ou un **nombre entier de minutes** (`4` → 4:00). Un seul chiffre aux secondes = **dizaines** (`3:3` → 3:30, pas 3:03) ; les secondes doivent rester **0–59** (`3:60`, `3:7`=70 s → refusés). Toute saisie invalide (décimale/virgule, secondes > 59, junk) affiche un **message d'erreur inline** et **conserve** le texte saisi (plus de vidage silencieux) ; le champ vidé volontairement = pas de durée. Le parsing/formatage est isolé dans `src/utils/duration.ts` (testé) ; commit au blur. Le **journal reste en minutes entières** (epic 2-4 non touché) : le pré-remplissage arrondit les secondes à la minute (`Math.round`, 3:30 → 4 min ; un morceau < 30 s → entrée sans minutes). Mise en page Details réorganisée en 2 lignes de 3 colonnes (Duration · BPM · Time Signature / Key · Mode · Pitch).

## Change Log

- 2026-06-17 — Implémentation story 6.1 : durée de chanson optionnelle (FR24) pré-remplissant le temps de session au Mark as Played, avec cumul sur re-marquage (FR21 amendé). Migration additive `duration_minutes`, plomberie contrôleur + form, tests back/front. Status → review.
- 2026-06-17 — Code review (3 couches adversariales) : 1 patch appliqué (`step`/`max` sur l'input Duration pour éviter la perte silencieuse de valeur), 7 findings dismissés (faux positifs / par conception / conformes au repo). Status → done.
- 2026-06-17 — Évolution post-review (demande northwood) : durée stockée en **secondes** (`duration_seconds`), saisie **m:ss** ou minutes décimales (`3,3`), util de parsing testé, journal pré-rempli en minutes arrondies. Réagencement Details en 2×3 colonnes. Front 204/204, back 132/132, lints clean, migration idempotente re-testée.
- 2026-06-17 — Saisie durée durcie : règle finale **m:ss / minutes entières uniquement** (décimal refusé), un chiffre aux secondes = dizaines (`3:3`→3:30), secondes plafonnées à 59, **message d'erreur inline** (texte conservé) au lieu du vidage. Placeholder retiré (label suffit).
- 2026-06-18 — Code review complète de la story (3 couches) : 1 patch appliqué (coercition `Number()` sur `SessionItem.sum` — piège pg string), 3 dettes déférées (désync au plafond 1440, fragilité du dirty-check JSON, course concurrente), ~9 findings dismissés. Status reste `done`.
- 2026-06-18 — UX (signalé northwood) : « Mark as Played » lit la chanson en base → une durée saisie mais non sauvegardée était ignorée. Ajout d'une garde « modifs non enregistrées » : si la fiche est modifiée, un `ConfirmDialog` « Save & mark as played » enregistre d'abord puis marque (détection dirty via snapshot JSON du form). Demande loggée séparément dans `deferred-work.md` : chanson cliquable dans la prévisualisation de l'historique de session. 2 tests d'intégration ajoutés. Front 213/213.
- 2026-06-17 — Fix (signalé northwood) : le total de session n'était jamais alimenté par « mark as played » (`durationMinutes` restait null) → temps non affiché dans le journal et non compté sur le heatmap. `markSongPlayed` synchronise désormais `PracticeSession.durationMinutes` avec la somme des entrées (auto-géré, sans écraser un override manuel). Tests AC6 ajoutés. Front 211/211, back 136/136.
