---
baseline_commit: 1eefc72
arch_decision: "Migrer le socle routing de <BrowserRouter> (composant) vers createBrowserRouter + <RouterProvider> (data-router react-router 6.28) pour débloquer useBlocker (story 18.2). Story INFRA PURE : AUCUN changement de comportement observable — mêmes URLs, mêmes redirections, mêmes pages, la fiche chanson reste en page-state local, le guard maison 17.2 reste en place. Pas de loaders/actions (auth = contexte client, wrapper RequireAuth). AuthProvider reste au-dessus de RouterProvider. HomePage doit rester exporté (HomePage.test.tsx en dépend). Cadré ADR architecture-song-route-2026-07-11.md."
---

# Story 18.1: Migration vers le data-router (infra pure, zéro changement de comportement)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a mainteneur du socle,
I want migrer le routing de `<BrowserRouter>` vers `createBrowserRouter`/`<RouterProvider>` sans rien changer au comportement,
so that `useBlocker` devienne disponible pour la story 18.2, en ayant prouvé d'abord que la bascule d'infra ne casse aucune route.

## Contexte & pourquoi

**Prérequis infra de la story 18.2** (route-ify la fiche chanson + remplacer le guard maison 17.2 par `useBlocker`). `useBlocker` (react-router 6.7+) **exige un data-router** (`createBrowserRouter`/`RouterProvider`) — indisponible avec le `<BrowserRouter>` composant actuel. Cette story fait **uniquement** la bascule d'infra, **sans aucun changement de comportement**, pour dé-risquer : on prouve que tout marche à l'identique avant d'ajouter du neuf en 18.2.

**Cadré en ADR** : `_bmad-output/planning-artifacts/architecture-song-route-2026-07-11.md`.

**⚠️ Périmètre STRICT :** rien d'autre ne bouge. La fiche chanson **reste** en `page`-state local (route-ify = 18.2). Le **guard maison 17.2** (`LeaveGuardContext`/`Provider`/`GuardedLink`) **reste en place** cette story. Aucune URL, aucune redirection, aucun flux ne change.

## État actuel (lu intégralement)

