---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/prd.md
  - _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/addendum.md
---

# musician-tools - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for musician-tools, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1 : L'utilisateur peut créer un sujet de travail avec un nom (requis) et une catégorie libre (optionnelle). Pas de hiérarchie : liste plate.
FR2 : L'utilisateur peut renommer, recatégoriser et supprimer ses propres sujets (propriété vérifiée, comme pour les chansons).
FR3 : L'utilisateur dispose d'une page de gestion simple listant tous ses sujets.
FR4 : La suppression d'un sujet ne supprime pas l'historique : les sessions passées qui le référencent continuent d'afficher son nom. En rééditant une session, l'utilisateur peut reclasser une entrée vers un autre sujet.
FR5 : Les sujets de travail sont distincts des « techniques » existantes (métadonnées de chanson) : aucun rapprochement automatique dans cette itération.
FR6 : L'utilisateur peut créer une session avec : date (défaut : aujourd'hui ; toute date passée autorisée — session rétroactive ; dates futures interdites), instrument, durée totale. Aucune durée minimale.
FR7 : Une session porte exactement un instrument. Deux instruments le même jour = deux sessions distinctes.
FR8 : Une session contient zéro ou plusieurs entrées ; chaque entrée référence une chanson ou un sujet, avec minutes (optionnelles) et note libre contextuelle (optionnelle).
FR9 : Une session porte une note libre globale (optionnelle).
FR10 : Toute session est éditable a posteriori : date, durée, instrument, entrées, notes.
FR11 : Toute session est supprimable, avec dialogue de confirmation (pattern existant).
FR12 : La saisie est optimisée pour la vitesse : chansons et sujets récents suggérés en premier, recherche instantanée, instrument par défaut pré-rempli. Cible : session complète saisie en moins de 30 secondes.
FR13 : [ASSUMPTION] Si toutes les entrées portent des minutes, la durée totale de la session est pré-calculée comme leur somme ; l'utilisateur peut la surcharger.
FR14 : L'utilisateur peut consulter l'historique de ses sessions (liste antichronologique avec date, durée, instrument, entrées).
FR15 : Grille annuelle type GitHub, une case par jour ; intensité = minutes totales du jour, échelle relative à l'utilisateur (paliers type quartiles GitHub). Toute session allume le jour quelle que soit sa durée (intensité minimale visible).
FR16 : Cliquer sur un jour ouvre le détail : sessions de la journée avec leurs entrées et notes.
FR17 : L'utilisateur peut naviguer entre les années.
FR18 : Aucune mécanique punitive : pas de compteur de streak cassée, pas de couleur agressive sur les jours vides, pas de notification de relance.
FR19 : Le « jour » d'une session est la date locale de l'appareil au moment de la saisie — le client détermine la date, jamais l'horloge du serveur.
FR20 : La heatmap est visible dès le premier jour, même vide — pas de seuil minimal de sessions.
FR21 : « Mark as Played Now » crée la session du jour pour l'instrument concerné (si absente) ou la complète : chanson ajoutée comme entrée, sans minutes. Jour = date locale de l'appareil.
FR22 : Rétro-import : l'historique de lectures existant (« Mark as Played » passés) est projeté dans la heatmap — chaque lecture passée allume son jour à l'intensité minimale.
FR23 : Cohérence inverse : ajouter une chanson à une session met à jour son « dernier joué » pour l'instrument de la session si la date de la session est plus récente ; éditer la date d'une session ou la supprimer recalcule le « dernier joué » des chansons concernées.

### NonFunctional Requirements

