---
baseline_commit: c591f0a34916123fc8b71ef51e1f778c961ea5e5
---

# Story 23.2: Script de rattachement — brancher les Songs existantes sur leur entrée

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur beta**,
I want **que les chansons que j'ai déjà saisies soient reconnues comme venant du Catalog**,
so that **je bénéficie des enrichissements du curateur sans rien perdre de ma donnée**.

## Contexte / origine

Deuxième story d'**Epic 23**. La 23.1 a créé les entrées Catalog (en brouillon). Celle-ci **branche** les chansons personnelles existantes dessus, en posant `source_catalog_uid` et `source_catalog_synced_at`.

**Ordre imposé : 23.1 (done) → 23.2 → 23.3 → 23.4.** Cette story fait le rattachement **exact-fold** ; les 9 saisies que le nettoyage a fait diverger sont traitées en 23.3.

**Elle étend le script existant** `backend/scripts/seed-catalog.js` — pas un nouveau fichier. Elle hérite donc de tout ce que la review de 23.1 y a mis, et **doit** le réutiliser plutôt que de le refaire.

## Ce qui est déjà là et doit être réutilisé tel quel

La review de 23.1 a durci le script sur des points qui valent **exactement autant** ici, et davantage : cette story **écrit dans les données personnelles des utilisateurs**, pas dans un pool partagé.

- **Le garde sur l'hôte résolu** (`isLocalHost` + `--allow-remote`). ⚠️ **Ne surtout pas le contourner ni le dupliquer.** Rappel de ce qui a été mesuré en 23.1 : `node scripts/seed-catalog.js --apply` dans un shell nu **visait la base de production** en affichant « development », parce que `db.js` calcule `env = NODE_ENV || 'production'` **avant** que `config.js` ait chargé `.env`. Seule une erreur TLS a évité 82 écritures en prod. Le garde porte sur `db.sequelize.config.host`, jamais sur `NODE_ENV`.
- **`--dry-run` par défaut, `--apply` pour écrire**, argument inconnu **refusé** (`parseArgs`).
- **Le rapport** : `formatReport`, code de sortie 1 dès qu'une ligne échoue, skips base affichés avant le bruit de parsing.
- **Le fold d'IDENTITÉ** : `lower(x)` + `COALESCE(lower(artist),'')`, **accents conservés**. Jamais `f_unaccent` (recherche seulement).
- **La garde par ligne** : lookup **inclus** dans le `try`, pour qu'une coupure en cours de lot n'emporte pas le rapport des lignes déjà écrites.

## Décisions et invariants applicables

- **Invariant 1 (epic)** — **jamais recréer une Song**, jamais réécrire `title`/`artist` ici. Toute la donnée d'entraînement (`SongPlays`, `SessionItems` + leur snapshot FR4, `playlist_songs`, `lastPlayed`, instrument et tuning perso) pend au `Song.uid` existant. *(La levée de cet invariant pour 9 lignes nommées appartient à la story 23.3, pas à celle-ci.)*
- **Invariant 2** — ne **jamais** toucher une Song qui a déjà un `sourceCatalogUid` : elle vient d'un vrai « Add from Catalog ».
- **Invariant 4** — rattacher **par requête sur la base**, pas ligne à ligne depuis le CSV. Le CSV est un instantané du 2026-07-25 ; la prod a bougé. Le script rattache donc aussi les chansons arrivées depuis, et reste ré-exécutable.
- **Décision B** — `source_catalog_synced_at = CatalogSong.updatedAt`, **pas `NULL`**. À `NULL`, la drift (`syncedAt == null || catalog.updatedAt > syncedAt`) afficherait « mise à jour disponible » sur toutes les chansons rattachées dès la publication.

## Acceptance Criteria

