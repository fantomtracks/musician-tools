# Epic 23 — rapport de répétition sur dump prod (2026-08-10)

Répétition complète jouée sur une **copie locale de la production**, conformément à la décision C. La production **n'a pas été touchée** : seule une lecture (`pg_dump`) a eu lieu.

## Filets posés avant de commencer

| | |
|---|---|
| Sauvegarde de la base locale | `backups/musician_tools_20260810_195354.dump` — 276 275 o, 48 tables avec données (vérifié par `pg_restore --list`) |
| État sauvegardé | 91 Songs · 6 Users · 5 CatalogSongs · 102 SongPlays · 67 SessionItems |
| Dump de production | `backups/musician_tools_prod_20260810_195530.dump` — 389 071 o, lecture seule |

## Ce que la répétition a révélé, et qui n'était pas prévu

### 1. `make db-restore` ne sait pas restaurer un dump Supabase

La prod est hébergée sur Supabase. `make db-backup-prod` dumpe la base **entière**, schémas système compris (`auth`, `storage`, `graphql`, `graphql_public`, `realtime`, `pgbouncer`, `vault`, `extensions`), et la restauration s'arrête sur :

```
pg_restore: error: extension "supabase_vault" is not available
```

**La base locale est restée intacte** : `--single-transaction` a tout annulé, relevé à `91|6|5|102|67` après l'échec — identique à avant. Le commentaire du Makefile qui promettait l'atomicité est vérifié en pratique.

**Contournement appliqué** : restauration du seul schéma `public` (`pg_restore -n public`), où vivent nos 49 tables et `f_unaccent`. Les extensions nécessaires (`unaccent`, `citext`, `pgcrypto`, `uuid-ossp`) étaient déjà présentes en local.

**Correctif à faire** : ajouter `--schema=public` à `db-backup-prod`. Bénéfice secondaire non négligeable — le dump cesserait d'embarquer le schéma `auth` de Supabase. *Non appliqué : outillage partagé, décision northwood.*

### 2. La séquence de la story était fausse

La story demandait « les trois dry-runs d'abord, puis les trois applications ». **Chaque phase dépend de la précédente** : avant que le seed ne soit appliqué, l'attach ne voit que les entrées Catalog préexistantes et l'alias refuse presque tout, faute de fiches canoniques. Mesuré :

| Phase (dry-run **avant** seed) | Résultat trompeur |
|---|---|
| attach | 6 candidats |
| alias | 9 candidats, 1 renommable, **8 refusées** (entrée canonique absente) |

**Séquence correcte, appliquée ici et à suivre en prod** : `dry-run seed → apply seed → dry-run attach → apply attach → dry-run alias → apply alias`.

### 3. La garde « alias morts » crie sur une seconde exécution

Après une exécution réussie, plus aucune chanson ne porte l'orthographe fautive — donc les 9 alias ne matchent plus rien, et la garde ajoutée en review 23.3 rapporte « 9 alias sur 9 n'ont trouvé AUCUNE chanson » avec un code de sortie 1. **Le run n'a rien écrit et rien de mal ne s'est produit** : la garde ne distingue pas « l'alias n'a jamais marché » de « l'alias a déjà fait son travail ». Même famille de défaut que celui relevé sur la garde de compteurs. À trancher (cf. « Reste à décider »).

## Chiffres de la répétition

### Dry-runs (dans la séquence entrelacée)

- **seed** : 82 lues, **75 à créer**, **7 déjà au Catalog** — la garde d'idempotence a évité 7 violations de contrainte d'unicité. Les 7 : *Come Together* (The Beatles), *Sunshine of Your Love* (Cream), *Billie Jean* (Michael Jackson), *Hysteria* (Muse), *Money* (Pink Floyd), *Killing in the Name* (RATM), *Give It Away* (RHCP).
- **alias** : **9 alias sur 9 ont trouvé une chanson — zéro alias mort.** Le témoin `Jamiroquoi / Runaway`, absent de la base de dev, est bien présent dans la prod : c'est la preuve que la restauration a pris et que les mesures faites en dev ne valaient rien.

### État après application des trois phases

| | avant | après |
|---|---|---|
| CatalogSongs | 50 | **125** (dont **75 brouillons**) |
| Songs | 88 | **88** |
| Songs rattachées | 6 | **82** |
| SongPlays | 133 | **133** |
| SessionItems | 94 | **94** |
| PlaylistSongs | 1 | **1** |

**Invariant 1 vérifié sur données réelles** : aucune Song créée ni supprimée, aucune donnée d'entraînement touchée.

