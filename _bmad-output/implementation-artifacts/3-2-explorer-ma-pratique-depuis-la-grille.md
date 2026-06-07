---
baseline_commit: 3abb6c7cfdd7c91a9d3ea2d7de4ff4fb1aba61d6
---

# Story 3.2: Explorer ma pratique depuis la grille

Status: done

## Story

As a musicien,
I want cliquer sur un jour pour voir le détail, naviguer entre les années, et agir (éditer ou créer une session) directement depuis la grille,
so that la grille devienne la porte d'entrée de mon journal.

## Acceptance Criteria

1. **Détail d'un jour** — Given un jour allumé, When je clique (ou valide au clavier) sur sa case, Then le détail s'ouvre : sessions du jour avec entrées, durées et notes (FR16).
2. **Jour vide neutre** — Given un jour vide, When je clique dessus, Then un état vide neutre s'affiche — sans reproche ni incitation culpabilisante (FR16, FR18).
3. **Navigation d'années** — Given plusieurs années de données, When j'utilise la navigation d'années, Then je passe d'une année à l'autre et la grille se recharge (FR17).
4. **Édition depuis le détail** *(ajout northwood)* — Given le détail d'un jour affichant une session, When je choisis « Edit », Then le formulaire de session s'ouvre directement en mode édition de cette session (deep-link, réutilisation du mode édition 2.4).
5. **Création pré-datée depuis un jour vide** *(ajout northwood)* — Given le détail d'un jour vide, When je choisis « Log a session for this day », Then le formulaire s'ouvre avec la date de ce jour pré-remplie — une affordance choisie, pas une relance (FR18 préservé).
6. **Suppression depuis le détail** *(ajout northwood, test terrain)* — Given le détail d'un jour affichant une session, When je choisis « Delete », Then confirmation (FR11), retrait du détail et mise à jour de la grille.
7. **Édition sans bruit** *(ajout northwood, test terrain)* — Given le mode édition, Then l'historique est masqué, And « Delete session » est disponible dans le bandeau (confirmation FR11).

## Tasks / Subtasks

- [x] Task 1 : Backend — filtre `?date=` sur GET /api/sessions (AC: 1)
  - [x] `getAllPracticeSessions` : accepter un query param optionnel `date` — si présent : format `DATE_PATTERN` + calendaire valide sinon 400 `'Date must be a valid YYYY-MM-DD date'` ; ajouter `date` au `where` (même include items, même ordre) — le détail d'un jour = la même liste, filtrée
  - [x] Tests : where avec date quand fourni, sans date inchangé (régression), 400 format invalide
- [x] Task 2 : Service (AC: 1)
  - [x] `practiceSessionService.getAll(date?: string)` — param optionnel ajouté à l'URL (`?date=`) ; rétrocompatible (les appels existants sans argument inchangés)
