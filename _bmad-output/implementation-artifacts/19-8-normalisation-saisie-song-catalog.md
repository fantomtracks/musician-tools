---
baseline_commit: 83d273ba9fe351b41b576673b6193db4ee554537
---

# Story 19.8: Normalisation de saisie partagée (bpm / pitchStandard / language) — Song + Catalog

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **backend developer**,
I want **shared normalizers (`normalizeInt`, `normalizeLanguage`) applied to `bpm`, `pitchStandard` and `language` on BOTH the Song and Catalog write paths**,
so that **a bad numeric input (decimal, non-numeric, or beyond INT4) can't 500 on the INTEGER columns, `normalizeDurationSeconds` stops being duplicated, and `language` is title-cased consistently on both sides**.

## Contexte / origine

Durcissement **v2 hors cluster DRY** (promu à la revue `deferred-work.md` du 2026-07-16). Dernière story v2 identifiée, sur la branche epic `feat/epic-19-composants-partages` (après le cluster composants partagés 19-7/9/10/11/12). Purement backend.

## Problème (constaté dans le code)

- **`bpm` (INTEGER) et `pitchStandard` (INTEGER)** sont écrits **bruts** côté Song (`songcontroller.js` create L182/L195, update L256/L266) ET Catalog (`pickIntrinsic` copie `bpm`/`pitchStandard` tels quels — ils sont dans `INTRINSIC_FIELDS`). Un `3.5`, un `"abc"`, un négatif ou une valeur `> 2147483647` (max INT4) → **erreur Postgres → 500** au lieu d'un `null` propre.
- **`normalizeDurationSeconds` est DUPLIQUÉ** : `songcontroller.js` L15 ≡ `catalogcontroller.js` L30 (identiques). Style = **reject-to-null** : `undefined→undefined` (champ absent), `null/''→null`, sinon `Number(value)` ; si `!Number.isInteger || <1 || >86400` → `null`.
- **`language` (JSONB)** est **title-cased + arrayifié** au Song (`normalizeLanguage`, songcontroller L35+) mais copié **brut** au Catalog (pas de 500 car JSONB, mais **incohérent** : « english » côté Catalog vs « English » côté Song).

## Décision de design (à valider — proposée en cohérence avec l'existant)

