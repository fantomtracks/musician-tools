---
baseline_commit: a43b9a65811691c737a7f4e556b11a2ab84863fe
---

# Story 23.3: Alias — rattacher les saisies divergentes et corriger l'orthographe

Status: in-progress

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

### Review Findings

_Code review du 2026-08-10. **Les 3 couches ont rendu** cette fois (2 min 40 à 4 min 40). Chaque constat a été vérifié plutôt que cru — deux tombent à la vérification, et l'une d'elles a révélé une erreur de ma part, corrigée ci-dessus dans le tableau de mutation._

- [ ] [Review][Decision] **Le chemin « collision » estampille `syncedAt`, donc la copie mal orthographiée se lit comme à jour — pour toujours** — quand une renommée est abandonnée pour cause de collision, la Song reçoit quand même `sourceCatalogSyncedAt = catalog.updatedAt`. Or `getSong` calcule `drift = syncedAt == null || catalog.updatedAt > syncedAt` (`songcontroller.js:114`) : la drift est donc **fausse**, et l'UI présentera « AC DC / Back in black » comme synchronisée avec le Catalog. `refreshSongFromCatalog` ne touche jamais `title`/`artist`, donc rien ne la réparera jamais. Et au passage suivant, `WHERE s.source_catalog_uid IS NULL` l'exclut : elle devient **injoignable**. Laisser `syncedAt` à `NULL` sur ce chemin la ferait ressortir comme divergente — mais ça contredit la **décision B** de l'epic. À trancher : décision B s'applique-t-elle au chemin qui n'a pas renommé ?
- [ ] [Review][Decision] **Écrire l'orthographe canonique depuis la fiche Catalog plutôt que depuis le CSV** — aujourd'hui l'`UPDATE` écrit `c.canonTitle`/`c.canonArtist`, c'est-à-dire les colonnes du CSV. La fiche Catalog est jointe **sans distinction de casse**, donc si le CSV et la fiche divergent un jour, on écrit chez l'utilisateur une orthographe qui n'est pas celle de la fiche à laquelle on le rattache. Prendre `c.title`/`c.artist` de la fiche rendrait l'invariant structurel. Contre-argument réel : une fiche mal orthographiée se propagerait alors chez les utilisateurs. Vérifié aujourd'hui : les 9 formes canoniques du CSV correspondent **octet pour octet** aux entrées du seed, donc le choix est sans effet immédiat — c'est un choix de modèle, pas un correctif.
- [x] [Review][Patch] **Une colonne artiste vide est acceptée, des deux côtés, dans la seule phase autorisée à réécrire des données utilisateur** — le contrôle de complétude est `if (!aliasTitle || !title)` : les deux colonnes artiste ne sont jamais validées. Vérifié à l'exécution : `,Runaway,Jamiroquai,Runaway` est **accepté**. Conséquences, chacune grave : un `aliasArtist` vide joint sur `coalesce(lower(s.artist),'') = ''` et réclame donc **toutes** les chansons de ce titre sans artiste, **chez tous les utilisateurs**, puis les renomme ; un `artist` canonique vide fait écrire `artist: null` par-dessus l'artiste réel de l'utilisateur, et le rapport l'affiche `— / Back in Black`, ce qui se lit comme du formatage et non comme une perte. [`backend/scripts/seed-catalog.js:469`]
- [x] [Review][Patch] **L'ordre des phases n'est garanti que par un commentaire** — si `--phase=alias --apply` est lancé avant l'attach, ou si le Catalog gagne un jour une fiche orthographiée **comme un alias**, une chanson correctement orthographiée se fait renommer vers autre chose, sur des données vivantes, sans annulation possible. Aujourd'hui c'est sûr par accident : aucune des 9 orthographes d'alias n'est elle-même une entrée du seed. Rendre le garde structurel : `AND NOT EXISTS (SELECT 1 FROM "CatalogSongs" x WHERE <x matche l'orthographe de l'alias>)`. [`backend/scripts/seed-catalog.js:19-20`, `:514-546`]
- [x] [Review][Patch] **Un alias qui ne matche aucune chanson est invisible et le run sort en 0** — le rapport dit « Alias : 9 exploitables » puis un nombre de candidats, jamais **lesquels** n'ont rien trouvé. Or la jointure est exacte à la casse près : une espace finale, une apostrophe courbe (`she’s` vs `she's`), un accent NFD, et l'alias ne matche rien. Toute la story existe pour 9 chansons précises — un 0 silencieux est exactement l'issue que personne ne remarque, et il n'y aura pas de seconde chance parce que l'opérateur considérera la phase faite. [`backend/scripts/seed-catalog.js:713-760`]
- [x] [Review][Patch] **Aucune sonde d'ambiguïté sur la jointure Catalog — la phase alias choisit là où la phase attach refuse** — `ATTACH_CANDIDATES_SQL` porte `count(*) OVER (PARTITION BY s.uid)` et 23.2 **refuse** un candidat ambigu. La requête alias n'a pas d'équivalent : si le LEFT JOIN renvoyait deux fiches pour un même fold, `if (seen.has(c.songUid)) continue` en jette une **sans compteur ni ligne de rapport**, et le lien est posé vers celle qui est revenue la première — sans départage, donc sans reproductibilité. Impossible aujourd'hui grâce à `catalog_songs_title_artist_ci`, mais les deux phases ne doivent pas diverger sur un rail de sécurité. [`backend/scripts/seed-catalog.js:543-545`, `:581`]
- [x] [Review][Patch] **Le dry-run peut promettre plus de renommées que l'apply n'en fera** — le pré-contrôle compte les collisions **telles qu'elles sont au SELECT**. Deux alias dont les formes canoniques foldent pareil, chez le même utilisateur, rapportent tous deux `collision_count = 0`. Sous `--apply`, le premier `UPDATE` passe, le second lève une 23505 et retombe sur le rattachement seul. L'écart est **déterministe**, pas une course : northwood valide un chiffre que le run ne peut pas tenir. Hors d'atteinte avec les 9 lignes actuelles, mais le fichier est fait pour grossir. [`backend/scripts/seed-catalog.js:533-537`, `:619-627`]
- [x] [Review][Patch] **Le refus de conflit compare des folds, donc deux orthographes canoniques différentes sont arbitrées premier-gagnant** — vérifié à l'exécution : deux lignes envoyant le même alias vers `AC/DC,Back in Black` et vers `ac/dc,back in black` ne lèvent **pas**, la seconde est rangée en « doublon interne » et **la première orthographe gagne**. Comme tout l'objet de la story est d'écrire une orthographe précise chez un utilisateur, le test de conflit doit comparer les **chaînes littérales**, pas leur fold. [`backend/scripts/seed-catalog.js:435-512`]
- [x] [Review][Patch] **Le seau `raced` sort en 0, n'affiche aucun uid, et n'est couvert par aucun test** — ce sont les lignes où l'utilisateur a modifié sa chanson entre le SELECT et l'UPDATE : l'alias **n'a pas été posé**. Le rapport imprime un nombre nu et le run se lit comme propre. Tous les mocks renvoient `[1]`, donc la branche n'est jamais exercée — c'est d'ailleurs pourquoi le formateur a besoin du `report.raced &&` défensif. [`backend/scripts/seed-catalog.js:615`, `:643`, `:683-685`]
- [x] [Review][Patch] **`attachedOnly` et `refused` n'affichent qu'un UUID nu** — l'AC4 demande un signalement **nommément** et l'AC7 un avant/après pour chaque Song concernée. Le bloc avant→après n'itère que `report.renames` : northwood lisant un dry-run de prod voit `• song 7f3a… — collision`, sans savoir de quelle chanson il s'agit, ni avec laquelle elle collisionne, ni chez quel utilisateur — alors que `userUid` et les orthographes sont disponibles au moment du push. [`backend/scripts/seed-catalog.js:668-697`]
- [x] [Review][Patch] **Rien n'est imprimé avant la fin du lot** — script lancé à la main contre la prod : un Ctrl-C ou un terminal qui saute détruit tout le relevé avant→après, alors que les renommées déjà faites restent commitées. Logger chaque renommée au moment où elle est écrite sous `--apply`. [`backend/scripts/seed-catalog.js:573-666`]
- [x] [Review][Patch] **Un échec du comptage post-écriture emporte la vérification sans le dire** — il est hors de tout `try` dans `runAlias` ; `main` l'attrape, mais le message générique ne dit pas que **les écritures, elles, ont eu lieu**. Message explicite : « écritures appliquées, contrôle des compteurs indisponible ». [`backend/scripts/seed-catalog.js:713-760`]
- [x] [Review][Patch] **Cinq faiblesses de tests** — (a) le test d'idempotence passe une liste **vide** : il passerait contre n'importe quelle implémentation ; (b) l'ordre des binds n'est lié nulle part à l'ordre des colonnes de la CTE, or l'en-tête du CSV est dans l'ordre **inverse** de chaque paire — permuter les deux noms dans la CTE laisserait toute la suite verte ; (c) `raced` n'est couvert par rien ; (d) la généralisation de `--file` à toute phase non-`seed` et l'acceptation de `--phase=alias` ne sont testées nulle part ; (e) `toHaveLength(9)` sur le fichier versionné casse dès qu'un curateur ajoute un 10ᵉ alias, tout en ne validant rien de leur contenu. [`backend/__tests__/seedCatalog.test.js`]
- [x] [Review][Defer] **Le CSV est normalisé NFC, la base ne l'est pas** [`backend/scripts/seed-catalog.js:440`] — deferred. Un titre tapé sur iOS peut arriver en NFD et ne jamais égaler l'alias NFC. Même classe que l'item NFC déjà reporté en 23.1 ; se traite en une passe sur la base, pas dans ce script.
- [x] [Review][Defer] **Aucun numéro de ligne dans les erreurs et les sauts de parsing** [`backend/scripts/seed-catalog.js:435-512`] — deferred. `• — /   (ligne vide ou incomplète)` ne situe pas la ligne fautive. Confort d'opérateur, sans conséquence sur la donnée.
- [x] [Review][Defer] **Le garde de compteurs est structurellement aveugle à cette phase** [`backend/scripts/seed-catalog.js:738-751`] — deferred. Une renommée ne change aucun compte : `diffCounts` ne peut pas détecter le seul dégât que la phase alias sait faire, tout en criant sur un utilisateur qui écrit pendant le run. C'est **la décision n°2 déjà ouverte de la review 23.2** — même sujet, vu par un autre bout, à trancher une seule fois.

**Patches appliqués le 2026-08-10** — les 11 constats `patch` sont corrigés. Backend **464 → 483 tests**, lint propre, dry-run réel réexécuté.

Les 7 gardes ajoutés sont **vérifiés par mutation** — et cette fois en visant la fonction par sa ligne, pas par la première occurrence du motif dans le fichier (c'est l'erreur qui avait faussé le tableau précédent). Une mutation neutre a servi de témoin : elle est bien restée verte, ce qui valide la méthode plutôt que le seul résultat.

| mutation | tests qui meurent |
|---|---|
| colonnes artiste redevenues optionnelles | 2 |
| sonde d'ambiguïté alias désactivée (ligne 629, pas 333) | 1 |
| réservation du dry-run retirée | 1 |
| conflit littéral non détecté | 2 |
| détection des alias morts retirée | 1 |
| journalisation au fil de l'eau retirée | 1 |
| `raced` et alias morts exclus du code de sortie | 2 |
| *(témoin : mutation neutre)* | *0, comme attendu* |

**Ce que le dry-run réel dit maintenant** : les 8 refus nomment la chanson, la cible, l'utilisateur et l'uid — là où il n'affichait qu'un UUID nu. Et le nouveau bloc « alias morts » a trouvé **de lui-même** que `Jamiroquoi / Runaway` ne correspond à aucune chanson en base de dev : c'est précisément le fait que j'avais dû déterrer à la main au cadrage de la story, et que le script taisait. Code de sortie **1**.

Les **2 constats `decision`** restent ouverts, avec ceux de la review 23.2.

_Écartés comme bruit (2), avec la preuve :_
- _« `identityKey` et `lower()` sont deux égalités différentes, `identityKey` plie les accents / l'article The / la ponctuation » — **faux**, vérifié à l'exécution : `identityKey` ne fait que minusculiser. Accents : NON plié. Article : NON plié. Ponctuation : NON pliée. Les deux folds coïncident._
- _« Ajouter `--alias-file=` pour répéter la phase sur une table de test » — hors périmètre, et le garde sur l'hôte couvre déjà le risque que ça viserait._

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
| la 23505 ne retombe plus sur le rattachement seul | 1 |
| une entrée canonique absente n'est plus refusée | 1 |
| le `where` ne re-vérifie plus la saisie | 1 |
| un alias contradictoire est résolu premier-gagnant | 1 |
| le renommage devient silencieux | 1 |

**Correction (review du 2026-08-10)** : la ligne « 23505 » annonçait 2 tests morts. C'était faux, et pour une raison qui vaut d'être écrite : ma mutation remplaçait la **première** occurrence de `if (error && error.name === 'SequelizeUniqueConstraintError')` dans le fichier — celle de `seedCatalog` (ligne 193, phase seed de 23.1), **pas** celle de `attachAliasSongs` (ligne 646). Je mesurais donc la robustesse d'un autre garde. Refait sur la bonne ligne : **1 test meurt**, celui qui exercice le repli. Le garde est bien couvert, mais mon chiffre ne le prouvait pas.

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
