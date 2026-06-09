---
title: PRD — Musician Tools : Journal de sessions, heatmap et sujets de travail
status: final
created: 2026-06-06
updated: 2026-06-06
---

# PRD — Musician Tools : Journal de sessions, heatmap et sujets de travail

## 1. Vision et contexte

Musician Tools est aujourd'hui un **catalogue de répertoire** : les musiciens y gèrent leurs chansons (clé, BPM, mode, signature, instruments, difficulté, accordages) et marquent quand ils les ont jouées. Cette itération le transforme en **journal de pratique musicale complet** : chaque moment de pratique devient une **session** enregistrée — quelles chansons, quels sujets de travail (pentatonique, gammes, technique…), combien de temps — et l'ensemble se visualise dans une **heatmap annuelle façon GitHub**.

**Le problème.** La pratique musicale réelle dépasse le répertoire : on travaille des gammes, de la technique, des sujets théoriques. Aujourd'hui l'app ne capture que « j'ai joué cette chanson » — sans durée, sans contexte, sans vision de la régularité. Le musicien n'a aucun miroir de sa pratique : où va son temps, qu'est-ce qui progresse, qu'est-ce qui rouille.

**Le pari produit.** La **session est l'unité atomique** du système. La heatmap, les futurs récaps et statistiques n'en sont que des projections. En gardant le modèle Session minimal, toutes les évolutions futures (santé du répertoire, récaps hebdo, école du manche) se brancheront dessus sans le modifier.

**Différenciation.** L'analyse concurrentielle montre que les journaux de pratique (Modacity, Andante…) ignorent le catalogue de répertoire, et que les apps de répertoire ignorent la pratique. Musician Tools combine les deux : logger « ce que j'ai travaillé » est trivial parce que le répertoire existe déjà. `[ASSUMPTION]` L'app reste gratuite pour cette itération — la monétisation n'est pas au périmètre.

**Philosophie produit (non négociable).** *Motivation par le miroir, jamais par le fouet.* Pas de streak punitif, pas de notification culpabilisante, pas de rouge agressif. Le journal reflète fidèlement la réalité — y compris rétroactivement — et c'est cette fidélité qui crée la confiance dans la heatmap.

## 2. Objectifs et métriques de succès

| # | Métrique | Cible |
|---|---|---|
| M1 | Utilisateurs actifs loggant ≥ 1 session/semaine | ≥ 50 % à 4 semaines après adoption |
| M2 | Temps médian de saisie d'une session (utilisateur récurrent) | < 30 secondes |
| M3 | Rétention du logging : utilisateurs encore actifs en semaine 4 | ≥ 40 % |
| M4 | Sessions contenant au moins un sujet de travail (pas seulement des chansons) | ≥ 30 % |

Ces métriques se mesurent depuis les données serveur existantes (sessions, horodatages) — pas d'outil d'analytics tiers dans cette itération.

**Contre-métriques** (garde-fous) :

- **CM1 — Churn post-rupture** : un trou dans la heatmap ne doit pas faire fuir. Surveiller le taux de retour après ≥ 7 jours d'inactivité ; s'il s'effondre, la heatmap culpabilise au lieu de motiver.
- **CM2 — Usage répertoire** : l'ajout du journal ne doit pas dégrader l'usage existant (création/édition de chansons, filtres). Le pont « Mark as Played » doit enrichir, pas complexifier.

## 3. Utilisateurs et parcours

Cible : musiciens amateurs et intermédiaires qui pratiquent régulièrement plusieurs instruments et veulent un miroir honnête de leur pratique — pas un cours, pas un coach culpabilisant.

### UJ-1 — Léa logge sa session du soir

Léa, 34 ans, bassiste amateur, vient de finir 40 minutes de pratique, le PC à portée de main. Elle ouvre Musician Tools, clique « Nouvelle session ». La date du jour et son instrument habituel (basse) sont pré-remplis. Elle ajoute « Sweet Child O' Mine » depuis ses chansons récentes (15 min), puis le sujet « Pentatonique » (25 min) avec la note « à 30 BPM, propre ». Elle valide. Moins de 30 secondes se sont écoulées ; la case du jour s'allume dans sa heatmap.

### UJ-2 — Léa rattrape la session d'hier

Hier, Léa a pratiqué chez une amie, sans logger. Ce matin, elle crée une session rétroactive datée d'hier : 20 minutes de « Gammes majeures ». La case d'hier s'allume. Le journal reste fidèle à sa pratique réelle, pas à son usage de l'app — c'est la condition de sa confiance dans la grille.

### UJ-3 — Marc joue et c'est loggé tout seul

