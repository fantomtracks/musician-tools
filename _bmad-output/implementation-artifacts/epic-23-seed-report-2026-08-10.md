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

## Reste à décider avant la production

1. **Rattachements SANS renommage** (décision reportée de la review 23.3) : **0 cas** sur le dump prod. ⇒ **La décision est sans objet**, le comportement actuel est conservé.
2. **La garde « alias morts » sur une seconde exécution** : faut-il la faire taire quand les chansons visées sont déjà rattachées à leur fiche canonique, ou accepter un code de sortie 1 sur tout re-run ?
3. **`--schema=public` dans `db-backup-prod`** : correctif d'outillage à appliquer ou non.

## Rappel d'exploitation

⚠️ **Ne publier une fiche Catalog qu'une fois REMPLIE.** Les 75 entrées créées sont des brouillons ne portant que titre + artiste. Publier l'une d'elles en l'état donnerait à ses détenteurs un bouton « Refresh » qui écrirait `null` sur leur tonalité, leur BPM, leur mode, leur métrique et leur durée.