1. **Rattachement par requête sur la base** — pour chaque Song sans `source_catalog_uid`, on cherche l'entrée Catalog dont le fold d'identité correspond **exactement**. Le rapprochement se fait **côté SQL** (l'expression de l'index), pas en chargeant toutes les Songs en mémoire pour les comparer en JS.
2. **Ce qui est écrit, et rien d'autre** — `source_catalog_uid` = l'uid de l'entrée, `source_catalog_synced_at` = `CatalogSong.updatedAt` de cette entrée. **Aucune autre colonne** n'est touchée : ni `title`, ni `artist`, ni `key`, ni `bpm`, ni `instrument`, ni `notes`, ni `lastPlayed`. Un test vérifie la liste exacte des champs mis à jour.
3. **Idempotence** — une Song ayant déjà un `sourceCatalogUid` est ignorée (invariant 2), et une seconde exécution `--apply` rattache **zéro** Song et le rapporte.
4. **Exact-fold uniquement** — `Beatles` ≠ `The Beatles`, `AC DC` ≠ `AC/DC`. Aucun rapprochement approximatif. Les 9 divergences connues sont l'objet de 23.3 ; les rapprochements réellement flous (un futur utilisateur qui tape « Beatles ») restent hors périmètre.
5. **Une entrée Catalog en brouillon rattache quand même** — le lien est posé, il reste dormant jusqu'à publication (décision A de l'epic). Ne **pas** filtrer sur `publishedAt`.
6. **`--dry-run` rapporte par utilisateur** — nombre de Songs qui seraient rattachées, **groupées par user**, sans rien écrire. C'est le chiffre que northwood lira avant d'autoriser la prod.
7. **Compteurs avant/après inchangés** — `COUNT(*)` de `Songs`, `SongPlays`, `SessionItems` et `playlist_songs` sont **identiques** avant et après. Le script les mesure lui-même et **échoue bruyamment** si l'un a bougé : c'est la preuve mécanique de l'invariant 1.
8. **Aucune modification du schéma, du modèle, d'un contrôleur, d'une route ou du front.** Aucune migration. Le script reste hors de tout chemin de déploiement.

## Tasks / Subtasks

- [x] **Task 1 — Sous-commande** (AC: 8)
  - [x] Le script gagne une notion de phase : `--phase=seed` (défaut, comportement actuel) et `--phase=attach`. `parseArgs` doit **refuser** une phase inconnue, comme il refuse déjà un argument inconnu.
  - [x] Le garde sur l'hôte, le dry-run par défaut et le rapport sont **partagés** entre les phases — ne pas les réécrire.
- [x] **Task 2 — La requête de rattachement** (AC: 1, 3, 4, 5)
  - [x] Sélectionner les candidats en SQL : jointure `Songs` × `CatalogSongs` sur `lower(s.title) = lower(c.title) AND COALESCE(lower(s.artist),'') = COALESCE(lower(c.artist),'')`, avec `s.source_catalog_uid IS NULL`. Retourner `song.uid`, `user_uid`, `catalog.uid`, `catalog."updatedAt"`.
  - [x] ⚠️ **Une Song pourrait matcher plusieurs entrées Catalog ?** Non en théorie — l'index canonique rend le fold unique côté Catalog. **Le vérifier quand même** dans la requête (ou compter) et **refuser** de rattacher un candidat ambigu plutôt que d'en choisir un au hasard.
  - [x] Colonnes DB : `source_catalog_uid`, `source_catalog_synced_at` (snake_case, cf. `field:` dans le modèle).
- [x] **Task 3 — L'écriture** (AC: 2, 3)
  - [x] `Song.update({ sourceCatalogUid, sourceCatalogSyncedAt }, { where: { uid, sourceCatalogUid: null } })` — le `where` **re-vérifie** l'invariant 2 au moment de l'écriture, pas seulement à la sélection (une exécution concurrente pourrait avoir rattaché entre-temps).
  - [x] Garde par ligne (`try` englobant lookup **et** écriture), comme en 23.1.
- [x] **Task 4 — Compteurs de sécurité** (AC: 7)
  - [x] Avant le lot : `COUNT(*)` sur `Songs`, `SongPlays`, `SessionItems`, `playlist_songs`. Après : les relire et **comparer**. Un écart ⇒ message explicite + code de sortie 1.
  - [x] En dry-run, les compteurs sont affichés une fois (photo de référence), sans comparaison.
