---
baseline_commit: a43b9a65811691c737a7f4e556b11a2ab84863fe
---

# Story 23.3: Alias — rattacher les saisies divergentes et corriger l'orthographe

Status: ready-for-dev

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

- [ ] **Task 1 — Lecture de la table d'alias** (AC: 1)
  - [ ] `parseAliasCsv(text)` sur le modèle de `parseSeedCsv` : réutiliser `splitCsvLine` (déjà RFC4180-ish, gère `Guns N' Roses` et une virgule entre guillemets), NFC, BOM, en-tête vérifié, lignes incomplètes rapportées.
  - [ ] Refuser un **doublon de fold d'alias** dans le fichier : deux lignes qui rattacheraient la même saisie à deux fiches différentes doivent lever, pas se résoudre premier-gagnant.
  - [ ] ⚠️ **Un alias dont le fold égale son propre fold canonique est inutile** (la phase exacte l'a déjà pris) : le signaler comme sauté plutôt que de le traiter.
- [ ] **Task 2 — Sélection des candidats en SQL** (AC: 2, 5)
  - [ ] Une requête par alias, ou une requête paramétrée sur la liste — mais **le rapprochement reste en SQL**, sur l'expression de l'index (`lower(s.title)`, `coalesce(lower(s.artist),'')`), jamais un `toLowerCase()` JS comparé en mémoire.
  - [ ] Résoudre l'entrée Catalog **canonique** (fold de `artist,title`) et récupérer son `uid` + `updatedAt`. Absente ⇒ AC5.
  - [ ] `s.source_catalog_uid IS NULL` dans la sélection (invariant 2).
- [ ] **Task 3 — Détection de collision de renommage** (AC: 4)
  - [ ] Avant d'écrire : existe-t-il une **autre** Song du **même** `user_uid` dont le fold d'identité égale déjà la forme canonique ? Si oui → rattacher sans renommer, et consigner.
  - [ ] ⚠️ **La vérification préalable ne suffit pas.** L'index est un index unique : deux exécutions concurrentes, ou une chanson créée entre-temps, peuvent lever une **23505** au moment de l'`UPDATE`. Attraper `SequelizeUniqueConstraintError`, **nommer la contrainte** (comme le fait `seedCatalog`), et retomber sur « rattacher sans renommer » plutôt que de faire échouer la ligne.
- [ ] **Task 4 — L'écriture** (AC: 3, 4, 6)
  - [ ] `Song.update({ sourceCatalogUid, sourceCatalogSyncedAt, title, artist }, { where: … })` — 4 champs, pas un de plus.
  - [ ] Le `where` re-vérifie **à l'écriture** : `{ uid, sourceCatalogUid: null, title: <saisie>, artist: <saisie> }`, la discipline de 23.2. 0 ligne touchée ⇒ seau « non écrites », pas « rattachées ».
  - [ ] Décider et **documenter** le sort de `silent` : 23.2 l'a mis parce que reposer une métadonnée n'est pas une édition. **Ici on modifie vraiment la chanson de l'utilisateur** — l'argument s'inverse. Trancher explicitement dans les Completion Notes, pas par copier-coller.
  - [ ] Garde par ligne (`try` englobant lecture et écriture).
- [ ] **Task 5 — Rapport** (AC: 7, 8)
  - [ ] Avant/après par utilisateur : `AC DC / Back in black` → `AC/DC / Back in Black`.
  - [ ] Sections distinctes : rattachées+renommées, rattachées **sans** renommage (collision), refusées (entrée canonique absente), échecs.
  - [ ] Une ligne explicite sur `SessionItems.label` **dès qu'au moins une renommée a une session à son actif** — sinon c'est du bruit. Le cas existe en dev : `Little Lord Fentanyl (feat. Pucifer)`.
  - [ ] Jamais d'email dans le rapport.
- [ ] **Task 6 — Compteurs de sécurité** (AC: 9)
  - [ ] Réutiliser `countGuardedTables` et `diffCounts` — **ne pas les réécrire**.
- [ ] **Task 7 — Tests** (AC: 1, 3, 4, 5, 6)
  - [ ] Étendre `backend/__tests__/seedCatalog.test.js` (modèles mockés) : en-tête d'alias refusé ; doublon de fold d'alias refusé ; l'`update` porte sur **exactement 4 champs** ; le `where` re-vérifie la saisie ; collision détectée ⇒ rattachée sans renommage ; **23505 concurrente ⇒ même repli, contrainte nommée** ; entrée canonique absente ⇒ refus avec raison ; dry-run n'écrit rien ; phase inconnue refusée.
  - [ ] **Vérifier les nouveaux gardes par mutation**, comme en review 23.2 : casser le garde de collision doit faire échouer un test. Un test qui ne meurt pas quand on casse ce qu'il teste ne teste rien.
  - [ ] Baseline backend à **mesurer** avant de commencer (438 au dernier relevé — le vérifier, pas le recopier).
- [ ] **Task 8 — Validation** (AC: 10)
  - [ ] `cd backend && npm test` + `npm run lint`. `git diff --stat` : script + test uniquement.
  - [ ] **Exécuter réellement le dry-run** de la phase alias et lire sa sortie. ⚠️ `NODE_ENV=development` **ne se connecte pas** à la base locale (SSL en dur dans `config.js`, cf. deferred-work) : utiliser `DB_ENABLE_SSL= NODE_ENV=test`.
  - [ ] Comparer le nombre de candidats à la mesure de cadrage : **8 en dev**, chez un seul utilisateur. Un chiffre différent doit être expliqué, pas accepté.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 0.1 | Story créée (create-story). Troisième phase du même script. Seule story de l'epic qui réécrit `title`/`artist` d'un utilisateur, donc invariant 1 levé pour les 9 lignes nommées uniquement. Table d'alias vérifiée avant rédaction : 9 cibles présentes, 0 alias mort, 0 collision entre alias, tout en NFC ; 8 des 9 matchent en dev, chez un seul utilisateur, avec 0 collision de renommage. Le cas `Little Lord Fentanyl (feat. Pucifer)` (1 SongPlay, 1 SessionItem) rend concret le snapshot FR4 de `SessionItems.label`. | northwood |
