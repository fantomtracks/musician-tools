---
baseline_commit: c817d0e3be1aeefedbd94bd5659f2b5cc7b4a259
---

# Story 14.2: Header non-connecté qui ne déborde plus sur mobile

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visiteur déconnecté sur mobile,
I want un header qui ne déborde pas à 390px,
so that le titre et le toggle dark ne soient plus poussés hors écran par les boutons Sign in / Create account.

## Acceptance Criteria

1. **Given** un utilisateur **non connecté** sur mobile (~390px) **When** il voit le header **Then** les CTA _Sign in_ / _Create account_ ne débordent plus : ils sont **retirés du header en non-connecté** et **relayés dans la HomePage** (avec un espacement qui ne les colle pas au footer) ; le header non-connecté = logo/titre + toggle dark seulement.
2. **Given** un utilisateur **connecté** **Then** le header (hamburger `md:hidden`… en réalité `lg:hidden`, cf. story 9.1 ; liens de nav ; dropdown compte ; toggle dark) est **inchangé** — aucune régression.
3. **Given** la HomePage en état **non connecté** **Then** elle présente les deux CTA : _Create account_ (action primaire, `btn-primary`, → `/register`) et _Sign in_ (`btn-secondary`, → `/login`), sous le pitch, centrés, avec un espacement propre ; en état **connecté**, la HomePage reste inchangée (« Hello, {name}! »), sans CTA.
4. **And** `Header.test.tsx` mis à jour : le test `unauthenticated: … sign-in actions remain` (ligne 79) est **inversé** — en non-connecté, ni _Sign in_ ni _Create account_ ne sont dans le header ; le toggle dark, lui, **reste** présent.
5. **And** UI en anglais ; dark mode respecté sur les CTA de la HomePage ; **aucune dépendance npm** ; les deux suites de tests restent vertes.

## Tasks / Subtasks

