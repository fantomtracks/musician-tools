---
baseline_commit: a43b9a65811691c737a7f4e556b11a2ab84863fe
---

# Story 23.3: Alias — rattacher les saisies divergentes et corriger l'orthographe

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur beta dont la saisie contenait une faute**,
I want **que ma chanson soit quand même reliée au Catalog, et son orthographe corrigée**,
so that **je ne sois pas pénalisé parce que j'avais tapé « AC DC »**.

## Contexte / origine

Troisième story d'**Epic 23**. La 23.1 a créé les entrées Catalog, la 23.2 a rattaché tout ce qui correspondait **exactement**. Il reste les saisies que le nettoyage du CSV a fait diverger : le Catalog est propre, leur orthographe ne l'est pas, et le fold exact ne les voit plus.

**C'est la décision F**, prise après mesure : *« je ne veux pas que les utilisateurs payent. Même dans le meilleur des mondes, corrige l'orthographe dans leur songlist. »* Le Catalog reste propre **et** personne ne perd son lien.

**Elle étend encore le même script** `backend/scripts/seed-catalog.js`, avec une troisième phase. Elle hérite donc du garde sur l'hôte, du dry-run par défaut et du refus d'argument inconnu — et cette fois plus que jamais : **c'est la seule story de l'epic qui réécrit le `title` et l'`artist` d'un utilisateur.**

## Ce que 23.2 a mis en place et qu'il faut réutiliser

- **Le garde sur l'hôte résolu** (`isLocalHost` + `--allow-remote`) : jamais contourné, jamais dupliqué.
- **`--phase=<seed|attach>`** avec refus d'une phase inconnue et d'un drapeau répété. Cette story ajoute `--phase=alias`.
- **Le `where` qui re-vérifie tout à l'écriture** — pas seulement la source. En 23.2 il porte `{ uid, sourceCatalogUid: null, title, artist }` parce qu'une chanson renommée entre le SELECT et l'UPDATE se voyait sinon estampiller une provenance périmée. **Ici la même discipline est encore plus nécessaire : on modifie l'identité.**
- **Les compteurs de sécurité** sur `Songs`, `SongPlays`, `SessionItems`, `PlaylistSongs`, pris via les modèles. Ils encadrent le lot et échouent bruyamment sur tout écart. *(Statut réel : garde-fou, pas preuve — cf. la décision ouverte de la review 23.2.)*
- **Le rapprochement en SQL**, jamais en JS.
- **La garde par ligne**, `try` englobant lecture et écriture.

## Mesures faites avant d'écrire cette story (base de dev, pas supposées)

Le fichier `backend/scripts/seed/catalog-seed-aliases.csv` (9 lignes, `aliasArtist,aliasTitle,artist,title`) a été vérifié :

- Les **9 cibles canoniques existent** toutes dans `catalog-seed.csv` — aucun alias ne pointe dans le vide.
- Les 9 folds d'alias **diffèrent** de leur fold canonique : aucun alias mort que la phase exacte aurait déjà pris.
- **Aucune collision** entre alias, et aucun fold d'alias ne percute une **autre** entrée du seed — donc aucun risque de rattacher à la mauvaise fiche.
- Tout est en **NFC**.

Sur la base de dev : **8 des 9 alias matchent une Song**, toutes chez le **même** utilisateur (`1e85fbfa…`). Le neuvième (`Jamiroquoi / Runaway`) n'existe pas en dev — la base de dev n'est pas la prod, et le chiffre qui compte sera celui du dump prod en 23.4.

**Zéro collision de renommée** en dev : aucune des 8 renommées ne percute une autre chanson du même utilisateur. La garde reste **obligatoire** — la prod n'est pas la dev, et c'est exactement le genre de chose qu'on ne découvre pas deux fois.

**Le cas qui rend le piège `SessionItems.label` concret** : `Primus / Little Lord Fentanyl (feat. Pucifer)` a **1 SongPlay et 1 SessionItem**. Après renommage, la songlist affichera « Puscifer » et l'historique de session continuera d'afficher « Pucifer ». Vérifié en base :

```
label_fige_dans_la_session           | titre_actuel_de_la_song
Little Lord Fentanyl (feat. Pucifer) | Little Lord Fentanyl (feat. Pucifer)
```