- [x] **Task 5 — Rapport par utilisateur** (AC: 6)
  - [x] Regrouper par `user_uid` et afficher `N chansons rattachées` par utilisateur. Ne **pas** afficher d'email (le script n'en a pas besoin et le CSV versionné n'en contient pas).
- [x] **Task 6 — Tests** (AC: 3, 4, 7)
  - [x] Étendre `backend/__tests__/seedCatalog.test.js` (modèles mockés, pas de vraie base) : la phase attach n'écrit rien en dry-run ; elle n'appelle `update` que pour les Songs sans source ; l'`update` ne porte **que** sur les deux colonnes ; le `where` contient `sourceCatalogUid: null` ; un candidat ambigu est refusé ; un écart de compteur fait échouer le lot ; une phase inconnue est refusée.
  - [x] Baseline backend à **mesurer** avant de commencer (rétro Epic 22, action item n°1).
- [x] **Task 7 — Validation** (AC: 8)
  - [x] `cd backend && npm test` + `npm run lint`. `git diff --stat` : uniquement le script et son test.
  - [x] **Exécuter réellement** le dry-run de la phase attach et lire sa sortie — la review de 23.1 a montré qu'un test vert ne dit rien de ce que le script fait au démarrage.

### Review Findings

_Code review du 2026-08-10. **2 couches sur 3 ont calé** (Edge Case Hunter, Acceptance Auditor : rien écrit pendant 12 min, tuées) — leur travail a été refait à la main, la revue est donc moins large qu'annoncé. Chaque constat du Blind Hunter a été vérifié plutôt que cru : plusieurs de ses scénarios tombent._