NFR1 : Vitesse de saisie — formulaire de session utilisable en < 30 s par un utilisateur récurrent ; aucune étape obligatoire au-delà de la date et de l'instrument.
NFR2 : Performance heatmap — rendu < 1 s avec une année complète de données (365 jours, plusieurs centaines de sessions, rétro-import inclus).
NFR3 : Responsive complet — journal, saisie et heatmap pleinement utilisables sur mobile et desktop ; dark mode partout ; préférences d'affichage via le pattern localStorage existant.
NFR4 : Propriété des données — un utilisateur ne voit et ne modifie que ses propres sessions et sujets (middleware d'ownership existant appliqué aux nouvelles routes).
NFR5 : Migrations — nouvelles tables (sessions, sujets, entrées) en migrations idempotentes (standard projet) ; rétro-import (FR22) rejouable sans doublon.
NFR6 : Accessibilité — heatmap navigable au clavier avec alternatives textuelles (ARIA) ; formulaires labellisés (standard existant).

### Additional Requirements

- Pas de starter template : projet brownfield — l'itération se greffe sur l'app existante (React + TypeScript + Vite + Tailwind ; Express + Sequelize + Supabase ; déploiement Fly.io auto sur main).
- Modèle de données cible (addendum) : Session (date, durée totale, un seul instrument, note libre globale, entrées[]) ; Entrée/SessionItem (référence chanson OU sujet, minutes optionnelles, note libre optionnelle) ; Sujet (nom, catégorie libre optionnelle). Garder le modèle Session minimal — les évolutions futures s'y branchent sans le modifier.
- La table `SongPlay` existante reste la source d'événements de lecture ; le « dernier joué » par instrument en est dérivé (`Song.lastPlayed` est global). Recalcul du dérivé à l'édition/suppression de session (FR23).
- Rétro-import (FR22) : projeter les `SongPlay` historiques dans la heatmap — projection rejouable, sans duplication en table session (arbitrage projection à la lecture vs backfill matérialisé à faire en implémentation).
- Date locale client (FR19/FR21) : ne pas horodater le jour côté serveur — l'implémentation actuelle de `markSongPlayed` utilise l'horloge serveur, à corriger au passage.
- Mesure des métriques produit (M1-M4) depuis les données serveur existantes — pas d'outil d'analytics tiers dans cette itération.

### UX Design Requirements

_Aucun document UX Design — section sans objet pour cette itération. Les exigences UX portées par le PRD : philosophie « miroir, pas fouet » (FR18), saisie < 30 s (FR12/NFR1), heatmap type GitHub à échelle relative (FR15), responsive + dark mode (NFR3), accessibilité (NFR6)._

### FR Coverage Map

FR1: Epic 1 - Création de sujet (nom + catégorie libre, liste plate)
FR2: Epic 1 - Renommer/recatégoriser/supprimer ses sujets (ownership)
FR3: Epic 1 - Page de gestion des sujets
FR4: Epic 1 - Suppression sans trou d'historique + reclassement d'entrée
FR5: Epic 1 - Sujets distincts des « techniques » existantes
FR6: Epic 2 - Création de session (date rétroactive, pas de durée minimale, dates futures interdites)
FR7: Epic 2 - Une session = un instrument
FR8: Epic 2 - Entrées chanson OU sujet (minutes + note optionnelles)
FR9: Epic 2 - Note libre globale de session
FR10: Epic 2 - Édition complète a posteriori
FR11: Epic 2 - Suppression avec confirmation
FR12: Epic 2 - Saisie < 30 s (suggestions récentes, recherche instantanée, défauts)
FR13: Epic 2 - Durée pré-calculée = somme des entrées, surchargeable
FR14: Epic 2 - Historique antichronologique des sessions
FR15: Epic 3 - Grille annuelle type GitHub, échelle relative, toute session allume le jour
FR16: Epic 3 - Détail des sessions au clic sur un jour
FR17: Epic 3 - Navigation entre années
FR18: Epic 3 - Aucune mécanique punitive
FR19: Epic 3 - Jour = date locale de l'appareil (client source de vérité)
FR20: Epic 3 - Heatmap visible dès le premier jour
FR21: Epic 4 - « Mark as Played » crée/complète la session du jour de l'instrument
FR22: Epic 3 - Rétro-import de l'historique de lectures dans la heatmap
FR23: Epic 4 - Cohérence bidirectionnelle du « dernier joué » (mise à jour + recalcul)

## Epic List

### Epic 1: Ma bibliothèque de sujets de travail
Je définis et gère mes sujets de travail (pentatonique, gammes, technique…) — la deuxième dimension de ma pratique existe dans l'app.
**FRs covered:** FR1, FR2, FR3, FR4, FR5

### Epic 2: Mon journal de sessions
Je logge toute ma pratique — chansons et sujets, durées, notes — y compris rétroactivement, en moins de 30 secondes, et je consulte mon historique.
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14

### Epic 3: Ma pratique en un coup d'œil (heatmap)
Je vois ma régularité dans une grille annuelle type GitHub — et ma grille a déjà une histoire grâce au rétro-import de mon historique de lectures.
**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR20, FR22

### Epic 4: La capture sans effort (pont avec l'existant)
Je joue comme avant — « Mark as Played » — et mon journal se remplit tout seul, sans jamais fausser mon « dernier joué ».
**FRs covered:** FR21, FR23

**Dépendances :** E1 → E2 → (E3 ∥ E4). Les epics 3 et 4 sont indépendants l'un de l'autre. Les NFR1-NFR6 transverses s'appliquent aux critères d'acceptation des stories concernées.

## Epic 1: Ma bibliothèque de sujets de travail

Je définis et gère mes sujets de travail (pentatonique, gammes, technique…) — la deuxième dimension de ma pratique existe dans l'app.

### Story 1.1: Créer un sujet de travail

As a musicien,
I want créer un sujet de travail avec un nom et une catégorie libre optionnelle,
So that je peux nommer ce que je travaille au-delà des chansons.

**Acceptance Criteria:**

**Given** je suis authentifié
**When** je crée un sujet « Pentatonique » sans catégorie
**Then** le sujet est sauvegardé et m'appartient (invisible pour les autres utilisateurs)
**And** il apparaît immédiatement dans ma liste de sujets

**Given** je crée un sujet « Walking bass » avec la catégorie « Technique »
**When** je valide
**Then** le nom et la catégorie sont sauvegardés

**Given** un nom vide
**When** je valide
**Then** une erreur de validation s'affiche (client et serveur) et rien n'est créé

**Given** un déploiement
**When** la migration de la table des sujets s'exécute
**Then** elle est idempotente — rejouable sans erreur (NFR5)
**And** le formulaire est labellisé, responsive et dark mode (NFR3, NFR6)

### Story 1.2: Gérer ma bibliothèque de sujets

As a musicien,
I want consulter, renommer, recatégoriser et supprimer mes sujets,
So that ma bibliothèque reste fidèle à ma pratique réelle.

**Acceptance Criteria:**

**Given** des sujets existants
**When** j'ouvre la page « Sujets »
**Then** je vois la liste plate de tous mes sujets avec nom et catégorie — aucune hiérarchie

**Given** un sujet
**When** je le renomme ou change sa catégorie
**Then** la modification est sauvegardée et visible immédiatement

**Given** un sujet
**When** je le supprime
**Then** un dialogue de confirmation s'affiche (pattern existant) avant suppression définitive
**And** la sémantique de suppression préserve le nom pour les références futures de l'historique (préparation FR4 — vérifié de bout en bout à l'Epic 2)

