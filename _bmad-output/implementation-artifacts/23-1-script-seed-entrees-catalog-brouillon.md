---
baseline_commit: 3416f6f919a8b7363d94813c8e78a2221b8158dc
---

# Story 23.1: Script de seed — créer les entrées Catalog en brouillon

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curateur**,
I want **créer d'un coup les entrées Catalog correspondant aux chansons déjà saisies en prod**,
so that **le Catalog cesse d'être vide et devienne curable**.

## Contexte / origine

Première story d'**Epic 23**. Les Epics 19 → 22 ont construit tout l'outillage du Catalog au-dessus d'un pool **quasi vide** (5 entrées constatées en QA). Cette story remplit le pool.

**Ordre imposé : 23.1 → 23.2 → 23.3 → 23.4.** Celle-ci ne fait que **créer les entrées** ; le rattachement des Songs existantes est 23.2, les alias et la correction orthographique 23.3, la répétition sur dump prod 23.4.

**Les deux fichiers d'entrée sont déjà versionnés et prêts** (commit `3416f6f`) :
- `backend/scripts/seed/catalog-seed.csv` — **82 lignes**, colonnes `artist,title`, sans email, zéro doublon de fold ;
- `backend/scripts/seed/catalog-seed-aliases.csv` — 9 lignes, **utilisées seulement en 23.3**, à ignorer ici.

## Découverte de cadrage — À LIRE EN PREMIER

**1. L'index canonique du Catalog n'est PAS partiel — il couvre les brouillons.** Les notes de la story 19.6 le décrivent comme « PARTIEL (published only, 409 au Publish) ». **C'est faux** : la migration `20260716000100` dit *« the 19.1 canonical unique index is untouched, so every row (draft or published) is unique »*, et aucune migration ne crée d'index partiel ni ne supprime `catalog_songs_title_artist_ci`. Conséquence : **une insertion en doublon lève 23505 immédiatement, même en brouillon**. Le script doit donc sauter ce qui existe. **Justification exacte** : la ré-exécution (un second `--apply` ne doit rien créer) et le contenu du Catalog de **prod**, inconnu depuis le poste de dev. *(Correction : une première version de cette story citait « Numb » comme collision avérée — faux, le `grep -i` avait matché « My Number ». Sur la base de dev, les 82 lignes ne collisionnent avec aucune des 5 entrées existantes.)*

**2. L'invariant 3 de l'epic est imprécis, et le suivre à la lettre serait un bug.** Il dit « le fold doit être celui de l'app : `lower` + `f_unaccent` ». En réalité le projet a **deux folds distincts** :
- **fold d'IDENTITÉ** (unicité, détection de doublon) : `lower(title)` + `COALESCE(lower(artist), '')` — **accents CONSERVÉS**. C'est l'expression exacte de l'index `catalog_songs_title_artist_ci`, et celle du helper `findExistingByTitleArtist` (`catalogcontroller.js:41-50`).
- **fold de RECHERCHE** (LIKE du browse) : `lower(f_unaccent(...))` via `foldedLike` (`catalogcontroller.js:237-241`).

**C'est le fold d'IDENTITÉ qu'il faut ici.** Utiliser `f_unaccent` ferait considérer « Hôtel California » et « Hotel California » comme la même entrée, alors que la base les tient pour distinctes → on sauterait une création légitime. L'epic sera amendée en conséquence.

## Décisions applicables (verrouillées au cadrage)

- **A — Seed en BROUILLON** : `publishedAt = NULL`. Une fiche seedée n'a que titre + artiste ; publiée, un « Refresh » écraserait la tonalité et le tempo du user avec du vide. En brouillon le lien reste dormant et s'allume quand le curateur publie.
- **C — Script one-off manuel**, idempotent, avec `--dry-run`. **Ce n'est pas une migration** : rien ne doit se déclencher au déploiement.
- **E — Le CSV est déjà nettoyé** : ne pas re-nettoyer, ne pas « corriger » quoi que ce soit à l'exécution. Le fichier est la source de vérité.

## Acceptance Criteria