- [ ] [Review][Decision] **Les 73 chansons rattachées n'ont jamais demandé à l'être — et la porte s'ouvre à la publication** — c'est le constat le plus lourd, et aucune couche automatique ne l'a produit. Dans le flux « Add from Catalog », l'utilisateur *choisit* le lien. Ici on le pose sur des chansons qu'il a tapées lui-même. Tant que l'entrée reste brouillon, rien ne bouge : vérifié des deux côtés, `getSong` n'émet le bloc `sourceCatalog` que si `publishedAt != null` (`backend/controllers/songcontroller.js:113`) et le refresh refuse un brouillon en 409 (`:147`). Mais le jour où le curateur **publie** une fiche encore pauvre, ces utilisateurs héritent d'un bouton « Refresh » qui écrit `catalog[f] ?? null` sur `key`, `bpm`, `mode`, `timeSignature`, `durationSeconds`, `pitchStandard` (`:155`) — leur clé et leur BPM remplacés par des `null`, sur une chanson qu'ils n'ont jamais importée. À trancher au niveau de l'epic, pas de la story : soit la publication exige un minimum de champs remplis, soit le refresh ne nulle plus, soit on assume.
- [ ] [Review][Decision] **Le garde de compteurs n'est pas la « preuve mécanique » annoncée** — il crie sur le cas *normal* et rate un cas anormal. Faux positif : la prod est vivante, un bêta-testeur qui log une séance pendant l'exécution ajoute une ligne `SongPlays` ⇒ `COMPTEURS MODIFIÉS`, sortie 1, « auditez la base » pour un run parfait — un garde qui hurle à tort la première fois est un garde qu'on désactive la deuxième. Faux négatif : une suppression + un ajout dans la même table laissent le compte identique. L'AC7 demande littéralement d'échouer sur tout écart, donc le code est conforme ; c'est l'AC qu'il faut trancher. [`backend/scripts/seed-catalog.js:512-543`]
- [x] [Review][Patch] **Fenêtre TOCTOU sur le rapprochement lui-même : le `where` ne re-vérifie que la source, pas le titre/artiste** — le commentaire affirme re-vérifier l'invariant à l'écriture ; il re-vérifie *une* des deux conditions qui ont fait de cette ligne un candidat. Entre le SELECT et l'UPDATE, l'utilisateur renomme sa chanson : l'UPDATE part quand même (l'uid correspond, la source est toujours NULL) et estampille une provenance vers une fiche qui ne correspond plus, rapportée comme un succès. [`backend/scripts/seed-catalog.js:316-330`]
- [x] [Review][Patch] **Un lot entièrement `raced` se lit comme un succès, sortie 0** — `affected === 0` est rangé sans condition dans « déjà rattachées entre-temps ». Un run qui rapporte `candidats : 82 / rattachées : 0 / déjà rattachées : 82` et sort en 0 dit à l'opérateur « quelqu'un a déjà fait le travail » alors que rien n'a été écrit. (Le scénario avancé par la couche adverse — attribut non déclaré silencieusement ignoré par Sequelize — est **écarté** : `sourceCatalogUid` et `sourceCatalogSyncedAt` sont bien dans `Song.rawAttributes`, vérifié à l'exécution.) Même incohérence de politique : `raced` sort en 0 en silence, un écart de compteur sort en 1 avec « auditez la base », pour le même évènement sous-jacent. [`backend/scripts/seed-catalog.js:322-331`, `:452-455`]
- [x] [Review][Patch] **`silent: true` porte l'AC2 et aucun test ne le couvre** — le test « l'update ne porte QUE sur les deux colonnes » n'inspecte que `Object.keys(values)`. Retirer `silent: true` écrit une troisième colonne (`updatedAt`) sur les songlists entières de cinq personnes, et la suite reste verte. Vérifié : aucune occurrence de `silent` dans le fichier de test. [`backend/__tests__/seedCatalog.test.js:94-113`]
- [x] [Review][Patch] **Les deux `countGuardedTables` sont hors de tout `try`, la connexion fuit et la vérification post-écriture est le point le plus exposé** — `main` n'enveloppe pas `runAttach`, et l'appel de tête `main(process.argv.slice(2))` n'a pas de `.catch()`. Une erreur base sur le **second** comptage — celui d'après les écritures — sort en stack trace brute, pool ouvert, et emporte précisément l'étape qui devait prouver que rien n'a été détruit. [`backend/scripts/seed-catalog.js:279-284`, `:483-487`, fin de fichier]
- [x] [Review][Patch] **Le mock ne peut pas attraper un mauvais `QueryTypes`, et le garde d'ambiguïté ne survit pas à `NaN`** — le test ne regarde jamais le second argument de `query`. En `RAW`, Sequelize renvoie `[rows, metadata]` ; `rows.map` produit alors des candidats à champs `undefined` et `matchCount: NaN`. Or `NaN > 1` est faux : ils passent le garde d'ambiguïté et arrivent à `Song.update({ sourceCatalogUid: undefined }, { where: { uid: undefined } })`. [`backend/scripts/seed-catalog.js:268-279`, `backend/__tests__/seedCatalog.test.js:70-82`]
- [x] [Review][Patch] **Deux tests de `parseArgs` passeraient même si le garde qu'ils testent disparaissait** — vérifié à l'exécution : le message générique d'argument inconnu contient déjà `--phase=seed|attach` **et** `--file=<chemin>`. Donc `toThrow(/[Pp]hase/)` et `toThrow(/--file/)` matchent le message générique. Retirer `--phase=` de la liste blanche laisserait ces tests verts. Assertions à resserrer sur `/Phase inconnue/` et `/n'a pas de sens en --phase=attach/`. [`backend/__tests__/seedCatalog.test.js:41-48`]
- [x] [Review][Patch] **Un `--phase` répété est résolu en silence, premier gagnant** — `--phase=seed --phase=attach` donne `seed`. (La couche adverse annonçait l'inverse ; vérifié à l'exécution, c'est bien le premier qui gagne.) Un drapeau dupliqué contredit la discipline « jamais ignorer un argument » héritée de 23.1. Même trou sur `--file=`. [`backend/scripts/seed-catalog.js:386-393`]
- [x] [Review][Patch] **Le commentaire sur-vend : « agrees with the database by construction », et l'index nommé ne peut pas servir cette jointure** — le SQL est une *troisième* réécriture à la main de la même règle, vérifiée par rien d'automatique. Et `songs_user_uid_title_artist_ci` a `user_uid` en tête de clé, or la jointure ne contraint pas `user_uid` : cet index ne peut pas la servir. Le commentaire doit dire ce qui est vrai — re-typé pour coller à l'expression de l'index, vérifié à la main sur la base de dev. [`backend/scripts/seed-catalog.js:240-260`]
- [x] [Review][Patch] **Deux assertions négatives sont tautologiques** — `not.toMatch(/f_unaccent/)` et `not.toMatch(/published_at/)` passent pour une chaîne qui ne contient aucun SQL, et survivent à un simple renommage. La vraie preuve de l'AC5 a été faite autrement (lecture de `getSong` et du refresh). [`backend/__tests__/seedCatalog.test.js:56-68`]
- [x] [Review][Patch] **Colonnes du rapport désalignées** — `Compteurs     :` contre `Compteurs après:`, et le libellé rattachées/à rattacher n'a pas la même largeur que `candidats`. Cosmétique, sauf que c'est exactement le bloc que l'opérateur lit pour décider d'autoriser une écriture en prod. [`backend/scripts/seed-catalog.js:449-455`]
- [x] [Review][Defer] **Aucun test automatisé n'exécute le SQL de rapprochement** [`backend/__tests__/seedCatalog.test.js:51-68`] — deferred. Les cinq assertions sont des `toMatch` sur une constante : rien ne parse ni n'exécute la requête. Le scénario avancé (« explose sur `column c."updatedAt" does not exist` au `--apply` prod ») est **empiriquement écarté** — la requête a réellement tourné contre Postgres pendant le dev, sur les 82 lignes du CSV en transaction annulée. Le manque reste réel mais 23.4 possède déjà la validation SQL sur base de dev, et le combler ici demanderait une dépendance de test (`pg-mem`) — décision hors périmètre d'une story qui ne devait toucher que deux fichiers.
- [x] [Review][Defer] **Un message d'erreur pg recopié tel quel peut emporter des titres de chansons dans les logs** [`backend/scripts/seed-catalog.js:333-335`] — deferred. Le script prend soin de n'afficher aucun email ; une violation de contrainte pg embarque en revanche les valeurs fautives. Report assumé : pendant une opération manuelle risquée, tronquer le message coûterait plus en diagnostic qu'il ne rapporte en confidentialité, et la sortie va dans le terminal de northwood.

**Patches appliqués le 2026-08-10** — les 10 constats `patch` ci-dessus sont corrigés. Backend **433 → 438 tests**, lint propre, dry-run réel réexécuté (le SQL a changé). Les 4 gardes ajoutés ont été **vérifiés par mutation**, pour ne pas refaire l'erreur que la review reprochait aux anciens tests : retirer `silent: true` casse 1 test, retirer titre/artiste du `where` en casse 3, retirer le garde de ligne inexploitable en casse 1, retirer la sortie 1 du lot entièrement non écrit en casse 1.

Les **2 constats `decision`** restent ouverts : ils engagent la donnée des bêta-testeurs, pas le code, et ne sont pas à moi de trancher.

_Écartés comme bruit (2) : « les `COUNT(*)` du dry-run sont calculés puis jetés » — ils sont **affichés**, et l'AC7 le demande explicitement (« photo de référence ») ; « Sequelize jette silencieusement `sourceCatalogSyncedAt` » — les deux attributs sont déclarés, vérifié via `Song.rawAttributes` à l'exécution._

## Dev Notes

### Le piège central de cette story

23.1 écrivait dans un pool **partagé** — une erreur y était réparable en supprimant des fiches. **23.2 écrit dans les Songs des utilisateurs.** Une requête trop large, un `where` oublié, et on touche la donnée d'entraînement de cinq personnes. D'où les compteurs avant/après en AC6 : ils ne sont pas décoratifs, ils sont la seule preuve mécanique que rien n'a été détruit.

### Pièges

- **Ne pas charger toutes les Songs en JS pour les comparer.** Le fold JS et le fold SQL sont deux implémentations de la même règle et peuvent diverger (c'est déjà un item deferred de 23.1 sur les espaces). Le rapprochement doit se faire **dans la requête**, avec l'expression de l'index.
- **`updatedAt` de l'entrée Catalog, pas `Date.now()`.** La drift se calcule contre `CatalogSong.updatedAt` ; y mettre l'heure du script rendrait toute entrée modifiée **avant** l'exécution faussement « à jour ».
- **`Song.update` déclenche les hooks du modèle** si le modèle en a. Vérifier `backend/models/song.js` avant d'écrire : un setter ou un hook `beforeUpdate` qui normaliserait `title` réécrirait l'identité du user — exactement ce que l'invariant 1 interdit. Si un tel hook existe, préférer une requête brute ciblée sur les deux colonnes.
- **`SessionItems.label` est un snapshot FR4** : il n'est pas concerné ici (on ne renomme rien en 23.2), mais il le sera en 23.3.
- **Ne pas filtrer sur `publishedAt`** : les entrées seedées en 23.1 sont toutes des brouillons ; filtrer les publiées ne rattacherait rien du tout.

### Anchors code (lus, non devinés)

- `backend/models/song.js:132-147` — `sourceCatalogUid` (`field: 'source_catalog_uid'`, soft, pas de FK) et `sourceCatalogSyncedAt` (`field: 'source_catalog_synced_at'`), tous deux nullable avec `defaultValue: null`.
- `backend/migrations/20260710000000-songs-title-artist-ci-unique.js:96` — `songs_user_uid_title_artist_ci` sur `(user_uid, lower(title), COALESCE(lower(artist), ''))` : l'identité côté Song, **scopée par utilisateur**.
- `backend/migrations/20260715000000-create-catalog-songs.js:104-108` — `catalog_songs_title_artist_ci`, l'identité côté Catalog, **globale**.
- `backend/scripts/seed-catalog.js` — le script à étendre : `parseArgs`, `isLocalHost`, `formatReport`, la garde par ligne et le refus sur base distante.
- `backend/controllers/songcontroller.js` — `refreshSongFromCatalog` : la discipline de référence (ne touche jamais `title`/`artist`, écrit les champs intrinsèques et `source_catalog_synced_at`).

### Project Structure Notes

- **UPDATE** : `backend/scripts/seed-catalog.js`, `backend/__tests__/seedCatalog.test.js`.
- **Aucun** fichier nouveau attendu ; aucun modèle, migration, contrôleur, route, front.
- Conventions backend : **CommonJS**, pas de `.ts`, modèles mockés dans les tests.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` § Epic 23 — invariants 1/2/4, décision B]
- [Source: `_bmad-output/implementation-artifacts/23-1-script-seed-entrees-catalog-brouillon.md` § Review Findings — les 14 correctifs dont cette story hérite, en particulier le garde sur l'hôte]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` 2026-08-10 — le piège `NODE_ENV`/`dotenv` app-wide, en HIGH]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev-story)

### Debug Log References

**Baseline backend mesurée avant de commencer** (action item n°1 de la rétro Epic 22) : **405 tests / 25 suites**. Après la story : **433 tests / 25 suites** (+28).

**Le modèle `Song` n'a ni hook ni setter.** Le piège n°3 des Dev Notes (un `beforeUpdate` qui normaliserait `title` réécrirait l'identité du user) a été vérifié, pas supposé : `grep -n "hooks\|beforeUpdate\|beforeSave\|beforeValidate\|set("` sur `backend/models/song.js` ne renvoie **rien**. `Song.update` sur deux colonnes est donc sûr, et le repli « requête brute » prévu par la story n'a pas été nécessaire.

