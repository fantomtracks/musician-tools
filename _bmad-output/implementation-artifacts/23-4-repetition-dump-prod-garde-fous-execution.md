---
baseline_commit: 2c460cb
---

# Story 23.4: Répétition sur dump prod, garde-fous chiffrés, puis exécution

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **northwood**,
I want **répéter l'opération sur une copie de la prod et vérifier des compteurs avant de toucher aux vraies données**,
so that **le seed ne soit jamais un pari**.

## Contexte / origine

Dernière story d'**Epic 23**. Les trois premières ont écrit le script ; celle-ci **s'en sert**.

⚠️ **Cette story n'est pas une story de code.** Son livrable est un **rapport mesuré** archivé, et une **exécution en production**. Elle peut ne produire aucune ligne de code — et si elle en produit, c'est que la répétition aura révélé quelque chose, ce qui est précisément son intérêt.

**Elle tranche aussi une décision restée ouverte** en review 23.3 (voir « Décision reportée » plus bas).

## Ce que la répétition doit corriger

La base de dev **n'est pas** un dump fidèle de la prod. Mesuré pendant la review 23.3 :

- l'export prod du 2026-07-25 contient `Jamiroquoi,Runaway` à la **ligne 35** — la source même d'un des 9 alias — et la base de dev n'a **aucune** chanson correspondante ;
- les volumes divergent : **87** lignes d'export contre **91** Songs en dev.

Elle a donc dérivé dans les deux sens. **Tout chiffre mesuré jusqu'ici vaut pour la dev et pour rien d'autre.** C'est le garde « alias morts » ajouté en review 23.3 qui a rendu l'écart visible tout seul — et c'est exactement le service qu'on lui demandait.

## Décisions déjà tranchées, à ne pas rouvrir

- **Décision A** — les entrées restent **brouillon**. La vérification navigateur consiste donc à constater que **la bannière de provenance est ABSENTE** sur une chanson rattachée. Une bannière visible serait le bug.
- **Décision C** — séquence imposée, dans cet ordre : `db-backup-prod` → restauration locale → dry-run → exécution locale → **vérification navigateur** → exécution prod.
- **Garde de compteurs** (review 23.2) — gardé tel quel. S'il se déclenche, la **première** question est « quelqu'un utilisait-il l'app ? », pas « qu'est-ce qui a cassé ».
- **Orthographe canonique** (review 23.3) — vient du CSV, pas de la fiche. Aucun changement.
- **Consentement** (review 23.2) — tranché : aucune chanson concernée n'est une composition personnelle. ⚠️ **Corollaire d'exploitation à respecter après cette story : ne publier une fiche qu'une fois REMPLIE.** Publier une fiche qui n'a que titre + artiste donne à ses détenteurs un bouton Refresh qui écrit `null` sur leur tonalité et leur BPM.

## Décision reportée que cette story doit trancher

**Le sort des chansons rattachées SANS renommage** (collision). Elles reçoivent `sourceCatalogSyncedAt`, donc la drift est fausse : la copie fautive s'affiche « à jour » et devient injoignable aux exécutions suivantes. northwood a raisonné « pas de cas en local, donc c'est bon » — le raisonnement est juste, la prémisse était fausse. **Sur le dump frais, le chiffre sera vrai** :

- **0 cas** ⇒ la décision devient sans objet, on garde le comportement actuel et on l'écrit ;
- **≥ 1 cas** ⇒ northwood tranche avec la liste nominative sous les yeux (le rapport les nomme depuis la review 23.3).

## Acceptance Criteria