Marc, guitariste, utilise l'app comme avant : il filtre par guitare + dernier joué, repère un morceau délaissé, le joue, clique « Mark as Played Now ». Sans action supplémentaire, la session guitare du jour est créée (ou complétée) avec ce morceau. Sa heatmap vit même s'il n'a jamais ouvert le journal — la capture est gratuite. Et dès le premier jour, sa grille n'est pas vide : tout son historique de lectures passées y figure déjà.

### UJ-4 — Léa contemple son année

Fin de mois, Léa ouvre la heatmap : trois semaines denses, une semaine creuse (vacances). Elle clique sur un jour sombre : le détail liste les deux sessions de cette journée, leurs morceaux, sujets et notes. Aucun message ne lui reproche la semaine creuse ; la grille constate, c'est tout.

## 4. Périmètre

### Inclus

1. **Sujets de travail** — entité de première classe, CRUD, liste plate.
2. **Journal de sessions** — CRUD manuel, sessions rétroactives, entrées chanson/sujet avec minutes et notes.
3. **Heatmap annuelle** — grille type GitHub, intensité par minutes, détail par jour, historique existant rétro-importé.
4. **Pont avec l'existant** — « Mark as Played Now » alimente la session du jour de l'instrument.

### Exclu (backlog, itérations futures)

- Mode session temps réel avec chrono (« Démarrer ma session ») — v2.
- Lecteur YouTube intégré, vidéothèque par instrument, métronome/accordeur contextuels.
- École du manche / moteur audio (détection de notes, micro-leçons).
- Motivation douce avancée : récaps hebdo, Wrapped annuel, records, objectifs.
- Lien chanson ↔ sujets (« ce blues travaille la pentatonique »).
- Santé du répertoire (fraîcheur 🟢/🟡/🔴, menu du jour).
- Vue de progression par sujet (historique daté des notes contextuelles : « à 30 BPM » → « à 60 BPM »).
- Répartition du temps de pratique par sujet/chanson (« où va mon temps ») — projection des récaps futurs.

## 5. Exigences fonctionnelles

### Groupe A — Sujets de travail

- **FR1** : L'utilisateur peut créer un sujet de travail avec un nom (requis) et une catégorie libre (optionnelle). Pas de hiérarchie : liste plate.
- **FR2** : L'utilisateur peut renommer, recatégoriser et supprimer ses propres sujets (propriété vérifiée, comme pour les chansons).
- **FR3** : L'utilisateur dispose d'une page de gestion simple listant tous ses sujets.
- **FR4** : La suppression d'un sujet ne supprime pas l'historique : les sessions passées qui le référencent continuent d'afficher son nom. En rééditant une session, l'utilisateur peut reclasser une entrée vers un autre sujet (l'historique ne se troue jamais, mais reste corrigeable).
- **FR5** : Les sujets de travail sont **distincts des « techniques »** existantes (métadonnées de chanson) : aucun rapprochement automatique dans cette itération. Le lien chanson ↔ sujets est au backlog.

### Groupe B — Journal de sessions

- **FR6** : L'utilisateur peut créer une session avec : date (défaut : aujourd'hui ; toute date passée autorisée — session rétroactive ; dates futures interdites), instrument, durée totale. **Aucune durée minimale** : une session de 1 à 3 minutes (« 3 minutes de pentatonique ») est une session à part entière.
- **FR7** : Une session porte **exactement un instrument**. Deux instruments le même jour = deux sessions distinctes.
- **FR8** : Une session contient zéro ou plusieurs entrées ; chaque entrée référence **une chanson ou un sujet**, avec minutes (optionnelles) et note libre contextuelle (optionnelle, ex. « à 30 BPM »).
- **FR9** : Une session porte une note libre globale (optionnelle, ex. « le pont coince encore »).
- **FR10** : Toute session est éditable a posteriori : date, durée, instrument, entrées, notes.
- **FR11** : Toute session est supprimable, avec dialogue de confirmation (pattern existant).
- **FR12** : La saisie est optimisée pour la vitesse : chansons et sujets récents suggérés en premier, recherche instantanée dans le répertoire et les sujets, instrument par défaut pré-rempli. Cible : session complète saisie en moins de 30 secondes (cf. M2).
- **FR13** : `[ASSUMPTION]` Si toutes les entrées portent des minutes, la durée totale de la session est pré-calculée comme leur somme ; l'utilisateur peut la surcharger.
- **FR14** : L'utilisateur peut consulter l'historique de ses sessions (liste antichronologique avec date, durée, instrument, entrées).

### Groupe C — Heatmap

