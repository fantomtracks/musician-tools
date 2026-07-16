---
baseline_commit: d89f022
---

<!-- Story créée 2026-07-15 via bmad-create-story ; Epic 19 (Catalog) ; source epics.md § Epic 19 story 19.3 + architecture-catalog-2026-07-12.md + ux-musician-tools-2026-07-12 (DL-5/6/10/17/18) -->

# Story 19.3: Browse — parcourir, rechercher, filtrer, voir le détail

Status: done

## Story

En tant qu'**utilisateur connecté**,
je veux parcourir, rechercher et filtrer le Catalog puis ouvrir le détail d'une fiche,
afin de trouver une chanson déjà remplie à ajouter à ma Songlist (UJ-1).

## Contexte & pourquoi

Le **modèle `CatalogSong` + les écritures curateur existent** (19-1 done) et l'**écran de curation** (19-2 done) alimente le Catalog. Cette story livre la **surface de lecture** : la page **Browse** (`/catalog`) et la **fiche détail** (`/catalog/:uid`). C'est le **premier endpoint paginé à ENVELOPPE** de l'app et le **premier écran URL-as-state**.

⚠️ **Scope = LECTURE SEULE.** Le **bouton « Add to my songlist » + le flag « Already in your songlist »** appartiennent à **19-4** (mécanique Add). Ici : les rows/fiches sont **cliquables vers le détail**, pas d'Add. Les **rails Collections + Recently-added** sont **Epic 20** (20-4 enrichira Browse). Ne PAS les construire ici — juste la barre de recherche, les filtres, la liste paginée, le détail.

⚠️ **Rupture assumée (project-context.md)** : la lecture Catalog est **NON scopée `userUid`** — `catalogcontroller` fait `findAll({ where: <filtres> })` **sans** `userUid`. C'est **correct** (donnée partagée, principe §3), ancré par commentaire. NE PAS rescoper.

## Décisions verrouillées (architecture + UX)

- **Endpoint liste À ENVELOPPE** `{ items, total, page, limit }` — **rompt** délibérément la convention « entité brute » (sinon pas de `total`/pagination). Les endpoints **unitaires** (détail) gardent l'entité brute.
- **`ORDER BY artist, title, uid`** — le tiebreaker `uid` est **obligatoire** (sinon lignes dupliquées/sautées entre pages en `LIMIT/OFFSET`). Tri défaut artiste→titre (DL-15/18).
- **Pagination `LIMIT/OFFSET`** (pas cursor) : `limit` **défaut** (ex. 24) + **max** (ex. 100, plafonné serveur) ; `page` ≥ 1. `findAndCountAll` → `{ rows, count }`.
- **`sort` en WHITELIST** stricte (colonnes autorisées : `artist`, `title`, `bpm`, `createdAt`) — sinon injection ORDER BY.
- **Recherche accent-INsensible** : réutiliser le wrapper IMMUTABLE **`f_unaccent`** (créé par la migration topics `20260625`, déjà en prod) → `lower(f_unaccent(title/artist)) LIKE lower(f_unaccent('%q%'))`. ⚠️ Distinct de la **clé canonique** (casse seule, accents gardés) — ne pas confondre les deux normalisations.
- **Filtres** = `key · mode · timeSignature · genre` (intrinsèques, DL-17) ; combinés en **ET** ; `genre` (JSONB array) matché via `@>`/contains. **AUCUN** filtre instrument/difficulté/accordage.
- **404 calme** : détail `uid` inconnu/invalide → 404 (deep-link périmé). Le front affiche « This song is no longer in the Catalog. » + lien Browse.
- **URL-as-state (DL-10)** : `useSearchParams` = **source unique** de l'état liste (search + filtres + page). Le fetch se cale dessus ; **pas de `useState` miroir**. Back-button restaure la vue.
- **Debounce ~250-300ms + `AbortController`** sur la recherche (annuler les requêtes périmées → pas de résultats fantômes hors-ordre).
- **Ordre Browse (DL-5)** : Search en tête → (rails Collections/Recently = Epic 20) → **liste filtrable**. Titre liste `All songs` → **`Results (n)`** dès qu'une recherche/filtre est actif (DL-6).