1. **La base locale est sauvegardée AVANT toute restauration** — `make db-restore` fait `pg_restore -c --if-exists` : il **détruit** la base locale. Les 91 chansons de QA disparaissent. Un `make db-backup` préalable, dont le fichier est vérifié non vide, est un prérequis non négociable.
2. **Le dump prod est frais** — produit par `make db-backup-prod` le jour de l'opération, pas un fichier qui traîne dans `backups/`. Le nom du fichier et son horodatage figurent dans le rapport.
3. **Les trois phases sont jouées en dry-run d'abord, dans l'ordre seed → attach → alias**, et chaque sortie est **lue** avant de passer à la suivante. Un code de sortie non nul **arrête la séquence** : on comprend avant de continuer.
4. **Les trois chiffres qui décident sont relevés sur le dump frais** — (a) rattachements **sans** renommage, qui tranche la décision reportée ; (b) **alias morts** (les 9 doivent tous matcher : ils viennent de cet export) ; (c) collisions de renommage. Tout écart avec l'attendu est **expliqué**, pas absorbé.
5. **Exécution locale sur le dump, dans l'ordre**, puis relevé avant/après de `Songs`, `SongPlays`, `SessionItems`, `PlaylistSongs` — **tous inchangés** — et des compteurs métier : N entrées Catalog créées, M Songs rattachées, K renommées.
6. **Vérification navigateur sur le dump restauré** — ouvrir une chanson rattachée et constater que **la bannière de provenance est absente** (décision A : la fiche est un brouillon). Constater aussi que le titre corrigé apparaît bien dans la songlist pour une chanson passée par la phase alias.
7. **Une seconde exécution locale ne fait rien** — les trois phases relancées avec `--apply` créent 0 entrée, rattachent 0 Song, renomment 0 titre. L'idempotence est **vérifiée sur données réelles**, pas déduite des tests.
8. **Un écart entre attendu et constaté interdit la prod** — le dump est le filet, pas la consolation.
9. **L'exécution en production n'a lieu que sur décision explicite de northwood**, et jamais dans le même mouvement que la répétition. Elle exige `--allow-remote` (le garde sur l'hôte) et se relit phase par phase.
10. **Le rapport est archivé** dans `_bmad-output/implementation-artifacts/epic-23-seed-report-<date>.md` : commandes exactes, sorties, chiffres avant/après, décision tranchée en AC4, et ce qui a divergé de l'attendu.

## Tasks / Subtasks

- [x] **Task 1 — Filet local** (AC: 1)
  - [x] `make db-backup`, puis **vérifier que le fichier existe et n'est pas vide** (le Makefile écrit un `.tmp` promu seulement en cas de succès — mais le vérifier reste gratuit).
  - [x] Noter le chemin du fichier dans le rapport : c'est le retour arrière.

  **Fait le 2026-08-10.** Fichier : `backups/musician_tools_20260810_195354.dump`, **276 275 octets**, reconnu `PostgreSQL custom database dump - v1.16-0`. Vérifié au-delà de « le fichier existe » : `pg_restore --list` y trouve **48 tables avec données**, dont `Songs`, `Users`, `CatalogSongs`, `SongPlays`, `SessionItems`. État sauvegardé : **91 Songs, 6 Users, 5 CatalogSongs, 102 SongPlays, 67 SessionItems**. C'est le retour arrière si la restauration du dump prod tourne mal.
- [x] **Task 2 — Dump prod frais** (AC: 2)
  - [x] `make db-backup-prod` (lit `DATABASE_URL_PROD` depuis `backend/.env`). ⚠️ **Lecture seule sur la prod** — `pg_dump` n'écrit rien.
  - [x] Vérifier la taille du fichier produit et l'horodater dans le rapport.

  **Fait le 2026-08-10.** Fichier : `backups/musician_tools_prod_20260810_195530.dump`, **389 071 octets** (contre 276 275 pour la locale), reconnu `PostgreSQL custom database dump - v1.16-0`. `pg_restore --list` y trouve `Songs`, `Users`, `CatalogSongs`, `SongPlays`, `SessionItems`, `PlaylistSongs`. Signe distinctif confirmant qu'il s'agit bien de la prod et non d'une copie locale : les tables y appartiennent au rôle **`postgres`**, alors qu'en local elles appartiennent à `musician_user` — c'est précisément ce que `--no-owner --no-acl` neutralise à la restauration.

  ⚠️ **Trouvé en vérifiant que le dump ne partirait pas au commit** : `backups/` est bien ignoré (`.gitignore:29`), donc les nouveaux dumps sont hors de git. **Mais deux dumps sont VERSIONNÉS** depuis des commits antérieurs à cette règle (`backups/musician_tools_20251228_150430.dump` et `…20251231_141210.dump`, 19 Ko chacun, contenant tous deux la table `Users`). Un `.gitignore` n'a aucun effet sur un fichier déjà suivi. Reporté en deferred-work — la suppression de l'historique est une réécriture, donc une décision de northwood.
- [x] **Task 3 — Restauration locale** (AC: 1, 2)
  - [x] `make db-restore FILE=backups/musician_tools_prod_<ts>.dump`. Le piège pg17 est **résolu** (`39aa96b` : client et serveur alignés en pg17, round-trip vérifié) — ne pas recopier l'avertissement périmé de l'epic.
  - [x] Contrôle immédiat : `COUNT(*)` sur `Songs`, `Users`, `CatalogSongs` — et **vérifier que `Jamiroquoi / Runaway` est présent**. C'est le témoin qui prouve qu'on est bien sur la prod et plus sur la dev dérivée.
- [x] **Task 4 — Dry-runs, dans l'ordre** (AC: 3, 4)
  - [x] `--phase=seed`, puis `--phase=attach`, puis `--phase=alias`, chacun **sans** `--apply`. Environnement local : `DB_ENABLE_SSL= NODE_ENV=test` (⚠️ `NODE_ENV=development` **ne se connecte pas**, SSL en dur — cf. deferred-work).
  - [x] Relever les 3 chiffres de l'AC4 et les **comparer à l'attendu** : 82 entrées à créer, les 9 alias doivent tous matcher.
  - [x] Un code de sortie ≠ 0 **arrête** : lire le rapport, comprendre, décider.
- [x] **Task 5 — Exécution locale** (AC: 5, 7)
  - [x] Les 3 phases avec `--apply`, dans l'ordre.
  - [x] Relever les compteurs avant/après et les compteurs métier.
  - [x] **Relancer les 3 phases** : tout doit être à zéro. C'est l'AC7, et c'est la seule preuve d'idempotence sur données réelles.
- [x] **Task 6 — Vérification navigateur** (AC: 6)
  - [x] Ouvrir une chanson rattachée : **bannière de provenance ABSENTE** (brouillon). Une bannière visible = bug bloquant.
  - [x] Ouvrir une chanson passée par la phase alias : le titre corrigé s'affiche dans la songlist.
  - [x] Ouvrir l'historique de session d'une chanson renommée qui en a un : il garde **l'ancienne** orthographe. C'est le contrat FR4, à constater pour ne pas le prendre pour un bug plus tard.
- [x] **Task 7 — Trancher la décision reportée** (AC: 4)
  - [x] Compter les rattachements **sans** renommage. 0 ⇒ acter que la décision est sans objet. ≥ 1 ⇒ présenter la liste nominative à northwood et **attendre sa décision** avant la prod.
- [x] **Task 8 — Exécution prod** (AC: 8, 9)
  - [x] **Ne rien lancer sans un feu vert explicite de northwood**, donné après lecture du rapport.
  - [x] Dry-run prod d'abord (`--allow-remote` non requis en dry-run : le garde ne porte que sur l'écriture), phase par phase, relu.
  - [x] Puis `--apply --allow-remote`, phase par phase, en relisant entre chaque.
  - [x] ⚠️ **Ne jamais tester un garde avec le drapeau qui écrit.** Leçon de 23.1 : un `--apply` lancé pour « voir ce que fait le garde » a visé la prod. Seule une erreur TLS a évité 82 écritures.