- [x] **Task 1 — Retirer les CTA du header non-connecté** (AC: #1, #2)
  - [x] `src/components/Header.tsx` : branche `else` (`!isAuthenticated`) rendant `Sign in` + `Create account` supprimée.
  - [x] Toggle dark conservé pour tous les états. Le ternaire `isAuthenticated ? <dropdown> : (<>CTA</>)` est devenu `{isAuthenticated && <dropdown>}` → non-connecté = logo/titre + toggle dark uniquement.
  - [x] À ~390px non connecté, la zone droite ne contient plus qu'un toggle `w-9 h-9` (36px) → débordement structurellement impossible (voir Completion Notes).
- [x] **Task 2 — Relayer les CTA dans la HomePage** (AC: #1, #3)
  - [x] `src/App.tsx`, `HomePage` branche non connectée : rangée de boutons ajoutée sous le pitch — _Create account_ (`btn-primary`, `/register`) + _Sign in_ (`btn-secondary`, `/login`). `Link` importé depuis `react-router-dom`.
  - [x] Rangée `flex flex-wrap items-center justify-center gap-3 pt-4` ; HomePage déjà centrée verticalement → pas de collage au footer ; `px-6` gère les marges mobile.
  - [x] Branche connectée (« Hello, {name}! ») inchangée : pas de CTA.
- [x] **Task 3 — Mettre à jour / ajouter les tests** (AC: #4, #5)
  - [x] `src/__tests__/Header.test.tsx` : test inversé — en non-connecté, `Sign in`/`Create account` `.not.toBeInTheDocument()` ; ajout d'une assertion que le toggle dark reste, via `getByTitle(/switch to (dark|light) mode/i)` (le nom accessible du bouton est son emoji, pas le `title` — d'où `getByTitle`).
  - [x] `HomePage` exporté depuis `src/App.tsx` ; `src/__tests__/HomePage.test.tsx` ajouté : non connecté → 2 CTA présents (`href` `/register` et `/login`) ; connecté → « Hello, Ada! » + aucun CTA.
- [x] **Task 4 — Vérifier** (AC: tous)
  - [x] `npm test` (front) : 35 suites / **313 tests** verts ; `cd backend && npm test` : 19 suites / 253 tests verts.
  - [x] `npm run build` OK (tsc strict — aucun import/variable mort après retrait du bloc).
  - [x] Débordement à ~390px : **vérifié par construction** (zone droite = 1 toggle 36px ; gauche = logo 32px + titre masqué <360px). Confirmation visuelle en navigateur recommandée en QA finale (pas d'outil de screenshot headless dispo, aucune dep ajoutée).

### Review Findings

_Code review 2026-07-04 — 3 couches parallèles (Blind Hunter ∥ Edge Case Hunter ∥ Acceptance Auditor). Auditor : 5/5 ACs ✓. Aucun défaut bloquant._

- [x] [Review][Defer] Couplage test↔module : `HomePage.test.tsx` importe `HomePage` via `../App`, ce qui tire tout le graphe de modules de `App.tsx` à l'import (toutes les pages/contexts/footer) juste pour un composant. Vert aujourd'hui (`tsc -b` exit 0, suite OK), mais fragile si une future page ajoute un effet de bord au chargement. [src/__tests__/HomePage.test.tsx] — deferred : durcissement optionnel = extraire `HomePage` dans son propre fichier (`src/pages/HomePage.tsx`). Non bloquant.
- Dismissed : (1) « import `Link` mort dans Header.tsx » (Blind, Med) → **faux positif** vérifié par Edge : `Link` reste utilisé (logo/nav/dropdown/menu mobile), `tsc -b` exit 0. (2) branche `isAuthenticated && user` inatteignable en prod (`isAuthenticated === !!user`) → pré-existant, défensif, non introduit ici.

## Dev Notes

### Fichiers à modifier (UPDATE)

**`src/components/Header.tsx`** — état actuel de la zone droite (lignes 130-192) :
- Un toggle dark (bouton, lignes 132-143) rendu **dans tous les cas**.
- Puis un ternaire `isAuthenticated ? (<account dropdown lg-only>) : (<>Sign in + Create account</>)` (lignes 144-191).
- **Ce que la story change** : supprimer la branche `else` (les 2 `<Link>` CTA). Résultat : `isAuthenticated ? (<account dropdown>) : null`.
- **À préserver absolument** : le toggle dark (tous états), le dropdown compte lg-only (connecté), le hamburger `lg:hidden` connecté (story 9.1), le logo/titre `<Link to="/">`, le `min-[360px]:block` du titre. Ne toucher qu'à la branche non-connectée des actions de droite.
- Après suppression, vérifier qu'aucun import ne devient mort (le `Link` reste utilisé par le logo et la nav → OK ; pas de suppression d'import attendue). `noUnusedLocals`/`noUnusedParameters` + `tsc -b` casseraient le build sinon.

**`src/App.tsx`** — `HomePage` (lignes 19-48) :
- Parent : `flex-1 … flex items-center justify-center px-6` → contenu centré verticalement, largeur `max-w-2xl`, `text-center`, `space-y-8`.
- Branche non connectée (lignes 32-44) : logo ♪ + `<h1>Musician Tools</h1>` + `<p>Practice management…</p>`. **Ajouter ici** la rangée de CTA.
- Branche connectée (lignes 25-31) : intacte.
- **Ce qui doit rester vrai** : la HomePage est le composant de la route `/` (App.tsx:67), publique. Un visiteur déconnecté arrive dessus et doit pouvoir aller vers `/login` et `/register` (ces routes existent, App.tsx:100-104). Retirer les CTA du header sans les remettre sur la HomePage **couperait** le seul chemin d'inscription/connexion pour un déconnecté → la relocalisation est obligatoire, pas cosmétique.

**`src/__tests__/Header.test.tsx`** — le test ligne 79 encode l'ancien comportement (`sign-in actions remain`). Il **échouera** après le changement s'il n'est pas inversé → c'est la garde de régression attendue par l'AC4.

### Conventions projet applicables (project-context.md)

- **Langue** : tout en anglais (labels, noms de test, commentaires). _Create account_ / _Sign in_ inchangés.
- **Dark mode** : les `btn-primary`/`btn-secondary` (définis `src/index.css:66-73`) gèrent déjà leurs styles ; vérifier le rendu dark. Pas de CSS custom (Tailwind only).
- **Réutilisation** : réutiliser les mêmes classes et cibles que l'ancien header (`btn-secondary`→`/login`, `btn-primary`→`/register`) — ne pas réinventer de boutons.
- **State** : aucun state à ajouter ; `HomePage` lit déjà `useAuth()` (`isAuthenticated`).
- **Pas de nouvelle dépendance** ; imports relatifs ; `import type` si un type est importé.

### Testing standards summary

- Frontend : Jest + Testing Library, tests dans `src/__tests__/`, `jsdom`. Pattern `jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }))` + `mockedUseAuth.mockReturnValue({ isAuthenticated, logout })`, rendu sous `<MemoryRouter>` (cf. `Header.test.tsx:1-20`).
- Tester le **comportement visible** (présence/absence de liens par rôle+nom), pas l'implémentation.
- Le hook husky pre-commit lance **les deux** suites (front puis back) — ne jamais `--no-verify`.
- Attention au nom accessible du toggle dark : il vient de l'attribut `title` (`Switch to dark/light mode`), pas d'un `aria-label` — le matcher doit viser ce texte.

### Previous story intelligence (14.1 — favicon)

- **Branche d'epic** : le travail de l'Epic 14 vit sur **`feat/epic-14-mobile-comfort`** (une branche par epic). Committer 14.2 dessus (Conventional Commits, ex. `feat(app): …` ou `fix(header): …`). Ne jamais travailler sur `main` (= déploiement prod).
- Suite front à **311 tests** après 14.1. 14.2 modifie 1 test existant (net 0) + éventuellement 1 fichier de test HomePage.
- 14.1 n'a touché que `index.html`/assets ; 14.2 est le premier vrai changement React de l'epic.

### Project Structure Notes

- `HomePage` est **défini inline dans `src/App.tsx`** et n'est **pas exporté** aujourd'hui. Pour le tester unitairement (Task 3, recommandé), l'exporter via `export function HomePage` (App.tsx:19) — changement propre, sans impact runtime. Sinon, s'en tenir à l'inversion du test Header (couverture minimale requise par l'AC).
- Breakpoints : le header/logo utilisent déjà `min-[360px]` et `lg:` ; **ne pas introduire de nouveau seuil** (cf. cadrage epic : seuils existants `lg`/`sm` uniquement).
- `btn-primary` / `btn-secondary` : classes utilitaires `@layer components` dans `src/index.css:66-73`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 14.2: Header non-connecté qui ne déborde plus sur mobile]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-musician-tools-2026-07-04/.decision-log.md] — header overflow classé « fix tactique, **hors UX lourd** » ; placement définitif des CTA repris par une future landing page (deferred-work § À brainstormer). V1 sobre assumée.
- [Source: src/components/Header.tsx:130-192] — zone d'actions droite ; branche non-connectée à retirer (182-191), toggle dark à conserver (132-143).
- [Source: src/App.tsx:19-48] — `HomePage`, branche non connectée (32-44) où relayer les CTA ; route `/` publique (67).
- [Source: src/App.tsx:100-104] — routes `/login` et `/register` (cibles des CTA).
- [Source: src/__tests__/Header.test.tsx:79-87] — test à inverser.
- [Source: src/index.css:66-73] — `btn-primary` / `btn-secondary`.
- [Source: _bmad-output/project-context.md] — anglais partout, dark mode `dark:`, Tailwind only, pas de dep, branche feature.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `npx jest Header HomePage` → 2 suites / 9 tests passed.
- `npm test` (front) → 35 suites / 313 tests passed (était 34/311 : +1 suite HomePage, +2 tests nets).
- `npm run build` → tsc strict + vite OK (aucun import/variable mort).
- `cd backend && npm test` → 19 suites / 253 tests passed.

