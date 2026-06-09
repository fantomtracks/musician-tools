# Checklist pré-déploiement — Sprint complet (Epics 1-5)

Date : 2026-06-08 · Branche : `bmad-and-claude` (28 commits d'avance sur `main`) · Cible : PROD Fly.io (`musician-tools`, région cdg) + DB Supabase

> **Rappel pipeline** : merge vers `main` → GitHub Action `flyctl deploy --remote-only` → Fly exécute `release_command` (`node scripts/release-migrate.js` = `sequelize-cli db:migrate --env production`) AVANT de basculer l'app. Si les migrations échouent → Fly garde l'ancienne version (pas de downtime). Pas de staging : la prod, c'est la prod.

## A. Avant le merge (sur la branche, en local)

- [ ] **Test manuel 5.1** (le 401) : connexion → `make restart` (vide la session serveur) → recharger une page → on atterrit sur `/login` proprement ; mauvais mot de passe → erreur de login sans boucle
- [ ] **Test manuel 4.2** : ajouter une chanson à une session (récente → dernier joué avance ; ancienne → ne recule pas) ; supprimer une session → le jour s'éteint dans la heatmap + le bloc « Played » se vide
- [ ] **Tour rapide de l'app** : sujets, songs, playlists, instruments, sessions, heatmap — rien de cassé
- [ ] **Suites vertes** : `npm test` (front) + `cd backend && npm test` — 177 + 106
- [ ] **Build OK** : `npm run build`
- [ ] **Pas de secret committé** : `git diff main..HEAD -- backend/.env` doit être VIDE (`.env` est gitignored — vérifier)

## B. Sécurité base de données (le plus important)

- [ ] **BACKUP de la prod AVANT TOUT** : `make db-backup-prod` (lit `DATABASE_URL_PROD` du backend/.env, fait un `pg_dump -F c`). C'est le filet n°1, irremplaçable. Vérifier que le `.dump` est bien créé dans le dossier de backup.
- [ ] **Les 6 nouvelles migrations de ce sprint sont idempotentes** (vérifié — toutes guardées `describeTable`/`showAllTables`/`showIndex`) :
  - `create-topics`, `create-practice-sessions`, `create-session-items`, `add-position-to-session-items`, `add-session-item-uid-to-song-plays`, `add-index-...session-item-uid`
- [ ] (Optionnel mais rassurant) **Dry-run migrations sur une copie** : restaurer le dump prod dans une base locale jetable et lancer `make migrate-prod PROD_DB_URL='<url copie locale>'` → vérifier que les 6 migrations passent sans erreur sur la vraie structure prod
- [ ] ⚠️ **Ne JAMAIS lancer de rollback (`down`) en prod à l'aveugle** : certaines `down()` droppent des tables (dette tracée). Au déploiement, seul `up` tourne — pas de risque. Mais un rollback manuel pourrait détruire des données.

## C. Le déploiement

- [ ] **Vérifier les secrets/env de prod sont en place sur Fly** : `flyctl secrets list -a musician-tools` doit contenir au moins `DATABASE_URL_PROD` (ou la variable que `config/config.js` lit en production) et `JWT_SECRET`. Et le secret GitHub `FLY_API_TOKEN` existe (sinon l'Action échoue avant tout).
- [ ] **Merger** `bmad-and-claude` → `main` (PR recommandée pour la trace, ou merge direct). Le push sur `main` déclenche le déploiement.
- [ ] **Surveiller le déploiement** : `flyctl logs -a musician-tools` (ou le dashboard). Confirmer dans l'ordre : (1) build OK, (2) `release_command` → « Release migrations completed successfully. », (3) bascule de l'app. Si « Release migrations failed » → l'ancienne version reste, tu corriges sans panique.

## D. Après le déploiement (smoke test prod)

- [ ] Se connecter sur l'URL prod
- [ ] Créer un sujet, logger une session avec une entrée, ouvrir la heatmap (la grille s'affiche < 1 s)
- [ ] « Mark as Played » sur une chanson → la session du jour se crée, la heatmap s'allume
- [ ] Provoquer/observer un 401 si possible (ou faire confiance aux tests) → re-login propre
- [ ] Si KO grave : `flyctl releases -a musician-tools` puis rollback vers la version précédente. La DB a déjà migré (additif/idempotent) — l'ancien code reste généralement compatible, mais vérifier au cas par cas.

## E. Versioning (optionnel)

- [ ] Bump `version` 1.2.0 → 1.3.0 dans `package.json` + `backend/package.json`, commit, **tag** → la CI `release.yml` crée la GitHub release (déclenchée par le tag de version). À faire seulement si tu veux marquer cette release.

## Notes

- **Première mise en prod de tout le PRD** : la prod est aujourd'hui à l'état pré-projet (ni Topics, ni Sessions, ni heatmap). Ce déploiement crée TOUT le schéma des Epics 1-4 + le lien 4.2. D'où l'importance du backup (A→B) même si tout est idempotent.
- **Données de prod existantes** : si tu as déjà du vrai historique « Mark as Played » en prod (table `SongPlays` pré-existante), il restera `sessionItemUid = null` (pas de backfill, documenté) — il alimente le « dernier joué » mais ne casse rien. Comportement cohérent.