### Contrôles d'unicité

- Doublons de fold dans `CatalogSongs` : **0**
- Doublons de fold par utilisateur dans `Songs` : **0**

### Idempotence (AC7)

Seconde exécution des trois phases : **0 création, 0 rattachement, 0 renommage.** Vérifié sur données réelles.

## Le cas « Beatles » vs « The Beatles » (demandé par northwood)

**Avant** — Catalog : 3 entrées `The Beatles` (publiées). Songs : l'utilisateur `8aea0eef` possède `Beatles / Come together` et `Beatles / I want you (she's so heavy)`, non rattachées.

**Après** :

| Catalog | Songlist de l'utilisateur |
|---|---|
| `The Beatles / All my loving` (publiée) | `The Beatles / Come Together` → liée à la fiche publiée |
| `The Beatles / Come Together` (publiée, **non dupliquée**) | `The Beatles / I Want You (She's So Heavy)` → liée à la fiche créée |
| `The Beatles / I Want You (She's So Heavy)` (brouillon, créée) | |
| `The Beatles / Something` (publiée) | |

**Entrées Catalog dont l'artiste est `beatles` sans article : 0.**

Chaîne de traitement : le seed n'a créé aucune entrée `Beatles` (le CSV avait été nettoyé) et a sauté `Come Together`, déjà présente ; l'attach exact n'a rien matché (`beatles` ≠ `the beatles`, accents et articles conservés) ; c'est l'alias qui a renommé les deux chansons puis les a rattachées. Aucun doublon, ni au Catalog ni dans la songlist.

## Vérification navigateur (AC6)

Faite sur la copie locale restaurée, avec northwood connecté (je ne saisis pas de mot de passe).

| Cas | Attendu | Constaté |
|---|---|---|
| `Vulfpeck / Dean Town` — fiche **brouillon** (75 cas) | aucune trace de provenance | **aucune mention du Catalog** sur la fiche |
| `Muse / Hysteria` — fiche **publiée** (7 cas) | ligne de provenance, **pas** de bandeau ambre, **pas** de Refresh | « ↳ Added from the Catalog » + lien, **rien d'autre** |
| Songlist | orthographes corrigées | `Jamiroquai Runaway` (ex-« Jamiroquoi ») et `Primus Little Lord Fentanyl (feat. Puscifer)` (ex-« Pucifer ») |
| Historique de session | garde l'ancienne orthographe (FR4) | label figé `…(feat. Pucifer)` alors que la chanson dit `…(feat. Puscifer)` |

**Pourquoi aucun bouton Refresh n'apparaît** : il est conditionné à `source?.drift` (`CatalogSourceBanner.tsx:109`), et la décision B a posé `syncedAt = catalog.updatedAt`. Vérifié en base : **0 chanson en drift sur les 82 rattachées**.

### Le point d'attention que cette vérification a fait remonter

La décision A supposait que tous les liens resteraient dormants, « puisque les fiches seedées sont des brouillons ». C'est vrai pour **75** chansons. Mais **7** se sont rattachées à des fiches **déjà publiées** en production (les 7 doublons du CSV), chez **2 utilisateurs** — pour celles-là, une ligne de provenance apparaît immédiatement.

C'est inoffensif aujourd'hui (pas de drift ⇒ pas de Refresh proposé). Ça cesse de l'être **le jour où le curateur édite l'une de ces 7 fiches** : la drift passera à vrai, le bouton apparaîtra, et un clic écrirait les valeurs de la fiche par-dessus celles de l'utilisateur. Les écarts mesurés sont réels :

| Chanson | utilisateur | fiche |
|---|---|---|
| `Muse / Hysteria` | **C / 186 bpm** | **A / 93 bpm** |
| `RHCP / Give It Away` | G | A |
| `RATM / Killing In The Name` | G / 89 | *(vide)* / *(vide)* |
| `Cream / Sunshine Of Your Love` | D | *(vide)* |

Ces 4 fiches publiées sont donc **moins riches ou divergentes** par rapport à ce que les utilisateurs ont saisi. À traiter avant d'éditer ces fiches — c'est le même sujet que la règle « ne publier qu'une fiche remplie », mais appliqué à des fiches **déjà** publiées.

## Reste à décider avant la production

1. **Rattachements SANS renommage** (décision reportée de la review 23.3) : **0 cas** sur le dump prod. ⇒ **La décision est sans objet**, le comportement actuel est conservé.
2. **La garde « alias morts » sur une seconde exécution** : faut-il la faire taire quand les chansons visées sont déjà rattachées à leur fiche canonique, ou accepter un code de sortie 1 sur tout re-run ?
3. **`--schema=public` dans `db-backup-prod`** : correctif d'outillage à appliquer ou non.
4. **Les 4 fiches publiées plus pauvres que la saisie des utilisateurs** (voir ci-dessus) : les enrichir avant toute édition, sinon un futur Refresh appauvrira la donnée de 2 utilisateurs.

## Rappel d'exploitation

⚠️ **Ne publier une fiche Catalog qu'une fois REMPLIE.** Les 75 entrées créées sont des brouillons ne portant que titre + artiste. Publier l'une d'elles en l'état donnerait à ses détenteurs un bouton « Refresh » qui écrirait `null` sur leur tonalité, leur BPM, leur mode, leur métrique et leur durée.

---

# EXÉCUTION EN PRODUCTION — 2026-08-10, 23h29–23h34

Autorisée explicitement par northwood après la répétition complète. Filet : dump prod frais
`backups/musician_tools_prod_20260810_232903.dump` (382 Ko), pris juste avant.

## Un obstacle rencontré, et pourquoi il n'était pas dans la répétition

`NODE_ENV=production` **empêche** `config.js` de charger le `.env` (`if (NODE_ENV !== 'production')`), donc `DATABASE_URL_PROD` n'est jamais lu et la connexion échoue sur une URL `undefined`. Le seul chemin qui atteint la prod est **`NODE_ENV` non défini** — précisément le piège que le script documente, et précisément pourquoi le garde sur l'hôte existe.

Puis : `self-signed certificate in certificate chain`. Cause : l'URL prod porte `?sslmode=require`, et pg 8.16 **vérifie** le certificat dans ce mode, ce qui prend le pas sur le `rejectUnauthorized: false` de `config.js`. Supabase présente un certificat auto-signé. Contourné pour le seul processus d'exécution en substituant `sslmode=no-verify`, **sans modifier le dépôt** — cela rend effectif ce que la config voulait déjà faire. Reporté en deferred-work.

*(C'est la même erreur TLS qui, en 23.1, avait évité 82 écritures accidentelles en prod.)*

## Les cinq phases, chacune en dry-run puis appliquée

| Phase | Résultat |
|---|---|
| **seed** | 82 lues, **75 créées**, 7 déjà au Catalog |
| **attach** | **73 rattachées**, réparties sur **5 utilisateurs** (60 / 10 / 1 / 1 / 1) |
| **alias** | **9 sur 9** ont trouvé leur chanson, 0 alias mort, 0 collision, 9 orthographes corrigées |
| **enrich** | **73 enrichies**, 73 marqueurs resynchronisés, 2 sources sans donnée |
| **publish** | **75 publiées**, 75 marqueurs resynchronisés |

Chaque dry-run a été lu avant son application, et chaque chiffre correspondait à la répétition.

## Vérification finale, faite indépendamment du rapport du script

| | |
|---|---|
| Fiches Catalog | **125**, dont **125 publiées** |
| Songs | **88**, dont **82 rattachées** |
| SongPlays / SessionItems / PlaylistSongs | **133 / 94 / 1** — inchangés |
| Chansons en drift | **0** — personne ne verra « nouvelle version disponible » |
| Doublons au Catalog | **0** |
| Doublons par utilisateur | **0** |

**Invariant 1 tenu sur la production** : aucune Song créée, aucune supprimée, aucune donnée d'entraînement touchée.

## Ce qui reste à la main pour northwood

- **Remplir 2 fiches** publiées sans aucune donnée : `Tool / Fear Inoculum` et `Wye Oak / Civilian`.
- **Enrichir 4 fiches déjà publiées avant cette opération**, plus pauvres que la saisie des utilisateurs (`Muse / Hysteria` en A·93 côté fiche contre C·186 côté utilisateur, `RHCP / Give It Away`, `RATM / Killing In The Name`, `Cream / Sunshine Of Your Love`).
- ⚠️ **Le bouton « Publier » du curateur ne resynchronise pas** : publier une fiche à la main depuis l'écran allumera la bannière chez ses détenteurs. Voir deferred-work.
- **3 entrées d'historique de session** gardent l'ancienne orthographe. C'est le contrat FR4, pas un bug.

---

# NETTOYAGE DE LA BASE DE PRODUCTION — 2026-08-11, 23h49–00h00

Demandé par northwood après le seed. Opérations **de données uniquement** : aucun code modifié, aucun déploiement. Filet posé avant : `backups/musician_tools_prod_20260810_235245.dump` (392 Ko).

## Suppression des chansons de test

Cinq chansons parasites supprimées, **par uid** et jamais par motif, dans une transaction qui se serait annulée si le compte n'avait pas été exactement 5 :

| uid | utilisateur | chanson |
|---|---|---|
| `13a181fe` | `9f11a0a5` | `GDFGFD / RETERET` |
| `1ebc8949` | `9f11a0a5` | `hjbhj / b bjh` |
| `27c0a0a1` | `9f11a0a5` | `/toto / test` |
| `84a5d4da` | `9f11a0a5` | `toto / test` |
| `a0a5a544` | `cf5f2b29` | `test / test` |

Les cinq avaient **0 lecture, 0 session, 0 playlist** : aucun historique détruit. `Songs` 88 → 83, les trois autres compteurs inchangés (133 / 94 / 1).

**Deux faux positifs écartés** : `Vulfpeck / 1612` (le titre n'a pas de voyelle, ce qui l'avait fait flagger par une regex) et `Vulfpeck / Sauna`. Et le mot « toto » a failli coûter cher — **Toto est un vrai groupe**. C'est pourquoi rien n'a été supprimé par motif : la liste a été résolue en uid complets, affichée, puis validée avant écriture.

**Le Catalog, lui, était propre** : les 50 fiches antérieures au seed sont toutes de vraies chansons.

## Corrections d'orthographe et de casse

**10 vraies fautes** (toutes sur des fiches à `copies = 0`, donc sans effet pour personne) :

`Thunderstuck`→`Thunderstruck` · `The Cramberries`→`The Cranberries` · `Fell Good Inc.`→`Feel Good Inc.` · `Roxane`→`Roxanne` · `Temptation`→`The Temptations` · `Guns and roses / Sweet Child O mine`→`Guns N' Roses / Sweet Child o' Mine` · `Ben E king`→`Ben E. King` · `i got you (i feel you)`→`I Got You (I Feel **Good**)` · `Don't stop believin`→`Don't Stop Believin'` · `Crazy little things called love`→`Crazy Little **Thing** Called Love`

**23 recasages** de titres, artistes non touchés. Trois pièges évités :

- La mise en casse automatique aurait transformé `Sweet Child o' Mine` en `Sweet Child O' Mine` — une régression sur la correction qu'on venait de faire. Exclu de la passe.
- Les acronymes sont préservés par construction (`CAKE`, `LANDMVRKS`, `MAXIMUM THE HORMONE` restent intacts) — le plan a d'ailleurs été **affiché avant d'être appliqué**, précisément parce qu'une mise en casse automatique produit facilement du charabia.
- Trois apostrophes qu'aucune règle de casse ne peut deviner, ajoutées à la main : `Livin' on a Prayer`, `Gimme Some Lovin'`, `Where Is My Mind?`

## Un effet de bord favorable, mais accidentel — à retenir

Les corrections ont été faites en **SQL brut**, ce qui **contourne la gestion des horodatages de Sequelize** : les `updatedAt` sont restés au 8 août. La drift est donc restée à **0** et personne n'a vu « nouvelle version disponible ».

C'est le bon résultat — un « Refresh » ne propage jamais le titre ni l'artiste, donc la bannière aurait été un faux signal. Mais ce n'était pas voulu : les mêmes corrections passées par le modèle Sequelize auraient allumé la bannière chez **trois** utilisateurs pour rien.

**Règle à en tirer** : corriger un `title`/`artist` au Catalog **en SQL brut** (ça ne réveille personne, et le refresh ne les propage pas de toute façon) ; corriger une **tonalité, un tempo ou un mode** **via le modèle**, pour que la bannière apparaisse — là, elle a du sens.

## État final vérifié

| | |
|---|---|
| Fiches Catalog | **125**, toutes publiées |
| Chansons utilisateurs | **83** |
| SongPlays / SessionItems / PlaylistSongs | **133 / 94 / 1** |
| Chansons en drift | **0** |
| Doublons (Catalog et par utilisateur) | **0** |

## Reste à faire à la main, via l'interface

- Remplir `Tool / Fear Inoculum` et `Wye Oak / Civilian`.
- Enrichir les 4 fiches plus pauvres que la saisie des utilisateurs (`Muse / Hysteria`, `RHCP / Give It Away`, `RATM / Killing in the Name`, `Cream / Sunshine of Your Love`). ⚠️ Passer par l'écran : la bannière est **justifiée** quand la tonalité change.