- [x] Task 3 : Heatmap — sélection d'un jour + panneau de détail (AC: 1, 2, 4, 5)
  - [x] Cellules ACTIVABLES : `onClick` + Enter/Espace dans le `handleGridKeyDown` (APG : Enter active la cellule focusée) ; `aria-selected={date === selectedDate}` sur les cellules ; `cursor-pointer`
  - [x] État `selectedDate` ; à la sélection → fetch `getAll(selectedDate)` → panneau sous la grille : titre = la date (string brute, piège FR19), cartes session réutilisant le MARKUP du History 2.3 (instrument, durée, note pre-wrap/break-words, sous-liste d'entrées avec labels FR4) — PAS le composant (il vit dans MySessionsPage) : extraire le rendu d'une carte session en composant partagé `src/components/SessionCard.tsx` UNIQUEMENT si la duplication dépasse ~40 lignes, sinon dupliquer sobrement (pas de refactor risqué de MySessionsPage)
  - [x] **AC4** : chaque carte du panneau porte un lien « Edit » (`aria-label={'Edit session of ' + date}`) → `/my-sessions?edit=<uid>` via `<Link>` react-router
  - [x] **AC5** : jour vide sélectionné → panneau neutre « No practice on {date}. » + lien « Log a session for this day » → `/my-sessions?date=<date>` — formulation FACTUELLE (FR18 : pas de « tu aurais dû », pas d'urgence)
  - [x] États du panneau : loading / échec (« Day detail could not be loaded. ») / contenu — live region nommée « Day detail status »
  - [x] Sélection réinitialisée au changement d'année
- [x] Task 4 : Heatmap — navigation d'années (AC: 3)
  - [x] État `year` (défaut : année courante locale) ; boutons « Previous year » / « Next year » (aria-labels, chevrons + libellé année visible) ; Next DÉSACTIVÉ au-delà de l'année courante (les sessions futures n'existent pas) ; borne basse raisonnable (1900, cohérente avec le serveur)
  - [x] Changement d'année → refetch heatmap (le `useEffect` dépend déjà de `[year]` depuis la 3.1), reset `selectedDate` ET `focusedDate` (la garde 3.1 `tabbableDate` couvre déjà le stale, mais le reset explicite est plus propre)
- [x] Task 5 : MySessionsPage — deep-links d'entrée (AC: 4, 5)
  - [x] **🚨 DÉCISION TECHNIQUE CRITIQUE (lire Dev Notes)** : lire `window.location.search` DIRECTEMENT (pas `useSearchParams`) — le hook react-router exigerait un Router dans les 50 tests existants de la page qui rendent `<MySessionsPage />` nu ; `window.location` ne casse rien
  - [x] Au mount : `?date=YYYY-MM-DD` → si format valide ET ≤ aujourd'hui (local) → `setDate(param)` ; sinon ignorer silencieusement ; `?edit=<uid>` → mémoriser dans un ref, et à l'arrivée des sessions (handler allSettled), si une session correspond → `startEditSession(session)` ; introuvable → ignorer
  - [x] `?edit` GAGNE sur `?date` si les deux présents ; après application, nettoyer l'URL via `window.history.replaceState({}, '', '/my-sessions')` (pas de re-trigger au re-render, URL propre)
  - [x] Interactions à préserver : le prefill d'instrument 2.5 (un `?date` ne touche pas l'instrument ; un `?edit` passe par startEditSession qui met déjà `instrumentTouchedRef = true`) ; tous les acquis 2.x