**Exécution réelle du dry-run** (Task 7, la partie que les tests verts ne remplacent pas). Deux enseignements, tous deux consignés en deferred-work :

1. `NODE_ENV=development node scripts/seed-catalog.js --phase=attach` **n'atteint pas la base locale** : l'en-tête s'affiche correctement (`Base : localhost:5433/musician_tools (locale)`), puis la connexion casse sur `The server does not support SSL connections`. Le bloc `development` de `config.js` exige le SSL en dur, le Postgres du docker-compose ne le parle pas. C'est exactement la commande que le message de refus du script recommande — une consigne officielle qui ne marche pas.
2. `DB_ENABLE_SSL=false` **active** le SSL : la chaîne `'false'` est truthy. Il faut vider la variable.

Contournement retenu pour l'exécution : `DB_ENABLE_SSL= NODE_ENV=test` (le bloc `test` vise le même `DATABASE_URL_DEV`). Sortie obtenue :

```
Base          : localhost:5433/musician_tools  (locale)
Phase         : attach  (rattachement des Songs existantes)
Mode          : dry-run (aucune écriture)
Compteurs     : Songs=91  SongPlays=102  SessionItems=67  PlaylistSongs=4
=== DRY-RUN — aucune écriture ===
  candidats       : 1
  à rattacher     : 1
  par utilisateur :
      1e85fbfa-… : 1
Relancez avec --apply pour écrire.
```

