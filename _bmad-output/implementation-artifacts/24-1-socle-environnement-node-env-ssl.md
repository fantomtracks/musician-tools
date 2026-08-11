---
baseline_commit: c15c3ccb235c0ef14de09d963acd3e395d1a696b
---

# Story 24.1: Socle d'environnement — une seule vérité pour `NODE_ENV`, un SSL qui suit la cible

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **mainteneur**,
I want **que l'environnement se détermine une seule fois, avant toute lecture, et que le SSL suive la base réellement visée**,
so that **aucun outil lancé à la main ne puisse viser la production en croyant être en dev — et que la consigne officielle du projet marche vraiment**.

## Contexte / origine

Première story d'**Epic 24** (dette technique). **Promue à la revue `deferred-work` du 2026-08-11**, où quatre items dispersés dans quatre sections du fichier ont été reconnus comme **un seul mécanisme cassé**.

Ce n'est pas de la dette théorique. Le piège a été **mesuré trois fois pendant l'Epic 23**, et une fois il n'a manqué qu'un certificat TLS pour que **82 écritures partent dans le Catalog partagé de production** (story 23.1). Le script de seed s'en protège désormais par un garde sur l'**hôte résolu** — mais ce garde est propre à ce script. **Le piège reste entier pour le prochain outil ponctuel.**

## Découverte de cadrage — À LIRE EN PREMIER

**1. Le rayon d'action est bien plus large que « on se trompe de base ».** Sept fichiers backend lisent `process.env.NODE_ENV`, et **trois prennent des décisions de sécurité** :

| Fichier | Décision prise sur `NODE_ENV` |
|---|---|
| `backend/db.js:2` | quelle base (`env = NODE_ENV \|\| 'production'`) |
| `backend/models/index.js:8` | quelle base — **la même logique, dupliquée** |
| `backend/server.js:105` | `secure` du cookie de session |
| `backend/server.js:132` | l'origine CORS autorisée |
| `backend/server.js:111` | branche `production` (trust proxy / statiques) |
| `backend/logger.js:38` | verbosité des logs |
| `backend/services/sessionService.js:14` | branche non-production |

Conséquence exacte quand `NODE_ENV` n'est pas défini au démarrage : `db.js` se connecte à la **PROD** (fallback `'production'`), puis `config.js` charge `.env` qui **remplit** `NODE_ENV=development` — et **toutes les lectures suivantes voient `development`**. Donc on sert de la donnée de production avec un cookie de session **non `secure`** et l'origine CORS de dev. Ce volet **n'est écrit nulle part** dans `deferred-work`, qui ne parle que de la base.

**2. Le déploiement est SAUF, et c'est ce qui rend le correctif faisable.** `both.Dockerfile:25` pose `ENV NODE_ENV=production` explicitement. Dans le conteneur déployé, `NODE_ENV` **est** défini — le fallback `|| 'production'` n'est jamais le chemin emprunté en prod. **C'est la vérification qui autorise l'option fail-fast** : refuser de démarrer sans `NODE_ENV` ne casserait pas le déploiement. Sans cette lecture, ce serait un pari.

**3. L'item « `NODE_ENV=production` rend la prod inatteignable » est vrai LOCALEMENT seulement.** `config.js:3` ne charge `dotenv` que si `NODE_ENV !== 'production'`. Dans le conteneur c'est correct — Fly injecte les variables directement, il n'y a pas de `.env`. En local, `.env` **contient** `DATABASE_URL_PROD`, donc `NODE_ENV=production` le rend illisible et Sequelize reçoit une URL `undefined`. `deferred-work` énonce l'item trop largement.

**4. `Makefile:163` s'en sort par un contournement qu'il ne faut pas casser** : il passe `DATABASE_URL_PROD="$(PROD_DB_URL)"` **sur la ligne de commande** en plus de `NODE_ENV=production`. Ce chemin marche aujourd'hui *malgré* le bug n°3, pas grâce à sa correction. Il doit continuer à marcher après.

**5. `config.js` sert aussi `sequelize-cli`** (`.sequelizerc` le désigne comme `config`). Toute modification doit rester un module chargeable par la CLI, sans effet de bord au `require`.

## Décisions à verrouiller (à trancher au dev, pas en douce)

