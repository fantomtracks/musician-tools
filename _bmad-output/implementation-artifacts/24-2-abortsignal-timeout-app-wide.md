---
baseline_commit: 614b23c0130f4a84e8bec838f5927cc17f65bb25
---

# Story 24.2: Un lot abandonné ne doit plus écrire en silence — `AbortSignal`, timeout, et un récap qui survit à la page

Status: ready-for-dev

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

- [ ] **Task 1 — `apiFetch`** (AC: 1, 2)
  - [ ] `signal` accepté et propagé aux **deux** `fetch` (initial + rejeu CSRF).
  - [ ] Borne de durée, avec la valeur **justifiée** dans les Completion Notes.
  - [ ] Erreur d'annulation **typée** (à la manière de `RateLimitError`, déjà dans ce fichier), distinguable d'un échec réseau.
  - [ ] Trancher le sort du chemin 401 (découverte 4) et l'écrire.
- [ ] **Task 2 — `runBounded`** (AC: 3, 4)
  - [ ] Le worker consulte le signal **avant de prendre l'item suivant**.
  - [ ] Troisième issue par item : `fulfilled` / `rejected` / **jamais démarré**. Ne pas la maquiller en rejet.
  - [ ] L'ordre des résultats reste celui des items — un test le verrouille.
- [ ] **Task 3 — Canal de récap global** (AC: 5, 9)
  - [ ] Provider monté **au-dessus** du router dans `main.tsx`, à côté d'`AuthProvider`.
  - [ ] Réutiliser le composant `Toast` existant (`role="status"`, région montée en permanence) — **ne pas** en écrire un second.
  - [ ] Amender `project-context.md` (portée du renversement).
- [ ] **Task 4 — Les trois surfaces** (AC: 6, 7)
  - [ ] `useBulkAddToSonglist` : signal déclenché au démontage, récap poussé dans le canal global.
  - [ ] `CatalogManage` (*Delete selected*, *Add to collection*) et `CatalogCollectionCompose` (*Remove selected*) : même traitement.
  - [ ] ⚠️ Vérifier `mountedRef` : le garde actuel (`useBulkAddToSonglist.ts:60`) devient partiellement redondant. **Le retirer ou le garder est une décision**, pas un oubli.
- [ ] **Task 5 — Tests** (AC: 3, 4, 7, 8)
  - [ ] Requête pendante bornée ; lot interrompu → récap correct ; items non démarrés comptés à part ; ordre préservé.
  - [ ] **Les suites 22.2/22.3/22.4 doivent passer sans modification** (AC8). Un test qui casse est un signal.
  - [ ] Baseline front à **mesurer** avant de commencer (557 au dernier relevé — le vérifier).
  - [ ] **Vérifier les gardes par mutation**, avec **témoin neutre**. Trois fois cette semaine la mutation a attrapé un test qui passait pour une mauvaise raison, dont un que la relecture avait laissé filer.
- [ ] **Task 6 — Validation** (AC: 10)
  - [ ] `npm test`, `npx tsc -b`, `npm run lint`. `git diff --name-only` : aucun fichier backend.
  - [ ] **Contrôle navigateur** : lancer un ajout groupé, quitter la page pendant le lot, constater le récap. La QA navigateur a trouvé ce que les couches vertes rataient **5 épics d'affilée** ; cette story est visible à l'écran.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-11 | 0.1 | Story créée (create-story). **Découverte qui déplace la story** : `AbortSignal` annule l'attente du client, pas le travail du serveur — « annuler le reste » laisserait quand même un sous-ensemble écrit et l'utilisateur non informé. La valeur est donc dans le **récit**, pas dans l'annulation. Décision northwood : vider la file (les items non partis n'écrivent rien), laisser aboutir ceux en vol, et remonter le récap dans un **toast global**. ⚠️ Cette story **renverse une décision écrite** (`Toast.tsx:15` : « deliberately NO global toast provider », story 22.5) — renversement borné aux lots, `project-context.md` à amender (AC9). Deux autres découvertes : `apiFetch:49` contient déjà un chemin qui ne se règle **jamais** (401 volontaire) qui bloquerait un lot indépendamment du sujet, et `runBounded` continue de tirer des items même toutes requêtes avortées — le garde doit être dans la boucle. Trois surfaces consommatrices, à traiter ensemble. | northwood |
