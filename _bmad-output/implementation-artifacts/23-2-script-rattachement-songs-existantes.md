---
baseline_commit: c591f0a34916123fc8b71ef51e1f778c961ea5e5
---

# Story 23.2: Script de rattachement — brancher les Songs existantes sur leur entrée

Status: ready-for-dev

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

- [ ] **Task 1 — Sous-commande** (AC: 8)
  - [ ] Le script gagne une notion de phase : `--phase=seed` (défaut, comportement actuel) et `--phase=attach`. `parseArgs` doit **refuser** une phase inconnue, comme il refuse déjà un argument inconnu.
  - [ ] Le garde sur l'hôte, le dry-run par défaut et le rapport sont **partagés** entre les phases — ne pas les réécrire.
- [ ] **Task 2 — La requête de rattachement** (AC: 1, 3, 4, 5)
  - [ ] Sélectionner les candidats en SQL : jointure `Songs` × `CatalogSongs` sur `lower(s.title) = lower(c.title) AND COALESCE(lower(s.artist),'') = COALESCE(lower(c.artist),'')`, avec `s.source_catalog_uid IS NULL`. Retourner `song.uid`, `user_uid`, `catalog.uid`, `catalog."updatedAt"`.
  - [ ] ⚠️ **Une Song pourrait matcher plusieurs entrées Catalog ?** Non en théorie — l'index canonique rend le fold unique côté Catalog. **Le vérifier quand même** dans la requête (ou compter) et **refuser** de rattacher un candidat ambigu plutôt que d'en choisir un au hasard.
  - [ ] Colonnes DB : `source_catalog_uid`, `source_catalog_synced_at` (snake_case, cf. `field:` dans le modèle).
- [ ] **Task 3 — L'écriture** (AC: 2, 3)
  - [ ] `Song.update({ sourceCatalogUid, sourceCatalogSyncedAt }, { where: { uid, sourceCatalogUid: null } })` — le `where` **re-vérifie** l'invariant 2 au moment de l'écriture, pas seulement à la sélection (une exécution concurrente pourrait avoir rattaché entre-temps).
  - [ ] Garde par ligne (`try` englobant lookup **et** écriture), comme en 23.1.
- [ ] **Task 4 — Compteurs de sécurité** (AC: 7)
  - [ ] Avant le lot : `COUNT(*)` sur `Songs`, `SongPlays`, `SessionItems`, `playlist_songs`. Après : les relire et **comparer**. Un écart ⇒ message explicite + code de sortie 1.
  - [ ] En dry-run, les compteurs sont affichés une fois (photo de référence), sans comparaison.
- [ ] **Task 5 — Rapport par utilisateur** (AC: 6)
  - [ ] Regrouper par `user_uid` et afficher `N chansons rattachées` par utilisateur. Ne **pas** afficher d'email (le script n'en a pas besoin et le CSV versionné n'en contient pas).
- [ ] **Task 6 — Tests** (AC: 3, 4, 7)
  - [ ] Étendre `backend/__tests__/seedCatalog.test.js` (modèles mockés, pas de vraie base) : la phase attach n'écrit rien en dry-run ; elle n'appelle `update` que pour les Songs sans source ; l'`update` ne porte **que** sur les deux colonnes ; le `where` contient `sourceCatalogUid: null` ; un candidat ambigu est refusé ; un écart de compteur fait échouer le lot ; une phase inconnue est refusée.
  - [ ] Baseline backend à **mesurer** avant de commencer (rétro Epic 22, action item n°1).
- [ ] **Task 7 — Validation** (AC: 8)
  - [ ] `cd backend && npm test` + `npm run lint`. `git diff --stat` : uniquement le script et son test.
  - [ ] **Exécuter réellement** le dry-run de la phase attach et lire sa sortie — la review de 23.1 a montré qu'un test vert ne dit rien de ce que le script fait au démarrage.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 0.1 | Story créée (create-story). Étend le script de 23.1 plutôt que d'en créer un nouveau, donc hérite du garde sur l'hôte résolu — critique ici, car cette story écrit dans les données personnelles des utilisateurs et non plus dans un pool partagé. Compteurs avant/après posés en AC comme preuve mécanique de l'invariant « jamais recréer une Song ». | northwood |