### Completion Notes List

- **Header** : la zone d'actions droite passe d'un ternaire `isAuthenticated ? <account dropdown> : (<>Sign in + Create account</>)` à `{isAuthenticated && <account dropdown>}`. Résultat : un visiteur déconnecté ne voit plus que logo/titre (gauche) + toggle dark (droite). Le hamburger connecté (9.1), le dropdown compte lg-only, la nav desktop et le toggle dark sont intacts. `Link` reste utilisé (logo + nav) → aucun import mort.
- **HomePage** (`src/App.tsx`, exporté) : les CTA _Create account_ (`btn-primary` → `/register`) et _Sign in_ (`btn-secondary` → `/login`) sont relayés sous le pitch, dans une rangée `flex flex-wrap items-center justify-center gap-3 pt-4`. La page étant centrée verticalement (`flex items-center justify-center`), les CTA ne collent pas au footer. Branche connectée inchangée. Sans cette relocalisation, un déconnecté n'aurait plus aucun chemin vers login/register — c'était le point critique.
- **Overflow ~390px — résolu par construction** : le seul élément de la zone droite en non-connecté est désormais un toggle `w-9 h-9` (36px). Gauche = logo 32px + titre (`hidden min-[360px]:block`, ~140px ≥360px). Largeur totale ≪ 390px → plus aucun débordement possible. (Confirmation visuelle navigateur = QA finale ; pas de screenshot headless faute d'outil, aucune dep ajoutée.)
- **Tests** : le test Header `sign-in actions remain` est inversé (garde de régression de l'AC4) ; nom accessible du toggle dark = son emoji → assertion via `getByTitle`. Nouveau `HomePage.test.tsx` couvre les deux états (CTA présents/href corrects déconnecté ; « Hello, {name} » + zéro CTA connecté).
- Zéro dépendance npm ; anglais partout ; dark mode via `btn-*` + `dark:` existants ; aucun nouveau breakpoint.

### File List

- `src/components/Header.tsx` (modified)
- `src/App.tsx` (modified — `Link` importé, `HomePage` exporté, rangée CTA)
- `src/__tests__/Header.test.tsx` (modified — test inversé)
- `src/__tests__/HomePage.test.tsx` (new)

## Change Log

- 2026-07-04 — Story 14.2 implémentée : CTA _Sign in_ / _Create account_ retirés du header non-connecté (fin du débordement mobile ~390px) et relayés sur la HomePage ; header connecté inchangé ; toggle dark conservé pour tous. `HomePage` exporté + testé ; test Header inversé. Front 313 / back 253 verts, build strict OK. Aucune dépendance.
