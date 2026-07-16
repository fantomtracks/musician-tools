---
baseline_commit: 5d3cd89de645d5cd14fae1cfb6dfc7168513e9da
---

# Story 19.12: Endpoint de check EXACT `(title, artist)` pour le dup-check Catalog

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curator editing a Catalog entry**,
I want **the "already exists" duplicate check to hit a server endpoint that tests the EXACT folded `(title, artist)` key**,
so that **a duplicate is caught reliably — the current client-side best-effort check (a substring search capped at 10 results) silently misses a collision that isn't in the first 10 rows**.

## Contexte / origine

**Volet C** (dernier) du triptyque re-scopé le 2026-07-16 (19-10 sticky ✅ / 19-11 combobox ✅ / **19-12 check-exact**). Ferme le **cluster refacto DRY** de la branche epic `feat/epic-19-composants-partages`. Le dup-check best-effort a été introduit en 19.6 comme raccourci ; cette story le remplace par un check serveur exact.

## Nature du changement (à lire — ce n'est PAS un refacto iso)

C'est un **changement de comportement** volontaire, backend + front :
- **Avant (19.6)** : le front debounce puis appelle `listCatalog({ search: title, includeDrafts: true, limit: 10 })` et matche la clé foldée `(title, artist)` **côté client** parmi les 10 premiers résultats. Fragile : la recherche est un *substring* et la limite est 10 → un doublon au-delà des 10 premiers (ou dont le titre matche largement) **passe entre les mailles** (le seul vrai garde-fou reste l'index unique GLOBAL → 409 au save).
- **Après (19.12)** : le front appelle un endpoint `GET` de check **exact** qui réutilise `findExistingByTitleArtist` (la MÊME logique foldée que le 409). Fiable, O(1) via l'index.

Le backstop serveur (index unique GLOBAL → 409 → `dupRef`/message) reste en place — ce check exact améliore juste la détection *avant* le save.

## Acceptance Criteria

1. **Endpoint backend** — `GET /api/catalog/exists?title=&artist=&excludeUid=` (curateur only) dans `backend/routes/catalog.js` + un handler `getCatalogExists` dans `backend/controllers/catalogcontroller.js`.
   - Route montée **AVANT `/:uid`** (sinon `exists` est capturé comme un uid — cf. le placement de `/facets`), middlewares `authsess, requireCurator` (le check révèle l'existence de **brouillons** → curateur only, cohérent avec §3 + le dup global 19.6).
   - Handler : `title = normalizeText(req.query.title)` ; si pas de titre → `res.json({ exists: false })` (rien à vérifier). Sinon `artist = normalizeText(req.query.artist)`, `excludeUid = isUuid(req.query.excludeUid) ? req.query.excludeUid : undefined`, puis `entry = await findExistingByTitleArtist(title, artist, excludeUid)` (RÉUTILISÉ tel quel — il voit brouillons ET publiés, sans scoping `publishedAt`), et `res.json({ exists: Boolean(entry), entry: entry || null })`. `catch` → `next(createError(500, …))`.
2. **Tests backend** — dans `backend/__tests__/catalogcontroller.test.js` : `exists:true` sur un doublon foldé (casse/espaces différents, artiste NULL vs '' ), `exists:true` même quand l'entrée est un **brouillon** (`publishedAt` NULL), `exists:false` si pas de match, `exists:false` si pas de titre, `excludeUid` skippe la ligne éditée (rename), **403 pour un non-curateur** (requireCurator).
3. **Service front** — `src/services/catalogService.ts` : `checkCatalogExists(title, artist?, excludeUid?, signal?) : Promise<{ exists: boolean; entry?: CatalogSong | null }>` (GET `/api/catalog/exists?…`, `credentials: 'include'`, `signal`). + tests `src/__tests__/catalogService.test.ts` (query construite, parse la réponse).
4. **CatalogAdmin branché** — l'effet dup-check debounced de `src/pages/CatalogAdmin.tsx` (~L227-258 : `listCatalog` + fold client) est remplacé par un appel à `checkCatalogExists(title, artist, workingUid ?? undefined, signal)`. **Préserver** : le débounce 500 ms, l'`AbortController`, le **fail-open** (`dupRef.current = false` en tête + on laisse l'état tel quel sur erreur/abort), `dupRef`/`setDupMessage` (mêmes libellés amber), l'exclusion de `workingUid` (→ `excludeUid`), les deps `[form.title, form.artist, workingUid]`. Le helper `foldedKey` de CatalogAdmin devient inutile → le retirer (vérifier qu'il n'est plus utilisé ailleurs). Le reste de l'autosave / `handlePublish` / Publish-masqué-sur-dup **inchangé**.
5. **Aucune régression ailleurs** — back vert (les tests dup-check front qui mockaient `listCatalog` sont adaptés pour mocker `checkCatalogExists` : c'est le comportement qui change, PAS de la triche), front vert, tsc + eslint. Aucun changement d'index / de migration (l'index unique GLOBAL existe déjà depuis 19.1/19.6). Aucun changement du flux Song (Songlist).

## Tasks / Subtasks

- [x] **Task 1 — Endpoint backend** (AC: 1, 2)
  - [x] `getCatalogExists` ajouté à `catalogcontroller.js` (réutilise `findExistingByTitleArtist`/`normalizeText`/`isUuid`/`createError`/`logger` déjà importés) + exporté.
  - [x] Route `router.get('/exists', authsess, requireCurator, …)` **avant** `/:uid` dans `routes/catalog.js`.
  - [x] 7 tests controller (exists true, brouillon `publishedAt` null, exists false, pas de titre = pas de lookup, excludeUid valide = clause `uid != …`, excludeUid non-uuid ignoré, 500 sur throw). Le 403 non-curateur est couvert par `requirecurator.test.js` (middleware partagé identique aux routes write). **→ backend 312 verts.**
- [x] **Task 2 — Service front** (AC: 3)
  - [x] `checkCatalogExists(title, artist?, excludeUid?, signal?)` dans `catalogService.ts` + 3 tests `catalogService.test.ts` (query construite title/artist/excludeUid, omissions, throw sur !ok).
- [x] **Task 3 — Brancher CatalogAdmin** (AC: 4)
  - [x] Effet dup-check migré `listCatalog`+fold → `checkCatalogExists(title, artist, workingUid ?? undefined, signal)` ; débounce 500 ms / AbortController / fail-open / `dupRef` / message amber / excludeUid préservés. `foldedKey` retiré (orphelin) + `eslint-disable` devenu inutile retiré. Test dup-check adapté (mock `checkCatalogExists`), assertion « already exists » inchangée. Autosave/Publish inchangés.
- [x] **Task 4 — Validation globale** (AC: 5)
  - [x] Back **312** (305 + 7) + front **447** + tsc + eslint clean. Aucune migration, aucun changement du flux Song.

## Dev Notes

### Backend — ce qui existe déjà (à RÉUTILISER, ne rien réécrire)
- **`findExistingByTitleArtist(title, artist, excludeUid)`** (`catalogcontroller.js` L49-58) : `where lower(title)=? AND COALESCE(lower(artist),'')=?` (+ `uid != excludeUid` si fourni). **PAS de filtre `publishedAt`** → voit brouillons ET publiés. C'est EXACTEMENT le scope voulu (le dup-check curateur doit voir les brouillons, comme le 409 de l'index global). `findOne` → l'entrée ou `null`. title/artist supposés déjà normalisés par l'appelant.
- **`respondDuplicateCatalogEntry`** (L65) : mappe 23505 → 409 en réutilisant `findExistingByTitleArtist`. Le backstop reste — le nouvel endpoint ne le remplace pas, il le double côté proactif.
- **`normalizeText`** : trim (et undefined si vide) — l'utiliser sur `req.query.title`/`artist` pour matcher la normalisation de create/update. **`isUuid`** : valider `excludeUid` (sinon undefined). Tous déjà importés dans le controller.
- **Routing** : `/facets` est monté AVANT `/:uid` justement pour ne pas être pris comme uid. **`/exists` DOIT l'être aussi.** Les WRITE routes sont `authsess, requireCurator` ; `/exists` est une lecture curateur → `authsess, requireCurator`.

### Front — l'effet à remplacer (source de vérité)
`CatalogAdmin.tsx` ~L227-258 (effet `[form.title, form.artist, workingUid]`) :
- en tête `dupRef.current = false` (fail-open — 19.6 review F1) ; si pas de titre → `setDupMessage(null)` + return ;
- débounce 500 ms → `listCatalog({ search: title, includeDrafts: true, limit: 10 }, signal)` → `res.items.find(e => e.uid !== workingUid && foldedKey(e) === foldedKey(form))` → si match `dupRef=true` + message amber (`A "${title}" by ${artist}…` / `A "${title}"…`) sinon reset ;
- `catch` → on laisse l'état tel quel (fail-open, l'index 409 est le backstop) ;
- cleanup `clearTimeout + ctrl.abort()`.
→ Remplacer le corps du `setTimeout` par `checkCatalogExists(title, artist, workingUid ?? undefined, ctrl.signal).then(res => { if (res.exists) { dupRef.current = true; setDupMessage(...) } else { dupRef.current = false; setDupMessage(null) } }).catch(() => {})`. Le reste identique. `foldedKey` (helper local L73) n'est plus utilisé → le retirer.

### Pièges (leçons)
- **`/exists` avant `/:uid`** — sinon 404/mauvais handler.
- **Curateur only** — le check révèle des brouillons (existence) → `requireCurator` obligatoire (le param `excludeUid`/titre d'un non-curateur ne doit jamais fuiter l'existence d'un brouillon). Test 403 requis.
- **Fail-open préservé** — sur erreur/abort réseau, ne pas bloquer la saisie ; l'index unique GLOBAL 409 reste le vrai garde-fou au save.
- **artiste NULL vs ''** — `findExistingByTitleArtist` folde déjà `COALESCE(lower(artist),'')` ; passer `artist` trimé (ou vide) suffit.
- **Ce N'EST PAS iso** — les tests dup-check front changent de mock (`listCatalog` → `checkCatalogExists`). C'est légitime (le mécanisme change). Ne PAS toucher aux autres tests Catalog (autosave/publish/CRUD).
- **Aucune migration** — l'index existe. Pas de nouveau fichier `backend/migrations/`.

### Project Structure Notes
- **UPDATE** : `backend/controllers/catalogcontroller.js` (+ `getCatalogExists` + export), `backend/routes/catalog.js` (+ route), `backend/__tests__/catalogcontroller.test.js` (+ tests), `src/services/catalogService.ts` (+ `checkCatalogExists`), `src/__tests__/catalogService.test.ts` (+ tests), `src/pages/CatalogAdmin.tsx` (effet dup-check + retrait `foldedKey`), `src/__tests__/CatalogAdmin.test.tsx` (mock adapté).
- **Aucun** NEW fichier. Aucune migration.

### References
- [Source: `backend/controllers/catalogcontroller.js` L49-74 — `findExistingByTitleArtist` + `respondDuplicateCatalogEntry` (à réutiliser)]
- [Source: `backend/routes/catalog.js` — placement `/facets` avant `/:uid` (modèle pour `/exists`) + pattern `authsess, requireCurator`]
- [Source: `src/pages/CatalogAdmin.tsx` L227-258 — le dup-check best-effort à remplacer ; `foldedKey` L73]
- [Source: `_bmad-output/implementation-artifacts/19-6-catalog-draft-publish-autosave.md` — la dette « dup-check exact » (F3/notes) + le dup global drafts-inclus]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — F « dup-check exact » [UX], promu 2026-07-16]

### Review Findings

Code review 2026-07-16 (3 couches). Sécurité validée (gate curateur, route avant `/:uid`, robustesse entrées), 0 violation d'AC (back 43 + front 22 + tsc verts indépendamment). 2 faux positifs du Blind Hunter réfutés par lecture du code.

- [x] [Review][Patch] Contrat de réponse uniforme — la branche « pas de titre » renvoie `{exists:false}` sans `entry` alors que les autres renvoient `{exists, entry}`. Inoffensif (le front ne lit que `exists`, type `entry?`), mais uniformiser en `{exists:false, entry:null}`. [backend/controllers/catalogcontroller.js — getCatalogExists]
- [x] [Review][Defer] Banner dup stale sur erreur réseau réelle — `.catch(() => {})` laisse `dupMessage` affiché alors que `dupRef` repasse `false` (fail-open) → l'UI dit « bloqué », le comportement autorise. **Pré-existant** (catch identique avant 19.12), bénin (index 409 = backstop). Reporté à deferred-work — distinguer `AbortError` du vrai échec + clear `dupMessage`. [src/pages/CatalogAdmin.tsx]

**Écartés (dismiss)** : F1 `foldedKey` orphelin → faux positif (grep + tsc = 0 réf ; la suppression 409 vit dans `conflictKeyRef` de Songs, pas Catalog) ; F2 array query → 500 → faux positif (`normalizeText` renvoie les non-strings tels quels, `findExistingByTitleArtist` coerce via `String()`, aucun throw).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `npx jest catalogcontroller` (backend) → 43/43 (36 + 7 nouveaux). `npm test` (backend complet) → **312/312** (21 suites).
- `npx jest` (front complet) → **447/447** (49 suites). `tsc --noEmit` clean. `eslint` (fichiers touchés) clean.

### Completion Notes List

- **Backend, zéro logique dupliquée** : `getCatalogExists` réutilise **tel quel** `findExistingByTitleArtist` (le lookup foldé `lower(title)+COALESCE(lower(artist),'')` **sans scoping `publishedAt`** → voit brouillons ET publiés, exactement le scope du dup-check curateur, cohérent avec le 409 de l'index global). Renvoie `{exists, entry}`. Garde `if (!title) → {exists:false}` (pas de lookup inutile), `isUuid` sur `excludeUid`, `catch → 500`.
- **Route curateur-only** : `GET /exists` monté **avant `/:uid`** (sinon capturé comme uid, comme `/facets`) avec `authsess, requireCurator` (le check révèle l'existence d'un brouillon → privilège requis). Le 403 est porté par le middleware partagé `requireCurator` (déjà testé par `requirecurator.test.js`, identique aux routes write) — pas de re-test au niveau handler (les tests controller appellent le handler directement, sans middleware).
- **Changement de comportement assumé** : le dup-check front passe du best-effort 19.6 (`listCatalog` search substring + `limit:10` + fold client — un doublon au-delà des 10 premiers passait entre les mailles) à un check serveur **exact** O(1) via l'index. Fiabilité accrue *avant* le save ; l'index unique GLOBAL 409 reste le backstop au save.
- **Front iso sur tout le reste** : l'effet dup-check garde débounce 500 ms / AbortController / fail-open (`dupRef=false` en tête + laisser tel quel sur catch) / `dupRef`+message amber / `excludeUid=workingUid` / deps `[form.title, form.artist, workingUid]`. `foldedKey` (helper client) retiré (orphelin). Autosave / `handlePublish` / Publish-masqué inchangés. Flux Song (Songlist) intact.
- **Adaptation de test légitime** (pas de la triche) : le test dup-check `CatalogAdmin.test.tsx` mocke désormais `checkCatalogExists` au lieu de `listCatalog` (le mécanisme a changé) ; l'assertion « already exists in the Catalog » + Publish masqué + no-save sont **inchangées**. Aucun autre test Catalog touché.
- **Aucune migration** (l'index unique GLOBAL existe depuis 19.1/19.6).
- **Cluster refacto DRY COMPLET** : 19-7 / 19-9 / 19-10 / 19-11 / 19-12 done. Reste hors cluster : 19-8 (normalisation saisie).

### File List

- **UPDATE** `backend/controllers/catalogcontroller.js` — + `getCatalogExists` (réutilise `findExistingByTitleArtist`) + export.
- **UPDATE** `backend/routes/catalog.js` — + `GET /exists` (authsess, requireCurator) avant `/:uid`.
- **UPDATE** `backend/__tests__/catalogcontroller.test.js` — + 7 tests `getCatalogExists`.
- **UPDATE** `src/services/catalogService.ts` — + `checkCatalogExists`.
- **UPDATE** `src/__tests__/catalogService.test.ts` — + 3 tests.
- **UPDATE** `src/pages/CatalogAdmin.tsx` — dup-check migré sur `checkCatalogExists` ; `foldedKey` retiré.
- **UPDATE** `src/__tests__/CatalogAdmin.test.tsx` — mock dup-check adapté à `checkCatalogExists`.
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml` — 19-12 in-progress → review.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-16 | 0.1 | Story créée (create-story) — endpoint GET /catalog/exists (curateur, réutilise findExistingByTitleArtist) + front checkCatalogExists remplace le dup-check best-effort 19.6 ; volet C (dernier) du triptyque ; changement de comportement (best-effort→exact), pas d'iso, pas de migration | northwood |
| 2026-07-16 | 1.0 | dev-story — endpoint backend (+7 tests) + service front (+3) + CatalogAdmin migré (dup-check exact, foldedKey retiré). Back 312, front 447, tsc+eslint clean. Cluster DRY complet. | northwood |