- [x] Task 6 : Tests (AC: tous)
  - [x] Backend : 3 cas (filtre date, sans date, 400)
  - [x] Heatmap (`MyHeatmapPage.test.tsx` — **wrapper `MemoryRouter` requis désormais** : les `<Link>` exigent un contexte Router ; adapter les ~8 tests existants mécaniquement, c'est le SEUL changement autorisé sur eux) : clic sur un jour actif → panneau avec sessions/entrées ; Enter au clavier → même panneau ; jour vide → état neutre + lien « Log a session for this day » avec `href="/my-sessions?date=..."` ; lien Edit avec `href="/my-sessions?edit=..."` ; boutons d'années (Previous → année-1 + refetch + sélection reset ; Next désactivé sur l'année courante) ; échec du détail → message sans contenu mensonger
  - [x] MySessionsPage (`window.history.pushState` avant render pour simuler les params — AUCUN wrapper Router nécessaire) : `?date=` valide → champ Date pré-rempli ; `?date=` futur/invalide → ignoré (date du jour) ; `?edit=<uid>` → mode édition actif après chargement (bandeau visible) ; `?edit` introuvable → ignoré ; URL nettoyée après application ; **les 50 tests existants passent sans modification**
- [x] Task 7 : Validations finales
  - [x] Les DEUX suites + lint + build + scan NUL ; smoke 401 sur GET /sessions?date=... ; **test manuel Safari + Chrome** (accord rétro #2 — interactions clic/clavier nouvelles) — vérifier en vrai : clic sur un jour → détail → Edit → formulaire pré-chargé → retour heatmap

### Review Findings

- [x] [Review][Patch] Fetch heatmap sans garde d'annulation : deux changements d'année rapides → la réponse lente peint la MAUVAISE année sous le bon titre ; et `failed` jamais réinitialisé sur le chemin refetch (High, les 3 couches) [MyHeatmapPage]
- [x] [Review][Patch] Course delete ↔ changement de jour : le delete résolu pendant le chargement du jour B transforme null → [] → faux « No practice on B » + lien de création mensonger (Med, blind+edge) [handleDeleteSession — garde par ref du jour]
- [x] [Review][Patch] `deleteSessionUid` survit aux changements de sélection/année → dialog ouvert sur le mauvais contexte, confirmation aveugle (Med, edge) [reset dans changeYear + effet de sélection]
- [x] [Review][Patch] Jour FUTUR → « Log a session for this day » = lien mort (silencieusement ignoré à l'arrivée) — supprimer le lien quand date > aujourd'hui (Med, blind) [panneau]
- [x] [Review][Patch] La live region « History status » n'est plus toujours montée (cachée avec la carte en édition) — la maintenir montée en sr-only pendant l'édition (Med, blind) [MySessionsPage]
- [x] [Review][Patch] « Next year » se désactive sous le focus clavier → focus perdu vers body — gestion de focus au passage des bornes (Med, blind) [boutons d'années]
- [x] [Review][Patch] Deep-link ?edit : ref jamais nettoyée si le fetch échoue + application qui peut écraser un brouillon/courser un create — clear sur rejet, skip si loading (Med, edge) [MySessionsPage]
- [x] [Review][Patch] Nettoyage d'URL : ne retirer QUE edit/date (préserver autres params + hash), gérer les valeurs vides ; encodeURIComponent sur le date du service ; ?date < 1900 ignoré côté client (blind+edge+auditor, pack Low) [service + deep-links]
- [x] [Review][Patch] Bouton Delete du panneau sans garde in-flight (double-clic → DELETE dupliqué → fausse erreur) + aucun moyen de FERMER le panneau — disable pendant la requête + re-clic sur la case sélectionnée = toggle fermeture (Low, edge ×2) [panneau]
- [x] [Review][Patch] Trous de tests : touche Espace, branche delete-failure, toggle fermeture, lien futur supprimé (blind) [tests]
- _Écartés (4) : label de cellule périmé pendant le refetch (transitoire, couvert) ; désync location react-router via replaceState (aucun autre consommateur de search dans l'app) ; ?date pré-1900 atteignant le serveur (MIN_DATE le rejette proprement — et le patch 8 l'ignore désormais côté client) ; remount de la live region au cancel-edit (résolu par le patch 5)._

## Dev Notes

### Décisions de conception

**1. Le détail d'un jour = GET /sessions?date= (filtre), pas un nouvel endpoint.** La donnée est identique à l'historique (sessions + items + labels FR4) — un paramètre de filtre sur l'existant est plus simple, testable, et le payload d'un jour est minuscule.

**2. Panneau sous la grille, pas de modale.** Plus simple, accessible nativement (pas de focus-trap à gérer), et la grille reste visible pendant l'exploration (UJ-4 : « elle clique sur un jour sombre… »). La sélection est marquée `aria-selected`.

**3. 🚨 Deep-links sans `useSearchParams`.** Le hook react-router impose un `<Router>` ancêtre → les **50 tests existants** de MySessionsPage (qui rendent le composant nu) exploseraient tous. `window.location.search` au mount + `history.replaceState` pour nettoyer = zéro dépendance Router, zéro test cassé, comportement identique pour l'utilisateur. C'est un arbitrage testabilité > pureté SPA, documenté ici pour la review.

**4. Liens (pas de navigation programmatique) côté heatmap.** `<Link to="/my-sessions?...">` : sémantique (clic-milieu, copier l'URL fonctionnent), et le seul coût est le wrapper `MemoryRouter` dans les tests heatmap (8 tests récents, adaptation mécanique autorisée).

**5. Next year désactivé au-delà de l'année courante.** Les dates futures sont interdites partout (FR6) — naviguer vers 2027 n'afficherait que du vide trompeur.

**6. FR18 jusque dans les libellés du panneau vide.** « No practice on {date}. » + « Log a session for this day » : factuel, sans reproche ni urgence. L'auditor vérifiera mot à mot (comme en 3.1).

### Intelligence 3.1 (toute fraîche — la page heatmap a été durcie par la review d'aujourd'hui)

- La grille est APG-conforme (lignes-jours, roving tabindex, no-move aux bords, modificateurs ignorés, Home/End) — l'activation Enter/Espace S'AJOUTE au switch du `handleGridKeyDown` existant, ne pas le réécrire
- `tabbableDate` est gardé contre les dates périmées ; `monthByWeek` n'a plus de garde morte ; `computeLevels` a la règle « max personnel = 4 » — ne rien toucher à ces acquis
- Les niveaux/labels des cellules ne changent pas — la 3.2 ajoute l'interaction, pas le rendu des intensités
- Retours terrain 3.1 : northwood teste en Safari — le clic ET le clavier doivent marcher dans les deux navigateurs (accord rétro #2)

### Périmètre — garde-fous

- **PAS de rétro-import SongPlay** (3.3) — le détail d'un jour n'affiche QUE les sessions ; les « lectures historiques » visibles dans le détail arrivent en 3.3
- **PAS de modification du formulaire de session lui-même** — les deep-links ne font que pré-remplir/déclencher l'existant
- **PAS d'édition inline dans le panneau** — Edit renvoie au formulaire unique (décision 2.4 : un seul éditeur)
- Les 50 tests MySessionsPage passent SANS modification (le critère 2.5 reste la règle) ; les ~8 tests heatmap peuvent recevoir le wrapper Router, rien d'autre

### Testing standards

Identiques. Nouveauté : simuler les query params via `window.history.pushState({}, '', '/my-sessions?date=...')` AVANT le render — et le nettoyer entre les tests (afterEach → pushState '/').

### Project Structure Notes

- Modifiés : `backend/controllers/practicesessioncontroller.js` (getAllPracticeSessions + filtre), `backend/__tests__/...` (+3), `src/services/practiceSessionService.ts` (getAll param), `src/pages/MyHeatmapPage.tsx` (sélection, panneau, années, liens), `src/__tests__/MyHeatmapPage.test.tsx` (wrapper + nouveaux cas), `src/pages/MySessionsPage.tsx` (deep-links au mount), `src/__tests__/MySessionsPage.test.tsx` (+ cas deep-links UNIQUEMENT)
- Nouveau potentiel : `src/components/SessionCard.tsx` seulement si la duplication du markup carte dépasse ~40 lignes

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2] — FR16/17/18 + les 2 ajouts northwood du 2026-06-07
- [Source: _bmad-output/implementation-artifacts/3-1-ma-grille-annuelle-de-pratique.md] — Review Findings (grille APG durcie, acquis à préserver)
- [Source: src/pages/MySessionsPage.tsx — startEditSession, todayLocalDate] — le mode édition 2.4 à déclencher, le validateur de date local
- [Source: src/pages/MyHeatmapPage.tsx — handleGridKeyDown, tabbableDate] — à étendre, pas réécrire
- [Source: _bmad-output/project-context.md + epic-2-retro] — règles + accords actifs

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

- TDD : 2 tests backend RED → GREEN 47/47 ; heatmap 12/12 (7 existants adaptés au seul wrapper MemoryRouter + 5 nouveaux) ; MySessionsPage 55/55 (les 51 existants SANS modification + 4 deep-links)
- Suites : backend 76/76, frontend 142/142 ; lint 0 nouvelle erreur ; build OK ; zéro NUL
- Smoke : GET /api/sessions?date=... sans session → 401
- 🔄 Premier passage terrain de northwood → 3 ajouts demandés, ancrés dans epics.md et implémentés avant review :
  1. **Delete depuis le détail d'un jour** (ConfirmDialog, dialog fermé avant la requête, retrait du panneau + REFETCH de la grille — l'intensité du jour change)
  2. **Historique masqué en mode édition** (la liste sous le formulaire d'édition était confusante)
  3. **« Delete session » dans le bandeau d'édition** (l'historique masqué emportait son bouton Delete) — réutilise le flow 2.4, y compris le resetForm quand on supprime la session en cours d'édition
  Tests : +4 (frontend 146/146, dont les 51 MySessionsPage préexistants toujours inchangés)
- ⚠️ Test manuel Safari + Chrome (accord rétro #2) : À REFAIRE par northwood (parcours delete inclus) — parcours complet clic jour → détail → Edit → formulaire pré-chargé, et jour vide → Log a session for this day → date pré-remplie

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- AC4/AC5 (ajouts northwood) livrés : Edit depuis le détail → /my-sessions?edit=<uid> (déclenche startEditSession 2.4 à l'arrivée des sessions, uid inconnu ignoré) ; jour vide → Log a session for this day → /my-sessions?date= (validée format + calendaire + ≤ aujourd'hui, sinon ignorée)
- Décision window.location tenue : les 51 tests MySessionsPage passent sans Router ni modification ; URL nettoyée par replaceState après consommation
- Panneau de détail : fetch annulable (réponse lente d'un jour précédent ignorée), live region nommée, états distincts, markup carte 2.3 dupliqué sobrement (< 40 lignes)
- Année : Next désactivé au-delà de l'année courante, sélection et focus reset au changement
- Les 2 ajouts northwood (édition depuis le détail, création pré-datée) intégrés comme AC 4-5 avec leur traçabilité epics.md
- Décision critique documentée : deep-links via window.location (pas useSearchParams) pour préserver les 50 tests MySessionsPage ; Links react-router côté heatmap avec wrapper MemoryRouter assumé sur ses 8 tests
- FR18 étendu aux libellés du panneau vide (l'affordance de création est un choix utilisateur, pas une relance)

### File List

**Modifiés (aucun nouveau fichier — la carte session dupliquée fait < 40 lignes, pas d'extraction) :**
- backend/controllers/practicesessioncontroller.js (+ filtre ?date sur getAllPracticeSessions)
- backend/__tests__/practicesessioncontroller.test.js (+2 tests)
- src/services/practiceSessionService.ts (getAll(date?))
- src/pages/MyHeatmapPage.tsx (+ sélection/panneau de détail, activation Enter/Espace, navigation d'années, liens Edit et Log-for-this-day)
- src/__tests__/MyHeatmapPage.test.tsx (wrapper MemoryRouter + 5 tests)
- src/pages/MySessionsPage.tsx (+ deep-links ?edit/?date via window.location, application du edit à l'arrivée des sessions)
- src/__tests__/MySessionsPage.test.tsx (+4 tests deep-links)

## Change Log

- 2026-06-07 : Story 3.2 implémentée (détail de jour cliquable/clavier avec panneau, navigation d'années bornée, deep-links Edit et création pré-datée — les 2 ajouts northwood) — statut → review
- 2026-06-07 : Test terrain northwood (Safari/Chrome) — légende : la pastille « jour vide » prise pour le niveau le plus bas → retirée de la légende (niveaux d'activité seuls) ; rampe verte renforcée (niveau 1 : green-400 light / green-700 dark, progression resserrée) pour un « Less » lisible dans les deux modes
- 2026-06-07 : Revue 3 couches — 10 findings patchés (garde d'annulation du fetch heatmap, courses delete↔sélection, reset du dialog au changement de contexte, lien de log supprimé sur jour futur, live region History toujours montée en sr-only, gestion de focus aux bornes d'années, nettoyage du ref ?edit sur échec + garde anti-course avec un create en vol, nettoyage d'URL préservant params/hash + encodeURIComponent + borne 1900, disable in-flight + toggle fermeture du panneau, 8 tests ajoutés). 151 tests front + 76 back verts, build + lint + scan NUL OK — statut → done (sous réserve du passage manuel Safari/Chrome, accord rétro #2)