1. **Le script existe et ne s'exécute jamais tout seul** — `backend/scripts/seed-catalog.js`, CommonJS, lancé à la main. Il n'est référencé ni par `release_command`, ni par une migration, ni par un script npm de déploiement. Un `npm run seed:catalog` est acceptable **s'il** est documenté comme manuel.
2. **`--dry-run` n'écrit rien** et rapporte : lignes lues, entrées à créer, entrées sautées **avec leur raison** (`déjà au Catalog` / `ligne vide ou incomplète` / `doublon interne au fichier`). Le mode dry-run est le **défaut** ; écrire exige un drapeau explicite (`--apply`).
3. **Skip sur le fold d'IDENTITÉ** — pour chaque ligne, l'existence est testée avec `lower(title)` + `COALESCE(lower(artist),'')`, accents conservés (cf. Découverte 2). Réutiliser la **logique** de `findExistingByTitleArtist` plutôt que d'en réécrire une variante. Une entrée déjà présente — brouillon **ou** publiée — est sautée, jamais mise à jour.
4. **Création en brouillon** — `publishedAt = NULL`, `title` et `artist` renseignés depuis le CSV, **aucun autre champ inventé** (pas de `key`, `bpm`, `mode`, `timeSignature`, `durationSeconds`, `language`, `genre`, `streamingLinks`). Les valeurs par défaut du modèle s'appliquent telles quelles.
5. **Idempotence prouvée, pas supposée** — une seconde exécution `--apply` crée **zéro** entrée et le rapporte. Un test le vérifie.
6. **Le 23505 reste impossible en pratique, et survivable en théorie** — même avec le skip, une course (deux exécutions simultanées) peut lever une contrainte d'unicité. Le script attrape l'erreur par ligne, la compte comme « sautée (conflit) », et **continue** — un lot ne s'arrête pas sur une ligne.
7. **Rapport final lisible** — total lu, créées, sautées par raison, et la **liste nominative des sautées** (au moins les 20 premières, puis un compte). Sortie sur stdout ; le script rend un code de sortie non nul **uniquement** si le fichier est illisible ou la connexion échoue — une ligne sautée n'est pas un échec.
8. **Aucune modification du schéma, du modèle, d'un contrôleur, d'une route ou du front.** Aucune migration.

## Tasks / Subtasks

- [x] **Task 1 — Squelette du script et connexion** (AC: 1)
  - [x] `backend/scripts/seed-catalog.js` en **CommonJS** (`require`/`module.exports`) — le backend n'est pas en ESM et n'a pas de TypeScript.
  - [x] Connexion via `require('../models')` (source de vérité, cf. § *Pièges*). **Ne pas** instancier un `new Sequelize` maison.
  - [x] Parsing des arguments : `--apply` (défaut = dry-run), `--file=<chemin>` (défaut `seed/catalog-seed.csv`). Fermer la connexion en `finally`.
- [x] **Task 2 — Lecture et validation du fichier** (AC: 2, 3)
  - [x] Lire le CSV. **Attention aux titres contenant une virgule** — `Little Lord Fentanyl (feat. Puscifer)` n'en a pas, mais `I Got You (I Feel Good)` non plus ; vérifier tout de même le fichier avant de choisir un split naïf, et préférer un parsing qui gère les guillemets.
  - [x] Ignorer l'en-tête, ignorer les lignes vides ; `title` vide ⇒ ligne invalide (le modèle a `title allowNull: false`), `artist` vide est **légal** (`allowNull: true`).
  - [x] Détecter les doublons **internes au fichier** sur le fold d'identité et n'en garder qu'un, en le comptant.
- [x] **Task 3 — Skip et création** (AC: 3, 4, 5, 6)
  - [x] Pour chaque ligne : chercher l'existant sur le fold d'identité ; si trouvé → sauter avec la raison ; sinon, en mode `--apply`, `CatalogSong.create({ title, artist, publishedAt: null })`.
  - [x] Envelopper la création dans un `try/catch` par ligne : une `SequelizeUniqueConstraintError` compte comme « sautée (conflit) », le lot continue.
- [x] **Task 4 — Rapport** (AC: 2, 7)
  - [x] Récapitulatif chiffré + liste nominative des sautées. En dry-run, le rapport dit explicitement **qu'aucune écriture n'a eu lieu**.
- [x] **Task 5 — Tests** (AC: 5)
  - [x] `backend/__tests__/seedCatalog.test.js` avec `jest.mock('../models')` (**pas de vraie base**, convention du projet) : le fichier est parsé, une entrée existante est sautée, une nouvelle est créée avec `publishedAt: null`, un doublon interne n'est créé qu'une fois, une `SequelizeUniqueConstraintError` sur une ligne n'interrompt pas le lot, et le mode dry-run n'appelle **jamais** `create`.
  - [x] Extraire la logique testable (parsing + décision) d'une fonction exportée ; le `main()` qui se connecte reste fin et non testé.