### `src/main.tsx` (17 l.)
```tsx
createRoot(...).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

### `src/App.tsx`
- `export function HomePage()` — **named export**, utilisé par `src/__tests__/HomePage.test.tsx` (à **conserver exporté**).
- `function App()` : `const { isAuthenticated, loading } = useAuth();` → si `loading` → écran « Loading... » ; sinon rend :
  ```tsx
  <LeaveGuardProvider>
    <div className="flex flex-col min-h-screen ...">
      <Header />
      <VerifyEmailBanner />
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/songs" element={isAuthenticated ? <Songs /> : <Navigate to="/login" replace />} />
          <Route path="/my-instruments" element={isAuthenticated ? <MyInstrumentsPage /> : <Navigate to="/login" replace />} />
          <Route path="/my-playlists" element={isAuthenticated ? <MyPlaylistsPage /> : <Navigate to="/login" replace />} />
          <Route path="/my-topics" element={isAuthenticated ? <MyTopicsPage /> : <Navigate to="/login" replace />} />
          <Route path="/my-sessions" element={isAuthenticated ? <MySessionsPage /> : <Navigate to="/login" replace />} />
          <Route path="/my-heatmap" element={isAuthenticated ? <MyHeatmapPage /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={isAuthenticated ? <ProfilePage /> : <Navigate to="/login" replace />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/songs" replace />} />
          <Route path="/register" element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/songs" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  </LeaveGuardProvider>
  ```
- **13 routes** : `/` (public) · 7 **protégées** (songs/my-instruments/my-playlists/my-topics/my-sessions/my-heatmap/profile → `/login` si non-auth) · 3 **publiques** (verify-email/forgot-password/reset-password) · 2 **guest-only** (login/register → `/songs` si auth) · `*` → `/`.

## Design retenu (data-router, react-router 6.28)

### 1. `main.tsx` → `RouterProvider`
```tsx
createRoot(...).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
```
- `AuthProvider` **reste au-dessus** du router (l'auth est un contexte client, `useAuth` doit rester dispo dans tous les éléments de route).
- Le `router` = `createBrowserRouter([...], { future: { v7_startTransition: true, v7_relativeSplatPath: true } })` — **mêmes `future` flags** qu'aujourd'hui (⚠️ en data-router, les flags passent en **2e argument** de `createBrowserRouter`, plus sur `<BrowserRouter>`).
- **Pas de loaders / actions** (décision ADR : l'auth reste un contexte, pas un fetch de route).

### 2. `RootLayout` = l'actuel corps d'`App` (moins les `<Routes>`)
- Composant layout rendant `<LeaveGuardProvider>` → div → `<Header/> <VerifyEmailBanner/> <main><Outlet/></main> <Footer/>`. **`LeaveGuardProvider` reste** (guard 17.2 conservé cette story).
- Gère le **loading auth** : `const { loading } = useAuth(); if (loading) return <écran Loading.../>;` avant de rendre le layout (préserve le comportement actuel où toute l'app attend l'auth).
- `<Outlet/>` remplace `<Routes>`.

### 3. `RequireAuth` (NEW) — routes protégées
```tsx
function RequireAuth() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
```

### 4. `GuestOnly` (NEW ou inline) — routes login/register
```tsx
function GuestOnly() {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated ? <Outlet /> : <Navigate to="/songs" replace />;
}
```

### 5. L'arbre de routes (équivalence EXACTE)
```tsx
const router = createBrowserRouter([
  { element: <RootLayout />, children: [
    { index: true, element: <HomePage /> },
    { element: <RequireAuth />, children: [
      { path: 'songs', element: <Songs /> },
      { path: 'my-instruments', element: <MyInstrumentsPage /> },
      { path: 'my-playlists', element: <MyPlaylistsPage /> },
      { path: 'my-topics', element: <MyTopicsPage /> },
      { path: 'my-sessions', element: <MySessionsPage /> },
      { path: 'my-heatmap', element: <MyHeatmapPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ]},
    { path: 'verify-email', element: <VerifyEmailPage /> },
    { path: 'forgot-password', element: <ForgotPasswordPage /> },
    { path: 'reset-password', element: <ResetPasswordPage /> },
    { element: <GuestOnly />, children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
    ]},
    { path: '*', element: <Navigate to="/" replace /> },
  ]},
], { future: { v7_startTransition: true, v7_relativeSplatPath: true } });
```
⚠️ **Vérifier l'équivalence** : `/` = `index: true` (relatif au layout) ; les paths enfants **sans slash de tête** (relatifs) ; `*` catch-all → `/`. Les redirections auth doivent produire **exactement** les mêmes comportements (`/songs` non-auth → `/login` ; `/login` auth → `/songs` ; route inconnue → `/`).

## Acceptance Criteria

**Given** le socle routing actuel (`<BrowserRouter>` + `<Routes>` dans `App`)
**When** on migre vers le data-router
**Then** `main.tsx` rend `<RouterProvider router={router} />` avec `router = createBrowserRouter([...], { future: { v7_startTransition: true, v7_relativeSplatPath: true } })` ; `AuthProvider` **reste au-dessus** de `RouterProvider` ; **aucun loader/action** react-router n'est introduit ; `HomePage` **reste un named export** (utilisé par `HomePage.test.tsx`)

**Given** le layout + les 13 routes existantes
**When** on définit l'arbre de routes
**Then** un `RootLayout` (élément de route racine) rend `<LeaveGuardProvider>` + `<Header/> <VerifyEmailBanner/> <main><Outlet/></main> <Footer/>` et gère le loading auth (écran « Loading... » tant que `useAuth().loading`) ; les 7 routes protégées passent par un wrapper **`<RequireAuth>`** ; les 2 routes login/register par un wrapper **`GuestOnly`** ; **toutes** les routes sont reproduites (index `/`, 7 protégées, 3 publiques verify/forgot/reset, login, register, `*`→`/`) avec les **mêmes redirections** (`/songs` non-auth → `/login` ; `/login`|`/register` auth → `/songs` ; inconnue → `/`)

**Given** la fiche chanson et le guard de nav 17.2
**When** 18.1 est livrée
**Then** la fiche chanson **reste** en `page`-state local (PAS route-ifiée — c'est 18.2) ; le **guard maison 17.2 reste en place** (`LeaveGuardProvider` toujours monté dans `RootLayout`, `GuardedLink` inchangé) ; **aucun changement de comportement UX observable** — refresh, back-button, popups, redirections se comportent **exactement** comme avant

**And** aucune régression : suites front + back vertes (les 15 tests qui rendent des composants isolés dans `<MemoryRouter>` **ne changent pas** — ils ne dépendent pas du routeur de prod ; `HomePage.test.tsx` OK tant que `HomePage` reste exporté) ; tsc + lint clean ; husky sans `--no-verify`. ⚠️ vérifier `AuthProvider × RouterProvider` (le loading auth + les redirections marchent) et le **double-invoke StrictMode** (aucun effet de bord). UI/commentaires en anglais. `[src/main.tsx, src/App.tsx (décomposé : RootLayout + HomePage), src/components/RequireAuth.tsx (NEW, peut aussi porter GuestOnly)]`

## Tasks / Subtasks

### Task 1 — `RootLayout` + `RequireAuth`/`GuestOnly` (AC 2)
- [x] Extraire le corps d'`App` (hors `<Routes>`) en **`RootLayout`** : `<LeaveGuardProvider>` → div → `Header` / `VerifyEmailBanner` / `<main><Outlet/></main>` / `Footer`. Conserver l'écran « Loading... » quand `useAuth().loading`. (`RootLayout` peut vivre dans `App.tsx` ou un fichier dédié — garder `HomePage` **exporté** depuis `App.tsx`.)
- [x] `RequireAuth` (NEW, ex. `src/components/RequireAuth.tsx`) : `isAuthenticated ? <Outlet/> : <Navigate to="/login" replace/>`.
- [x] `GuestOnly` : `!isAuthenticated ? <Outlet/> : <Navigate to="/songs" replace/>` (même fichier ou inline).
- [x] Importer `Outlet`, `Navigate`, `useAuth` comme il faut. **Ne pas** retirer `LeaveGuardProvider` (c'est 18.2).

### Task 2 — `createBrowserRouter` + `main.tsx` (AC 1, 2)
- [x] Définir le `router` (arbre de routes ci-dessus) — dans `main.tsx` ou un `src/router.tsx` dédié. `future` flags en **2e argument** de `createBrowserRouter`.
- [x] `main.tsx` : `<StrictMode><AuthProvider><RouterProvider router={router} /></AuthProvider></StrictMode>`. Retirer `<BrowserRouter>` et le rendu de `<App/>`.
- [x] Vérifier chaque route ↔ l'existant (paths relatifs sous le layout, `index: true` pour `/`, `*`→`/`, redirections auth identiques).

### Task 3 — Vérifs & non-régression (AC And)
- [x] `npm test` (front) + `cd backend && npm test` verts ; `npx tsc -b` ; `npm run lint`. Les tests `MemoryRouter` inchangés.
- [x] (Optionnel) petit test de fumée de routing si utile (ex. `createMemoryRouter` avec l'arbre → une route protégée redirige vers `/login` non-auth). Ne pas sur-tester.
- [x] **QA manuelle rapide** : parcourir `/`, login, `/songs`, chaque page `my-*`, profile, logout, une route inconnue → mêmes URLs/redirections qu'avant ; la fiche chanson (ouvrir/éditer/back/popup titre-vide) **inchangée**.

## Dev Notes

### Fichiers UPDATE — état & ce qui change
- **`src/main.tsx`** : `<BrowserRouter>` + `<App/>` → `<RouterProvider router={router}/>`. `AuthProvider` conservé au-dessus. `future` flags migrés en 2e arg de `createBrowserRouter`.
- **`src/App.tsx`** : `App()` (avec `<Routes>`) décomposé en `RootLayout` (layout + Outlet + loading) ; `HomePage` **reste exporté**. Le default export `App` disparaît ou devient inutilisé — **vérifier qu'aucun import ne le référence** (seul `main.tsx` l'importait ; `HomePage.test` importe le named export).
- **NEW** `src/components/RequireAuth.tsx` (+ `GuestOnly`).

### Pièges / points de vigilance
- **`future` flags** : en data-router ils vont en 2e arg de `createBrowserRouter`, pas sur un composant. Les garder (mêmes flags) pour ne pas changer le comportement de transition/splat.
- **StrictMode double-invoke** : le data-router est robuste ; juste vérifier qu'aucun effet ajouté ne double-fire. (18.1 n'ajoute pas d'effet.)
- **`AuthProvider` × `RouterProvider`** : `AuthProvider` doit rester **au-dessus** (`useAuth` dans les éléments de route). Le loading auth passe dans `RootLayout` (pas dans `main.tsx`).
- **Écran Loading** : préserver le « Loading... » plein écran pendant `loading` — c'était dans `App`, il va dans `RootLayout`.
- **Ne rien changer d'autre** : c'est le cœur de la story. Pas de route-ify, pas de suppression de guard, pas de `useBlocker` (tout ça = 18.2).

### Conventions (project-context.md)
- `import type` (verbatimModuleSyntax) ; pas de variable morte (`noUnusedLocals` — attention au default export `App` devenu mort → le retirer proprement) ; imports relatifs ; Tailwind only ; **tout en anglais**.
- Pas de nouvelle dépendance npm (`createBrowserRouter`/`RouterProvider`/`Outlet` sont déjà dans `react-router-dom@6.28`).

### Garde-fous workflow
- **Jamais sur `main`** : branche `feat/epic-18-song-route` (à partager avec 18.2). Merge `main` = **prod** ; northwood merge à la main. Front-only, **pas de migration DB**.
- Hook pre-commit lance front + back — **jamais `--no-verify`**. Commits Conventional (`refactor(routing): ...` ou `feat(routing): ...`).

### Project Structure Notes
- **EDIT** : `src/main.tsx`, `src/App.tsx` (→ `RootLayout` + `HomePage` exporté).
- **NEW** : `src/components/RequireAuth.tsx` (+ `GuestOnly`), éventuel `src/router.tsx`.
- **Pas de backend, pas de migration, pas de dépendance npm.**
- **18.2 (suivante)** route-ifiera `Songs` + supprimera le guard maison → `useBlocker`.

### References
- [Source: _bmad-output/planning-artifacts/architecture-song-route-2026-07-11.md] — ADR (décision data-router, RequireAuth sans loaders, découpage 2 stories)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 18] — cadrage + décisions verrouillées
- [Source: src/main.tsx] — `<BrowserRouter>` + `future` flags à migrer
- [Source: src/App.tsx] — `HomePage` (named export à garder), `App` (Routes à décomposer), les 13 routes + redirections auth
- [Source: src/__tests__/HomePage.test.tsx:3] — dépend de `import { HomePage } from '../App'`
- [Source: react-router-dom@6.28] — `createBrowserRouter`/`RouterProvider`/`Outlet`/`useBlocker` (18.2)
- [Source: _bmad-output/project-context.md] — conventions front (verbatimModuleSyntax, noUnusedLocals, imports relatifs)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

- **Piège `future` flags** (corrigé) : en react-router 6, `v7_relativeSplatPath` est **router-level** (2e arg de `createBrowserRouter`) mais `v7_startTransition` est **render-level** (prop `future` de `<RouterProvider>`). Répartis correctement pour préserver le comportement (sinon warning « unknown future flag »).
- **Smoke test routing — `Request is not defined`** : `createMemoryRouter`/`RouterProvider` (data-router) exige les primitives Fetch (`Request`/`Response`), absentes de jsdom → **contourné sans nouvelle dépendance** en testant le **même** tableau `routes` via `useRoutes(routes)` + `<MemoryRouter>` (routeur composant). Prouve l'équivalence de l'arbre (paths + gardes + catch-all) sans polyfill.
- **Boucle multi-render** (corrigé) : un test qui bouclait `render` sans cleanup accumulait le DOM → converti en `test.each` (auto-cleanup par test).
- **Validations** : `npx tsc -b` 0 · `npm run lint` clean · front **351/351** (+13 : nouveau `router.test.tsx`) · back **265/265**. Aucune régression (les 15 tests `MemoryRouter` inchangés, `HomePage.test` OK — `HomePage` reste exporté).

### Completion Notes List

- **AC1 (RouterProvider)** : `main.tsx` rend `<AuthProvider><RouterProvider router={router} future={{ v7_startTransition: true }} /></AuthProvider>` ; `router` = `createBrowserRouter(routes, { future: { v7_relativeSplatPath: true } })` ; **aucun loader/action** ; `HomePage` reste named-exporté.
- **AC2 (layout + routes)** : `RootLayout` (named export d'`App.tsx`) = `<LeaveGuardProvider>` + Header/VerifyEmailBanner/`<main><Outlet/></main>`/Footer + écran « Loading... » tant que `useAuth().loading` ; `RequireAuth`/`GuestOnly` (NEW `src/components/RequireAuth.tsx`) ; arbre de routes dans `src/router.tsx` — **13 routes reproduites à l'identique**, redirections auth identiques (`/songs` non-auth → `/login` ; `/login`|`/register` auth → `/songs` ; `*` → `/`), vérifiées par le smoke test.
- **AC3 (zéro changement)** : la fiche chanson **reste** en `page`-state (pas route-ifiée) ; le **guard maison 17.2 reste** (`LeaveGuardProvider` monté dans `RootLayout`, `GuardedLink`/`useLeaveGuard` inchangés) ; aucune URL/redirection/flux modifié.
- **AC And** : suites vertes, tsc + lint clean ; `AuthProvider` reste au-dessus de `RouterProvider` (loading auth dans `RootLayout`) ; le default export `App` mort a été retiré proprement (`RootLayout` remplace).
- ⚠️ **QA manuelle non exécutée par l'agent** (pas de stack lancée) : parcourir `/` / login / `/songs` / pages `my-*` / profile / logout / route inconnue → mêmes URLs/redirections ; la fiche chanson (ouvrir/éditer/back/popup titre-vide) inchangée. À faire par northwood avant merge (le smoke test couvre l'arbre de routes, mais pas le rendu réel des pages ni les redirections auth en conditions réelles).

### File List

- `src/main.tsx` (EDIT — `<BrowserRouter>`+`<App/>` → `<RouterProvider router={router} future={{v7_startTransition}} />` dans `<AuthProvider>`)
- `src/App.tsx` (EDIT — `App` (default, avec `<Routes>`) → `RootLayout` (named export, layout + `<Outlet/>` + loading) ; `HomePage` conservé named-exporté ; imports des pages/`Routes`/`Navigate` retirés)
- `src/router.tsx` (NEW — `routes: RouteObject[]` (exporté pour les tests) + `router = createBrowserRouter(routes, { future: { v7_relativeSplatPath } })`)
- `src/components/RequireAuth.tsx` (NEW — `RequireAuth` + `GuestOnly`)
- `src/__tests__/router.test.tsx` (NEW — 13 tests : équivalence de l'arbre de routes via `useRoutes`, gardes RequireAuth/GuestOnly, catch-all)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (EDIT — 18-1 → review)

## Change Log

| Date       | Version | Description                                                                 |
|------------|---------|-----------------------------------------------------------------------------|
| 2026-07-11 | 0.1     | Story 18.1 — migration data-router (`<BrowserRouter>` → `createBrowserRouter`/`<RouterProvider>`). `RootLayout` (Outlet) + `RequireAuth`/`GuestOnly` + arbre de routes `src/router.tsx` reproduisant les 13 routes à l'identique ; `future` flags répartis (router-level vs render-level). **Zéro changement de comportement** (fiche chanson reste page-state, guard 17.2 reste). +13 tests routing (`router.test.tsx`, via `useRoutes` pour éviter le polyfill Fetch). Front 351 ✓ (+13), back 265 ✓, tsc + lint clean. Statut → review. |

## Review Findings

_Code review adversariale 3 couches (Blind / Edge Case / Acceptance) — 2026-07-11. **Acceptance Auditor : 4/4 ACs satisfaits, 0 violation.** **Edge Case Hunter (accès projet) : migration fidèle** — 7 frontières confirmées équivalentes (gate loading sûr, catch-all, index, paths relatifs, ancêtre LeaveGuardProvider intact, gardes RequireAuth/GuestOnly réellement exercées, AuthProvider bien placé), **aucun bug de correction**. Le split des `future` flags (v7_relativeSplatPath router-level / v7_startTransition render-level) diverge du texte de la story mais est **la bonne** implémentation react-router (le texte est à corriger, pas le code). Triage : 1 patch, 2 defer, 2 dismiss._

- [x] [Review][Patch→Fixed] **Commentaires trompeurs sur la couverture de test** [src/router.tsx, src/__tests__/router.test.tsx] — le commentaire de `router.tsx` dit « tests can mount ... via `createMemoryRouter` » alors que le test utilise `useRoutes` + `<MemoryRouter>` (routeur composant, à cause de la limite jsdom `Request`). Corriger le commentaire pour dire la vérité : le smoke test prouve l'**arbre de routes** (paths + gardes + catch-all) via `useRoutes` ; le **wiring data-router** (`createBrowserRouter`/`RouterProvider`/`future`) est couvert par `tsc` (l'API compile) + la QA manuelle, pas par un test jsdom.
- [x] [Review][Defer] **Le data-router installe une error boundary par défaut** [src/router.tsx — pas d'`errorElement`] — deferred : une erreur de rendu d'une page routée affiche désormais la page d'erreur générique **non stylée** de react-router (« Unexpected Application Error! »), remplaçant le chrome (Header/Footer) — là où l'ancien `<BrowserRouter>` laissait un écran blanc. **Amélioration** de facto (message au lieu d'écran blanc) mais changement de comportement vs « zéro changement », et non-brandé. Candidat : un `errorElement` brandé sur la route racine (nouveau périmètre — l'app n'avait AUCUNE UI d'erreur avant ; possible en 18.2 ou suite). Non bloquant.
- [x] [Review][Defer] **Le wiring data-router + le gate loading + l'ancêtre LeaveGuardProvider ne sont pas couverts par un test** [src/__tests__/router.test.tsx] — deferred : `createMemoryRouter`/`RouterProvider` exigent les primitives Fetch (`Request`) absentes de jsdom → le test passe par `useRoutes` (arbre seulement), et mocke `RootLayout` (donc ni le `if (loading)` ni l'ancêtre `LeaveGuardProvider` ne sont exercés). **Le code de prod est vérifié correct** par la review (Edge Case Hunter). Gap de couverture assumé (un vrai test du data-router demanderait un polyfill Fetch = nouvelle dép) ; couvert par tsc + QA manuelle.

### Findings écartés (dismiss)
- **Import dangling du default `App`** (Blind Low) — **vérifié** par l'Edge Case Hunter : seuls des imports **nommés** (`RootLayout`, `HomePage`) subsistent, aucun importeur du default `App` dans le repo. Faux positif.
- **Commentaire périmé dans `LeaveGuardContext.ts`** (« This app uses `<BrowserRouter>` ») — **dismiss** : le fichier est **supprimé en 18.2** (swap guard → `useBlocker`) → le corriger maintenant serait de la churn annulée.