C'est le **contrat FR4** (`models/sessionitem.js:41-42` : *« an entry keeps its display name even after the song/topic is deleted »*), pas une régression. À **dire** dans le rapport pour que northwood ne le prenne pas pour un bug en QA.

## Décisions et invariants applicables

- **Invariant 1 — AMENDÉ par la décision F.** « Jamais recréer une Song » reste entier : le renommage est un `UPDATE` sur la ligne en place, jamais un delete/recreate. L'interdiction de réécrire `title`/`artist` est **levée pour les seules lignes de la table d'alias**, et uniquement pour aligner sur la fiche canonique. Partout ailleurs elle tient.
- **Invariant 2** — ne jamais toucher une Song qui a déjà un `sourceCatalogUid`.
- **Invariant 3** — fold d'**identité** : `lower(x)` + `COALESCE(lower(artist),'')`, **accents conservés**. Jamais `f_unaccent`.
- **Invariant 4** — rapprochement par requête sur la base.
- **Décision B** — `source_catalog_synced_at = CatalogSong.updatedAt`, comme en 23.2.
- **La sémantique de `refreshSongFromCatalog` n'est pas touchée** : il ne réécrit jamais `title`/`artist`, et ce n'est pas cette story qui va l'y autoriser.

## Acceptance Criteria

1. **La table d'alias est lue depuis le fichier versionné** `backend/scripts/seed/catalog-seed-aliases.csv`, en-tête `aliasArtist,aliasTitle,artist,title` **vérifié** et refusé s'il diffère — même discipline que `parseSeedCsv`, qui refuse de deviner l'ordre des colonnes. NFC appliqué à la lecture.
2. **Rattachement par alias** — toute Song sans `source_catalog_uid` dont le fold d'identité correspond au fold d'un **alias** est rattachée à l'entrée Catalog de la forme **canonique**, avec `source_catalog_synced_at = CatalogSong.updatedAt` (décision B), exactement comme en 23.2.
3. **Correction orthographique, et rien d'autre** — `title` et `artist` sont réécrits vers la forme canonique. **Aucun autre champ** : ni `key`, ni `bpm`, ni `instrument`, ni `notes`, ni `lastPlayed`, ni `myInstrumentUid`, ni le tuning. Un test vérifie la liste **exacte** des champs mis à jour (4 : les 2 de provenance + `title` + `artist`).
4. **Une renommée qui collisionnerait avec une autre chanson du même utilisateur ne renomme pas** — `songs_user_uid_title_artist_ci` rend l'identité unique **par user**. Dans ce cas : la Song est **quand même rattachée** (le lien ne fait de mal à personne), le renommage est **abandonné**, et le cas est **signalé nommément** dans le rapport. Jamais d'écrasement, jamais de choix au hasard. La collision doit être détectée **avant** l'écriture *et* survivre à une 23505 concurrente.
5. **Une entrée canonique absente du Catalog est signalée, pas silencieuse** — si l'alias pointe vers une fiche qui n'existe pas (seed non joué, fiche supprimée), la ligne est refusée avec sa raison. Ne **jamais** créer l'entrée à la volée : c'est le travail de la phase seed.
6. **Idempotence** — une seconde exécution `--apply` ne rattache et ne renomme **rien**, et le rapporte. Après renommage, la Song ne matche plus l'alias mais la forme canonique : elle est aussi couverte par l'invariant 2 (elle a désormais une source).
7. **`--dry-run` liste l'avant/après par utilisateur** — pour chaque Song concernée : `artiste / titre` **avant** et **après**, groupés par user, sans rien écrire. C'est ce que northwood lira avant d'autoriser la prod.
8. **Le rapport dit que l'historique des sessions garde l'ancienne orthographe** — `SessionItems.label` est un snapshot FR4 volontaire. Une ligne explicite dans le rapport, pour que ce ne soit pas pris pour un bug.
9. **Compteurs avant/après inchangés** — `Songs`, `SongPlays`, `SessionItems`, `PlaylistSongs`, comme en 23.2. Écart ⇒ échec bruyant.
10. **Aucune modification du schéma, du modèle, d'un contrôleur, d'une route ou du front.** Aucune migration.

## Tasks / Subtasks

