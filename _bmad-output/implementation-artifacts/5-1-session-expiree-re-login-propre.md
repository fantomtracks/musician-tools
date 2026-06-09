---
baseline_commit: 0cfd925c9dac114dc27f9d68e8ccdf096790eee8
---

# Story 5.1: Une session expirée me ramène proprement au login

Status: done

## Story

As a utilisateur dont la session a expiré (ou dont le serveur a redémarré),
I want qu'un appel rejeté en 401 me ramène automatiquement à l'écran de connexion,
so that je ne reste pas bloqué devant un message d'erreur trompeur (« Heatmap could not be loaded ») sans moyen de me reconnecter.

## Contexte (issu des rétros Epic 2/3/4)

Le « 401-dead-end », vécu 3 fois en test : le front retient « connecté » via `localStorage` (`AuthContext`, `isAuthenticated: !!user`), mais la vraie session vit dans le cookie + la mémoire serveur. Quand le serveur redémarre (nodemon, `make restart`) ou que la session expire, chaque `fetch` se prend un **401**, et les services font juste `throw new Error('Failed to ...')` → message qui accuse la donnée, **sans chemin de re-login**. Impasse jusqu'à rechargement manuel. Pré-existant, transverse à toutes les pages.

## Acceptance Criteria

1. **Redirection au 401** — Given une session morte côté serveur, When un appel API d'une page protégée renvoie 401, Then l'utilisateur est ramené à `/login` (rechargement propre) et son « user » stocké est effacé, plutôt que de voir un message d'erreur de données.
2. **Pas de boucle ni de faux positif sur le login** — Given l'écran de login, When une tentative de connexion échoue (401 sur `/auth/login`), Then on NE redirige PAS (pas de boucle) et le message d'erreur de login normal s'affiche — l'auth (`authService`) n'est pas soumise à l'intercepteur.
3. **Les erreurs non-401 inchangées** — Given une vraie panne (500, réseau), When un appel échoue, Then le comportement actuel est préservé (message d'erreur de la page, pas de redirection).
4. **Transverse** — Given n'importe quelle page protégée (Songs, Instruments, Playlists, Topics, Sessions, Heatmap), When un 401 survient, Then la redirection s'applique uniformément (un seul point de correction).

## Tasks / Subtasks

- [x] Task 1 : Wrapper `apiFetch` centralisé (AC: 1, 4)
  - [x] Créer `src/services/apiFetch.ts` : `export async function apiFetch(input, init)` qui appelle `fetch(input, init)` ; si `res.status === 401` → effacer le user stocké (`localStorage.removeItem('user')`) ET rediriger via `window.location.assign('/login')` (rechargement complet : vide l'état React, `AuthContext` se réinitialise depuis le localStorage désormais vide → écran login). Puis retourner/relancer pour que l'appelant ne traite pas une réponse fantôme
  - [x] ⚠️ **Anti-boucle** (AC2) : si `window.location.pathname === '/login'`, NE PAS rediriger (laisser le 401 remonter normalement)
  - [x] NE PAS toucher `credentials: 'include'` ni la signature : `apiFetch` est un drop-in de `fetch`
- [x] Task 2 : Migrer les services de domaine vers `apiFetch` (AC: 3, 4)
  - [x] Remplacer `fetch(` par `apiFetch(` dans : `instrumentService.ts`, `playlistService.ts`, `practiceSessionService.ts`, `songPlayService.ts`, `songService.ts`, `topicService.ts`, `songLinksService.ts`
  - [x] ⚠️ **NE PAS migrer `authService.ts`** (login/register/logout/me) — un 401 sur `/auth/login` = mauvais identifiants, doit afficher l'erreur de login, pas rediriger (AC2). C'est la seule exclusion
  - [x] Le `if (!res.ok) throw ...` existant de chaque service RESTE (les non-401 throw comme avant, AC3) — `apiFetch` n'intercepte QUE le 401
- [x] Task 3 : Tests (AC: tous)
  - [x] `src/__tests__/apiFetch.test.ts` : un 401 → `localStorage` « user » effacé + `window.location.assign('/login')` appelé (mocker `window.location`) ; un 401 alors que `pathname === '/login'` → PAS de redirection ; une réponse 200 → passe ; une 500 → pas de redirection, la réponse est retournée telle quelle (le service throw ensuite)
  - [x] Un test de service (ex. `practiceSessionService` ou via une page) : un 401 déclenche bien la redirection ; un 500 garde le message d'erreur existant (non-régression)
  - [x] ⚠️ Ne pas casser les suites existantes : `window.location` est souvent à mocker globalement — vérifier les tests de pages qui ne s'attendent pas à une redirection (ils renvoient 200/erreurs non-401, donc non impactés)
- [x] Task 4 : Validations finales
  - [x] Suite frontend + lint + build + scan NUL
  - [ ] **Test manuel** : se connecter, redémarrer le backend (`make restart` → vide la session), recharger une page protégée → on doit atterrir sur `/login` proprement (et plus « Heatmap could not be loaded »). Vérifier qu'un mauvais mot de passe sur le login affiche bien l'erreur sans boucle

### Review Findings

- [x] [Review][Patch] Flash d'erreur avant la redirection : sur 401, `apiFetch` retourne la réponse → le service `throw` → la page met un état d'erreur (« Error while loading… ») rendu une fraction de seconde avant que le rechargement complet ne détruise le document. C'est précisément l'erreur trompeuse que la story veut éliminer. Sur 401, retourner une promesse qui ne se résout JAMAIS (la page navigue de toute façon) → l'appelant ne throw pas, pas de flash (Med, blind+edge+auditor) [src/services/apiFetch.ts + tests 401]
- [x] [Review][Patch] Hygiène de test : `window.location` est remplacé en `beforeEach`/dans un test mais jamais restauré (`afterEach` ne restaure que `global.fetch`) — fuite latente. Sauver l'original et le restaurer (apiFetch.test.ts + songPlayService.test.ts) (Med, les 3 couches) [tests]
- [x] [Review][Patch] Trous de couverture (AC2/AC3) : ajouter un test du rejet réseau (`fetch` rejette → `apiFetch` rejette, pas de redirection) et un test de l'exclusion `authService` (un 401 sur le login NE déclenche PAS la redirection) (Low, auditor) [tests]
- [x] [Review][Defer] Rafale de 401 concurrents → N `assign('/login')` + N `removeItem` (page qui lance plusieurs fetchs). Bénin en pratique (navigations même-URL coalescées, removeItem idempotent) ; un verrou `isRedirecting` serait propre mais ajoute un état module difficile à réinitialiser en test [apiFetch.ts] — deferred, bénin
- [x] [Review][Defer] Clé `'user'` codée en dur, dupliquée d'`authService` (vérifiée identique) ; une constante partagée serait plus propre [apiFetch.ts] — deferred, nice-to-have
- [x] [Review][Defer] Rechargement complet perd un formulaire en cours si la session meurt en pleine saisie — inhérent à une session morte (le serveur refuserait l'enregistrement de toute façon) [apiFetch.ts] — deferred, inhérent
- [x] [Review][Dismiss] Garde SSR `typeof window` (SPA Vite, pas de SSR) ; 403/419 aussi « session morte » (FAUX pour ce backend : 403 = ownership, 401 = pas de session → 401-only est correct) ; commentaire d'en-tête « survend » (il est exact) ; seam de redirection injectable (sur-ingénierie, le mock `Object.defineProperty` suffit)

## Dev Notes

### Approche : un seul point d'interception (`apiFetch`)

- L'app n'a pas d'intercepteur HTTP (pas d'axios) — chaque service fait du `fetch` brut. Le correctif transverse propre = un wrapper `apiFetch` adopté par les services de domaine. Une seule définition de la règle 401 (cf. leçon « une seule définition », acquis 3.3/4.2).
- **Rechargement complet** (`window.location.assign`) plutôt qu'un `navigate()` react-router : ça vide tout l'état React et force `AuthContext` à se réinitialiser depuis le localStorage (vidé) → pas de demi-état « connecté mais 401 ». Plus simple et plus sûr qu'une gestion fine via le router.
- **Exclusion `authService`** : le endpoint `/auth/login` répond 401 sur mauvais identifiants ; l'intercepter redirigerait en boucle / masquerait l'erreur de login. C'est la seule exception (AC2).

### État actuel (lu, à préserver)

- `src/contexts/AuthContext.tsx` : `user` chargé de `localStorage` clé `'user'` ; `isAuthenticated: !!user`. Le rechargement post-redirect le remet à null (localStorage vidé).
- `src/services/authService.ts` : `getStoredUser`/`storeUser`/`logout` (qui fait déjà `localStorage.removeItem('user')`). NON migré.
- Les 7 services de domaine : pattern `fetch(..., { credentials: 'include' })` + `if (!res.ok) throw new Error('Failed to ...')`. `apiFetch` se glisse à la place de `fetch`, le reste inchangé.
- `practiceSessionService.ts` : surface les messages 400 du body (create/update) — `apiFetch` ne touche pas ça (il ne court-circuite que le 401).

### Pièges

- **Boucle de redirection** : garder le test `pathname === '/login'`.
- **Tests / `window.location`** : en jsdom, `window.location.assign` peut nécessiter un mock (`Object.defineProperty` ou jest.spyOn) ; ne pas faire de vraie navigation en test.
- **NUL + discipline** : protocole rétro #3 (scan perl) reconduit.
- **Ne pas sur-corriger** : `apiFetch` n'intercepte QUE le 401 ; tout le reste (200, 400, 500, réseau) passe inchangé (AC3) — sinon régression sur les messages d'erreur existants (CM2).

### Ce que cette story NE fait PAS

- PAS de refresh-token ni de prolongation de session (hors périmètre).
- PAS de changement du backend (le 401 est déjà correct côté serveur ; c'est la réaction du front qui manque).
- PAS de migration de `authService`.

### Project Structure Notes

- Nouveau : `src/services/apiFetch.ts`, `src/__tests__/apiFetch.test.ts`.
- Modifiés : les 7 services de domaine (`instrumentService`, `playlistService`, `practiceSessionService`, `songPlayService`, `songService`, `topicService`, `songLinksService`).

### References

- deferred-work.md : entrée « Session serveur expirée → page morte » (priorité montée 2026-06-07, 3ᵉ manifestation)
- Rétros Epic 2/3/4 : 401-dead-end, candidat mini-story
- project-context.md : services `xxxService`, `fetch` brut, `credentials: 'include'`, `if (!res.ok) throw` (l.71-74)

## Dev Agent Record

### Context Reference

Mini-story post-PRD issue des rétrospectives (dette 401-dead-end promue).

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- TDD : 5 tests `apiFetch` RED → GREEN ; migration des 7 services par sed (`fetch(` → `apiFetch(` + import) ; suite complète verte sans toucher aux tests existants
- `songPlayService.test.ts` : le test « request fails » passé en `status: 500` (sinon `undefined`) + nouveau test 401→redirect au niveau service
- ⚠️ EN ATTENTE northwood : test manuel (restart backend → 401 → /login ; mauvais mot de passe → erreur sans boucle)

### Completion Notes List

- **`apiFetch`** (nouveau, `src/services/apiFetch.ts`) : drop-in de `fetch`. Sur `status === 401` ET `pathname !== '/login'` → `localStorage.removeItem('user')` + `window.location.assign('/login')` (rechargement complet, `AuthContext` se réinitialise vide). Sinon retourne la réponse telle quelle. N'intercepte QUE le 401 (200/400/500/réseau inchangés, AC3).
- **7 services de domaine migrés** vers `apiFetch` (`instrument`, `playlist`, `practiceSession`, `songPlay`, `song`, `topic`, `songLinks`) ; le `if (!res.ok) throw` de chacun reste (un 401 redirige ET throw — l'appelant ne traite pas de réponse fantôme).
- **`authService` NON migré** (seule exclusion) : un 401 sur `/auth/login` = mauvais identifiants → doit afficher l'erreur, pas rediriger (AC2). Anti-boucle via le test `pathname === '/login'`.
- Frontend uniquement, aucun changement backend (le 401 serveur est déjà correct).
- Validations : 175 tests front verts (+6), lint, build, scan NUL.

### File List

- src/services/apiFetch.ts (nouveau — intercepteur 401)
- src/services/instrumentService.ts (migré apiFetch)
- src/services/playlistService.ts (migré apiFetch)
- src/services/practiceSessionService.ts (migré apiFetch)
- src/services/songPlayService.ts (migré apiFetch)
- src/services/songService.ts (migré apiFetch)
- src/services/topicService.ts (migré apiFetch)
- src/services/songLinksService.ts (migré apiFetch)
- src/__tests__/apiFetch.test.ts (nouveau)
- src/__tests__/songPlayService.test.ts (modifié — test 401 niveau service)

## Change Log

- 2026-06-08 : Story créée (planification de la mini-story 401-dead-end décidée à la rétro Epic 4 — intercepteur `apiFetch` transverse, exclusion `authService`) — statut ready-for-dev
- 2026-06-08 : Implémentation TDD (apiFetch + migration des 7 services, authService exclu) — 6 tests ajoutés, 175 front verts, lint/build/NUL OK — statut → review (test manuel en attente)
- 2026-06-08 : Revue 3 couches — 3 findings patchés (sur 401, `apiFetch` ne résout plus = plus de flash d'erreur trompeur avant le reload ; restauration de `window.location` en afterEach ; tests ajoutés : rejet réseau AC3 + exclusion authService AC2), 3 defer (rafale 401 bénigne, clé en dur, perte de formulaire inhérente), faux positifs écartés (SSR, 403). 177 front verts, lint/build/NUL OK — statut → done (test manuel northwood en attente)