**Un seul candidat n'exerce pas la jointure.** La base locale ne contient que 5 entrées Catalog (le seed 23.1 n'y a jamais été appliqué), donc ce dry-run prouvait surtout que la requête compile. J'ai répété la jointure sur données réalistes en insérant les 82 lignes du CSV **dans une transaction annulée** (`BEGIN … ROLLBACK`), contre le vrai Postgres :

```
--- candidats de la phase attach ---   user 1e85fbfa-… : 73
--- ambiguites (doit etre vide) ---    (0 rows)
--- Songs deja rattachees exclues ---  6
```

Soit : **73 rattachements**, **zéro ambiguïté** (l'index canonique tient), et les **6** Songs déjà pourvues d'une source restent hors sélection (invariant 2, vérifié côté SQL et pas seulement côté mock). État de la base avant et après la répétition : `5 | 91 | 6` dans les deux cas — le ROLLBACK n'a rien laissé.

### Completion Notes List

- **Le rapprochement est fait par Postgres, pas par le script** (AC1). `ATTACH_CANDIDATES_SQL` joint `Songs` × `CatalogSongs` sur l'expression de l'index d'identité (`lower()` des deux côtés, `coalesce(lower(artist),'')`, **accents conservés**, jamais `f_unaccent`). Aucune Song n'est chargée en mémoire pour être comparée en JS : le fold JS et le fold SQL peuvent diverger — ils divergent déjà sur les espaces (item deferred de 23.1) — et le seul fold qui fait autorité est celui de l'index.
- **La sonde d'ambiguïté est dans la requête**, pas après coup : `count(*) OVER (PARTITION BY s.uid)`. En théorie elle vaut toujours 1 puisque `catalog_songs_title_artist_ci` rend le fold unique côté Catalog ; un 2 signifie que l'index canonique ne fait pas son travail, et le script **refuse** ce candidat au lieu de prendre la première ligne revenue. Un seul candidat ambigu suffit à mettre le code de sortie à 1 : c'est un état à auditer, pas un « rien à faire ».
- **Deux colonnes, et le compte est vérifié par un test** (AC2) : `Object.keys(values).sort()` doit valoir exactement `['sourceCatalogSyncedAt','sourceCatalogUid']`. `syncedAt` reçoit le `CatalogSong.updatedAt` de l'entrée, jamais l'heure du script (décision B) — un test le vérifie par identité d'objet, donc un `new Date()` glissé là le casserait.
- **Décision non demandée par la story, à valider en review : `silent: true` sur l'`update`.** Sans lui, Sequelize pousse aussi `Songs."updatedAt"`. Rattacher, c'est reposer une métadonnée de provenance, pas éditer la chanson de quelqu'un : bumper l'`updatedAt` des songlists entières de cinq personnes falsifierait l'historique de la ligne et rendrait littéralement fausse la promesse « aucune autre colonne ». Vérifié avant de trancher qu'aucun contrôleur, route ni écran ne lit `Song.updatedAt` (`grep` sur `controllers/`, `routes/`, `src/`) — donc rien ne régresse. L'argument inverse (« la ligne a bien changé ») se défend ; je l'ai tranché du côté de l'AC.
- **Le `where` re-vérifie l'invariant 2 à l'écriture** (`{ uid, sourceCatalogUid: null }`), pas seulement à la sélection : entre le SELECT et l'UPDATE, une exécution concurrente ou un vrai « Add from Catalog » a pu poser un lien — et ce lien-là est le bon, pas le nôtre. Quand l'`update` ne touche 0 ligne, la Song part dans le seau `raced` et n'est **pas** comptée comme rattachée.
- **Les compteurs sont pris par les modèles, pas par des noms de table écrits à la main** (AC7). La story parlait de `playlist_songs` ; la table s'appelle en réalité **`PlaylistSongs`** (`playlist_songs` est le nom de l'index unique). Passer par `db.PlaylistSong.count()` supprime la question. Un écart sur l'une des quatre tables ⇒ message nommant la table et l'écart, puis code de sortie 1.
- **Le message d'écart nomme les deux causes possibles**, bug ou utilisateur en train d'écrire pendant l'exécution. Le second cas n'est pas théorique : les compteurs sont pris à deux instants sur une base vivante. L'AC exige d'échouer bruyamment dans les deux cas, et c'est ce qui est fait — mais l'opérateur doit savoir quoi regarder d'abord.
- **`--phase` inconnue refusée, `--file` refusé en phase attach.** `--phase=attachh` qui se rabattrait sur `seed` écrirait 82 entrées que personne n'a demandées ; `--file=` honoré en silence en phase attach ferait croire à une autre entrée que la base. Les deux lèvent, dans la lignée du « jamais ignorer un argument » de la review 23.1.
- **Écart de numérotation dans la story, laissé tel quel** : les Dev Notes renvoient aux « compteurs avant/après en AC6 » alors que ce sont l'**AC7** (l'AC6 est le rapport par utilisateur). Les deux sont satisfaits ; je ne corrige pas, le workflow n'autorise pas la modification des Dev Notes.
- **Non couvert par les tests unitaires, et assumé** : que le fold SQL de la requête coïncide avec l'index `songs_user_uid_title_artist_ci`. C'est du Postgres. La répétition en transaction annulée ci-dessus en donne la preuve empirique sur les données locales ; la validation formelle reste l'objet de 23.4.