## Acceptance Criteria

1. **Liste paginée à enveloppe** : `GET /api/catalog?search=&key=&mode=&timeSignature=&genre=&sort=&page=&limit=` (auth) → `{ items: CatalogSong[], total, page, limit }`. `ORDER BY artist, title, uid`. Non connecté → 401.
2. **Pagination bornée** : `limit` défaut + plafonné à un max serveur ; `page` ≥ 1 ; `offset = (page-1)*limit`. Un `limit`/`page` hors borne/non-numérique retombe sur le défaut (jamais 500, jamais `limit=∞`).
3. **`sort` whitelisté** : seul un `sort` dans la whitelist change l'ordre ; toute autre valeur → tri défaut (artiste→titre). Pas d'injection ORDER BY.
4. **Recherche accent-insensible** : `search=beyonce` matche « Beyoncé » (via `f_unaccent`, sur titre OU artiste, casse+accents pliés) ; combinable avec les filtres (ET). Résultat vide → `total: 0`, `items: []`.
5. **Filtres intrinsèques** : `key`, `mode`, `timeSignature` (égalité) et `genre` (contains JSONB) filtrent ; combinés en ET. Aucun filtre instrument.
6. **Lecture non-scopée** : la requête liste et le détail n'ont **pas** de `userUid` dans le `where` ; contrôleur `catalog*` + commentaire d'ancrage §3.
7. **Détail** : `GET /api/catalog/:uid` (auth) → entité brute ; `uid` inconnu/invalide → **404 calme**.
8. **Page Browse (`/catalog`)** : recherche (input) + filtres (key/mode/timeSignature/genre) + **liste paginée** ; état porté par l'**URL** (`useSearchParams`, source unique) ; **debounce + AbortController** ; titre `All songs` → `Results (n)` quand une recherche/filtre est active ; états **loading** (skeleton), **empty** (« The Catalog is filling up… » / « No songs match your search. »), **erreur** (Retry). Back-button restaure search+filtres.
9. **Row cliquable** : chaque ligne (colonnes **Artist · Title · Key · BPM**, artiste d'abord DL-18) est cliquable → `/catalog/:uid`. **Pas** de bouton Add (19-4).
10. **Fiche détail (`/catalog/:uid`)** : lecture seule, champs **intrinsèques uniquement** (title, artist, album, key, bpm, mode, timeSignature, durationSeconds, language, genre, pitchStandard) + **liens streaming cliquables** (ouverture externe) ; deep-link inconnu → not-found calme + lien Browse. **Pas** de bouton Add (19-4).
11. **Nav** : un **lien `Catalog`** ajouté à la nav principale, **juste après `Songlist`** (2ᵉ position, DL-Nav), desktop + mobile.
12. **Qualité** : back tests (envelope, whitelist, cap limit, unaccent, non-scopé, 404) + front tests (URL-state, debounce, empty/results, 404 calme) ; tsc + lints clean ; UI EN, dark mode, aucune primitive de style neuve.

## Tasks / Subtasks

### Task 1 — Backend : endpoint liste paginé + détail (AC 1-7)
- [x] `backend/controllers/catalogcontroller.js` : ajouter `getCatalogList` et `getCatalogEntry`. **Commentaire d'ancrage** en tête des lectures : « SHARED read — NON scopé userUid (principe §3, project-context.md). NE PAS rescoper. »
- [x] `getCatalogList` :
  - [x] Parser `page`/`limit` défensivement : `limit = clamp(int(query.limit) || DEFAULT=24, 1, MAX=100)` ; `page = max(1, int(query.page) || 1)` ; `offset = (page-1)*limit`.
  - [x] `sort` : whitelist `{ artist:['artist','title','uid'], title:['title','artist','uid'], bpm:['bpm','artist','title','uid'], recent:[['createdAt','DESC'],'artist','title','uid'] }` ; défaut `artist`. Toujours terminer par `uid` (tiebreaker).
  - [x] `where` (ET) : filtres `key`/`mode`/`timeSignature` (égalité si fournis) ; `genre` → `{ [Op.contains]: [value] }` (JSONB) ; `search` → `Op.and` de `whereFn(fn('lower', fn('f_unaccent', col('title'))), { [Op.like]: '%'+foldedQ+'%' })` OR sur `artist` (via `Op.or`). Réutiliser le folding `f_unaccent` (topics).
  - [x] `CatalogSong.findAndCountAll({ where, order, limit, offset })` → `res.json({ items: rows, total: count, page, limit })`.
- [x] `getCatalogEntry` : `isUuid(uid)` sinon 404 ; `CatalogSong.findByPk(uid)` → 404 calme si null ; sinon entité brute.
- [x] `backend/routes/catalog.js` : ajouter `router.get('/', authsess, getCatalogList)` et `router.get('/:uid', authsess, getCatalogEntry)` (lecture = authsess SEUL, pas requireCurator). Attention à l'ordre des routes (`/` et `/:uid` avant/après les écritures — pas de collision).
- [x] Tests backend (`jest.mock('../models')`, `findAndCountAll` mocké) : enveloppe `{items,total,page,limit}` ; `limit` plafonné + défaut sur valeur pourrie ; `sort` hors-whitelist → défaut ; `where` sans `userUid` ; 404 détail (uid inconnu + invalide).

### Task 2 — Frontend : catalogService lecture (AC 8-10)
- [x] `src/services/catalogService.ts` : ajouter `listCatalog(params, signal?)` → `GET /api/catalog?…`, retourne `{ items, total, page, limit }` (type `CatalogListResponse`) ; passe `signal` (AbortController) à `apiFetch`. `getCatalogEntry(uid)` → `GET /api/catalog/:uid` ; **404 → throw `CatalogNotFoundError`** (nouvelle petite classe, ou retourner null → le composant gère le not-found). Réutiliser le type `CatalogSong` existant.

### Task 3 — Frontend : page Browse `/catalog` (AC 8, 9, 11)
- [x] `src/pages/Catalog.tsx` (nouveau) : `useSearchParams` **source unique** (search, key, mode, timeSignature, genre, page). Un `useEffect` re-fetch quand les params changent, avec **debounce** (~250-300ms) sur la frappe et **`AbortController`** (annule la requête précédente). Pas de `useState` miroir des filtres.
- [x] `src/components/CatalogList.tsx` (nouveau) : table **Artist · Title · Key · BPM** (artiste d'abord), réutilise le style de la table Songlist (`overflow-auto max-h-[65vh]`, header `sticky top-0`, `min-w-0`) ; chaque ligne = lien `<Link to="/catalog/:uid">` (stretched-link : le **titre** porte le lien). Pagination (« Load more » ou pages) pilotant `page` dans l'URL.
- [x] Titre liste `All songs` → `Results (n)` quand search/filtre actif (DL-6) ; états skeleton/empty/erreur (Retry) ; `aria-live="polite"` annonçant le nombre de résultats.
- [x] `src/components/Header.tsx` : ajouter `{ to: '/catalog', label: 'Catalog' }` à `navLinks` **en 2ᵉ position** (après Songlist).
- [x] `src/router.tsx` : routes `{ path: 'catalog', element: <Catalog /> }` et `{ path: 'catalog/:uid', element: <CatalogEntry /> }` sous `<RequireAuth />`.

### Task 4 — Frontend : fiche détail `/catalog/:uid` (AC 10)
- [x] `src/pages/CatalogEntry.tsx` (nouveau) : `useParams` → `getCatalogEntry(uid)` ; loading skeleton ; **not-found calme** (« This song is no longer in the Catalog. » + `<Link to="/catalog">Browse the Catalog</Link>`) sur 404 ; sinon lecture seule — en-tête mené par l'artiste (DL-18), grille des champs **intrinsèques uniquement**, **liens streaming cliquables** (`target="_blank" rel="noopener"`). **Pas** de bouton Add (19-4), pas de save-bar.

### Task 5 — Tests front (AC 12)
- [x] `src/__tests__/Catalog.test.tsx` : rendu liste depuis un mock `listCatalog` ; taper une recherche → l'URL (searchParams) reflète, fetch débouncé rappelé ; `Results (n)` ; 0 résultat → message ; erreur fetch → Retry. (Rendu sous `MemoryRouter` ; mock `catalogService`.)
- [x] `src/__tests__/CatalogEntry.test.tsx` : fiche rendue (champs intrinsèques + liens) ; 404 → not-found calme + lien Browse.

## Dev Notes

### Backend — patterns exacts
- **Contrôleur actuel** `backend/controllers/catalogcontroller.js` : exports `createCatalogEntry`/`updateCatalogEntry`/`deleteCatalogEntry` (19-1) + helpers `normalizeText`, `respondDuplicateCatalogEntry`, `findExistingByTitleArtist`, `INTRINSIC_FIELDS`. Ajouter les 2 lectures + les exporter. `isUuid` déjà importé.
- **Folding `f_unaccent`** : voir `backend/controllers/topiccontroller.js` L.10-13 — `whereFn(fn('lower', fn('f_unaccent', col('name'))), fn('lower', fn('f_unaccent', name)))` pour une ÉGALITÉ. Pour une **recherche substring**, viser `whereFn(fn('lower', fn('f_unaccent', col('title'))), { [Op.like]: `%${folded}%` })` où `folded` est déjà `lower(f_unaccent(q))` **côté SQL** — le plus simple : passer la valeur brute et laisser Postgres folder les deux côtés via `fn`. Le wrapper `f_unaccent` (IMMUTABLE) est créé par migration `20260625000000-topics-name-ci-unaccent.js` (`CREATE EXTENSION IF NOT EXISTS unaccent` + `f_unaccent`) → **déjà présent en prod**, aucune migration à ajouter.
- **findAndCountAll** renvoie `{ rows, count }` ; `count` est le total **filtré** (pas la table entière) — c'est bien ce qu'il faut pour `total`.
- **JSONB genre** : colonne `genre` JSONB (array). Filtre « contient » → `{ genre: { [Op.contains]: [value] } }` (Sequelize → `@>`). Vérifier en local sur une fiche seedée.
- **Convention réponses** : la liste est la SEULE enveloppe (exception documentée) ; le détail = entité brute (convention normale) ; 404 via `createError(404, 'Catalog entry not found')`.

### Frontend — patterns exacts
- **`useSearchParams`** fonctionne sous le data-router (déjà utilisé `VerifyEmailPage.tsx` L.2/12, `ResetPasswordPage.tsx`). La page `/catalog` est sous `<RequireAuth>` (data-router) → OK. ⚠️ Ne PAS copier le pattern **localStorage** de la Songlist (`Songs.tsx` ~30 clés `songs*`) — le Catalog est **URL-as-state** (DL-10).
- **Table Songlist à réutiliser (style)** : `src/components/SongsList.tsx` + le delta responsive d'Epic 14 (`overflow-auto max-h-[65vh]`, header `sticky top-0 z-10`, `min-w-0` sur l'enfant flex). Réutiliser les classes, PAS la logique (la Songlist filtre client-side ; le Catalog filtre serveur).
- **Debounce + AbortController** : `apiFetch` accepte-t-il un `signal` ? vérifier `src/services/apiFetch.ts` — sinon passer `{ signal }` dans les options de `fetch`. Pattern : un `useRef<AbortController>` ; à chaque fetch, `abort()` le précédent, créer un nouveau ; ignorer l'erreur `AbortError`.
- **Recherche = filtre en place** (DL-6) : une seule surface de résultats (la liste) ; PAS de dropdown autocomplete. Champ vidé → titre redevient `All songs`.
- **Flag doublon + bouton Add = 19-4** (hors scope ici) : ne pas charger la Songlist perso pour marquer les rows dans 19-3. Les rows mènent au détail, point.
- **nav 7e lien** : `navLinks` `src/components/Header.tsx` L.8-15 — insérer Catalog en position 2 (après Songlist). Le mobile réutilise le même `navLinks`.

### Réutilisation (ne pas réinventer)
- `catalogService` (19-2) : y ajouter les lectures (pas un nouveau service). Type `CatalogSong` existant.
- `songDuplicate.ts` : PAS ici (c'est 19-4).
- `apiFetch` (CSRF/erreurs), `RequireAuth`, data-router (Epic 18), 404 scopé calme (Epic 18).

### Conventions (cf. project-context.md)
- Backend CommonJS ; réponses (hors liste) = entité brute ; erreurs `createError` → `next`. Lecture Catalog = `authsess` seul, NON scopé (exception §3).
- Front TS strict + `verbatimModuleSyntax` (`import type`), `noUnusedLocals` ; Tailwind only + dark mode ; services `fetch`/`apiFetch` + `credentials:'include'`. Tests `src/__tests__/` Testing Library ; back `jest.mock('../models')`. Hook pre-commit = front + back verts.
- UI EN. `main` = prod (mais 19-3 n'ajoute AUCUNE migration — que du code lecture).

### Interim 19.3 → 19.4
- 19-4 ajoutera : migration `Songs.sourceCatalogUid`, endpoint Add, **bouton Add 3 états + flag doublon client-side** (sur les rows/fiche de 19-3), crochet Songlist-vide. Concevoir `CatalogList`/`CatalogEntry` pour qu'une **cellule d'action** (Add) se greffe facilement en fin de row / dans la fiche.

### Project Structure Notes
- NEW : `src/pages/Catalog.tsx`, `src/pages/CatalogEntry.tsx`, `src/components/CatalogList.tsx`, `src/__tests__/Catalog.test.tsx`, `src/__tests__/CatalogEntry.test.tsx`.
- UPDATE : `backend/controllers/catalogcontroller.js` (+ getCatalogList/getCatalogEntry), `backend/routes/catalog.js` (+ GET routes), `src/services/catalogService.ts` (+ listCatalog/getCatalogEntry), `src/components/Header.tsx` (+ lien Catalog), `src/router.tsx` (+ routes), `backend/__tests__/catalogcontroller.test.js` (+ tests lecture).
- AUCUNE migration (lecture seule).

### References
- [Source: epics.md#Story 19.3] — user story + AC.
- [Source: architecture-catalog-2026-07-12.md#Starter Evaluation (Foundation/Occam/Second-order/Inversion)] — pagination serveur, enveloppe, LIMIT/OFFSET, sort whitelist, cap limit, tiebreaker uid, debounce/AbortController, URL-as-state, unaccent.
- [Source: architecture-catalog-2026-07-12.md#API & Communication + Frontend Architecture] — formes d'endpoint, catalogService séparé.
- [Source: ux-designs/…/EXPERIENCE.md] — DL-5 ordre Browse, DL-6 search-to-collapse, DL-10 URL-state, DL-17 filtres intrinsèques, DL-18 artiste d'abord, états (empty/404 calme/erreur).
- [Source: backend/controllers/topiccontroller.js#foldedNameMatch] — pattern `f_unaccent` à calquer.
- [Source: backend/controllers/catalogcontroller.js] — contrôleur à étendre.
- [Source: _bmad-output/implementation-artifacts/19-2-admin-saisir-fiche-front.md] — catalogService/CatalogSong (19-2 done).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (bmad-dev-story)

### Debug Log References

- Front **375/375** (40 suites, +6 Catalog/CatalogEntry) · Back **288/288** (21 suites, +6 list/detail) · tsc `-b` clean · front+back eslint clean.
- **Smoke SQL recherche** (Sequelize contre base dev) : `lower(f_unaccent(title/artist)) LIKE lower(f_unaccent('%q%'))` — `cafe`→«Café», `energie`→«Énergie» (titre ET artiste, accents pliés), `zombie`→«Zombie». SQL généré validé, rows nettoyées.

### Completion Notes List

- **Backend** : `getCatalogList` (enveloppe `{items,total,page,limit}`, `findAndCountAll`, `SORT_WHITELIST` avec tiebreaker `uid`, `clampInt` limit 1..100 défaut 24 / page ≥1, filtres key/mode/timeSignature égalité + genre `Op.contains` JSONB, recherche `foldedLike` via `f_unaccent` sur titre|artiste) + `getCatalogEntry` (404 calme uid invalide/inconnu). Lecture **NON scopée userUid** (commentaire d'ancrage §3). Routes GET `authsess` seul.
- **Frontend** : `catalogService.listCatalog(params, signal)` + `getCatalogEntry` (404 → `CatalogNotFoundError`). `Catalog.tsx` = **URL-as-state** (`useSearchParams` source unique) + **debounce 280ms** sur la frappe + **`AbortController`** (annule les requêtes périmées) ; titre `All songs`→`Results(n)` ; états loading (skeleton) / empty / erreur (Retry) ; pagination Prev/Next. `CatalogList.tsx` (table Artist·Title·Key·BPM, titre = lien détail). `CatalogEntry.tsx` (lecture seule, champs intrinsèques + liens externes, not-found calme). Nav lien **Catalog en 2e position**.
- **Scope respecté** : PAS de bouton Add / flag doublon (19-4), PAS de rails Collections (Epic 20). Aucune migration.
- **Note** : filtres key/mode/timeSignature/genre rendus en **inputs texte** (utilitaire v1) plutôt qu'en selects (pas de listes d'options exportées ; polish possible plus tard). `eslint-disable-next-line exhaustive-deps` sur l'effet debounce (dépend volontairement de `searchInput` seul).

### File List

**NEW**
- `src/pages/Catalog.tsx`
- `src/pages/CatalogEntry.tsx`
- `src/components/CatalogList.tsx`
- `src/__tests__/Catalog.test.tsx`
- `src/__tests__/CatalogEntry.test.tsx`

**UPDATE**
- `backend/controllers/catalogcontroller.js` (+ `getCatalogList`, `getCatalogEntry`, SORT_WHITELIST, clampInt, foldedLike)
- `backend/routes/catalog.js` (+ GET `/` et `/:uid`, authsess)
- `backend/__tests__/catalogcontroller.test.js` (+ 6 tests list/detail)
- `src/services/catalogService.ts` (+ `listCatalog`/`getCatalogEntry`, `CatalogListResponse`, `CatalogNotFoundError`)
- `src/router.tsx` (+ routes `/catalog`, `/catalog/:uid`)
- `src/components/Header.tsx` (+ lien nav `Catalog` en 2e position)

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-07-15 | 0.1 | Story créée (ready-for-dev) — Browse lecture seule (liste paginée enveloppe + recherche unaccent + filtres + détail 404 calme + URL-state) ; Add/flag doublon = 19-4, rails = Epic 20 |
| 2026-07-15 | 0.2 | Implémentée : backend list (enveloppe, sort whitelist, cap limit, unaccent, non-scopé) + détail 404 ; front Catalog (URL-state, debounce/abort), CatalogList, CatalogEntry, nav Catalog. Front 375✓ back 288✓ tsc✓ lints✓ ; smoke SQL recherche validé base dev. Status → review. |
| 2026-07-15 | 0.3 | Code review 3 couches (Acceptance 12/12 AC) → 6 patch (P1 Retry refetch réel ; P2 pagination hors-borne ; P3 escape wildcards LIKE ; P4 test search back ; P5 page Math.floor + search trim ; P6 row cliquable) + tests ; 1 defer (filtres casse/accents → facettes, deferred-work) ; 1 dismiss. Front 375✓ back 289✓ tsc✓ lints✓ ; escape LIKE validé base dev. Status → done. |

## Review Findings

_Code review 3 couches (Acceptance 12/12 AC, 2 écarts mineurs), 2026-07-15. 6 patch, 1 defer, 1 dismiss._

- [x] [Review][Patch] [HIGH] Bouton **Retry no-op** : `onClick={() => patchParams({})}` ne change pas l'URL → l'effet de fetch (deps `[search,…,page]`) ne se re-déclenche pas → l'utilisateur reste bloqué sur l'écran d'erreur. Ajouter un `refetchToken` (compteur) aux deps de l'effet ; Retry fait `setError(false)+setLoading(true)+bump(token)`. Durcir le test (asserter le refetch). `[src/pages/Catalog.tsx]` (blind+edge+auditor)
- [x] [Review][Patch] [MED] **Page hors-borne** (deep-link `?page=5` alors qu'1 résultat) : `items:[]` mais `total>0` → message trompeur (« No songs… » / « Catalog filling up ») ET Prev/Next non rendus (bloc `items.length>0`) → impossible de revenir. Rendre la pagination dès `totalPages>1` (hors du bloc items) ; empty-state seulement si `total===0`. `[src/pages/Catalog.tsx]` (edge+auditor)
- [x] [Review][Patch] [MED] **Wildcards LIKE non échappés** : `%`/`_`/`\` saisis restent des jokers SQL → faux matches (« 50% », « a_c »). Échapper (`replace(/[\\%_]/g, '\\$&')`, escape `\` par défaut Postgres) avant `%…%`. `[backend/controllers/catalogcontroller.js foldedLike/pattern]` (blind+edge)
- [x] [Review][Patch] [LOW] **Chemin search/genre backend non testé** (les tests n'exercent que `key`) → un typo `fn/col/whereFn` passerait en prod. Ajouter un test passant `search` (exerce `foldedLike`). Le smoke SQL couvre déjà le runtime, mais un test unit garde la régression. `[backend/__tests__/catalogcontroller.test.js]` (blind)
- [x] [Review][Patch] [LOW] **`page` décimal** (`?page=2.5`) : front garde 2.5 (affiche « Page 2.5 »), backend `parseInt`→2 → désync. `Math.floor`/`parseInt` côté front. + **recherche tout-espaces** → `hasQuery` vrai côté front (Results(total)) mais backend trim → tout le catalogue : trimmer côté front. `[src/pages/Catalog.tsx]` (edge)
- [x] [Review][Patch] [LOW] **Ligne non entièrement cliquable** + commentaire « stretched-link » trompeur (seule la cellule Titre porte le lien). Rendre la row cliquable (`useNavigate` onClick) en gardant le titre comme lien a11y ; corriger le commentaire (le vrai stretched-link + cellule Add arrivent en 19-4). `[src/components/CatalogList.tsx]` (auditor)
- [x] [Review][Defer] [MED] **Filtres key/mode/timeSignature/genre en égalité sensible casse/accents** (contrairement à la recherche foldée) : « rock » vs « Rock » → 0 résultat silencieux. Le vrai fix = **facettes/selects** peuplées des valeurs réelles (élimine le problème de casse) — plus gros que 19-3. → deferred-work (polish filtres). `[backend/controllers/catalogcontroller.js]` (edge)

**Dismiss :**
- ❌ Pas de borne de longueur sur `search` — perf-only, route authentifiée, catalogue petit ; faible valeur.