**Given** les « techniques » existantes des chansons
**When** cette story est livrée
**Then** aucun rapprochement ni migration : le formulaire chanson est inchangé (FR5)

**Given** un autre utilisateur
**When** il tente d'accéder à mes sujets (page ou API)
**Then** l'accès est refusé (NFR4)

## Epic 2: Mon journal de sessions

Je logge toute ma pratique — chansons et sujets, durées, notes — y compris rétroactivement, en moins de 30 secondes, et je consulte mon historique.

### Story 2.1: Créer une session de pratique

As a musicien,
I want enregistrer une session (date, instrument, durée, note libre),
So that ma pratique du jour — ou d'un jour passé — laisse une trace fidèle.

**Acceptance Criteria:**

**Given** je suis authentifié
**When** je crée une session avec la date du jour (pré-remplie), l'instrument « Basse » et 40 minutes
**Then** la session est sauvegardée et m'appartient (NFR4)

**Given** j'ai pratiqué hier sans logger
**When** je crée une session datée d'hier
**Then** la session rétroactive est acceptée sans distinction de traitement (FR6)

**Given** une date future
**When** je valide
**Then** une erreur de validation s'affiche — dates futures interdites (FR6)

**Given** une session de 2 minutes
**When** je valide
**Then** elle est acceptée — aucune durée minimale (FR6)

**Given** le formulaire de création
**When** je choisis l'instrument
**Then** exactement un instrument par session (FR7) ; je peux ajouter une note libre globale optionnelle (FR9)
**And** la migration de la table sessions est idempotente (NFR5) ; formulaire responsive, dark mode, labellisé (NFR3, NFR6)

### Story 2.2: Détailler ma session avec des entrées

As a musicien,
I want ajouter à ma session des entrées — chansons de mon répertoire ou sujets de ma bibliothèque — avec minutes et note contextuelle,
So that je sais précisément ce que j'ai travaillé, et avec quel ressenti.

**Acceptance Criteria:**

**Given** une session en cours de création ou d'édition
**When** j'ajoute une entrée
**Then** je choisis une chanson de mon répertoire **ou** un sujet de ma bibliothèque (FR8)
**And** je peux préciser des minutes optionnelles et une note libre optionnelle (« à 30 BPM ») (FR8)

**Given** une session avec entrées « Sweet Child (15 min) » et « Pentatonique (25 min) »
**When** toutes les entrées portent des minutes
**Then** la durée totale est pré-calculée à 40 min, et je peux la surcharger (FR13)

**Given** une session sans aucune entrée
**When** je valide
**Then** elle est acceptée — zéro entrée est valide (FR8)