- **Style = reject-to-null** (comme `normalizeDurationSeconds`), PAS clamp, PAS 400. Une valeur invalide/hors-bornes devient `null` (le champ n'est simplement pas enregistré, comme un champ vide) — le moins surprenant, et pas de « valeur fausse mais plausible » silencieuse qu'un clamp produirait.
- **Bornes** (INTEGER, rejet hors intervalle) :
  - `bpm` : **1..1000** (rien de réel ne dépasse ~300 ; 1000 = marge large).
  - `pitchStandard` : **380..500 Hz** (couvre baroque ~415, Verdi 432, moderne 440–444, orchestres hauts ~466 ; défaut 440). *Révisable — élargir si un cas légitime tombe hors bornes.*
  - `durationSeconds` : **1..86400** (inchangé).
- **`language`** : appliquer `normalizeLanguage` (title-case + array) aussi au **Catalog**.

## Acceptance Criteria

1. **Module util partagé** — `backend/utils/normalize.js` (NEW) exporte :
   - `normalizeInt(value, { min, max })` — généralise `normalizeDurationSeconds` : `undefined→undefined`, `null/''→null`, `parsed=Number(value)` ; si `!Number.isInteger(parsed) || parsed < min || parsed > max` → `null`, sinon `parsed`.
   - `normalizeDurationSeconds(value)` = `normalizeInt(value, { min: 1, max: 86400 })` (compat — mêmes retours qu'aujourd'hui).
   - `normalizeLanguage(value)` — déplacé **verbatim** depuis `songcontroller.js` (title-case, array ET string, filtre les vides, `null` si vide).
   - Tests `backend/__tests__/normalize.test.js` (NEW) : `normalizeInt` (undefined pass-through, null/'', décimal→null, string non-num→null, négatif→null, > max→null, borne incluse, valide→entier), `normalizeLanguage` (array title-case, string title-case, vide→null, undefined pass-through), `normalizeDurationSeconds` (parité avec l'ancien : 1..86400).
2. **Song câblé** — `songcontroller.js` importe depuis le util et **supprime** ses copies locales de `normalizeDurationSeconds` (L15) et `normalizeLanguage` (L35). `bpm` → `normalizeInt(bpm, { min: 1, max: 1000 })`, `pitchStandard` → `normalizeInt(pitchStandard, { min: 380, max: 500 })`, sur create ET update, en respectant le motif existant (`const nb = normalizeInt(...); nb !== undefined ? nb : (null | song.bpm)` — comme `normalizedLanguage`). `durationSeconds`/`language` continuent d'être normalisés (via le util maintenant). Comportement inchangé pour les valeurs valides.
3. **Catalog câblé** — `catalogcontroller.js` importe depuis le util et **supprime** sa copie locale de `normalizeDurationSeconds` (L30). Dans `pickIntrinsic` : après le remplissage, normaliser `bpm` (`normalizeInt {1,1000}`), `pitchStandard` (`normalizeInt {380,500}`), `durationSeconds` (via util, inchangé), et **`language` (`normalizeLanguage`) — nouveau** (parité title-case avec Song). Motif `if (out.<field> !== undefined) out.<field> = normalize…(out.<field>)`.
4. **Tests backend des deux côtés** — `songcontroller.test.js` + `catalogcontroller.test.js` : bpm décimal/non-num/overflow → `null` (pas de 500), bpm valide → conservé ; pitchStandard idem + hors-bornes → `null` ; `language` title-casé au Catalog. Ne PAS casser les tests existants (les valeurs valides restent identiques).
5. **Aucune régression / aucune migration** — back vert, pas de nouveau fichier `backend/migrations/` (colonnes INTEGER/JSONB inchangées). Aucun changement front nécessaire (le front envoie déjà des nombres ou `null` ; il relit la valeur enregistrée, pas un echo). tsc/eslint front intacts (rien touché côté front).

## Tasks / Subtasks

- [x] **Task 1 — Module `backend/utils/normalize.js`** (AC: 1)
  - [x] `normalizeInt`/`normalizeDurationSeconds`(=wrapper)/`normalizeLanguage` (déplacé verbatim). **→ 14 tests `normalize.test.js`.**
- [x] **Task 2 — Câbler Song** (AC: 2, 4)
  - [x] Importé du util ; 2 copies locales supprimées (capo gardé, hors périmètre) ; `normalizeInt` sur bpm ({1,1000}) + pitchStandard ({380,500}), create + update. **Piège évité** : côté create, `pitchStandard: normalizedPitch` (bare) au lieu de `… : null` pour préserver le défaut colonne 440 sur champ absent. **→ song 49/49 (+1).**
- [x] **Task 3 — Câbler Catalog** (AC: 3, 4)
  - [x] Importé du util ; copie locale `normalizeDurationSeconds` supprimée ; `pickIntrinsic` normalise bpm/pitchStandard/language (nouveau title-case). `pickIntrinsic` gère l'absence par omission (défaut colonne préservé). **→ catalog 44/44 (+1).**
- [x] **Task 4 — Validation** (AC: 5)
  - [x] Backend **328/328** (312 + 16). Aucun fichier front touché (front 447 intact). eslint backend clean. Aucune migration, aucune colonne modifiée.

## Dev Notes

### Anchors code (lus)
- **`songcontroller.js`** : `normalizeDurationSeconds` L15 (à déplacer), `normalizeLanguage` L30-55 (à déplacer verbatim — title-case + array + string + filtre vides), create L160-195 (bpm brut L182, pitchStandard brut L195, `normalizedLanguage` L177/L193), update L239-266 (bpm `: song.bpm` L256, pitchStandard `: song.pitchStandard` L266). **Motif à suivre pour bpm/pitch** = celui de `normalizedLanguage` : `const nb = normalizeInt(bpm,{…}); … nb !== undefined ? nb : (null|song.bpm)`.
- **`catalogcontroller.js`** : `normalizeDurationSeconds` L30 (dupliqué — supprimer), `INTRINSIC_FIELDS` L40-43 (bpm/pitchStandard/language dedans), `pickIntrinsic` L77-84 (aujourd'hui ne normalise QUE durationSeconds L82). Y ajouter bpm/pitchStandard/language.
- **Modèles** : `song.js`/`catalogsong.js` — `bpm` INTEGER, `pitchStandard` INTEGER (défaut 440), `language` JSONB. **Ne PAS toucher** (pas de migration).

### Pièges (leçons)
- **Reject-to-null, pas clamp** : cohérent avec `normalizeDurationSeconds`. Un clamp enregistrerait une valeur fausse-mais-plausible.
- **`undefined` = champ absent** : `normalizeInt(undefined)` doit renvoyer `undefined` (pour que l'update « laisse la valeur actuelle » via `nb !== undefined ? … : song.bpm`). Ne PAS transformer `undefined` en `null` (casserait les PUT partiels).
- **`language` JSONB** : pas un risque de 500, juste une harmonisation (title-case). Vérifier que les tests Catalog existants sur `language` (s'il y en a) acceptent la forme title-casée.
- **Zéro front** : durcissement serveur ; ne rien changer côté React. Le front envoie `bpm: number | null` (via `parseNumber`), donc les valeurs légitimes passent inchangées ; ce sont les cas limites (décimal collé, très grand nombre) que le serveur neutralise désormais.
- **Ne pas élargir** : uniquement bpm/pitchStandard/language + factorisation de duration. Pas d'autre champ, pas de migration.

### Project Structure Notes
- **NEW** : `backend/utils/normalize.js`, `backend/__tests__/normalize.test.js`.
- **UPDATE** : `backend/controllers/songcontroller.js`, `backend/controllers/catalogcontroller.js`, `backend/__tests__/songcontroller.test.js`, `backend/__tests__/catalogcontroller.test.js`.
- **Aucun** changement front, **aucune** migration.

### References
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — dette normalisation saisie, promue 2026-07-16]
- [Source: `backend/controllers/songcontroller.js` L15/L30-55 + create/update — `normalizeDurationSeconds`/`normalizeLanguage` + bpm/pitchStandard bruts]
- [Source: `backend/controllers/catalogcontroller.js` L30 + `pickIntrinsic` L77-84 — duration dupliqué, bpm/pitchStandard/language non normalisés]
- [Source: `backend/models/song.js` + `backend/models/catalogsong.js` — colonnes INTEGER/JSONB (inchangées)]

### Review Findings

Code review 2026-07-16 (3 couches). Le piège central (défaut 440) est **correctement géré sur les 4 chemins** (vérifié par l'Edge Hunter : `pitchStandard allowNull:true` + defaultValue 440). Bornes bien choisies. 0 violation d'AC, 328 verts, pas de migration/front. 2 faux positifs du Blind réfutés.

- [x] [Review][Patch] `normalizeInt` durci contre les non-scalaires — `Number([5])===5`, `Number(true)===1`, `Number('0x10')===16` : un tableau/booléen/hexa pourrait faire passer un entier que le client n'a pas tapé. Sans risque (toujours un entier en-borne ou null, jamais un 500) et hérité de l'ancien `normalizeDurationSeconds`, mais l'util étant neuf et partagé, ajouter un garde `typeof value !== 'number' && typeof value !== 'string' → null` (+ test). [backend/utils/normalize.js]

**Écartés (dismiss)** : F1 invalide→null → 500 si colonne NOT NULL → faux positif (`pitchStandard allowNull:true` vérifié modèles ; null accepté) ; F2 update efface l'existant sur saisie invalide → comportement **déjà** celui de `normalizeDurationSeconds` (parité voulue), inatteignable par le front (`parseNumber`), et l'ancien comportement était un 500 (pire) → reject-to-null assumé.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `npx jest normalize` → 14/14. `npx jest songcontroller` → 49/49. `npx jest catalogcontroller` → 44/44. `npm test` (backend complet) → **328/328** (22 suites, 312 + 16). eslint backend clean. `git status` : uniquement `backend/` modifié (front intact → 447).

### Completion Notes List

- **Util partagé `backend/utils/normalize.js`** : `normalizeInt(value,{min,max})` (reject-to-null : `undefined`→`undefined`, `null/''`→`null`, décimal/non-num/hors-bornes→`null`, sinon l'entier) ; `normalizeDurationSeconds` = wrapper `{1,86400}` (parité exacte avec l'ancien) ; `normalizeLanguage` déplacé **verbatim** depuis songcontroller. Les deux controllers importent d'ici → fin du duplicata `normalizeDurationSeconds`.
- **bpm/pitchStandard durcis des 2 côtés** : bornes `bpm 1..1000`, `pitchStandard 380..500`. Un décimal (`3.5`), une string (`"x"`), un négatif ou un dépassement INT4 (`9999999999`) → `null` au lieu d'un **500** sur la colonne INTEGER.
- **⚠️ Piège du défaut 440 évité** : côté Song `create`, l'ancien `pitchStandard,` (shorthand) laissait Sequelize appliquer le défaut colonne 440 quand le champ était absent. Un `… !== undefined ? … : null` l'aurait cassé (absent→null explicite). Corrigé en `pitchStandard: normalizedPitch` (bare) : absent→`undefined`→défaut 440 ; présent-invalide→`null` ; présent-valide→valeur. Côté `update` et côté Catalog (`pickIntrinsic` par omission), l'absence était déjà gérée correctement.
- **`language` harmonisé** : title-case (`« english »`→`« English »`) désormais aussi au Catalog (avant : brut). Pas un risque de 500 (JSONB), juste la parité avec la fiche chanson.
- **Périmètre tenu** : bpm/pitchStandard/language + factorisation duration uniquement. `normalizeCapo` laissé local (hors périmètre). Aucune migration, aucune colonne modifiée, **aucun changement front** (durcissement serveur ; le front envoie déjà nombre|null).

### File List

- **NEW** `backend/utils/normalize.js` — `normalizeInt`/`normalizeDurationSeconds`/`normalizeLanguage` partagés.
- **NEW** `backend/__tests__/normalize.test.js` — 14 tests unitaires.
- **UPDATE** `backend/controllers/songcontroller.js` — import du util ; 2 copies locales retirées ; bpm/pitchStandard normalisés (create + update).
- **UPDATE** `backend/controllers/catalogcontroller.js` — import du util ; copie locale retirée ; bpm/pitchStandard/language normalisés dans `pickIntrinsic`.
- **UPDATE** `backend/__tests__/songcontroller.test.js` — + test bpm/pitch invalides→null.
- **UPDATE** `backend/__tests__/catalogcontroller.test.js` — + test bpm/pitch→null + language title-casé.
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml` — 19-8 in-progress → review.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-16 | 0.1 | Story créée (create-story) — util partagé `normalize.js` (normalizeInt/normalizeDurationSeconds/normalizeLanguage) appliqué à bpm/pitchStandard/language côté Song ET Catalog ; reject-to-null (bornes bpm 1..1000, pitch 380..500) ; factorise le duplicata duration ; harmonise language ; backend-only, pas de migration | northwood |
| 2026-07-16 | 1.0 | dev-story — util `normalize.js` (+14 tests) + Song & Catalog câblés + language title-casé au Catalog. Backend 328, front intact, eslint clean, pas de migration. Piège du défaut pitchStandard 440 évité. | northwood |