- [x] **Task 6 — Validation** (AC: 8)
  - [x] `cd backend && npm test` et `npm run lint`. Baseline backend à mesurer **avant** de commencer (`cd backend && npm test 2>&1 | tail -3`) — la rétro Epic 22 interdit d'écrire un compteur non mesuré.
  - [x] `git diff --stat` doit ne montrer que le script, son test, et éventuellement `package.json` — aucun modèle, aucune migration, aucun contrôleur.

## Dev Notes

### Pièges

- **`NODE_ENV` non défini vaut `production`** (`backend/models/index.js:8`, `config/config.js:3`). Un script lancé sans précaution en local **se connecterait à la base de prod**. Exporter `NODE_ENV=development` est **obligatoire** en local, et le script doit **afficher l'environnement et l'hôte de la base au démarrage** pour qu'on ne se trompe jamais de cible. C'est un seed de contenu : se tromper de base, c'est polluer la prod.
- **La connexion Sequelize est créée deux fois dans ce projet** (`db.js` puis `models/index.js`) — la source de vérité est **`models/index.js`** (project-context). Faire `const { CatalogSong, sequelize } = require('../models')`.
- **Ne pas utiliser `f_unaccent` ici** (cf. Découverte 2). Le fold d'identité conserve les accents.
- **Ne pas passer par le contrôleur ni par HTTP.** `createCatalogEntry` exige une session curateur et applique des normalisations de saisie ; un script parle au modèle.
- **`publishedAt: null` doit être explicite.** Ne pas compter sur le défaut : la colonne a `defaultValue: null`, mais l'écrire rend l'intention lisible et protège d'un changement de défaut.
- **Le CSV d'entrée ne contient ni email ni nom d'utilisateur** — c'est délibéré (le fichier d'origine, lui, en contient). Ne pas « enrichir » le seed depuis `backups/`.

### Anchors code (lus, non devinés)

- `backend/models/catalogsong.js` — `title allowNull: false`, `artist allowNull: true`, `publishedAt` nullable ; le commentaire en tête rappelle que l'index unique fonctionnel **n'est pas déclaré dans le modèle** (il vit dans la migration) pour que `sync({alter:false})` ne tente pas de le recréer.
- `backend/migrations/20260715000000-create-catalog-songs.js:104-108` — `CREATE UNIQUE INDEX catalog_songs_title_artist_ci ON "CatalogSongs" (lower(title), COALESCE(lower(artist), ''))`. **C'est la définition de l'identité.**
- `backend/migrations/20260716000100-add-published-at-to-catalog-songs.js:1-7` — la phrase qui corrige la note de 19.6.
- `backend/controllers/catalogcontroller.js:41-50` — `findExistingByTitleArtist`, la logique de recherche d'existant **à réutiliser** (mêmes `fn('lower', …)` / `fn('coalesce', …)`).
- `backend/scripts/release-migrate.js` — le seul script existant : très fin, `execSync`, code de sortie propre. Modèle de **forme**, pas de fond (lui délègue à sequelize-cli).
- `backend/models/index.js:1-20` — le bootstrap de connexion.

### Project Structure Notes

- **NEW** : `backend/scripts/seed-catalog.js`, `backend/__tests__/seedCatalog.test.js`.
- **EXISTANT, ne pas modifier** : `backend/scripts/seed/catalog-seed.csv` (82 lignes), `backend/scripts/seed/catalog-seed-aliases.csv` (9 lignes, pour 23.3).
- **Aucun** changement de modèle, migration, contrôleur, route, ni front.
- Conventions backend (project-context) : **CommonJS uniquement**, jamais d'`import`/`export` ; pas de `.ts` dans `backend/` ; erreurs loguées via `winston` si le script en a besoin, sinon `console` suffit pour un outil manuel.

### Testing Standards

- Suite backend : `backend/jest.config.js`, env node, tests dans `backend/__tests__/`, lancés par `cd backend && npm test`.
- **Les modèles se mockent** (`jest.mock('../models')`) — pas de base réelle dans les tests, c'est la convention du projet pour tout ce qui touche Sequelize.
- Le hook husky pre-commit lance les **deux** suites (front + back) ; jamais de `--no-verify`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` § Epic 23 — décisions A/C/E et invariants]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` § « Candidate epic — amorcer le Catalog » — l'analyse d'origine]
- [Source: `_bmad-output/implementation-artifacts/epic-22-retro-2026-08-10.md` — action item n°1 : aucune affirmation numérique non mesurée]
- [Source: `_bmad-output/project-context.md` — CommonJS backend, piège `NODE_ENV`, mock des modèles]

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev-story)

### Debug Log References