- **A — `dotenv` avant toute lecture de `NODE_ENV`.** C'est la racine : le fichier `.env` doit être chargé **avant** que qui que ce soit calcule `env`. Charger `dotenv` inconditionnellement est **sûr en prod** (pas de `.env` dans le conteneur ⇒ no-op silencieux) et répare le cas local. ⚠️ `dotenv` ne réécrit **jamais** une variable déjà posée dans l'environnement réel — donc Fly et le `Makefile` gardent la main.
- **B — Un seul point de décision.** `db.js` et `models/index.js` dupliquent `NODE_ENV || 'production'`. Le project-context dit déjà que **la source de vérité est `models/index.js`**. La duplication doit disparaître, pas être corrigée deux fois.
- **C — Fail-fast ou fallback ?** À trancher explicitement. Le fallback `'production'` est ce qui rend le piège silencieux ; refuser de démarrer sans `NODE_ENV` est possible (cf. Découverte 2). **Recommandation : fail-fast**, avec un message qui nomme la cible. Un `NODE_ENV` absent est une erreur d'opérateur, pas un défaut raisonnable — et « défaut = production » est le pire choix possible pour un défaut.
- **D — SSL conditionnel en `development`**, comme il l'est déjà en `test`/`staging`. Le bloc `development` code `ssl: { require: true }` en dur alors que le Postgres du `docker-compose` ne parle pas SSL.
- **E — `DB_ENABLE_SSL` comparé explicitement** (`=== 'true'`). Aujourd'hui la chaîne `'false'` est **truthy**, donc la seule façon de désactiver le SSL est de **vider** la variable — ce que personne ne devine en lisant un `.env` où elle vaut littéralement `false`.
- **F — `sslmode` de `DATABASE_URL_PROD`.** L'URL porte `?sslmode=require` (vérifié), et pg 8.16 **vérifie** le certificat dans ce mode, ce qui **prime** sur le `rejectUnauthorized: false` de la config ; Supabase présente un auto-signé. À trancher : `sslmode=no-verify` dans l'URL, ou retirer le paramètre et laisser `dialectOptions` décider. ⚠️ **Ce point touche une variable d'environnement de production, pas le dépôt** — il se change dans les secrets Fly et dans le `.env` local, et doit être **annoncé**, pas glissé.

## Acceptance Criteria

1. **`NODE_ENV` est résolu une seule fois, après le chargement de `.env`** — plus aucun fichier ne calcule son propre `env` avant que `dotenv` ait tourné. Un test le verrouille en simulant un démarrage sans `NODE_ENV` dans l'environnement réel mais présent dans `.env`.
2. **Un démarrage sans `NODE_ENV` nulle part ne se connecte JAMAIS à la production silencieusement** — soit il échoue avec un message qui nomme l'environnement attendu (décision C), soit il retombe sur un défaut **non-production**. Le comportement retenu est écrit dans les Completion Notes avec sa raison.
3. **La logique d'environnement n'existe plus qu'à un seul endroit** — `db.js` et `models/index.js` ne dupliquent plus `NODE_ENV || 'production'`. La source de vérité reste `models/index.js` (project-context).
4. **`NODE_ENV=development` atteint réellement la base locale** — le SSL du bloc `development` devient conditionnel. Critère **vérifié en exécution réelle**, pas seulement en test : `NODE_ENV=development node scripts/seed-catalog.js --phase=seed` (dry-run) se connecte et affiche son rapport. C'est la consigne officielle du projet (`project-context.md`) et du message de refus du script de seed : elle doit marcher.
5. **`DB_ENABLE_SSL=false` désactive le SSL** — comparaison explicite. Une valeur absente, `'false'`, `'0'` ou vide ne l'active pas ; `'true'` l'active. Table de vérité testée.
6. **Le chemin prod reste intact** — `NODE_ENV=production` avec les variables injectées par l'environnement (sans `.env`) construit la **même** configuration qu'avant : mêmes `url`, `pool`, `logging: false`. Un test compare la configuration résolue avant/après plutôt que de faire confiance à la relecture.
7. **`Makefile:163` continue de fonctionner** — `DATABASE_URL_PROD=… NODE_ENV=production npx sequelize-cli db:migrate --env production` reste valide, et `config.js` reste chargeable par `sequelize-cli` sans effet de bord au `require` (`.sequelizerc`).
8. **Le `sslmode` de `DATABASE_URL_PROD` est tranché et documenté** (décision F). Si le choix est de changer la variable d'environnement, la story ne la change pas en douce : elle **écrit la consigne** et northwood l'applique aux secrets Fly. Aucun secret n'entre dans le dépôt.
9. **Les trois décisions de sécurité de `server.js` sont vérifiées après coup** — cookie `secure`, origine CORS, branche `production` : elles doivent lire le **même** environnement que la couche base. Un test qu'un démarrage cohérent ne peut pas donner « base = prod » et « cookie = non sécurisé » en même temps.
10. **Aucune modification de modèle, de migration, de contrôleur, de route ni du front.** Aucune migration.