- **FR15** : Une grille annuelle type GitHub affiche une case par jour ; l'intensité visuelle reflète les minutes totales pratiquées ce jour-là. L'échelle est **relative à l'utilisateur** (paliers calculés sur sa propre distribution, à la façon des quartiles GitHub). Comme sur GitHub, **toute session allume le jour** quelle que soit sa durée : une session sans durée ou de quelques minutes s'affiche à l'intensité minimale visible.
- **FR16** : Cliquer sur un jour ouvre le détail : sessions de la journée avec leurs entrées et notes.
- **FR17** : L'utilisateur peut naviguer entre les années.
- **FR18** : Aucune mécanique punitive : pas de compteur de série (« streak ») cassée, pas de couleur agressive sur les jours vides, pas de notification de relance. La grille constate, ne juge pas.
- **FR19** : Le « jour » d'une session est la **date locale de l'appareil** (téléphone ou ordinateur) au moment de la saisie — c'est le client qui détermine la date, jamais l'horloge du serveur.
- **FR20** : La heatmap est visible dès le premier jour, même vide — pas de seuil minimal de sessions.

### Groupe D — Pont avec l'existant

- **FR21** : Cliquer « Mark as Played Now » sur une chanson crée la session du jour **pour l'instrument concerné** (si absente) ou la complète : la chanson est ajoutée comme entrée, sans minutes. Le jour est la date locale de l'appareil (cf. FR19).
- **FR22** : **Rétro-import** : l'historique de lectures existant (enregistrements de « Mark as Played » passés) est projeté dans la heatmap — chaque lecture passée allume son jour à l'intensité minimale. La grille a une histoire dès le lancement.
- **FR23** : La cohérence inverse est maintenue : ajouter une chanson à une session met à jour son « dernier joué » pour l'instrument de la session si la date de la session est plus récente ; éditer la date d'une session ou la supprimer **recalcule** le « dernier joué » des chansons concernées. Le filtre « dernier joué » existant ne ment jamais.

## 6. Exigences non fonctionnelles

- **NFR1 — Vitesse de saisie** : le formulaire de session est utilisable en < 30 s par un utilisateur récurrent (mesuré, cf. M2) ; aucune étape obligatoire au-delà de la date et de l'instrument.
- **NFR2 — Performance heatmap** : rendu < 1 s avec une année complète de données (365 jours, plusieurs centaines de sessions, rétro-import inclus).
- **NFR3 — Responsive complet** : journal, saisie de session et heatmap pleinement utilisables sur mobile et desktop. Dark mode supporté partout ; les préférences d'affichage suivent le pattern localStorage existant.
- **NFR4 — Propriété des données** : un utilisateur ne voit et ne modifie que ses propres sessions et sujets (middleware d'ownership existant, appliqué aux nouvelles routes).
- **NFR5 — Migrations** : les nouvelles tables (sessions, sujets, entrées) suivent le standard projet de migrations idempotentes ; le rétro-import (FR22) est rejouable sans doublon.
- **NFR6 — Accessibilité** : heatmap navigable au clavier avec alternatives textuelles (ARIA) ; formulaires labellisés (standard existant).

## 7. Risques et dépendances

| Risque | Impact | Mitigation |
|---|---|---|
| La heatmap culpabilise après une rupture de pratique (effet documenté chez Duolingo/Anki) | Churn (CM1) | FR18 : aucune mécanique punitive ; surveiller CM1 dès le lancement |
| Friction de saisie → abandon du logging (cause n°1 d'abandon des practice journals du marché) | M1/M3 ratées | FR12/NFR1 : < 30 s, suggestions récentes ; le pont FR21 capture sans saisie |
| Enrichissement prématuré du modèle Session (tentation identifiée au brainstorming) | Dette, complexité | Modèle minimal gardé ; toute extension future se branche sans le modifier |
| Double comptage entre l'historique de lectures existant et les sessions | Heatmap faussée, « dernier joué » incohérent | FR21-FR23 : règles de fusion, de rétro-import et de recalcul explicites |

**Dépendances** : modèle `Song`, historique de lectures et tracking « dernier joué » existants ; middleware d'auth/ownership existant ; analyse concurrentielle à revérifier en ligne avant lancement (recherche effectuée hors web).

## 8. Questions ouvertes

1. `[ASSUMPTION]` Gratuité maintenue — la monétisation (freemium observé à $4–7/mois dans la niche) est-elle un sujet pour une itération future ?
2. `[ASSUMPTION]` Le rétro-import (FR22) couvre l'intégralité de l'historique de lectures, sans limite de profondeur.

## 9. Glossaire

| Terme | Définition |
|---|---|
| **Session** | Unité atomique du journal : un moment de pratique daté, sur un instrument, avec une durée et des entrées. |
| **Entrée** | Ligne d'une session référençant une chanson **ou** un sujet, avec minutes et note libre optionnelles. |
| **Sujet de travail** | Thème de pratique défini par l'utilisateur (pentatonique, gammes…), loggable au même titre qu'une chanson. Distinct des « techniques » (métadonnées de chanson). |
| **Heatmap** | Grille annuelle type GitHub ; projection visuelle des sessions, intensité = minutes du jour. |
| **Pont** | Mécanisme reliant le « Mark as Played Now » existant au journal : capture automatique sans saisie. |
