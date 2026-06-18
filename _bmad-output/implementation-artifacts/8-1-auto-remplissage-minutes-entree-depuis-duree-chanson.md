---
baseline_commit: d174cff
---

# Story 8.1: Auto-remplissage des minutes d'entrée depuis la durée chanson

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui détaille sa session de pratique,
I want que choisir une chanson ayant une durée pré-remplisse automatiquement le temps de l'entrée,
so that je saisis moins et mon journal reflète mon temps sans effort.

## Acceptance Criteria

1. **Pré-remplissage à la sélection (FR24 étendu)** — Given le sélecteur d'entrée d'une session (création ou édition), When je sélectionne une chanson **qui a une durée** (`durationSeconds`) et que le champ minutes de cette entrée est **vide**, Then le champ minutes est pré-rempli avec la durée **arrondie à la minute** (`Math.round(durationSeconds / 60)`).
2. **Sous 30 s → pas de minutes** — Given une chanson dont la durée arrondit à 0 (< 30 s), When je la sélectionne, Then aucune valeur n'est mise (champ laissé vide), cohérent avec le comportement de `markSongPlayed` (story 6.1).
3. **Ne jamais écraser une saisie manuelle** — Given une entrée dont le champ minutes est **déjà renseigné** (même partiellement), When je (re)sélectionne une chanson, Then la valeur saisie est **conservée** (aucun écrasement).
4. **Chanson sans durée → rien** — Given une chanson **sans** `durationSeconds`, When je la sélectionne, Then le champ minutes reste vide (pas de régression).
5. **Topic → rien** — Given je sélectionne un **topic** (pas une chanson), When la sélection se fait, Then aucun pré-remplissage de minutes (les topics n'ont pas de durée).
6. **Éditable** — Given un champ pré-rempli, When je modifie la valeur, Then ma valeur prime (le pré-remplissage n'est qu'une valeur initiale).

## Tasks / Subtasks

- [x] Util — ajouter dans `src/utils/duration.ts` un helper `secondsToWholeMinutes(seconds: number | null | undefined): number | null` (arrondi `Math.round`, `> 0` sinon `null`) + tests dans `src/__tests__/duration.test.ts` (AC1, AC2)
- [x] Frontend — `MySessionsPage.tsx` : à la sélection d'entrée (`onPick`, ~ligne 714), si le ref est une chanson (`song:<uid>`), résoudre la chanson dans `songs`, et **si le champ minutes de l'entrée est vide**, pré-remplir `minutes` avec `secondsToWholeMinutes(song.durationSeconds)` (AC1, AC3, AC4, AC5)
- [x] Frontend — garder le `digitsOnly`/format attendu pour le champ minutes (`entry.minutes` est une **string**) ; ne pré-remplir que quand `entry.minutes === ''` (AC3)
- [x] Tests — front (`MySessionsPage.test.tsx`) : sélection d'une chanson avec durée pré-remplit ; champ déjà saisi non écrasé ; chanson sans durée → vide ; topic → vide (AC1-5)

### Review Findings

- [x] [Review][Patch] Traduire en anglais le commentaire ajouté (règle projet « commentaires en anglais ») [src/pages/MySessionsPage.tsx:717-719] — appliqué (2026-06-18)
- [x] [Review][Patch] Ajouter un test AC6 (valeur pré-remplie puis éditée → la valeur utilisateur prime) [src/__tests__/MySessionsPage.test.tsx] — appliqué (2026-06-18)
- [x] [Review][Defer] Re-sélectionner une autre chanson n'écrase pas les minutes déjà auto-remplies — conforme à AC3 et sûr (pas de perte) ; tweak possible (flag « auto-rempli ») si gênant un jour [src/pages/MySessionsPage.tsx] — noté

## Dev Notes

### Contexte & pourquoi
Phase A de l'Epic 8 (« tout est entrée », cf. `sprint-change-proposal-2026-06-18.md`). **Story indépendante, faible risque** — elle n'enlève rien, elle ajoute juste un confort de saisie. C'est l'extension de **FR24** au **flux manuel** (la story 6.1 a fait l'équivalent pour « Mark as Played » côté backend).

### Fichiers à toucher (UPDATE)
- **`src/pages/MySessionsPage.tsx`** (le cœur) :
  - L'état des entrées : `entries: EntryDraft[]`, chaque `EntryDraft` a `{ key, ref, minutes: string, note, ... }` (cf. `type EntryDraft`, ~ligne 9).
  - Le catalogue chansons est déjà chargé : `const [songs, setSongs] = useState<Song[]>([])` (~ligne 194). Chaque `Song` porte `durationSeconds?: number | null` (ajouté en 6.1, cf. `src/services/songService.ts`).
  - Le sélecteur : composant `EntryRefPicker`, prop `onPick: (ref: string) => void`. Le ref est `'song:<uid>'` ou `'topic:<uid>'`.
  - **Point d'accroche exact** (~ligne 714) :
    ```tsx
    onPick={ref => updateEntry(entry.key, { ref })}
    ```
    → à enrichir pour pré-remplir les minutes. `updateEntry(key, patch)` fusionne le patch (`setEntries(prev => prev.map(e => e.key === key ? { ...e, ...patch } : e))`).
  - **Logique suggérée** (dans le handler `onPick`, qui a `entry` en closure) :
    ```tsx
    onPick={ref => {
      const patch: Partial<EntryDraft> = { ref };
      // FR24 étendu : pré-remplir les minutes depuis la durée de la chanson,
      // seulement si l'utilisateur n'a rien saisi (ne jamais écraser).
      if (entry.minutes === '' && ref.startsWith('song:')) {
        const song = songs.find(s => s.uid === ref.slice('song:'.length));
        const mins = secondsToWholeMinutes(song?.durationSeconds);
        if (mins !== null) patch.minutes = String(mins);
      }
      updateEntry(entry.key, patch);
    }}
    ```
- **`src/utils/duration.ts`** : ajouter `secondsToWholeMinutes` (réutilisable, testé). Le backend `markSongPlayed` fait déjà `Math.round(song.durationSeconds / 60)` avec `> 0 → null` (cf. `backend/controllers/songcontroller.js`) — reproduire la **même** sémantique côté front pour la cohérence.
  ```ts
  export function secondsToWholeMinutes(seconds: number | null | undefined): number | null {
    if (!Number.isInteger(seconds) || (seconds as number) <= 0) return null;
    const rounded = Math.round((seconds as number) / 60);
    return rounded > 0 ? rounded : null;
  }
  ```

### Ce qui doit être préservé (ne pas casser)
- Le **plancher/calage** de durée de session existe encore (commits `380e8c4`/`cbd6676`) : il sera retiré en **8-3**, pas ici. Le pré-remplissage d'une entrée fait monter le cumul → le plancher de session suit (comportement déjà testé). Ne pas y toucher.
- `EntryRefPicker` : ne pas modifier son comportement de sélection/clavier ; seul le handler `onPick` côté parent change.
- Le champ minutes utilise `digitsOnly` à la saisie (`onChange={e => updateEntry(entry.key, { minutes: digitsOnly(e.target.value) })}`) ; le pré-remplissage écrit une string d'entiers (`String(mins)`), cohérent.

### Testing standards
- **Frontend uniquement** (aucun changement backend). Suite Jest racine (`src/__tests__/`), Testing Library. Lancer `npm test` à la racine.
- `MySessionsPage.test.tsx` a déjà les helpers `addEntry(index, ref, minutes?)` et `pickEntry` + le fixture `SONG_UID → 'Sweet Child'`. **Important :** le fixture actuel `getAllSongs.mockResolvedValue([{ uid: SONG_UID, title: 'Sweet Child' }])` n'a **pas** de `durationSeconds` — pour tester l'AC1, mocker une chanson **avec** `durationSeconds` (ex. `240` → 4 min) dans le test concerné.
- Cas à couvrir : (1) sélection chanson avec durée → minutes pré-remplies ; (2) champ déjà saisi → inchangé ; (3) chanson sans durée → vide ; (4) topic → vide ; (5) util `secondsToWholeMinutes` (240→4, 210→4, 20→null, null→null).

### Project Structure Notes
- `src/utils/duration.ts` + `src/__tests__/duration.test.ts` existent déjà (créés en 6.1) — on **étend**, on ne crée pas.
- Conventions front (cf. `project-context.md`) : TypeScript strict + `verbatimModuleSyntax` (imports de types via `import type`), pas d'alias de paths, Testing Library « comportement visible ».

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-18.md] — Phase A, FR24 étendu
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8] — Story 8.1
- [Source: _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/prd.md] — FR24 (amendé/étendu 2026-06-18)
- [Source: src/pages/MySessionsPage.tsx#EntryRefPicker / onPick ~714 / entries] — point d'accroche
- [Source: backend/controllers/songcontroller.js#markSongPlayed] — sémantique d'arrondi seconde→minute (référence de cohérence, story 6.1)
- [Source: _bmad-output/implementation-artifacts/6-1-duree-de-chanson-temps-de-session-auto.md] — story sœur (durée chanson, util duration.ts)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Cycle red-green sur `secondsToWholeMinutes` (RED : export inexistant → GREEN : helper ajouté).
- `npx tsc -b` clean ; frontend `npm test` 222/222 ; lint clean sur les 4 fichiers touchés.

### Completion Notes List

- AC1-6 couverts. Helper `secondsToWholeMinutes` ajouté dans `duration.ts` (même sémantique d'arrondi que le backend `markSongPlayed` de 6.1 : entier > 0, arrondi minute, sinon `null`).
- Pré-remplissage branché dans le handler `onPick` du sélecteur d'entrée (`MySessionsPage.tsx`) : uniquement pour un ref `song:`, uniquement si `entry.minutes === ''` (jamais d'écrasement), via `songs.find(...)` + `secondsToWholeMinutes(song.durationSeconds)`. Topics et chansons sans durée → aucun pré-remplissage.
- **Aucun changement backend** (story front-only). Le plancher/calage de session (commits 380e8c4/cbd6676) n'est pas touché — il sera retiré en 8-3.
- Tests : util (3 nouveaux cas) + 4 tests d'intégration `MySessionsPage` (pré-remplit / pas d'écrasement / sans durée / topic).

### File List

- `src/utils/duration.ts` (modifié — ajout `secondsToWholeMinutes`)
- `src/__tests__/duration.test.ts` (modifié — tests du helper)
- `src/pages/MySessionsPage.tsx` (modifié — import + pré-remplissage dans `onPick`)
- `src/__tests__/MySessionsPage.test.tsx` (modifié — 4 tests 8.1)

## Change Log

- 2026-06-18 — Implémentation story 8.1 (Epic 8, Phase A) : à la sélection d'une chanson dans une entrée de session, pré-remplissage automatique des minutes depuis la durée de la chanson (arrondie), sans écraser une saisie manuelle. Helper `secondsToWholeMinutes` réutilisable. Front 222/222, tsc + lint clean. Status → review.
- 2026-06-18 — Code review (3 couches) : 2 patches appliqués (commentaire FR → EN ; test AC6 ajouté), 3 findings dismissés (pré-remplissage > 1440 inatteignable car durationSeconds borné à 86400 ; re-sélection sûre conforme AC3 ; reste clean). Front 223/223. Status → done.