**Given** la migration de la table des entrées
**When** elle s'exécute
**Then** elle est idempotente (NFR5)

### Story 2.3: Consulter mon historique de sessions

As a musicien,
I want voir la liste de mes sessions passées,
So that je peux me remémorer ce que j'ai travaillé et quand.

**Acceptance Criteria:**

**Given** des sessions existantes
**When** j'ouvre la page « Sessions »
**Then** je vois la liste antichronologique : date, durée, instrument, entrées (FR14)
**And** les notes (globales et par entrée) sont consultables

**Given** un autre utilisateur
**When** il consulte son historique
**Then** il ne voit jamais mes sessions (NFR4)
**And** la page est responsive et dark mode (NFR3)

### Story 2.4: Corriger mon journal a posteriori

As a musicien,
I want éditer ou supprimer toute session,
So that mon journal reste fidèle à ma pratique réelle, pas à mon usage de l'app.

**Acceptance Criteria:**

**Given** une session existante
**When** je l'édite
**Then** date, durée, instrument, entrées et notes sont tous modifiables (FR10)

**Given** une session référençant un sujet supprimé depuis
**When** je la consulte ou l'édite
**Then** le nom du sujet supprimé reste affiché (FR4)
**And** je peux reclasser l'entrée vers un autre sujet (FR4)

**Given** une session
**When** je la supprime
**Then** dialogue de confirmation avant suppression définitive (FR11)

### Story 2.5: Logger en moins de 30 secondes

As a musicien récurrent,
I want une saisie éclair — suggestions intelligentes et défauts pré-remplis,
So that logger ne devienne jamais une corvée qui me fait abandonner le journal.

**Acceptance Criteria:**

**Given** j'ouvre le formulaire de session
**When** il s'affiche
**Then** date du jour et mon instrument le plus récemment utilisé sont pré-remplis (FR12)
**And** seules date et instrument sont obligatoires (NFR1)

**Given** j'ajoute une entrée
**When** la liste de choix s'affiche
**Then** mes chansons et sujets récemment loggés apparaissent en premier (FR12)
**And** une recherche instantanée filtre répertoire et sujets au fil de la saisie (FR12)

**Given** un utilisateur récurrent
**When** il logge une session type (2 entrées, minutes, une note)
**Then** le parcours complet tient en moins de 30 secondes (NFR1/M2)

## Epic 3: Ma pratique en un coup d'œil (heatmap)

Je vois ma régularité dans une grille annuelle type GitHub — et ma grille a déjà une histoire grâce au rétro-import de mon historique de lectures.

### Story 3.1: Ma grille annuelle de pratique

As a musicien,
I want voir une grille annuelle type GitHub où chaque jour pratiqué s'allume selon mes minutes,
So that ma régularité — et mes trous — me sautent aux yeux, sans jugement.

**Acceptance Criteria:**

**Given** des sessions sur plusieurs jours
**When** j'ouvre la heatmap
**Then** une grille annuelle affiche une case par jour, intensité = minutes totales du jour (FR15)
**And** l'échelle est relative à ma propre distribution (paliers type quartiles GitHub) (FR15)

**Given** une session de 2 minutes ou sans durée un jour donné
**When** la grille s'affiche
**Then** ce jour s'allume à l'intensité minimale visible — toute session compte (FR15)

**Given** un nouvel utilisateur sans aucune session
**When** il ouvre la heatmap
**Then** la grille s'affiche, vide, dès le premier jour — aucun seuil (FR20)

**Given** des jours sans pratique
**When** la grille s'affiche
**Then** aucun compteur de streak, aucune couleur agressive, aucune notification de relance (FR18)