- [x] **Task 1 — Lecture de la table d'alias** (AC: 1)
  - [x] `parseAliasCsv(text)` sur le modèle de `parseSeedCsv` : réutiliser `splitCsvLine` (déjà RFC4180-ish, gère `Guns N' Roses` et une virgule entre guillemets), NFC, BOM, en-tête vérifié, lignes incomplètes rapportées.
  - [x] Refuser un **doublon de fold d'alias** dans le fichier : deux lignes qui rattacheraient la même saisie à deux fiches différentes doivent lever, pas se résoudre premier-gagnant.
  - [x] ⚠️ **Un alias dont le fold égale son propre fold canonique est inutile** (la phase exacte l'a déjà pris) : le signaler comme sauté plutôt que de le traiter.
- [x] **Task 2 — Sélection des candidats en SQL** (AC: 2, 5)
  - [x] Une requête par alias, ou une requête paramétrée sur la liste — mais **le rapprochement reste en SQL**, sur l'expression de l'index (`lower(s.title)`, `coalesce(lower(s.artist),'')`), jamais un `toLowerCase()` JS comparé en mémoire.
  - [x] Résoudre l'entrée Catalog **canonique** (fold de `artist,title`) et récupérer son `uid` + `updatedAt`. Absente ⇒ AC5.
  - [x] `s.source_catalog_uid IS NULL` dans la sélection (invariant 2).
- [x] **Task 3 — Détection de collision de renommage** (AC: 4)
  - [x] Avant d'écrire : existe-t-il une **autre** Song du **même** `user_uid` dont le fold d'identité égale déjà la forme canonique ? Si oui → rattacher sans renommer, et consigner.
  - [x] ⚠️ **La vérification préalable ne suffit pas.** L'index est un index unique : deux exécutions concurrentes, ou une chanson créée entre-temps, peuvent lever une **23505** au moment de l'`UPDATE`. Attraper `SequelizeUniqueConstraintError`, **nommer la contrainte** (comme le fait `seedCatalog`), et retomber sur « rattacher sans renommer » plutôt que de faire échouer la ligne.
- [x] **Task 4 — L'écriture** (AC: 3, 4, 6)
  - [x] `Song.update({ sourceCatalogUid, sourceCatalogSyncedAt, title, artist }, { where: … })` — 4 champs, pas un de plus.
  - [x] Le `where` re-vérifie **à l'écriture** : `{ uid, sourceCatalogUid: null, title: <saisie>, artist: <saisie> }`, la discipline de 23.2. 0 ligne touchée ⇒ seau « non écrites », pas « rattachées ».
  - [x] Décider et **documenter** le sort de `silent` : 23.2 l'a mis parce que reposer une métadonnée n'est pas une édition. **Ici on modifie vraiment la chanson de l'utilisateur** — l'argument s'inverse. Trancher explicitement dans les Completion Notes, pas par copier-coller.
  - [x] Garde par ligne (`try` englobant lecture et écriture).
- [x] **Task 5 — Rapport** (AC: 7, 8)
  - [x] Avant/après par utilisateur : `AC DC / Back in black` → `AC/DC / Back in Black`.
  - [x] Sections distinctes : rattachées+renommées, rattachées **sans** renommage (collision), refusées (entrée canonique absente), échecs.
  - [x] Une ligne explicite sur `SessionItems.label` **dès qu'au moins une renommée a une session à son actif** — sinon c'est du bruit. Le cas existe en dev : `Little Lord Fentanyl (feat. Pucifer)`.
  - [x] Jamais d'email dans le rapport.
- [x] **Task 6 — Compteurs de sécurité** (AC: 9)
  - [x] Réutiliser `countGuardedTables` et `diffCounts` — **ne pas les réécrire**.
- [x] **Task 7 — Tests** (AC: 1, 3, 4, 5, 6)
  - [x] Étendre `backend/__tests__/seedCatalog.test.js` (modèles mockés) : en-tête d'alias refusé ; doublon de fold d'alias refusé ; l'`update` porte sur **exactement 4 champs** ; le `where` re-vérifie la saisie ; collision détectée ⇒ rattachée sans renommage ; **23505 concurrente ⇒ même repli, contrainte nommée** ; entrée canonique absente ⇒ refus avec raison ; dry-run n'écrit rien ; phase inconnue refusée.
  - [x] **Vérifier les nouveaux gardes par mutation**, comme en review 23.2 : casser le garde de collision doit faire échouer un test. Un test qui ne meurt pas quand on casse ce qu'il teste ne teste rien.
  - [x] Baseline backend à **mesurer** avant de commencer (438 au dernier relevé — le vérifier, pas le recopier).
- [x] **Task 8 — Validation** (AC: 10)
  - [x] `cd backend && npm test` + `npm run lint`. `git diff --stat` : script + test uniquement.
  - [x] **Exécuter réellement le dry-run** de la phase alias et lire sa sortie. ⚠️ `NODE_ENV=development` **ne se connecte pas** à la base locale (SSL en dur dans `config.js`, cf. deferred-work) : utiliser `DB_ENABLE_SSL= NODE_ENV=test`.
  - [x] Comparer le nombre de candidats à la mesure de cadrage : **8 en dev**, chez un seul utilisateur. Un chiffre différent doit être expliqué, pas accepté.

## Dev Notes

### Le piège central de cette story

Les deux stories précédentes posaient des métadonnées. **Celle-ci réécrit ce que l'utilisateur a tapé.** Un `where` trop large ou une collision mal gérée, et on renomme la mauvaise chanson dans la songlist de quelqu'un — sans qu'il l'ait demandé, et sans qu'il sache pourquoi. C'est aussi la seule story de l'epic dont l'effet est **visible** par l'utilisateur.

### Pièges

- **La collision de renommage n'est pas théorique et ne se voit pas dans un test unitaire.** L'index `songs_user_uid_title_artist_ci` est fonctionnel et **par utilisateur** : rien n'empêche le même user d'avoir déjà « AC/DC / Back in Black » à côté de « AC DC / Back in black ». En dev, zéro cas — en prod, inconnu. Le garde doit exister **et** la 23505 doit être rattrapée.
- **Ne pas renommer via `song.title = …; song.save()`** : ça sauve tout l'objet. Un `Song.update` ciblé sur 4 champs, comme en 23.2.
- **L'ordre des phases compte.** La phase alias doit tourner **après** l'exact-fold : sinon une Song que le fold exact aurait prise pourrait être traitée comme un alias et renommée sans nécessité. À poser explicitement dans la doc du script.
- **`SessionItems.label` ne se réécrit pas** (AC8). C'est le contrat FR4, mesuré ci-dessus. Tenter de le « corriger » serait réécrire l'historique.
- **Le modèle `Song` n'a ni hook ni setter** — vérifié en 23.2 (`grep hooks|beforeUpdate|beforeSave|beforeValidate|set(` sur `models/song.js` : vide). Un `update` sur `title` ne déclenchera donc pas de normalisation cachée. Le re-vérifier si le modèle a bougé.
- **`createSong` normalise titre et artiste depuis la story 16.1** : la forme canonique écrite ici doit être cohérente avec ce que le contrôleur produirait, sinon on introduit une divergence que personne ne verra avant longtemps.

### Anchors code (lus, non devinés)

- `backend/scripts/seed-catalog.js` — `parseSeedCsv`, `splitCsvLine`, `parseArgs` (phases + drapeau répété), `countGuardedTables`, `diffCounts`, `attachSongs`, `formatAttachReport`, la garde par ligne et le nommage de contrainte sur 23505.
- `backend/scripts/seed/catalog-seed-aliases.csv` — les 9 lignes, vérifiées ci-dessus.
- `backend/migrations/20260710000000-songs-title-artist-ci-unique.js:96` — `songs_user_uid_title_artist_ci`, l'unicité **par utilisateur** : la source de la collision de renommage.
- `backend/models/sessionitem.js:41-46` — `label`, snapshot FR4, `allowNull: false`.
- `backend/controllers/songcontroller.js` — `refreshSongFromCatalog` ne touche jamais `title`/`artist` ; `createSong` mappe la 23505 en 409 (story 17.1) et normalise titre/artiste (16.1).

### Project Structure Notes

- **UPDATE** : `backend/scripts/seed-catalog.js`, `backend/__tests__/seedCatalog.test.js`.
- **Déjà versionné, ne pas régénérer** : `backend/scripts/seed/catalog-seed-aliases.csv`.
- Conventions backend : **CommonJS**, pas de `.ts`, modèles mockés dans les tests.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` § Epic 23 — décision F, invariant 1 amendé, story 23.3]
- [Source: `_bmad-output/implementation-artifacts/23-2-script-rattachement-songs-existantes.md` § Review Findings — les 10 patches dont cette story hérite, en particulier le `where` élargi et la vérification par mutation]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` 2026-08-10 — le SSL en dur qui empêche `NODE_ENV=development` d'atteindre la base locale]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev-story)

### Debug Log References

**Baseline backend mesurée** avant de commencer : **438 tests / 25 suites** (le chiffre annoncé dans la story, vérifié et non recopié). Après : **464 / 25** (+26).

**Le dry-run réel a refusé les 8 candidats — et c'est le bon comportement.** La base de dev ne contient que 5 entrées Catalog : le seed de 23.1 n'y a jamais été appliqué. Chaque alias pointe donc vers une fiche absente, et l'AC5 s'est déclenchée pour de vrai plutôt que dans un mock :

```
Compteurs       : Songs=91  SongPlays=102  SessionItems=67  PlaylistSongs=4
Alias           : 9 exploitables, 0 sautés
  candidats       : 8
  à renommer      : 0
  REFUSÉES        : 8
      ✗ song 55ef6b30… : entrée canonique absente du Catalog (AC/DC / Back in Black)
      …
```

Code de sortie : **1**. Un refus n'est pas un skip — il veut dire qu'un alias pointe dans le vide et que quelqu'un doit décider.

**Le chemin de renommage a donc été exercé séparément**, en insérant les 82 entrées du seed dans une **transaction annulée** et en rejouant la requête exacte du script contre Postgres :

```
avant                                         | apres                                          | fiche | collisions | sessions
AC DC / Back in black                         | AC/DC / Back in Black                          | t     |     0      |    0
System of a Down / Chop suey !                | System of a Down / Chop Suey!                  | t     |     0      |    0
Beatles / Come together                       | The Beatles / Come Together                    | t     |     0      |    0
Alan Parson Project / Eye in the sky          | The Alan Parsons Project / Eye in the Sky      | t     |     0      |    0
AC DC / Highway to hell                       | AC/DC / Highway to Hell                        | t     |     0      |    0
Beatles / I want you (she's so heavy)         | The Beatles / I Want You (She's So Heavy)      | t     |     0      |    0
Primus / Little Lord Fentanyl (feat. Pucifer) | Primus / Little Lord Fentanyl (feat. Puscifer) | t     |     0      |    1
Guns n roses / My Michelle                    | Guns N' Roses / My Michelle                    | t     |     0      |    0
```

Les 8 fiches canoniques sont trouvées, **zéro collision**, et `Little Lord Fentanyl` porte bien **1 SessionItem** — donc la note FR4 se déclenchera à l'exécution réelle, ce qui était l'objet de l'AC8. État de la base avant et après : `5 | 91 | 6` dans les deux cas.

**Les 6 gardes de cette story sont vérifiés par mutation** (Task 7), pas seulement couverts :

| mutation | tests qui meurent |
|---|---|
| le garde de collision ne bloque plus le renommage | 2 |
| la 23505 ne retombe plus sur le rattachement seul | 2 |
| une entrée canonique absente n'est plus refusée | 1 |
| le `where` ne re-vérifie plus la saisie | 1 |
| un alias contradictoire est résolu premier-gagnant | 1 |
| le renommage devient silencieux | 1 |

### Completion Notes List

- **La décision laissée ouverte par la story est tranchée, et dans l'autre sens que 23.2.** Le renommage **ne** passe **pas** `silent`. En 23.2 on reposait une métadonnée de provenance et masquer `updatedAt` était honnête ; ici la chanson de l'utilisateur change vraiment, et geler `updatedAt` ferait mentir la ligne sur sa propre histoire. En revanche le chemin « rattacher **sans** renommer » (collision) reste `silent`, parce que lui n'écrit que la provenance. Un test verrouille les deux sens, et la mutation le confirme.
- **La collision est détectée en SQL et rattrapée à l'écriture.** Le pré-contrôle compte, sur le **même** utilisateur et en excluant la chanson elle-même, les lignes dont le fold égale déjà la forme canonique. Ça ne suffit pas : `songs_user_uid_title_artist_ci` est un index unique, et une chanson créée entre le SELECT et l'UPDATE lèverait une 23505. Le `catch` retombe alors sur « rattacher sans renommer » en **nommant la contrainte**, au lieu de faire échouer la ligne. Zéro collision en dev — la garde existe pour la prod, qui est inconnue d'ici.
- **Un alias qui se contredit fait lever, il n'est pas arbitré.** Deux lignes envoyant la même saisie vers deux fiches différentes ⇒ `SeedFileError`. Deux lignes **strictement identiques** ⇒ simple doublon sauté : c'est de la redondance, pas une contradiction. La distinction est testée.
- **Un alias dont le fold égale déjà sa forme canonique est sauté** : la phase exacte de 23.2 l'a forcément pris, et le « renommer » vers l'orthographe qu'il a déjà n'aurait aucun sens. Aucun cas dans le fichier actuel (vérifié au cadrage), mais le fichier vivra.
- **La table d'alias voyage en paramètres liés**, pas interpolée : ces chaînes viennent d'un fichier et l'une d'elles contient légitimement une apostrophe (`Guns N' Roses`). Le premier tuple est casté en `::text` — sans ça Postgres refuse d'inférer le type des paramètres dans un `VALUES`.
- **`LEFT JOIN` sur `CatalogSongs`, pas `JOIN`** : une fiche canonique absente doit **remonter** pour être refusée et nommée. Avec un `JOIN`, elle disparaîtrait de la liste des candidats et le rapport dirait « rien à faire » — le cas s'est produit pour de vrai sur la base de dev, et c'est cette ligne qui l'a rendu visible.
- **La note FR4 n'apparaît que si elle s'applique.** `SessionItems.label` est un instantané volontaire : après correction, l'historique gardera « Pucifer ». Le rapport le dit **uniquement** quand au moins une renommée a un historique — un avertissement inconditionnel est du bruit, et le bruit est ce qui rend les vrais avertissements invisibles. Un test verrouille les deux branches.
- **Un refus met le code de sortie à 1**, au même titre qu'un échec. C'est délibéré : « l'alias pointe vers une fiche qui n'existe pas » demande une décision humaine, pas un haussement d'épaules.
- **Ordre des phases documenté dans l'en-tête du script** : seed → attach → alias. Si la phase alias tournait avant l'exact-fold, une chanson que le fold exact aurait prise pourrait être renommée par un alias dont elle n'avait pas besoin.
- **`--file` est désormais refusé pour toute phase autre que `seed`**, avec un message propre à la phase — la phase alias lit bien un CSV, mais un CSV versionné et fixe, pas celui qu'on lui passerait.
- **Non couvert par les tests unitaires, et assumé** : que le fold SQL coïncide avec `songs_user_uid_title_artist_ci`. C'est du Postgres ; la répétition en transaction annulée ci-dessus en donne la preuve empirique, la validation formelle reste l'objet de 23.4.

### File List

- `backend/scripts/seed-catalog.js` — MODIFIÉ (phase alias : lecture de la table, SQL de rapprochement + sondes de collision et d'historique, écriture, rapport avant/après)
- `backend/__tests__/seedCatalog.test.js` — MODIFIÉ (+26 tests)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIÉ (suivi)

Inchangé et volontairement non régénéré : `backend/scripts/seed/catalog-seed-aliases.csv`. Aucun modèle, migration, contrôleur, route ni front (AC10, vérifié par `git diff --name-only`).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 0.1 | Story créée (create-story). Troisième phase du même script. Seule story de l'epic qui réécrit `title`/`artist` d'un utilisateur, donc invariant 1 levé pour les 9 lignes nommées uniquement. Table d'alias vérifiée avant rédaction : 9 cibles présentes, 0 alias mort, 0 collision entre alias, tout en NFC ; 8 des 9 matchent en dev, chez un seul utilisateur, avec 0 collision de renommage. Le cas `Little Lord Fentanyl (feat. Pucifer)` (1 SongPlay, 1 SessionItem) rend concret le snapshot FR4 de `SessionItems.label`. | northwood |
| 2026-08-10 | 0.2 | Phase alias implémentée. Rapprochement, détection de collision et comptage d'historique en SQL, table d'alias en paramètres liés. Renommage NON silencieux (décision inverse de 23.2, argumentée) ; collision ⇒ rattachement sans renommage, y compris en repli d'une 23505 concurrente ; fiche canonique absente ⇒ refus et code de sortie 1. Backend 438 → 464. Les 6 gardes vérifiés par mutation. Dry-run réel exécuté : les 8 candidats refusés faute de Catalog seedé en local — comportement attendu, AC5 validée sur du réel ; chemin de renommage exercé à part en transaction annulée (8 fiches trouvées, 0 collision, 1 SessionItem qui déclenchera la note FR4). | northwood |
