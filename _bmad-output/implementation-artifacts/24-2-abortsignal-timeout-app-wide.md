---
baseline_commit: 5b1abd7fe6c530e6dca3cac20d968bb4e67daf28
# Corrigé au moment de la review : la story a été CRÉÉE à 614b23c, mais le travail a démarré
# après le merge d'Epic 24 et la release 2.1.1. Garder l'ancien baseline aurait produit un diff
# de review mêlant du travail sans rapport — et l'Acceptance Auditor s'en sert pour reconstruire
# le diff, donc il aurait audité autre chose que cette story.
---

# Story 24.2: Un lot abandonné ne doit plus écrire en silence — `AbortSignal`, timeout, et un récap qui survit à la page

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **que quitter une page arrête ce qui n'est pas encore parti, et qu'on me dise ce qui est parti quand même**,
so that **je ne retrouve jamais dans ma songlist un sous-ensemble inconnu de ce que j'avais coché**.

## Contexte / origine

Deuxième story d'**Epic 24** (dette technique). **Promue à la revue `deferred-work` du 2026-08-11**, où trois items (22-2, 22-4, et le *Delete selected* voisin) décrivaient le même trou.

C'est un finding **perte de données**, et l'**action item n°1 de la rétro Epic 21** dit qu'un finding perte-de-données **ne se defer pas** sur « fenêtre étroite ». Il l'a été une fois. Pas deux.

## Découverte de cadrage — À LIRE EN PREMIER

**1. « Annuler » ne défait RIEN, et ça déplace toute la story.** `AbortSignal` annule **l'attente du client**, pas le travail du serveur : un `POST` déjà parti aboutit et écrit. Donc « on annule le reste » laisserait quand même un sous-ensemble écrit, avec un utilisateur non informé — **exactement le problème qu'on prétend corriger**. La valeur n'est pas dans l'annulation, elle est dans le **fait de le raconter**.

**Décision northwood (2026-08-11) : vider la file + récap dans un toast global.** On arrête les items **pas encore partis** (pour eux, rien n'est écrit, c'est le vrai gain), on laisse aboutir ceux **déjà en vol**, et le récap remonte à un niveau qui **survit au démontage de la page**.

**2. Cette story RENVERSE une décision écrite, et il faut le dire.** `src/components/Toast.tsx:15` porte noir sur blanc : *« Callers keep their own `useState` + `setTimeout(2500)` — la convention du projet — et **deliberately NO global toast provider** »*. C'était juste en 22.5 : chaque toast appartenait à la page qui le déclenchait. **Ça ne l'est plus ici**, et pour une raison précise : le récap doit **survivre à la page qui a lancé le lot**. Un toast local meurt avec son composant, donc ne peut structurellement pas porter ce message.
⚠️ Le renversement est **borné** : on ajoute un canal global **pour les lots**, on **ne migre pas** les toasts existants. `project-context.md` devra être amendé.

**3. `main.tsx` a déjà le bon emplacement.** `AuthProvider` est **au-dessus** de `RouterProvider` (story 18.1, pour que `useAuth()` marche partout). Un `ToastProvider` au même niveau survit aux changements de route et aux démontages de page. Rien à réarchitecturer.