- [x] **Task 9 — Rapport** (AC: 10)
  - [x] Archiver `epic-23-seed-report-<date>.md` : commandes, sorties, chiffres, écarts, décision AC4.
  - [x] Mentionner explicitement la règle d'exploitation : **ne publier une fiche qu'une fois remplie**.

## Dev Notes

### Ce qui rend cette story différente des trois autres

Les trois premières écrivaient du code testable. Celle-ci **agit**. Son seul filet est la séquence, et la séquence n'a de valeur que si chaque étape est **lue** avant la suivante. Enchaîner les commandes sans lire les sorties revient à ne pas avoir fait la répétition.

### Répartition des rôles

- **Ce que je peux faire seul** : sauvegarde locale, dry-runs, lecture des rapports, rédaction du rapport archivé.
- **Ce qui demande ton accord explicite** : la **restauration** (elle détruit ta base locale de QA) et **toute exécution visant la prod**, dry-run compris. Je ne lancerai rien sur la prod de ma propre initiative.

### Pièges

- **`make db-restore` détruit la base locale** (`-c --if-exists`). Tes 91 chansons de QA disparaissent. D'où l'AC1.
- **`NODE_ENV=development` ne se connecte pas à la base locale** : SSL codé en dur dans `config.js` alors que le Postgres docker ne le parle pas. Utiliser `DB_ENABLE_SSL= NODE_ENV=test`. Et `DB_ENABLE_SSL=false` **active** le SSL (la chaîne `'false'` est truthy) — il faut la **vider**.
- **L'ordre des phases n'est plus seulement documenté** : depuis la review 23.3, un `NOT EXISTS` empêche structurellement la phase alias de renommer une chanson dont l'orthographe est déjà une entrée du Catalog. Le respecter reste plus lisible.
- **Le témoin `Jamiroquoi / Runaway`** est le meilleur contrôle que la restauration a marché : il est dans l'export prod et absent de la dev.
- **Un code de sortie 1 ne signifie pas « rien n'a été écrit »** : sur la phase alias, un refus ou une ligne non écrite met le code à 1 alors que les autres lignes ont bien été traitées. Lire le rapport, pas seulement le code de sortie.