### File List

- `backend/scripts/seed-catalog.js` — MODIFIÉ (phase attach : SQL de rapprochement, écriture, compteurs, rapport ; `parseArgs` gagne `--phase`)
- `backend/__tests__/seedCatalog.test.js` — MODIFIÉ (+28 tests)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIÉ (suivi)
- `_bmad-output/implementation-artifacts/deferred-work.md` — MODIFIÉ (2 pièges d'environnement découverts à l'exécution réelle)

Aucun modèle, migration, contrôleur, route ni fichier front touché (AC8, vérifié par `git diff --stat`).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 0.1 | Story créée (create-story). Étend le script de 23.1 plutôt que d'en créer un nouveau, donc hérite du garde sur l'hôte résolu — critique ici, car cette story écrit dans les données personnelles des utilisateurs et non plus dans un pool partagé. Compteurs avant/après posés en AC comme preuve mécanique de l'invariant « jamais recréer une Song ». | northwood |
| 2026-08-10 | 0.2 | Phase attach implémentée. Rapprochement en SQL sur l'expression de l'index, sonde d'ambiguïté par fonction fenêtre, écriture limitée à deux colonnes avec re-vérification de l'invariant 2 dans le `where`, compteurs de sécurité sur les 4 tables porteuses de donnée d'entraînement. Backend 405 → 433 tests. Dry-run exécuté pour de vrai, puis jointure répétée sur les 82 entrées du CSV dans une transaction annulée : 73 rattachements, 0 ambiguïté, 6 Songs déjà sourcées exclues. Deux pièges d'environnement découverts au passage (SSL en dur en dev, `DB_ENABLE_SSL=false` truthy) et consignés en deferred-work. | northwood |