**4. `apiFetch` contient DÉJÀ un chemin qui ne se règle jamais — et il est volontaire.** `src/services/apiFetch.ts:49` : sur un **401**, il retourne `new Promise(() => {})` qui ne se règle **jamais**, délibérément (la page navigue vers `/login`, et résoudre afficherait une erreur de données trompeuse une fraction de seconde). Conséquence pour cette story : un lot qui prend un 401 en vol bloque `runBounded` **pour toujours** — un **second** mécanisme de blocage, distinct de celui décrit dans `deferred-work`. Le timeout doit donc être posé **au-dessus** de ce chemin, ou celui-ci explicitement exclu (il est suivi d'un rechargement complet, donc inoffensif en pratique). **À trancher, pas à ignorer.**

**5. Annuler les requêtes ne suffit pas : `runBounded` continue de tirer.** Ses workers bouclent sur un index partagé (`src/utils/runBounded.ts:22-35`) et ne connaissent aucun signal. Même toutes les requêtes avortées, la boucle irait au bout de la liste. **Le garde doit être dans la boucle**, pas seulement dans le `fetch`.

**6. Trois surfaces consomment `runBounded`**, pas une : `src/hooks/useBulkAddToSonglist.ts` (ajout groupé, 2 écrans), `src/pages/CatalogManage.tsx` (*Delete selected* **et** *Add to collection*), `src/pages/CatalogCollectionCompose.tsx` (*Remove selected*). Le trou est identique partout ; les traiter séparément re-créerait la divergence que l'Epic 22 a combattue.

**7. `mountedRef` est vérifié TROP TARD, mesuré.** `useBulkAddToSonglist.ts:60` teste `mountedRef.current` **après** que les N requêtes ont abouti. C'est ce qui produit le symptôme exact : les écritures atterrissent, `run` retourne `null`, aucun récap, aucune mise à jour du cache, et la sélection meurt avec le composant.

## Décisions applicables

- **A — Vider la file, laisser finir le vol, raconter** (northwood, ci-dessus). Les items non démarrés sont abandonnés **sans avoir rien écrit** ; ceux en vol vont au bout ; le total réel part dans un toast global.
- **B — Le canal global est ajouté POUR LES LOTS, et ne remplace rien.** Les toasts locaux existants restent tels quels. Aucun refactor de masse.
- **C — Le timeout est une borne de dernier recours**, pas un mécanisme de contrôle : il protège de la requête qui ne répond jamais (réseau mobile qui décroche), pas des lots lents. Valeur à choisir et à **justifier**, pas à copier d'un blog.
- **D — Rien ne change pour un lot qui se termine normalement.** Aucun récap déplacé, aucun libellé modifié, aucun test existant réécrit. Si un test de lot doit bouger, c'est un signal à examiner, pas une formalité.

## Acceptance Criteria

1. **`apiFetch` accepte un `AbortSignal` et une borne de durée** — le signal est propagé au `fetch` sous-jacent, y compris sur le **rejeu CSRF** (`apiFetch.ts:33-36`, qui refait un `fetch` : l'oublier laisserait une requête non annulable). Une requête avortée **rejette** de façon typée et distinguable d'un échec réseau.
2. **Le chemin 401 qui ne se règle jamais est traité explicitement** (découverte 4) : soit il reste hors du timeout avec la raison écrite, soit il est borné. Le comportement retenu figure dans les Completion Notes. **Ne pas le découvrir en production.**
3. **`runBounded` s'arrête de tirer des items dès que le signal est déclenché** — les workers cessent d'avancer dans la liste. Les items **jamais démarrés** sont rapportés comme tels, **distincts** d'un échec : ils n'ont rien écrit, et les compter en « failed » ferait croire à une erreur serveur.
4. **Les résultats restent dans l'ordre des items** — la garantie actuelle de `runBounded` (`allSettled`, ordre des items et non d'achèvement) est **préservée** ; les récaps segmentés en dépendent.
5. **Un lot interrompu par un démontage produit un récap qui survit à la page** — canal global monté au-dessus du router (découverte 3). Le message dit ce qui a **réellement** abouti, pas ce qui était sélectionné.
6. **Les trois surfaces sont traitées ensemble** (découverte 6) : ajout groupé (2 écrans), *Delete selected*, *Add to collection*, *Remove selected*. Aucune ne conserve l'ancien comportement.
7. **Une requête qui ne répond jamais ne laisse plus une fonctionnalité morte** — la borne de durée libère le lot, les boutons se réactivent, un récap est produit. Vérifié par un test qui simule une requête pendante, pas par relecture.
8. **Un lot qui se termine normalement est inchangé** (décision D) — mêmes récaps, mêmes libellés, mêmes seaux. Les tests existants de 22.2/22.3/22.4 passent **sans modification**. Toute réécriture d'un test existant doit être justifiée dans les Completion Notes.
9. **`project-context.md` est amendé** — la ligne « pas de système de toast global » ne doit plus décrire le contraire du code (découverte 2). Le renversement est écrit avec sa raison et sa **portée** (les lots seulement).
10. **Aucune modification du backend.** Aucun modèle, migration, contrôleur, route.

## Tasks / Subtasks

- [x] **Task 1 — `apiFetch`** (AC: 1, 2)
  - [x] `signal` accepté et propagé aux **deux** `fetch` (initial + rejeu CSRF).
  - [x] Borne de durée, avec la valeur **justifiée** dans les Completion Notes.
  - [x] Erreur d'annulation **typée** (à la manière de `RateLimitError`, déjà dans ce fichier), distinguable d'un échec réseau.
  - [x] Trancher le sort du chemin 401 (découverte 4) et l'écrire.
- [x] **Task 2 — `runBounded`** (AC: 3, 4)
  - [x] Le worker consulte le signal **avant de prendre l'item suivant**.
  - [x] Troisième issue par item : `fulfilled` / `rejected` / **jamais démarré**. Ne pas la maquiller en rejet.
  - [x] L'ordre des résultats reste celui des items — un test le verrouille.
- [x] **Task 3 — Canal de récap global** (AC: 5, 9)
  - [x] Provider monté **au-dessus** du router dans `main.tsx`, à côté d'`AuthProvider`.
  - [x] Réutiliser le composant `Toast` existant (`role="status"`, région montée en permanence) — **ne pas** en écrire un second.
  - [x] Amender `project-context.md` (portée du renversement).
- [x] **Task 4 — Les trois surfaces** (AC: 6, 7)
  - [x] `useBulkAddToSonglist` : signal déclenché au démontage, récap poussé dans le canal global.
  - [x] `CatalogManage` (*Delete selected*, *Add to collection*) et `CatalogCollectionCompose` (*Remove selected*) : même traitement.
  - [x] ⚠️ Vérifier `mountedRef` : le garde actuel (`useBulkAddToSonglist.ts:60`) devient partiellement redondant. **Le retirer ou le garder est une décision**, pas un oubli.
- [x] **Task 5 — Tests** (AC: 3, 4, 7, 8)
  - [x] Requête pendante bornée ; lot interrompu → récap correct ; items non démarrés comptés à part ; ordre préservé.
  - [x] **Les suites 22.2/22.3/22.4 doivent passer sans modification** (AC8). Un test qui casse est un signal.
  - [x] Baseline front à **mesurer** avant de commencer (557 au dernier relevé — le vérifier).
  - [x] **Vérifier les gardes par mutation**, avec **témoin neutre**. Trois fois cette semaine la mutation a attrapé un test qui passait pour une mauvaise raison, dont un que la relecture avait laissé filer.
- [ ] **Task 6 — Validation** (AC: 10)
  - [x] `npm test`, `npx tsc -b`, `npm run lint`. `git diff --name-only` : aucun fichier backend.
  - [ ] **Contrôle navigateur** : lancer un ajout groupé, quitter la page pendant le lot, constater le récap. La QA navigateur a trouvé ce que les couches vertes rataient **5 épics d'affilée** ; cette story est visible à l'écran.

### Review Findings

_Code review du 2026-08-11, **les 4 couches ont rendu**. Verdict : **NE PAS MERGER EN L'ÉTAT** — deux régressions introduites par cette story, dont une visible par l'utilisateur._

**🔴 BLOQUANT 1 — `RequestAbortedError` casse les 8 gardes `AbortError` de l'application.** Vérifié : `grep` trouve **8** occurrences de `err?.name === 'AbortError'` dans `src/pages` (`CatalogEntry:43`, `CatalogManage:163/177/235`, `CatalogCollectionCompose:140/164`, `Catalog:147`, `CatalogCollection:70`). Ces gardes servent à **ignorer une requête supplantée** (l'utilisateur tape dans la recherche, change de filtre, pagine). En renommant l'erreur, aucun ne matche plus. La couche Verification Gap l'a **démontré** en conditions réelles : sur la page Catalog, taper une recherche laisse un panneau « Something went wrong. » **permanent** — les résultats corrects sont chargés mais masqués, et `error` n'est jamais réinitialisé hors de l'effet. Aucun test ne l'attrape parce que les suites de pages mockent `catalogService`, donc `apiFetch` n'y tourne jamais. **Correctif** : ne typer que le vrai abandon (`error instanceof DOMException && error.name === 'AbortError'`) **et** préserver la compatibilité — soit en gardant `name = 'AbortError'`, soit en migrant les 8 gardes d'un bloc.