**Given** le calcul du « jour » d'une session
**When** la grille agrège
**Then** elle utilise la date telle que saisie côté client (date locale de l'appareil), sans conversion serveur (FR19)

**Given** une année complète de données (plusieurs centaines de sessions)
**When** la grille se rend
**Then** affichage < 1 s (NFR2) ; navigable au clavier avec alternatives textuelles ARIA (NFR6) ; responsive et dark mode (NFR3)

### Story 3.2: Explorer ma pratique depuis la grille

As a musicien,
I want cliquer sur un jour pour voir le détail, et naviguer entre les années,
So that la grille devienne la porte d'entrée de mon journal.

**Acceptance Criteria:**

**Given** un jour allumé
**When** je clique (ou valide au clavier) sur sa case
**Then** le détail s'ouvre : sessions du jour avec entrées, durées et notes (FR16)

**Given** un jour vide
**When** je clique dessus
**Then** un état vide neutre s'affiche — sans reproche ni incitation culpabilisante (FR16, FR18)

**Given** plusieurs années de données
**When** j'utilise la navigation d'années
**Then** je passe d'une année à l'autre et la grille se recharge (FR17)

**Given** le détail d'un jour affichant une session _(ajout northwood, 2026-06-07)_
**When** je choisis « Edit » sur cette session
**Then** le formulaire de session s'ouvre directement en mode édition de cette session (réutilisation du mode édition existant, deep-link)

**Given** le détail d'un jour vide _(ajout northwood, 2026-06-07)_
**When** je choisis « Log a session for this day »
**Then** le formulaire de session s'ouvre avec la date de ce jour pré-remplie — une affordance choisie par l'utilisateur, pas une relance (FR18 préservé)

### Story 3.3: Ma grille a déjà une histoire (rétro-import)

As a musicien qui utilise l'app depuis des mois,
I want que mes « Mark as Played » passés apparaissent dans la heatmap dès le lancement,
So that ma grille reflète ma vraie histoire au jour 1 — pas un désert décourageant.

**Acceptance Criteria:**

**Given** mon historique de lectures existant (enregistrements de lectures passés)
**When** la heatmap s'affiche après le déploiement de cette fonctionnalité
**Then** chaque lecture passée allume son jour à l'intensité minimale (FR22)

**Given** un jour avec à la fois des lectures historiques et une vraie session
**When** la grille agrège
**Then** pas de double comptage : les minutes de session priment, l'historique n'ajoute que la présence (FR22)

**Given** le mécanisme de rétro-import
**When** il est rejoué (redéploiement, re-calcul)
**Then** aucun doublon n'est créé — opération idempotente (NFR5)

**Given** le détail d'un jour uniquement historique (FR16)
**When** je l'ouvre
**Then** les lectures sont identifiables comme telles (« joué », sans durée), distinctes des sessions loggées

## Epic 4: La capture sans effort (pont avec l'existant)

Je joue comme avant — « Mark as Played » — et mon journal se remplit tout seul, sans jamais fausser mon « dernier joué ».

### Story 4.1: « Mark as Played » remplit mon journal tout seul

As a musicien qui n'a pas encore adopté le journal,
I want que cliquer « Mark as Played Now » alimente automatiquement la session du jour de mon instrument,
So that ma heatmap vit même si je n'ouvre jamais le formulaire de session.

**Acceptance Criteria:**

**Given** aucune session aujourd'hui pour la guitare
**When** je clique « Mark as Played Now » sur une chanson avec l'instrument guitare
**Then** une session du jour est créée pour la guitare, avec la chanson comme entrée sans minutes (FR21)

**Given** une session guitare existe déjà aujourd'hui
**When** je marque une autre chanson jouée à la guitare
**Then** la chanson s'ajoute comme entrée à cette session existante — pas de session en double (FR21)

**Given** une session basse existe aujourd'hui, mais aucune pour la guitare
**When** je marque une chanson jouée à la guitare
**Then** une session guitare distincte est créée — une session par instrument (FR21, FR7)

**Given** la même chanson déjà présente dans la session du jour
**When** je la marque jouée à nouveau
**Then** pas d'entrée dupliquée dans la session

**Given** un clic à 23h50 heure locale
**When** la session du jour est déterminée
**Then** c'est la date locale de l'appareil qui fait foi — le code serveur n'utilise plus son horloge pour dater le jour (FR19/FR21, correction de l'horodatage existant)

### Story 4.2: Mon « dernier joué » ne ment jamais

As a musicien qui filtre par « dernier joué » pour faire tourner son répertoire,
I want que le journal et le « dernier joué » restent cohérents dans les deux sens,
So that mon usage quotidien — repêcher les morceaux délaissés — reste fiable.

**Acceptance Criteria:**

**Given** une chanson dont le « dernier joué » basse date de janvier
**When** je l'ajoute à une session basse datée de mars (y compris rétroactive)
**Then** son « dernier joué » basse devient mars (FR23)

**Given** la même chanson
**When** je l'ajoute à une session datée de décembre dernier (antérieure à janvier)
**Then** son « dernier joué » reste janvier — on ne recule jamais par simple ajout (FR23)

**Given** une session de mars qui portait la lecture la plus récente d'une chanson
**When** je supprime cette session ou change sa date
**Then** le « dernier joué » de la chanson est recalculé depuis l'historique restant (FR23)

**Given** le tri « dernier joué » existant de la liste de chansons
**When** toutes ces opérations s'exécutent
**Then** le tri reflète toujours la réalité — aucune régression de l'usage existant (FR23, CM2)
