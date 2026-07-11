---
type: architecture-decision-record
date: '2026-07-11'
project_name: 'musician-tools'
user_name: 'northwood'
scope: 'Fiche chanson = vraie route + migration data-router (ferme 3 items nav, supprime le guard maison 17.2)'
status: 'décidé — prêt à cadrer en epic'
decidedBy: 'northwood + facilitation archi 2026-07-11'
inputDocuments:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/17-2-auto-creation-front-blocage-doublon.md'
  - '_bmad-output/implementation-artifacts/deferred-work.md (§ À brainstormer — item route)'
supersedes_debt:
  - '17.2 defer — back navigateur/popstate non gardé'
  - '17.2 defer — beforeunload draft add non-créé (partiellement)'
  - 'deferred-work § À brainstormer — refresh sur une chanson → songlist'
---

# ADR — Fiche chanson = vraie route (`/songs/:uid`) + migration data-router

## Contexte & problème

Le formulaire de chanson n'est **pas une route** : c'est un état local `page: 'list' | 'form'` + `editingUid` dans la page `/songs`. Conséquences, remontées 3× pendant l'Epic 17 :

1. **Refresh sur une chanson → retour songlist** (l'état d'édition n'est pas dans l'URL) — signalé northwood en QA 17.2.
2. **Back-button navigateur non gardé** — la popup titre-vide de 17.2 ne s'affiche pas sur un popstate (deferred 17.2).
3. **`useBlocker` indisponible** avec `<BrowserRouter>` (composant, pas data-router) → 17.2 a dû construire un **guard de navigation maison** (`LeaveGuardContext` + `LeaveGuardProvider` + `GuardedLink`, Header patché) — dette assumée.

Les 3 ont la **même racine** : l'état d'édition vit hors de l'URL, et le routeur composant n'expose pas de blocker.

## Décision

**Migrer `<BrowserRouter>` → `createBrowserRouter` + `<RouterProvider>` (data-router)** et **router-ifier le formulaire** : `/songs` (liste), `/songs/new` (ajout), `/songs/:uid` (édition).

Cela débloque **`useBlocker`** (API react-router 6.7+, exige un data-router), qui **remplace intégralement** le guard maison de 17.2.

**Ferme d'un coup :** refresh-persistence (1), back-button gardé (2), et **supprime la dette** du guard maison (3). Dette **nette réduite**.

### Alternative écartée
**Garder `<BrowserRouter>` + ajouter juste la route + une persistance maison.** Rejetée : fixerait le refresh mais **pas** le back-button, et **laisserait** le guard maison de 17.2 en place (dette). La migration data-router est plus de travail en une fois mais solde les 3 items + simplifie.

## Design retenu

### Routes
- `/songs` — la liste (inchangée).
- `/songs/new` — formulaire **vierge** (mode add).
- `/songs/:uid` — formulaire **édition** de la chanson `uid`.
- À l'**auto-création** : sur `/songs/new`, dès le titre trimmé non-vide → `songService.createSong` → **`navigate('/songs/' + newUid, { replace: true })`** → bascule invisible, **zéro entrée d'historique** parasite (le `replace` remplace `/songs/new`).

### Cœur du refacto — `Songs.tsx`
- `editingUid` et `page` **ne sont plus des `useState`** : ils sont **dérivés de l'URL** via `useParams()` :
  - route `/songs` → mode liste.
  - route `/songs/new` → mode add (`editingUid = null`).
  - route `/songs/:uid` → mode édition (`editingUid = uid`).
- Le chargement de la chanson éditée se fait au montage/param-change (fetch `getSong(uid)` si pas déjà en mémoire, sinon depuis `songs`).
- Tout le reste de la machinerie 17.2/13.1 (auto-save débounce, `savingRef`/verrou in-flight, `editBaselineJson`, `saveStatus`, blocage doublon symétrique, Seuil 1) **reste** — seul le déclencheur d'entrée/sortie change (URL au lieu de `setPage`).

### Guard de navigation → `useBlocker`
- **Supprimer** `src/contexts/LeaveGuardContext.ts`, `src/contexts/LeaveGuardProvider.tsx`, le `GuardedLink` de `Header.tsx` (retour aux `<Link>` simples), le `LeaveGuardProvider` de `App.tsx`, et l'enregistrement `registerLeaveGuard`/`attemptLeave` de `Songs.tsx`.
- **Remplacer** par `useBlocker(({ currentLocation, nextLocation }) => …)` dans la route du formulaire : bloque quand `editingUid !== null && titre vide` → réutilise **`isFreshSong` / `deleteEditingSong` / `ConfirmDialog`** de 17.2 (fresh → delete silencieux + `blocker.proceed()` ; à valeur → popup, Delete → delete + proceed, Continue → `blocker.reset()`).
- **`beforeunload`** reste (refresh/fermeture d'onglet — `useBlocker` ne couvre pas l'unload navigateur).