- Baseline backend **mesurée avant de commencer** : `cd backend && npm test` → **372 tests** (action item n°1 de la rétro Epic 22).
- TDD : `npx jest seedCatalog` → RED (module absent) → **13/13**.
- Suite backend complète : **385/385** (372 + 13). `npm run lint` backend clean.
- **Exécution réelle du script** (`NODE_ENV=development node scripts/seed-catalog.js`) : il annonce environnement + base + mode, puis échoue proprement sur `The server does not support SSL connections` avec un code de sortie non nul. **Problème d'environnement, pas de la story** — la config dev exige SSL (piège documenté dans `project-context`) et le Postgres local ne le propose pas dans son état actuel. C'est précisément ce que la story 23.4 doit régler avec le dump prod restauré.
- **Vérification de bout en bout sans base** : le vrai fichier de 82 lignes traverse `parseSeedCsv` + `seedCatalog` avec un modèle simulé → **82 valides, 0 sautée au parsing**, première `AC/DC — Back in Black`, dernière `Vulfpeck — Dean Town`.

### Completion Notes List

- **⚠️ CORRECTION D'UNE AFFIRMATION FAUSSE QUE J'AVAIS ÉCRITE.** Le cadrage, cette story, le suivi et deux messages de commit affirmaient que « Numb » était déjà au Catalog **et** dans le CSV, comme preuve que les collisions sont réelles. **Faux** : mon `grep -i "numb"` avait matché « My Number ». Vérifié : les 82 lignes ne collisionnent avec **aucune** des 5 entrées de la base de dev. La garde de skip reste néanmoins requise — pour l'idempotence d'un second `--apply` et parce que le contenu du Catalog de **prod** est inconnu depuis ici. Corrigé dans `epics.md`, dans cette story et dans `sprint-status.yaml`. C'est exactement l'action item n°1 de la rétro Epic 22, pris en défaut sur la story suivante.
- **Le fold d'identité, pas celui de recherche** : `lower(title)` + `coalesce(lower(artist), '')`, accents conservés — même forme que `findExistingByTitleArtist`. Un test inspecte la structure réelle de la clause Sequelize (`attribute.fn`, `logic`) et vérifie qu'aucun `f_unaccent` n'y figure. *(La première version du test sérialisait la clause en JSON — inutile : les `Symbol` et les objets `Fn` n'y survivent pas. Le test passait sur un `{}` vide.)*
- **Dry-run par défaut, `--apply` pour écrire.** Le script affiche environnement, base et mode **avant** toute action, et avertit explicitement si `NODE_ENV` vaut `production` — le piège majeur de ce projet, où un `NODE_ENV` non défini vaut `production`.
- **Brouillon explicite** : `publishedAt: null` est passé littéralement à `create`, et un test vérifie que **seules** les clés `title`/`artist`/`publishedAt` sont envoyées — aucun `key`/`bpm`/`mode` inventé.
- **Trois issues distinctes par ligne** : déjà présent → sauté ; `SequelizeUniqueConstraintError` (course entre deux exécutions) → sauté avec sa propre raison ; **toute autre erreur** → comptée en `failed` et affichée, jamais maquillée en « sauté ». Le lot continue dans les trois cas.
- **Périmètre tenu** : aucun modèle, aucune migration, aucun contrôleur, aucune route, aucun front. Le script n'est référencé nulle part dans le déploiement.

### File List

- **NEW** `backend/scripts/seed-catalog.js` — script manuel : parsing CSV, skip sur le fold d'identité, création en brouillon, rapport.
- **NEW** `backend/__tests__/seedCatalog.test.js` — 13 tests (modèles mockés).
- **UPDATE** `_bmad-output/planning-artifacts/epics.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml` — correction de l'affirmation « Numb ».

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 1.0 | dev-story — script de seed + 13 tests. Backend **385/385** (baseline 372 mesurée avant), lint clean. Le script s'exécute réellement et échoue proprement sur la connexion SSL locale (environnement, pas la story) ; les 82 lignes réelles traversent parsing et décision. **Correction d'une affirmation fausse de mon cadrage** : « Numb » n'est pas dans le CSV, le grep avait matché « My Number ». | northwood |
| 2026-08-10 | 0.1 | Story créée (create-story). Deux découvertes : l'index canonique du Catalog couvre les brouillons (la note de 19.6 est fausse) donc le skip est obligatoire ; et l'invariant 3 de l'epic confond le fold de RECHERCHE (`f_unaccent`) avec le fold d'IDENTITÉ (`lower` + `COALESCE`, accents conservés) — c'est le second qu'il faut, le suivre à la lettre aurait produit de faux skips. | northwood |
