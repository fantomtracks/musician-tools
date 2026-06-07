# Addendum — PRD Musician Tools : Journal de sessions

> Profondeur contributive destinée aux documents aval (architecture, solution design, UX). Ne fait pas partie du contrat PRD.

## Esquisse de modèle de données (issue du plan d'action du brainstorming)

- **Session** : date, durée totale, **un seul instrument**, note libre globale, entrées[]. Deux instruments le même jour = deux sessions.
- **Entrée (SessionItem)** : référence vers chanson **ou** sujet, minutes (optionnel), note libre (optionnel).
- **Sujet** : nom, catégorie libre (optionnel) — volontairement minimal, pas de hiérarchie. Distinct des « techniques » existantes (pas de migration) ; le lien chanson ↔ sujets viendra plus tard (idée #11).

**Mécanique du pont (FR21-FR23)** :
- La table `SongPlay` existante (un enregistrement par « Mark as Played », avec instrument) reste la source d'événements de lecture ; le « dernier joué » par instrument en est dérivé (le champ `Song.lastPlayed` est global).
- FR23 : à l'édition/suppression de session, recalculer le dérivé depuis les événements.
- FR22 (rétro-import) : projeter les `SongPlay` historiques dans la heatmap — projection rejouable, sans duplication en table session (à arbitrer en architecture : projection à la lecture vs backfill matérialisé).
- FR19/FR21 : le client envoie sa **date locale** — ne pas horodater le jour côté serveur (l'implémentation actuelle de `markSongPlayed` utilise l'horloge serveur, à corriger au passage).

Obstacle identifié au brainstorming : *la tentation d'enrichir le modèle Session trop tôt*. Le garder minimal — santé du répertoire, récaps, école du manche se brancheront dessus comme projections sans le modifier.

## Notes techniques (contraintes existantes, hors contrat PRD)

- Stack : React + TypeScript + Vite + Tailwind (dark mode par classes `dark:`) ; backend Express + Sequelize + Supabase ; déploiement Fly.io (auto-deploy sur main).
- Migrations Sequelize idempotentes (standard depuis le fix e5400c5).
- `lastPlayed` et les enregistrements `SongPlay` existent déjà — point d'ancrage naturel du pont FR21-FR23.
- Filtrage côté client avec persistance localStorage — pattern réutilisable pour les préférences de la heatmap.

## Digest concurrentiel (connaissances ~début 2026 — accès web indisponible pendant la recherche, à revérifier avant lancement)

- **Modacity** (iOS/Android) — practice journal « pro » : sessions chronométrées, items/exercices, notes, audio, stats ; ~$5–7/mois, positionnement « deliberate practice ».
- **Tonara** — suivi de pratique assigné par le prof, gamification ; B2B2C écoles de musique.
- **Andante / Sessions / Practicia / Better Practice** — timers + log manuel simple ; rétention notoirement faible.
- **Yousician / Fretello / Simply Piano** — apprentissage guidé avec streaks Duolingo ; le tracking est un sous-produit du contenu. ~$10–20/mois.
- **PracticeBird / Music Journal** — logging léger + graphes ; pas de heatmap type GitHub.
- Modèles UX adjacents : Strava (récaps), Duolingo (streaks — avec leur effet culpabilisant documenté), Anki (répétition espacée), GitHub (heatmap).

**Enseignements retenus dans le PRD** : différenciation répertoire + journal combinés (quasi inexistant sur le marché) ; friction de saisie = cause n°1 d'abandon → FR12/NFR1 ; risque culpabilisation heatmap → FR18 ; sujets de première classe appréciés (les « items » de Modacity) → Groupe A ; repère pricing freemium $4–7/mois si monétisation future.

## Matière de backlog (brainstorming du 2026-06-06, hors périmètre de ce PRD)

Thèmes complets dans `_bmad-output/brainstorming/brainstorming-session-2026-06-06-1603.md` :
- Mode session temps réel (chrono) — explicitement arbitré en v2.
- Poste de travail intégré : lecteur YouTube (vitesse + boucle A-B), vidéothèque par instrument, métronome/accordeur contextuels.
- École du manche : moteur audio plateforme, répétition espacée des erreurs, micro-leçons.
- Motivation douce : récap hebdo, Wrapped annuel, records, objectifs opt-in.
- Lien chanson ↔ sujets ; santé du répertoire + menu du jour ; filtres composables drag & drop ; playlists intelligentes.