**🔴 BLOQUANT 2 — la borne de durée ne couvre pas `getCsrfToken()`, donc le chemin d'écriture reste non borné.** `csrf.ts:21` fait un `fetch` **sans signal**, et `apiFetch` l'`await` avant le sien. Si `/api/csrf-token` ne répond jamais, `apiFetch` ne se règle jamais, le minuteur avorte un contrôleur que personne n'écoute, et `deadline.release()` n'est jamais atteint — minuteur **et** écouteur fuités. C'est **exactement** le scénario que la story existe pour supprimer, et il subsiste sur **tous** les POST/PUT/PATCH/DELETE, donc sur les quatre lots. Mes deux tests passaient à côté : l'un est un GET (branche CSRF jamais prise), l'autre résout le jeton immédiatement.

**🟠 GRAVE 3 — la vérification de montage est passée APRÈS la boucle de classification**, donc `onSongKnown?.()` s'exécute désormais sur un composant démonté (`useBulkAddToSonglist:93/101`) — sur `Catalog.tsx:57` c'est `addToCache`, donc un `setState`. React 19 ne prévient plus : silencieux. Le comptage doit rester avant la vérification, les callbacks non.

**🟠 GRAVE 4 — le trou de couverture que j'avais annoncé est TROIS FOIS plus large que je ne l'ai écrit.** Mes Completion Notes le limitaient au hook. Mutations recompilables passées par l'Auditor : inverser `skipped` en `failed` tue **0** test dans le hook (comme annoncé), **0/22** dans `CatalogManage`, **0/14** dans `CatalogCollectionCompose`. **Aucune surface** ne verrouille la distinction que l'AC3 existe pour établir. Et les trois recaps de page (`showGlobalToast`) ne sont couverts par **rien** — supprimer le bloc entier laisse la suite verte.