### Anchors (lus, non devinés)

- `Makefile:219` `db-backup` — écrit un `.tmp` promu seulement en cas de succès.
- `Makefile:231` `db-backup-prod` — `pg_dump` via `PG_CLIENT_IMAGE` (postgres:17), lecture seule sur la prod, refuse une URL mal formée.
- `Makefile:243` `db-restore` — `pg_restore -c --if-exists --single-transaction --no-owner --no-acl` : **destructif** et atomique.
- `backend/scripts/seed-catalog.js` — les 3 phases, le garde sur l'hôte, les compteurs, les rapports nominatifs.
- `_bmad-output/implementation-artifacts/deferred-work.md` — le constat « la dev n'est pas un dump fidèle », le piège SSL/`NODE_ENV`, la résolution pg17.

### Project Structure Notes

- **NOUVEAU** : `_bmad-output/implementation-artifacts/epic-23-seed-report-<date>.md`.
- **Aucun fichier de code attendu.** Si un correctif s'avère nécessaire, il vit dans `backend/scripts/seed-catalog.js` et son test, et il est justifié par ce que la répétition a montré.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` § Epic 23 — story 23.4, décisions A et C]
- [Source: `_bmad-output/implementation-artifacts/23-3-alias-rattachement-et-correction-orthographe.md` § Review Findings — la décision reportée à cette story]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` 2026-08-10 — dev ≠ dump prod ; SSL en dur ; pg17 résolu]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

**Rapport complet : `_bmad-output/implementation-artifacts/epic-23-seed-report-2026-08-10.md`.**

Répétition faite le 2026-08-10 sur copie locale de la prod. Prod **non touchée** (lecture seule).
Résultats : 75 entrées créées / 7 déjà présentes ; **82 Songs rattachées sur 88** ; **9 alias sur 9 ont matché** ; `Songs`, `SongPlays`, `SessionItems`, `PlaylistSongs` **inchangés** ; **0 doublon** de fold au Catalog comme par utilisateur ; idempotence vérifiée (0/0/0 au second passage).
**Décision reportée de la review 23.3 : TRANCHÉE — 0 rattachement sans renommage sur le dump prod, la décision est sans objet, comportement conservé.**
Trois écarts découverts : `db-restore` incompatible avec un dump Supabase (contourné par `-n public`), séquence de la story fausse (les phases doivent être entrelacées), garde « alias morts » qui crie sur toute seconde exécution.
Vérification navigateur **faite** : fiche brouillon ⇒ aucune trace ; fiche publiée ⇒ ligne de provenance seule, **sans** bandeau ni Refresh (0 chanson en drift sur 82) ; orthographes corrigées visibles en songlist ; historique de session figé sur l'ancienne (FR4). **Point remonté** : 7 chansons se sont rattachées à des fiches DÉJÀ PUBLIÉES, chez 2 utilisateurs — inoffensif tant que personne n'édite ces fiches, mais 4 d'entre elles sont plus pauvres que la saisie des utilisateurs. Reste Task 8 (exécution prod, sur feu vert explicite).

### Agent Model Used

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 0.1 | Story créée (create-story). Story d'exécution, pas de code : le livrable est un rapport mesuré et une exécution en prod. Cadrée sur les cibles réelles du Makefile, lues et non supposées — `db-restore` est **destructif** pour la base locale, d'où la sauvegarde préalable en AC1 ; l'avertissement « client pg17 » de l'epic est **périmé** (résolu en `39aa96b`). Porte la décision reportée de la review 23.3 : le sort des rattachements sans renommage, à trancher sur le chiffre réel du dump. Témoin de restauration retenu : `Jamiroquoi / Runaway`, présent dans l'export prod et absent de la dev dérivée. | northwood |