## Tasks / Subtasks

- [x] **Task 1 — Point d'entrée unique de l'environnement** (AC: 1, 3)
  - [x] Charger `dotenv` **avant** toute lecture de `NODE_ENV`, en tête du premier module chargé. Vérifier l'ordre réel de chargement (`server.js` → `models/index.js` → `db.js` → `config/config.js`) plutôt que le supposer.
  - [x] Supprimer la duplication `NODE_ENV || 'production'` entre `db.js` et `models/index.js`.
  - [x] ⚠️ Garder `config.js` chargeable par `sequelize-cli` (`.sequelizerc`), sans effet de bord au `require`.
- [x] **Task 2 — Trancher le défaut** (AC: 2)
  - [x] Appliquer la décision C (fail-fast recommandé) et **écrire la raison** dans les Completion Notes.
  - [x] Le message doit nommer ce qui est attendu et ce qui a été trouvé — pas un `throw` nu.
- [x] **Task 3 — SSL qui suit la cible** (AC: 4, 5)
  - [x] Bloc `development` : SSL conditionnel, aligné sur `test`/`staging`.
  - [x] `DB_ENABLE_SSL` comparé explicitement ; table de vérité (absent / `''` / `'false'` / `'0'` / `'true'`) testée.
- [x] **Task 4 — Non-régression du chemin prod** (AC: 6, 7)
  - [x] Test comparant la configuration **résolue** en `production` avant/après (url, pool, logging), sans `.env`.
  - [x] Vérifier la cible Makefile de migration prod **sans l'exécuter** contre la prod (lecture + `--help`/dry equivalent), ou l'exécuter contre une base locale restaurée.
- [x] **Task 5 — Cohérence des décisions de sécurité** (AC: 9)
  - [x] Test qu'un démarrage ne peut pas donner base = prod et cookie non-`secure` simultanément.
- [x] **Task 6 — `sslmode`** (AC: 8)
  - [x] Trancher, documenter, et **écrire la consigne** pour les secrets Fly. Ne rien committer de secret.
- [x] **Task 7 — Tests** (AC: 1, 2, 5, 6)
  - [x] Suite backend, `jest.mock` des modèles selon la convention. Baseline à **mesurer** avant de commencer (546 au dernier relevé — le vérifier, pas le recopier).
  - [x] **Vérifier les gardes par mutation**, en visant par motif unique ou par index de ligne, avec un **témoin neutre**. C'est la convention depuis 23.2, et elle a attrapé trois faux positifs depuis.
- [x] **Task 8 — Validation** (AC: 10)
  - [x] `cd backend && npm test` + `npm run lint`. `git diff --name-only` : aucun modèle, migration, contrôleur, route ni front.
  - [x] **Exécuter réellement** le dry-run du script de seed avec `NODE_ENV=development` (AC4). Un test vert ne dit rien de ce que fait un binaire au démarrage — c'est la leçon la plus chère de l'Epic 23.

## Dev Notes

### Le piège central de cette story

Il n'est pas dans la logique, il est dans **l'ordre de chargement**. `db.js:2` s'exécute **avant** la ligne 3 qui `require` `config.js`, lequel charge `dotenv`. Toute correction qui laisse une lecture de `NODE_ENV` en amont de `dotenv` ne corrige rien — et le symptôme est invisible localement dès qu'on exporte la variable à la main. **Se relire ne suffit pas : il faut démarrer un processus sans `NODE_ENV` dans l'environnement réel et regarder quelle base est visée.**

### Pièges