**🟠 GRAVE 5 — un lot abandonné dont TOUT a échoué ne dit rien.** Les trois pages gardent sur le succès (`if (landed)`, `if (removed.length)`) alors que le hook, lui, parle aussi quand `failed > 0`. Les items en échec ont peut-être touché le serveur : c'est précisément le « sous-ensemble inconnu » à supprimer.

**🟡 Autres retenus** : « 1 **were** not started » (pluriel faux dans les 3 messages de page, alors que `describeAbandonedBatch` le gère) · **deux régions live identiques** une fois le provider monté, superposées au même pixel, et `getByRole('status', { name: 'Notification' })` devient ambigu pour toute page enveloppée · `Toast.tsx:15` **dit toujours** « deliberately NO global toast provider » — le fichier renversé n'a pas été touché · **aucun test ne protège la décision centrale** (le signal ne doit jamais atteindre les requêtes) : le rebrancher plus tard laisserait les 575 tests verts · `describeAbandonedBatch` rend `« ... : . »` sur un récap vide · `batchAbortRef` partagé par 3 lots dans `CatalogManage`, jamais remis à `null`.

**AC7 déclassée en UNPROVEN par l'Auditor**, à raison : le test de requête pendante s'arrête à `apiFetch` ; rien ne prouve que le **lot** se libère, que les boutons se réactivent, ni qu'un récap est produit — or l'AC exige explicitement de ne pas l'établir par relecture.

**✅ LES 2 BLOQUANTS SONT CORRIGÉS (2026-08-11).**

- **Bloquant 1** — `RequestAbortedError` garde désormais `name = 'AbortError'`. Les 8 gardes des pages continuent de fonctionner, et `instanceof RequestAbortedError` reste disponible pour qui veut le détail : on ne perd rien en gardant le nom conventionnel. Au passage, le classement se fait sur **l'erreur** et non sur l'état du signal — un échec réseau tombant dans le même tick qu'un abandon n'est plus maquillé en annulation.
- **Bloquant 2** — l'attente du jeton CSRF est bornée par `abortableWait()`. ⚠️ **Pas** en passant le signal à `getCsrfToken()` : il déduplique les appels concurrents derrière **une** requête partagée, donc le timeout d'un seul appelant aurait tué le jeton de tous les autres. On interrompt uniquement **notre attente**, jamais la requête partagée.