### Routes protégées (migration minimale)
- **Pas de loaders** : l'auth est un **contexte client** (`AuthProvider`/`useAuth`), pas un fetch de route. On garde le pattern conditionnel via un wrapper **`<RequireAuth>`** (`isAuthenticated ? <Outlet/> : <Navigate to="/login" replace/>`) comme route parente des routes protégées. `AuthProvider` reste **au-dessus** de `<RouterProvider>` dans `main.tsx`.
- Layout racine (Header / VerifyEmailBanner / `<main><Outlet/></main>` / Footer) devient l'**élément d'une route layout** avec `<Outlet/>`.

### Deep-link & 404 scopé
- `/songs/:uid` avec un `uid` inconnu **ou pas à moi** → `getSong` renvoie **404 scopé** (invariant 7.5 : « pas à toi » = « n'existe pas »). Le form affiche un état **« Song not found »** + lien retour `/songs` (pas d'oracle d'existence).

## Découpage en epic (2 stories — dé-risqué)

**Story 1 — Migration data-router (infra pure, AUCUN changement de comportement).**
`main.tsx` (`RouterProvider` + `createBrowserRouter`, `future` flags conservés), `App.tsx` (layout racine + `<Outlet/>` + `<RequireAuth>`), toutes les routes existantes reproduites **à l'identique**. Critère : **tout marche exactement comme avant** (mêmes URLs, mêmes redirections, Header/Footer, la fiche chanson reste en `page`-state pour l'instant). Le guard 17.2 **reste en place** cette story. Vérifiable par la QA + suite verte : rien ne bouge côté UX.

**Story 2 — Route-ifier le form + swap guard.**
Routes `/songs/new` + `/songs/:uid` ; `editingUid`/`page` dérivés de l'URL ; auto-création → `navigate(replace)` ; **suppression** du guard maison 17.2 ; **`useBlocker`** + popup titre-vide ; 404 scopé deep-link. Ferme les 3 items. QA nav app-wide (comme 17.2).

## Risques & mitigations
- **Racine routing touchée (toutes les routes)** → mitigé par le split : Story 1 est une bascule d'infra **sans changement de comportement**, prouvable avant d'ajouter du neuf.
- **`AuthProvider` × data-router** : garder `AuthProvider` au-dessus de `RouterProvider` ; `useAuth` reste dispo dans tous les éléments de route. Vérifier `loading`/redirections `/login` ↔ `/songs`.
- **StrictMode double-invoke** : `useBlocker` + `navigate(replace)` de l'auto-création — vérifier pas de double-navigation / double-create (le verrou in-flight `savingRef` de 17.2 couvre déjà le double-create).
- **Tests** : les tests qui rendent `<Songs/>` dans `<MemoryRouter>` devront passer par la route/param (`/songs/:uid`) — adapter les helpers de rendu. Ceux qui rendent `Header` (guard supprimé) redeviennent des `<Link>` simples.
- **17.2 en prod (v1.13.0)** : cette migration **révise** du code shippé (le guard). Le remplacement par `useBlocker` doit préserver le comportement UX validé en QA 17.2 (popup, fresh-delete, symétrie).

## Règles de cohérence (pour l'agent dev)
- **`import type`** obligatoire (verbatimModuleSyntax) ; imports relatifs ; Tailwind only ; tout en anglais.
- **Ne pas** introduire de loaders/actions react-router pour l'auth (rester sur le contexte + `<RequireAuth>`).
- **Conserver** toute la logique doublon/Seuil 1/auto-save de 17.2 ; seul le **transport** (état local → URL) et le **guard** (maison → `useBlocker`) changent.
- `navigate` de l'auto-création **toujours en `{ replace: true }`** (pas de spam d'historique).
- Invariant 7.5 sur le deep-link `/songs/:uid` (404 scopé, pas d'oracle).
- Suites front + back vertes, tsc + lint clean, husky sans `--no-verify`. Jamais sur `main`.

## Fichiers touchés (prévisionnel)
- **Story 1** : `src/main.tsx`, `src/App.tsx` (+ éventuel `src/components/RequireAuth.tsx` NEW) ; tests de routing.
- **Story 2** : `src/pages/Songs.tsx` (params URL + `useBlocker` + navigate), `src/components/Header.tsx` (retour `<Link>`), **DELETE** `src/contexts/LeaveGuardContext.ts` + `src/contexts/LeaveGuardProvider.tsx` ; tests (`SongsAutoSave`, `Header`, nouveaux tests route/deep-link/404).

## Prochaine étape BMad
`bmad-create-epics-and-stories` (fenêtre fraîche) — cadrer l'**Epic 18 « Fiche chanson = vraie route »** et ses 2 stories à partir de cet ADR. Puis cycle create-story → dev-story → code-review.