- **Ne pas « corriger » en exportant `NODE_ENV` partout.** C'est le contournement actuel, et c'est ce qui masque le bug.
- **`dotenv` n'écrase jamais une variable déjà posée** — c'est ce qui rend le chargement inconditionnel sûr pour Fly et pour le `Makefile`. À vérifier plutôt qu'à croire.
- **La config de `test` vise la même base que `development`** (`DATABASE_URL_DEV`). C'est ce qui a permis le contournement `DB_ENABLE_SSL= NODE_ENV=test` pendant l'Epic 23 — après cette story, le contournement doit devenir inutile, pas obligatoire.
- **`server.js:105`/`:132` ne sont pas hors périmètre par confort** : ils lisent la même variable. Si le correctif change **quand** `NODE_ENV` est résolu, il change leur comportement aussi. AC9 existe pour que ce ne soit pas découvert en prod.
- **Le garde sur l'hôte résolu du script de seed reste utile après cette story** — il protège d'une erreur d'URL, pas seulement d'une erreur de `NODE_ENV`. Ne pas le retirer sous prétexte que la cause racine est traitée.

### Anchors code (lus, non devinés)

- `backend/db.js:2-3` — `env` calculé **avant** le `require` qui charge `dotenv`. La racine.
- `backend/models/index.js:8` — la **même** ligne, dupliquée ; source de vérité de la connexion selon `project-context.md`.
- `backend/config/config.js:3-6` — `dotenv` chargé seulement si `NODE_ENV !== 'production'`.
- `backend/config/config.js:16-19` — SSL **en dur** dans `development`.
- `backend/config/config.js:41`, `:65` — `ssl: process.env.DB_ENABLE_SSL && {...}` : la chaîne `'false'` est truthy.
- `backend/server.js:105`, `:111`, `:132` — cookie `secure`, branche production, origine CORS.
- `both.Dockerfile:25` — `ENV NODE_ENV=production` : **la prod est sauve**, ce qui autorise le fail-fast.
- `Makefile:163` — migration prod, passe `DATABASE_URL_PROD` en ligne de commande.
- `.sequelizerc` — `config.js` est aussi la config de `sequelize-cli`.

### Project Structure Notes

- **UPDATE** : `backend/db.js`, `backend/models/index.js`, `backend/config/config.js`.
- **Peut-être UPDATE** : `backend/server.js` (AC9), `backend/__tests__/` (nouveaux tests).
- **Hors dépôt** : la valeur de `sslmode` dans `DATABASE_URL_PROD` (secrets Fly + `.env` local).
- **Aucun** modèle, migration, contrôleur, route, front.
- Conventions backend : **CommonJS**, pas de `.ts`, modèles mockés dans les tests.

### Testing Standards

- Suite backend : `backend/jest.config.js`, env node, tests dans `backend/__tests__/`.
- Les tests qui manipulent `process.env` doivent **restaurer** l'environnement (`afterEach`) — sinon ils polluent les autres suites, qui lisent `NODE_ENV`.
- `jest.resetModules()` sera nécessaire : `config.js` et `db.js` capturent l'environnement **au `require`**.
- Le hook pre-commit lance les **deux** suites ; jamais de `--no-verify`.

### References

- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` § « ⬆️ PROMU EN STORY le 2026-08-11 — cluster environnement »]
- [Source: `_bmad-output/implementation-artifacts/epic-23-retro-2026-08-11.md` — action item n°4 ; et « l'exécution réelle est la meilleure couche de review »]
- [Source: `_bmad-output/implementation-artifacts/23-1-script-seed-entrees-catalog-brouillon.md` § Review Findings — les 82 écritures évitées par une erreur TLS]
- [Source: `_bmad-output/implementation-artifacts/epic-23-seed-report-2026-08-10.md` § « Un obstacle rencontré » — `sslmode` et `NODE_ENV=production`]
- [Source: `_bmad-output/project-context.md` — pièges d'environnement, source de vérité `models/index.js`]

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev-story)

### Debug Log References

**Baseline backend mesurée avant de commencer** : **546 tests / 25 suites**. Après : **568 / 26** (+22). Front **inchangé à 557** — cette story ne touche pas le front. `tsc` et les deux lints propres.

**AC4 — la preuve qui compte, en exécution réelle.** La consigne officielle du projet, telle quelle :

```
$ NODE_ENV=development node scripts/seed-catalog.js --phase=seed
Base            : localhost:5433/musician_tools  (locale)
NODE_ENV        : au démarrage « development », après chargement « development »
Mode            : dry-run (aucune écriture)
info: Connection to the DB has been established successfully.
…
Relancez avec --apply pour écrire.
```

Avant cette story, la **même** commande mourait sur `SequelizeConnectionError: The server does not support SSL connections`. Le contournement `DB_ENABLE_SSL= NODE_ENV=test` utilisé pendant toute l'Epic 23 n'est plus nécessaire.

**AC2 — la commande exacte de l'incident 23.1, rejouée.** `env -u NODE_ENV node scripts/seed-catalog.js --phase=seed` vise désormais **`localhost:5433` (locale)**. Avant, elle visait la base de **production** en affichant « development ». Le `.env` fournit `NODE_ENV=development`, il est lu **avant** le choix de la connexion, donc il n'y a plus de divergence à exploiter.

**Le vrai fail-fast, vérifié séparément** (ni environnement réel, ni `.env` — lancé depuis un `cwd` sans `.env`) :

```
Error: NODE_ENV is not set, and there is no safe default.
Expected one of: development, test, staging, production.
```

**Les 5 gardes vérifiés par mutation**, avec **témoin neutre** resté vert :

| mutation | tests qui meurent |
|---|---|
| fail-fast `NODE_ENV` absent retiré | 2 |
| validation d'une valeur inconnue retirée | 1 |
| `DB_ENABLE_SSL` redevient truthy | 3 |
| `dotenv` chargé APRÈS la lecture de `NODE_ENV` | 3 |
| *(témoin : commentaire modifié)* | *0, comme attendu* |

⚠️ **Au premier passage, la mutation du fail-fast tuait 0 test.** Le garde n'était couvert par rien : en le retirant, `raw` restait `undefined` et c'est la **validation suivante** qui levait — avec un message contenant lui aussi « NODE_ENV », donc mon `toThrow(/NODE_ENV/)` passait pour la mauvaise raison. Assertion resserrée sur `/is not set/`, message propre au cas absent. **Troisième fois dans ce projet que la mutation attrape un test qui passe pour une mauvaise raison ; la relecture ne l'avait pas vu.**

### Completion Notes List

- **Décision C tranchée : FAIL-FAST.** `config/env.js` refuse de démarrer si `NODE_ENV` est absent, avec un message qui nomme les 4 valeurs acceptées et dit pourquoi il ne devine pas. Raison : « défaut = production » est **le pire défaut possible** — il rend le cas *dangereux* silencieux. Ce n'était faisable que parce que `both.Dockerfile:25` pose `ENV NODE_ENV=production` ; vérifié aussi pour `docker-compose.yml:44` (dev) et `Makefile:163` (migration prod). **Aucun chemin de déploiement ou de migration ne dépend du fallback.**
- **`dotenv` est chargé inconditionnellement**, alors que `config.js` ne le faisait que hors production. Sûr : le conteneur n'a pas de `.env` (no-op silencieux), et dotenv **n'écrase jamais** une variable déjà posée — propriété **vérifiée par un test** dont le faux `dotenv` reproduit ce contrat, et non supposée. Effet de bord voulu : le piège n°3 du cadrage (prod inatteignable en local) disparaît au passage.
- **Il y avait une TROISIÈME copie du fallback, absente du cadrage** : `server.js:13`. Elle ne « marchait » que parce qu'un `require` plus haut (`./routes/index`) chargeait `.env` par accident — un ordre subi, pas choisi. Retirée. C'est aussi ce qui **ferme l'AC9** : `env.js` levant sur un `NODE_ENV` absent, `server.js` ne peut plus atteindre ses décisions de sécurité (cookie `secure`, CORS, branche production) avec une valeur indéfinie. **L'état incohérent est devenu inatteignable**, il n'est pas seulement testé.
- **`db.js` reste la connexion « de service » et `models/index.js` la source de vérité** (project-context inchangé). Les deux tirent leur `env` du même module ; plus aucune ligne ne recalcule `NODE_ENV || …`.
- **Le bloc `development` passe au SSL conditionnel**, aligné sur `test`/`staging`. Par défaut (`DB_ENABLE_SSL` absent), plus de SSL : le Postgres du `docker-compose` ne le parle pas. Un dev qui vise une base distante pose `DB_ENABLE_SSL=true`.
- **`DB_ENABLE_SSL` comparé strictement à `'true'`.** Table de vérité testée, y compris `'TRUE'` → **false** : pas de tolérance accidentelle. Le `.env` du projet contient littéralement `DB_ENABLE_SSL=false`, qui **activait** le SSL jusqu'ici.
- **Correction d'un message que ma propre modification a rendu FAUX.** `seed-catalog.js:1623` avertissait que « `.env` a modifié `NODE_ENV` **APRÈS** le choix de la connexion ». C'était vrai et dangereux ; ça ne l'est plus, puisque c'est exactement ce que cette story corrige. Laissé visible mais retourné en **note de fait** (d'où vient la valeur), l'avertissement étant devenu mensonger. Hors File List du cadrage, assumé : réparer ce qu'on invalide fait partie du changement.
- **AC8 — `sslmode` : TRANCHÉ, mais rien n'est appliqué ici, c'est hors dépôt.** Recommandation : mettre **`sslmode=no-verify`** dans `DATABASE_URL_PROD` (secret Fly **et** `.env` local). Raison : pg 8.16 **vérifie** le certificat en mode `require`, ce qui prime sur le `rejectUnauthorized: false` déclaré dans `config.js` ; Supabase présente un auto-signé. `no-verify` rend **effectif ce que la config dit déjà vouloir** (chiffré, non vérifié) au lieu de laisser deux sources se contredire. ⚠️ **Action pour northwood**, pas pour cette story — aucun secret n'entre dans le dépôt.
- **Non couvert et assumé** : aucun test ne démarre `server.js` en entier (il ouvrirait un port et une connexion). L'AC9 est verrouillée par l'invariant « une seule source de vérité + refus de démarrer », pas par un boot complet.

### File List

- **NEW** `backend/config/env.js` — point de décision unique : charge `.env`, résout et **valide** l'environnement, expose `sslEnabled`.
- **NEW** `backend/__tests__/configEnv.test.js` — 22 tests (ordre de chargement, fail-fast, table de vérité SSL, non-régression prod, cohérence sécurité, absence de duplication).
- **UPDATE** `backend/config/config.js` — `dotenv` déplacé dans `./env` ; SSL conditionnel en `development` ; `sslEnabled` remplace les trois lectures brutes de `DB_ENABLE_SSL`.
- **UPDATE** `backend/db.js` — plus de calcul local de `NODE_ENV`.
- **UPDATE** `backend/models/index.js` — idem (la duplication disparaît).
- **UPDATE** `backend/server.js` — troisième copie du fallback retirée (trouvée pendant le dev).
- **UPDATE** `backend/scripts/seed-catalog.js` — avertissement devenu faux corrigé en note de fait.
- **UPDATE** `_bmad-output/implementation-artifacts/sprint-status.yaml` — suivi.

Aucun modèle, aucune migration, aucun contrôleur, aucune route, aucun fichier front (AC10, vérifié par `git diff --name-only`).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-11 | 0.2 | Implémentée (dev-story). Point de décision unique `config/env.js` : `dotenv` chargé AVANT toute lecture de `NODE_ENV`, **fail-fast** sur valeur absente ou inconnue (décision C tranchée — « défaut = production » rend le cas dangereux silencieux ; faisable car Dockerfile, docker-compose et Makefile:163 posent tous la variable). SSL conditionnel en `development`, `DB_ENABLE_SSL` comparé strictement. **Une TROISIÈME copie du fallback trouvée pendant le dev** (`server.js:13`), absente du cadrage — sa suppression ferme l'AC9 : l'état incohérent « base = prod, cookie non sécurisé » devient **inatteignable**. AC4 et AC2 vérifiées en **exécution réelle** : `NODE_ENV=development` atteint enfin la base locale, et la commande exacte de l'incident 23.1 vise `localhost` au lieu de la prod. Backend 546 → 568. 5 gardes vérifiés par mutation, témoin neutre vert — dont un qui **ne tuait aucun test au premier passage** (assertion trop lâche, resserrée). AC8 (`sslmode`) tranchée mais **hors dépôt** : consigne écrite pour northwood. | northwood |
| 2026-08-11 | 0.1 | Story créée (create-story), promue à la revue `deferred-work` du même jour. **Découverte de cadrage qui élargit l'enjeu** : 7 fichiers backend lisent `NODE_ENV`, dont 3 qui décident de la sécurité (cookie `secure`, CORS, trust proxy) — un démarrage sans `NODE_ENV` sert donc de la donnée de **production** avec la posture de sécurité du **dev**, ce que `deferred-work` ne disait pas. **Découverte qui rend le correctif faisable** : `both.Dockerfile:25` pose `NODE_ENV=production`, donc le fail-fast ne casserait pas le déploiement — vérifié, pas supposé. Deux items de `deferred-work` corrigés au passage : « `NODE_ENV=production` rend la prod inatteignable » n'est vrai qu'en **local**, et `Makefile:163` marche aujourd'hui par contournement (URL passée en ligne de commande), pas par correction. | northwood |