Front **575 → 578**. Mutations : `name` remis à `RequestAbortedError` ⇒ 1 test meurt ; attente du jeton dé-bornée ⇒ 1 test meurt. Deux de mes tests antérieurs assertaient `name: 'RequestAbortedError'` — réalignés sur le contrat corrigé, ce qui est le sens même du correctif.

**⚠️ RESTENT OUVERTS, non traités ici** : les constats 3, 4, 5 (vérification de montage après la boucle, couverture nulle des 3 surfaces, lot tout-en-échec silencieux), les points jaunes, et **la QA navigateur**.

## Dev Notes

### Le piège central

Il n'est pas dans `AbortSignal`, il est dans **ce qu'on raconte**. Annuler ne défait pas les écritures : si le récap ment ou n'arrive pas, la story n'a rien corrigé — elle a juste rendu le lot plus court. **Le canal global est la story ; l'annulation n'en est que la moitié la moins importante.**

### Pièges

- **Le rejeu CSRF est un second `fetch`** (`apiFetch.ts:33-36`). Oublier d'y passer le signal laisse une requête non annulable, exactement sur le chemin des écritures (méthodes mutantes).
- **Le chemin 401 ne se règle jamais, volontairement.** Ne pas le « réparer » par réflexe : il est suivi d'un rechargement complet. C'est le timeout qui doit en tenir compte, pas l'inverse.
- **Ne pas compter un item jamais démarré comme un échec.** Il n'a rien écrit ; l'afficher en « failed » ferait chercher une panne serveur inexistante — même famille que les gardes qui crient sur le cas normal (rétro Epic 23).
- **L'ordre des résultats est contractuel** (`runBounded.ts:8-10`) : les récaps segmentés lisent `results[i]` en face de `uids[i]`.
- **Un `AbortController` par lot, pas par requête** — sinon on ne peut pas vider la file d'un coup.
- **StrictMode double le montage** : un provider ou un `useEffect` de nettoyage mal écrit déclencherait une annulation au premier démontage simulé. C'est le piège qui a mordu en 19.4 et 18.x ; les tests du projet rendent en `StrictMode` **par défaut**.

### Anchors code (lus, non devinés)

- `src/services/apiFetch.ts:23-61` — les deux `fetch`, le rejeu CSRF, le 401 qui ne se règle jamais (`:49`), le 429 typé (`RateLimitError`) qui sert de **modèle d'erreur typée**.
- `src/utils/runBounded.ts:14-43` — l'index partagé, la garantie d'ordre, le repli sur limite non finie.
- `src/hooks/useBulkAddToSonglist.ts:52-95` — `mountedRef` testé **après** le lot (`:60`), le `finally`, les 4 seaux typés.
- `src/pages/CatalogManage.tsx`, `src/pages/CatalogCollectionCompose.tsx` — les deux autres consommateurs.
- `src/components/Toast.tsx:13-25` — la décision « pas de provider global » **que cette story renverse**, et la région live à réutiliser.
- `src/main.tsx:13-15` — `AuthProvider` au-dessus de `RouterProvider` : l'emplacement du nouveau provider.

### Project Structure Notes

- **UPDATE** : `src/services/apiFetch.ts`, `src/utils/runBounded.ts`, `src/hooks/useBulkAddToSonglist.ts`, `src/pages/CatalogManage.tsx`, `src/pages/CatalogCollectionCompose.tsx`, `src/main.tsx`, `_bmad-output/project-context.md`.
- **NEW** : un contexte de récap global (+ son test).
- **Aucun** fichier backend.
- Conventions front : TypeScript strict, `verbatimModuleSyntax` (imports de types en `import type`), Tailwind uniquement, tests en Testing Library sous `StrictMode`.

### References

- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` § « ⬆️ PROMU EN STORY le 2026-08-11 — `AbortSignal` + timeout app-wide »]
- [Source: `_bmad-output/implementation-artifacts/epic-22-retro-2026-08-10.md` — la QA navigateur trouve ce que 3 couches vertes ratent, 5ᵉ épic d'affilée]
- [Source: `_bmad-output/implementation-artifacts/epic-23-retro-2026-08-11.md` — vérification par mutation, affirmations mesurées]
- [Source: `_bmad-output/project-context.md` — toasts, StrictMode, conventions front]

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev-story)

### Debug Log References

**Baseline front mesurée** : 557 / 61 suites. Après : **575 / 63** (+18). Backend **inchangé à 572** — cette story ne touche pas le back. `tsc` et les deux lints propres.

**AC8 tenue, avec une exception justifiée.** Un seul test existant a bougé : `forwards a GET url and init to fetch unchanged`, qui affirmait que `init` est transmis **strictement** tel quel — or il porte désormais un `signal`. Son intention (« une méthode sûre passe sans machinerie CSRF ») est préservée en vérifiant les champs de l'appelant **et** le signal, plutôt qu'en relâchant l'assertion. Les suites 22.2 / 22.3 / 22.4 passent sans modification.

**⚠️ Trois de mes propres tests étaient faux, et la mutation les a démasqués :**
1. Mon mock de `fetch` **ignorait le signal** alors que le vrai `fetch` rejette — le test attendait une promesse qui ne venait jamais et accusait le code à tort.
2. Mon test « un second lot remplace le premier » ne levait **qu'un seul** message : il passait contre n'importe quelle implémentation.
3. Le plus instructif : mes deux tests du hook plaçaient `useBulkAddToSonglist` dans le composant **parent** et simulaient le départ en changeant ce qu'il *rend*. Le composant n'étant jamais démonté, le `useEffect` de nettoyage ne tournait pas — **le test mesurait un abandon qui n'avait pas lieu**. Détecté parce que les 8 items partaient quand même.

**Mon harnais de mutation était cassé, lui aussi.** Il comptait les échecs via `grep "Tests: N failed"` — or une mutation qui casse la **compilation** TypeScript ne produit pas cette ligne, et il rapportait alors `0`, indistinguable de « garde non couvert ». Trois gardes ont été déclarés « survivants » à tort. Refait avec des mutations qui compilent et une détection explicite du « suite ne compile pas ».

| mutation (recompilable) | tests qui meurent |
|---|---|
| garde d'annulation de la file retiré | **3** |
| `abortRef.abort()` retiré du démontage | **1** |
| minuteur de timeout jamais armé | **1** |
| **`skipped` recompté en `failed`** | **0 — NON COUVERT, cf. ci-dessous** |
| *(témoin neutre)* | *0, comme attendu* |

### Completion Notes List

- **Le signal pilote LA FILE, pas les requêtes — c'est le point de conception de la story.** Le passer aux `fetch` annulerait des appels côté client alors que le serveur a peut-être déjà écrit : on retrouverait des écritures dont personne ne peut rendre compte, exactement le bug à supprimer. Donc les requêtes **en vol vont au bout** et sont rapportées honnêtement ; seules celles **jamais démarrées** sont abandonnées — et elles, elles n'ont rien écrit. C'est la décision A, et l'implémentation l'a rendue littérale.
- **`BatchSkippedError` plutôt qu'un troisième statut** : le tableau garde le type `PromiseSettledResult`, donc zéro remous de typage pour les trois consommateurs, tout en restant **distinguable par type** — le motif déjà idiomatique du projet (`SongConflictError`, `CatalogNotFoundError`).
- **Le renversement de la décision « pas de toast global » est borné et écrit.** `GlobalToastProvider` est monté au-dessus du router, réutilise le composant `Toast` existant (même région live), et `project-context.md` est amendé avec la portée : **les lots seulement**, les toasts de page ne bougent pas.
- **`apiFetch` : le chemin 401 reste délibérément non borné** (AC2). Il est suivi d'un rechargement complet ; le borner ferait rejeter une promesse dont la page ne verra jamais le résultat, et réintroduirait l'erreur de données trompeuse supprimée en 5.1. Le minuteur est en revanche **libéré** sur ce chemin — un test vérifie qu'il ne fuit pas.
- **Timeout à 30 s, volontairement généreux** : il doit protéger de la requête qui ne répond **jamais**, pas arbitrer la lenteur. Un faux abandon ressemblerait à un échec pour l'utilisateur.
- **`AbortSignal.any()` écarté** : jsdom ne l'implémente pas, les tests auraient exercé un chemin différent du navigateur — précisément le genre d'écart qui mord ce projet. Composition écrite à la main.
- **`handleDeleteSelected` passait par `Promise.allSettled`** : ni borné ni annulable. Converti à `runBounded` pour que les trois surfaces partagent le même régime (AC6).
- **⚠️ TROU CONNU ET ASSUMÉ, à traiter en review** : aucun test n'assère que `skipped` est classé **dans `skipped` et non dans `failed`** au niveau du hook. La mutation le confirme (0 test ne meurt). `BatchSkippedError` est bien couvert dans `runBounded`, et le message utilisateur l'est dans `describeAbandonedBatch` — c'est la **classification intermédiaire** qui n'est pas verrouillée. Non comblé ici parce que `run()` ne rend son récap que monté, donc l'assertion demande un scénario monté-mais-annulé qui n'existe pas naturellement. À combler, pas à oublier.
- **⚠️ QA NAVIGATEUR NON FAITE** (Task 6, case laissée décochée). C'est le gate de northwood, et la rétro Epic 22 rappelle que la QA navigateur trouve ce que trois couches vertes ratent — **cinq épics d'affilée**. Cette story est visible à l'écran : lancer un ajout groupé, quitter la page pendant le lot, constater le récap.

### File List

- **NEW** `src/contexts/GlobalToastContext.ts` — contexte + hook (scindé du composant : règle ESLint `react-refresh/only-export-components`).
- **NEW** `src/contexts/GlobalToastProvider.tsx` — provider, réutilise `<Toast>`.
- **NEW** `src/__tests__/GlobalToastProvider.test.tsx` — 5 tests.
- **NEW** `src/__tests__/useBulkAddToSonglist.test.tsx` — 4 tests.
- **UPDATE** `src/services/apiFetch.ts` — `REQUEST_TIMEOUT_MS`, `RequestAbortedError`, composition du signal, rejeu CSRF borné.
- **UPDATE** `src/utils/runBounded.ts` — `signal` optionnel, `BatchSkippedError`, garde dans la boucle.
- **UPDATE** `src/hooks/useBulkAddToSonglist.ts` — contrôleur par lot, seau `skipped`, récap global au démontage, `describeAbandonedBatch`.
- **UPDATE** `src/pages/CatalogManage.tsx` — *Delete selected* (converti à `runBounded`) et *Add to collection*.
- **UPDATE** `src/pages/CatalogCollectionCompose.tsx` — *Remove selected*.
- **UPDATE** `src/main.tsx` — provider au-dessus du router.
- **UPDATE** `src/__tests__/apiFetch.test.ts`, `src/utils/runBounded.test.ts` — nouveaux tests + 1 test existant réaligné (justifié).
- **UPDATE** `_bmad-output/project-context.md` — amendement AC9.

Aucun fichier backend (AC10).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-11 | 0.1 | Story créée (create-story). **Découverte qui déplace la story** : `AbortSignal` annule l'attente du client, pas le travail du serveur — « annuler le reste » laisserait quand même un sous-ensemble écrit et l'utilisateur non informé. La valeur est donc dans le **récit**, pas dans l'annulation. Décision northwood : vider la file (les items non partis n'écrivent rien), laisser aboutir ceux en vol, et remonter le récap dans un **toast global**. ⚠️ Cette story **renverse une décision écrite** (`Toast.tsx:15` : « deliberately NO global toast provider », story 22.5) — renversement borné aux lots, `project-context.md` à amender (AC9). Deux autres découvertes : `apiFetch:49` contient déjà un chemin qui ne se règle **jamais** (401 volontaire) qui bloquerait un lot indépendamment du sujet, et `runBounded` continue de tirer des items même toutes requêtes avortées — le garde doit être dans la boucle. Trois surfaces consommatrices, à traiter ensemble. | northwood |
