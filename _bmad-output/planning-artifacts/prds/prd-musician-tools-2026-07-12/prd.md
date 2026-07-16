---
title: "PRD — Musician Tools : Catalog (pool partagé de chansons)"
status: final
created: 2026-07-12
updated: 2026-07-12
---

# PRD — Musician Tools : Catalog

## 0. But du document

Ce PRD cadre le **Catalog** : un pool **partagé** de chansons pré-remplies qu'un utilisateur parcourt et copie dans sa **Songlist** personnelle. Il s'adresse au PM (northwood) et aux workflows aval (UX, architecture, epics/stories). Structure : vocabulaire ancré dans le **Glossaire** (§3), features groupées avec exigences fonctionnelles (`FR-n`) nichées dessous, hypothèses indexées en §9 (taguées `[ASSUMPTION]` inline quand ancrées dans une feature).

- Les identifiants (`FR-n`, `UJ-n`, `SM-n`, `NFR-n`) sont **propres à ce PRD Catalog** — ne pas les confondre avec le PRD journal `prd-musician-tools-2026-06-06` (FR1–FR26).
- Ce PRD **s'appuie sur l'existant** sans le redupliquer : Songlist perso, chansons (métadonnées clé/BPM/mode/signature/accordages), Playlists perso, garde d'unicité chanson per-user (Epic 17), auto-fill métadonnées (SongBPM). Le détail technique (modèle de données, mécanique snapshot, autorisation) vit dans `addendum.md`.
- Décisions fondatrices déjà tranchées (cf. `.decision-log.md`) : copie **snapshot + provenance**, contenu v1 = **métadonnées + liens seulement**, identité **canonique (titre+artiste)**, visibilité v1 **connectés seulement**, seed via **mini-UI curateur**, doublon à l'ajout = **bloquer + pointer l'existante**.

## 1. Vision

Aujourd'hui, chaque nouvel utilisateur de Musician Tools arrive sur une **Songlist vide** et doit **tout ressaisir à la main** — titre, artiste, clé, BPM, mode, accordages, liens — avant même de pouvoir logger une pratique. C'est la première friction du produit, et elle frappe pile au moment où l'utilisateur devrait ressentir la valeur.

Le **Catalog** supprime cette friction. C'est une bibliothèque **partagée** de chansons déjà entièrement remplies (métadonnées + liens YouTube/Spotify) que l'utilisateur **parcourt** et **ajoute à sa Songlist en un geste** (`Add to my songlist`). La chanson atterrit complète dans sa collection perso, prête à être jouée et travaillée, et reste **entièrement éditable** — c'est désormais *sa* chanson. Au-delà des fiches unitaires, des **Collections** curées (« Rock 90 », « Pop 2000 »…) laissent l'utilisateur peupler sa Songlist par lots thématiques.

Stratégiquement, le Catalog fait franchir au produit le pas du **mono-utilisateur vers le partagé** : un socle de données commun, curé, qui devient la matière de la future landing page (montrer un catalogue riche donne envie de s'inscrire) et, à terme, le terrain d'une **contribution communautaire**. Cette v1 pose le modèle partagé et le geste de copie ; elle est délibérément **curée par un seul mainteneur** et **limitée aux métadonnées**, pour livrer la valeur sans ouvrir prématurément les chantiers modération et licences.

## 2. Utilisateur cible

### 2.1 Jobs To Be Done

- **Fonctionnel** — « Quand j'ajoute une chanson que je pratique, je veux qu'elle soit déjà remplie (BPM, clé, liens) pour ne pas perdre 5 minutes à tout saisir. »
- **Fonctionnel** — « Je découvre/monte un répertoire (ex. rock 90s) et je veux peupler ma Songlist par thème sans chercher chaque titre un par un. »
- **Émotionnel** — « Je veux que l'app me donne l'impression d'être déjà pleine de matière, pas un tableur vide à remplir. »
- **Contextuel (curateur / northwood)** — « En tant que mainteneur, je veux enrichir un catalogue commun qui profite à tous les utilisateurs, sans écrire du SQL à la main. »

### 2.2 Non-utilisateurs (v1)

- **Contributeurs communautaires** — v1 est **curée par un seul mainteneur** ; les utilisateurs ne créent pas d'entrées Catalog (prévu comme phase future, cf. §4.6).
- **Visiteurs non connectés** — le Catalog n'est **pas** navigable sans compte en v1 (cf. §4.1, `[NON-GOAL for MVP]` browse public).
- **Musiciens cherchant paroles / tablatures / accords** — hors périmètre (cf. §5).

### 2.3 Parcours utilisateurs clés

- **UJ-1. Léa ajoute une chanson déjà remplie en dix secondes.**
  - **Persona + contexte :** Léa, guitariste, vient d'entendre « Zombie » des Cranberries et veut la travailler. Aujourd'hui elle abandonnerait à l'idée de tout ressaisir.
  - **État d'entrée :** connectée, sur sa Songlist.
  - **Chemin :** elle ouvre **Browse catalog** → tape « zombie » → la fiche apparaît (clé Em, BPM ~84, lien YouTube) → **Add to my songlist**.
  - **Climax :** la chanson est **dans sa Songlist, complète**, sans aucune saisie ; un toast confirme « Added to your songlist ».
  - **Résolution :** elle ouvre la chanson **dans sa Songlist**, ajuste l'accordage qu'elle utilise (attribut **perso**, réglé après l'ajout), et logge sa session. Réalise le JTBD fonctionnel #1.
  - **Edge case :** si « Zombie » est **déjà** dans sa Songlist, l'app ne recopie pas — elle signale « Already in your songlist » et pointe la fiche existante (FR-6).

- **UJ-2. Marc peuple sa Songlist avec une Collection « Rock 90 ».**
  - **Persona + contexte :** Marc débute et ne sait pas quoi travailler ; il veut un répertoire prêt à l'emploi.
  - **État d'entrée :** connecté, section Catalog.
  - **Chemin :** il parcourt les **Collections** → ouvre « Rock 90 » (20 chansons) → **Add collection to my songlist**.
  - **Climax :** les 20 chansons atterrissent dans sa Songlist d'un coup ; un récap indique « 18 added, 2 already in your songlist ».
  - **Résolution :** sa Songlist est pleine de matière, **regroupée dans une Playlist « Rock 90 »** prête à enchaîner ; il commence à jouer. Réalise le JTBD fonctionnel #2.

- **UJ-3. northwood cure le Catalog sans toucher au SQL.**
  - **Persona + contexte :** northwood, mainteneur, veut ajouter 30 chansons et monter une Collection.
  - **État d'entrée :** connecté avec le rôle **Curator**, sur l'écran d'administration du Catalog.
  - **Chemin :** il crée une fiche Catalog → **auto-fill** propose BPM/durée depuis SongBPM → il complète clé/mode → enregistre ; il compose une Collection en y glissant des fiches.
  - **Climax :** les fiches et la Collection sont **immédiatement visibles** par tous les utilisateurs connectés.
  - **Résolution :** le catalogue s'enrichit de façon tenable, sans intervention en base. Réalise le JTBD contextuel curateur.
  - **Edge case :** s'il tente une fiche dont le (titre + artiste) existe déjà au Catalog, la création est **refusée** (unicité canonique, FR-13).

## 3. Glossaire

*Termes à employer **verbatim** en aval (FR, UJ, SM, UX, epics). Aucun synonyme ailleurs dans le PRD. Chaînes UI en anglais (site en anglais) ; définitions en français.*

- **Catalog** — Pool **partagé**, unique et global, de fiches chansons canoniques pré-remplies, en **lecture seule** pour les utilisateurs. Source depuis laquelle on copie *vers* sa Songlist. Ne se dit jamais « Library ».
- **Catalog entry** *(fiche Catalog)* — Une chanson canonique du Catalog : métadonnées + liens officiels, **sans** propriétaire utilisateur. Son identité est la **clé canonique** (titre + artiste normalisés), unique dans le Catalog. Ne porte **ni** historique de pratique, **ni** playlists, **ni** notes perso.
- **Songlist** — Collection **personnelle** de chansons d'un utilisateur (existant). Cible de la copie.
- **Song** *(chanson perso)* — Chanson dans la Songlist d'un utilisateur (entité existante) ; porte l'historique de pratique, les playlists, `lastPlayed`. Peut être **issue** d'une fiche Catalog (porte alors une **Provenance**).
- **Add to my songlist** — Action de **copier** une fiche Catalog en une Song perso (mécanique **snapshot + provenance**). Sens **unidirectionnel** : Catalog → Songlist, jamais l'inverse.
- **Add collection to my songlist** — Action d'**importer en bloc** une Catalog Collection : copie chaque fiche (garde de doublon FR-6) **et** crée/réutilise une **Playlist perso miroir** du même nom (FR-9).
- **Catalog Collection** *(Collection)* — Bundle **curé** de fiches Catalog (ex. « Rock 90 »), qu'un utilisateur importe en bloc dans sa Songlist. Miroir partagé des **Playlists** perso ; à ne pas confondre avec elles.
- **Curator** *(curateur)* — Rôle autorisé à créer, éditer et supprimer les fiches Catalog et à composer les Collections. En v1 = northwood.
- **Provenance** — Lien conservé sur une Song perso copiée (`sourceCatalogUid`), invisible pour l'utilisateur en v1. Sert de crochet pour deux évolutions futures : la **proposition de mise à jour** (§4.5) et la **popularité agrégée** (§4.7 — compter adds/plays par fiche) ; **ne crée aucune dépendance vive** (la suppression de la fiche source ne casse pas la Song).
- **Clé canonique** — Normalisation (titre + artiste, insensible à la casse/aux espaces) servant d'identité d'une fiche Catalog **et** de garde de doublon à l'ajout. Miroir de l'index unique per-user des chansons (Epic 17).

## 4. Features

### 4.1 Browse Catalog — parcourir et trouver

**Description :** Un utilisateur connecté accède à une nouvelle surface **Catalog** où il parcourt, recherche et filtre les fiches, puis en ouvre le détail. La valeur du Catalog est la **trouvabilité** autant que le volume : la recherche et les filtres exploitent les dimensions métadonnées existantes. Réalise UJ-1, UJ-2. `[ASSUMPTION: le Catalog est une nouvelle entrée de navigation de premier niveau, à côté de Songlist ; cf. §11 Architecture de l'information.]`

**Functional Requirements :**

#### FR-1 : Parcourir le Catalog
Un utilisateur **connecté** peut parcourir la liste des fiches Catalog. Réalise UJ-1.
**Consequences (testable) :**
- Un utilisateur **non connecté** qui atteint la surface Catalog est traité comme toute route protégée (redirigé/401), pas de fuite de contenu.
- La liste est **paginée ou virtualisée** (le Catalog est destiné à grossir au-delà de la Songlist perso) — pas de rendu de la totalité en un bloc.

#### FR-2 : Rechercher et filtrer
Un utilisateur peut rechercher par texte (titre/artiste) et filtrer par métadonnées **intrinsèques à la chanson** : **clé (key), mode, signature rythmique, genre**. Réalise UJ-1, UJ-2. Les attributs liés à **l'instrument** (`instrument`, difficulté, accordage) sont **personnels** — ils se règlent une fois la chanson dans la Songlist et ne sont **ni stockés ni filtrés** au Catalog (une fiche canonique par chanson, cf. §9 / addendum ; décision UX DL-17).
**Consequences (testable) :**
- La recherche texte est insensible à la casse et aux accents (miroir du folding existant).
- Les filtres se combinent (ET) ; un état « aucun résultat » explicite est affiché.

#### FR-3 : Consulter le détail d'une fiche
Un utilisateur peut ouvrir une fiche Catalog et voir **tous** ses champs (métadonnées + liens officiels).
**Consequences (testable) :**
- Les liens YouTube/Spotify sont cliquables (ouverture externe).
- La fiche expose un unique appel à l'action **Add to my songlist** (FR-4) — ou l'état « Already in your songlist » (FR-6).

**Notes :** `[NON-GOAL for MVP]` browse public non connecté — reporté (cf. §5, §6.2). `[NOTE FOR PM]` : les axes de tri/filtre par défaut (par artiste ? par ajout récent au Catalog ?) sont à préciser en UX.

### 4.2 Add to my songlist — copier une fiche (snapshot + provenance)

**Description :** Le geste central. **Add to my songlist** copie les champs de la fiche Catalog en une nouvelle Song perso, **entièrement éditable et indépendante** de la source, tout en conservant une **Provenance** invisible. Aucune édition perso ne remonte jamais au Catalog (garde-fou unidirectionnel). Réalise UJ-1.

**Functional Requirements :**

#### FR-4 : Copier en snapshot avec provenance
Un utilisateur peut ajouter une fiche Catalog à sa Songlist ; le système crée une Song perso en copiant les champs de la fiche et enregistre la Provenance (`sourceCatalogUid`). Réalise UJ-1.
**Consequences (testable) :**
- Après l'ajout, la Song apparaît dans la Songlist avec les métadonnées de la fiche.
- La copie est un **quasi-1:1** : `CatalogSong` porte les **mêmes colonnes que `Song`** (mêmes noms/formes — cf. addendum), donc chaque champ canonique atterrit tel quel dans son homologue perso, sans couche de transformation.
- La Song porte `sourceCatalogUid` ; ce lien est **inerte** (aucune synchronisation, aucune dépendance de suppression). La « version » de provenance pour un futur diff de re-sync se lit sur `CatalogSong.updatedAt` (pas de colonne de version figée en v1).
- La copie **n'inclut pas** d'historique de pratique, de playlists ni de `lastPlayed` (champs perso, vierges à la création).

#### FR-5 : La copie est pleinement éditable et indépendante
La Song copiée est éditable comme toute chanson perso ; une modification ultérieure de la fiche Catalog **n'affecte pas** la copie (et inversement).
**Consequences (testable) :**
- Éditer un champ de la Song copiée n'écrit **rien** dans le Catalog.
- Supprimer la fiche Catalog source laisse la Song perso **intacte**.

#### FR-6 : Garde de doublon à l'ajout
Si l'utilisateur possède déjà, dans sa Songlist, une chanson de **clé canonique** identique, l'ajout est **bloqué** : le système ne recopie pas et **pointe la chanson existante**. Réutilise la garde d'unicité per-user (Epic 17 / 409).
**Consequences (testable) :**
- L'ajout d'une fiche dont (titre + artiste) correspond à une Song existante n'ajoute **aucune** ligne.
- L'UI affiche « Already in your songlist » et permet d'accéder à la chanson existante (pas d'erreur rouge générique).

#### FR-7 : Garde-fou unidirectionnel
Aucune action utilisateur ne peut modifier une fiche Catalog ; le sens de copie est strictement Catalog → Songlist.
**Consequences (testable) :**
- Il n'existe aucun chemin (UI ou API) permettant à un utilisateur non-curateur d'écrire dans le Catalog.

### 4.3 Catalog Collections — importer par lots

**Description :** Des **Collections** curées (« Rock 90 », « Pop 2000 »…) regroupent des fiches Catalog par thème. Un utilisateur les parcourt et en importe une **d'un geste** : les chansons peuplent sa Songlist **et** sont regroupées dans une **Playlist perso miroir** du même nom, pour que le répertoire thématique reste cohérent côté perso. C'est le miroir *partagé* des Playlists perso existantes. Réalise UJ-2.

**Functional Requirements :**

#### FR-8 : Parcourir les Collections
Un utilisateur connecté peut parcourir les Collections et voir les fiches qu'elles contiennent.
**Consequences (testable) :**
- Une Collection affiche son nom, sa description éventuelle et le nombre de chansons.

#### FR-9 : Importer une Collection dans sa Songlist
Un utilisateur peut ajouter toutes les fiches d'une Collection à sa Songlist en une action ; chaque fiche passe la garde de doublon (FR-6) et l'import crée (ou réutilise) une **Playlist perso miroir** du même nom que la Collection. Réalise UJ-2.
**Consequences (testable) :**
- Les fiches déjà présentes dans la Songlist sont **ignorées** à l'insertion (pas de doublon) ; l'import réussit pour les autres.
- Une **Playlist perso** portant le nom de la Collection est créée si elle n'existe pas, **sinon réutilisée** (unicité `lower(name)`, Epic 10) ; **toutes** les chansons du lot (y compris celles déjà présentes dans la Songlist) y sont rattachées, pour que le regroupement thématique soit complet.
- L'import est **best-effort** : un échec sur une fiche n'annule pas le lot.
- Un récapitulatif indique le nombre ajouté, déjà présent, et éventuellement échoué (ex. « 18 added, 2 already in your songlist »).

### 4.4 Curation du Catalog — rôle et administration

**Description :** Le Catalog est **curé** via un rôle **Curator** et un écran d'administration protégé, plutôt que par des scripts en base. Le curateur crée/édite/supprime des fiches et compose les Collections ; l'auto-fill existant l'assiste. Réalise UJ-3. En v1 un seul curateur (northwood) ; le rôle est un **attribut booléen `isCurator`** sur l'utilisateur (cf. addendum).

**Functional Requirements :**

#### FR-10 : Rôle Curator
Le système distingue un rôle **Curator** (attribut booléen `isCurator` sur User) disposant des droits d'écriture sur le Catalog ; les utilisateurs standard ne l'ont pas.
**Consequences (testable) :**
- Toute route d'écriture Catalog sans le rôle Curator est refusée par un **403** explicite. Le Catalog étant lisible par tout utilisateur connecté (FR-1/FR-3), l'espace admin n'est **pas** un secret d'énumération de ressource : le pattern 404 anti-oracle (7.5) ne s'y applique pas — c'est une exception assumée, documentée dans l'addendum.

#### FR-11 : Gérer les fiches Catalog
Un curateur peut créer, éditer et supprimer des fiches Catalog via un écran d'administration. La correction d'une fiche se fait **en place** (édition de la ligne existante), jamais par suppression-recréation.
**Consequences (testable) :**
- La création demande au minimum un **titre** ; les autres champs sont optionnels.
- L'auto-fill (SongBPM) peut pré-remplir BPM/durée sans écraser une saisie existante (miroir du comportement Songlist actuel).
- Éditer une fiche **préserve son `uid`** : les Provenances (`sourceCatalogUid`) déjà distribuées restent valides. Corriger un titre/artiste = un `UPDATE` sur la même ligne, pas un delete+recreate.

#### FR-12 : Composer des Collections
Un curateur peut créer une Collection, la nommer, et y ajouter/retirer des fiches Catalog.
**Consequences (testable) :**
- Une fiche peut appartenir à plusieurs Collections.
- Supprimer une fiche du Catalog la retire des Collections qui la référencent (pas de référence morte).

#### FR-13 : Unicité canonique au Catalog
Le Catalog rejette la création d'une fiche dont la **clé canonique** (titre + artiste) existe déjà. Une seule entrée canonique par (titre + artiste) : les variantes (studio vs live, standard vs drop-D) **ne sont pas** des entrées distinctes en v1 — choix assumé (cf. §5). Réalise UJ-3 (edge case).
**Consequences (testable) :**
- Une seconde fiche de même (titre + artiste normalisés) est refusée (index unique **global** + 409 typé, même mécanique que la garde d'unicité per-user d'**Epic 17**, mais sans la dimension `userUid`).

### 4.5 Mise à jour depuis la source *(évolution future — modèle-aware, non construite en v1)*

**Description :** La Provenance (FR-4) est stockée précisément pour permettre, **plus tard**, de proposer à l'utilisateur « la fiche Catalog a été corrigée depuis ta copie — veux-tu revoir/appliquer ? » — une mise à jour **proposée, jamais silencieuse**. **Aucune UX de mise à jour n'est construite en v1** ; seul le lien de provenance (`sourceCatalogUid`) est persisté pour ne pas se fermer la porte ; la « version » pour un futur diff se relira sur `CatalogSong.updatedAt`. Voir §6.2 et §8.

### 4.6 Contribution communautaire *(évolution future — modèle-aware, non construite en v1)*

**Description :** À terme, les utilisateurs pourront **proposer** des fiches au Catalog. Le modèle v1 (rôle Curator, ownership d'une fiche, statut de publication) est pensé pour **ne pas fermer la porte** à la contribution + modération, mais **rien de tout cela n'est construit en v1** (pas de soumission, pas de file de modération, pas de notes/évaluations). Voir §5 et §8.

### 4.7 Popularité / analytics du Catalog *(évolution future — modèle-aware, non construite en v1)*

**Description :** À terme, le Catalog exposera une **popularité par fiche** agrégée sur tous les utilisateurs — combien de fois une fiche a été **ajoutée** (`Add to my songlist`) et **jouée** (sessions loggées) — pour **(a)** aider le **curateur** à décider quoi cataloguer/prioriser, **(b)** monter des **Collections « Top N »** (ex. « Top 10 Red Hot Chili Peppers »), et **(c)** éventuellement **trier le browse par popularité**. **Rien n'est construit en v1**, mais le modèle le rend déjà **calculable sans migration** : la **Provenance** (`sourceCatalogUid`, FR-4) permet de compter les **adds** (Songs pointant une fiche) et de suivre les **plays** (SongPlays des Songs issues d'une fiche — la provenance survit à l'édition). C'est une **agrégation en lecture**, ajoutable plus tard.

**Garde-fous pour l'increment futur (à cadrer le jour venu) :**
- **Nouveau flux perso → partagé** : la popularité fait remonter des actions perso (adds/plays) en **agrégat partagé** — première fois que la donnée perso alimente le pool commun. À traiter en sécu/vie privée (jusqu'ici la copie est strictement one-way Catalog → Songlist).
- **Seuil anti-dé-anonymisation** : à petit nombre d'utilisateurs, un compteur agrégé est quasi nominatif ; l'exposition **user-facing** exigera un **seuil minimal d'affichage** (masquer sous N). L'usage **curateur-only** (analytics admin) est le point d'entrée le moins sensible.
- **Signal fiable = échelle** : comme les métriques de succès (§7), la popularité n'a de valeur qu'avec une base d'utilisateurs réelle (bruit à N≈4).
- Les Collections « Top N » restent **curées à la main** (FR-12) : la popularité *informe* le curateur, elle ne génère pas la Collection automatiquement (increment encore ultérieur).

Voir §6.2 et §8.2.

## 5. Non-Goals (explicites)

- **Paroles, tablatures, accords, partitions** — hors périmètre. Les paroles sont juridiquement les plus risquées (contenu protégé, licences payantes) ; les tabs/accords cumulent copyright et absence de consensus (versions multiples). Le Catalog reste **métadonnées + liens**.
- **Browse public non connecté** — non en v1 (nouvelle surface SEO/rate-limit/cache à cadrer).
- **Contribution communautaire / modération** — non en v1 (§4.6).
- **Mise à jour vive / synchronisation Catalog → copies** — non en v1 ; la copie est un snapshot, la provenance est inerte (§4.5).
- **Variantes/versions multiples par chanson** — non en v1 ; une entrée canonique par chanson (§4.4, FR-13).
- **Popularité / analytics agrégés** — non en v1 ; décrit comme increment modèle-aware (§4.7), la Provenance le rend déjà calculable.
- **Monétisation** — le produit reste gratuit ; aucune notion payante liée au Catalog.
- **Write-back** — aucune remontée d'édition perso vers le Catalog (FR-7).

## 6. Périmètre MVP

### 6.1 Inclus

- Nouvelle entité **Catalog entry** partagée (métadonnées + liens officiels), identité canonique unique.
- **Browse / search / filter** du Catalog + détail d'une fiche (connectés).
- **Add to my songlist** : copie snapshot + provenance, copie éditable/indépendante, garde de doublon.
- **Catalog Collections** : parcours + import en lot (garde de doublon) **+ création/réutilisation d'une Playlist perso miroir** du nom de la Collection.
- **Curation** : rôle Curator + écran d'admin (fiches + Collections), assisté par l'auto-fill existant.
- Réutilisation du design system (responsive, dark mode) et du pattern d'autorisation existant, étendu au rôle Curator.

### 6.2 Hors périmètre MVP

- Browse public non connecté — *v2* (débloque pleinement la landing page). `[NOTE FOR PM]` émotionnellement porteur : c'est l'argument d'acquisition ; à revisiter dès que le socle Catalog est stable.
- Mise à jour depuis la source (proposition de re-sync) — *v2* ; provenance déjà stockée.
- Contribution communautaire + modération + évaluations — *v2/v3*.
- Variantes/versions par chanson — *v2* si le besoin émerge.
- Popularité / analytics du Catalog (compteurs adds/plays agrégés, tri par popularité, Collections « Top N ») — *v2* ; provenance déjà calculable, crochet posé (§4.7). Curateur-only d'abord, user-facing avec seuil anti-dé-anonymisation ensuite.
- Paroles via fournisseur licencié / champ perso — *non planifié*.

## 7. Métriques de succès

**Primaires**
- **SM-1** : **Part des chansons ajoutées via le Catalog** — proportion de nouvelles Songs créées par `Add to my songlist` (unitaire + imports de Collection) vs saisie manuelle. **Métrique directionnelle** : on suit la **tendance à la hausse** dans le temps, **sans seuil chiffré** (à N≈4 users un pourcentage précis n'a pas de signal fiable ; un seul user fait bouger le %). La contre-métrique SM-C1 garde contre le remplissage vide. Valide FR-4, FR-9.
- **SM-2** : **Time-to-first-song** d'un nouvel utilisateur — délai entre inscription et 1ʳᵉ chanson dans la Songlist ; on cherche une **baisse nette** vs la saisie manuelle. Valide FR-1, FR-4.

**Secondaires**
- **SM-3** : **Taux d'import de Collection** — % d'utilisateurs ayant importé ≥ 1 Collection. Valide FR-9.
- **SM-4** : **Couverture du Catalog** — nombre de fiches et de Collections curées (santé de l'offre). Cible de seed au lancement (définition de « seedé ») : **~50–100 fiches + 3–5 Collections**. Valide FR-11, FR-12.

**Counter-métriques (à ne pas optimiser)**
- **SM-C1** : **Songs copiées jamais jouées** — une hausse des ajouts qui ne se traduit pas en pratique (sessions loggées) signale du remplissage vide, pas de la valeur. Contrebalance SM-1. Ne pas pousser l'ajout au détriment de l'usage réel.
- **SM-C2** : **Doublons/ré-saisies évités** — la garde de doublon (FR-6) doit rester un confort, pas un frein ; surveiller les blocages perçus comme des erreurs. Contrebalance SM-1.

## 8. Questions ouvertes

1. ~~**Version de provenance**~~ — **Tranché (2026-07-12)** : pas de colonne de version figée en v1 ; le futur diff de re-sync relira `CatalogSong.updatedAt`. (§4.5, FR-4)
2. ~~**Tri/filtre par défaut**~~ — **Tranché en UX (2026-07-12, DL-15)** : tri par défaut du browse = **artiste → titre** ; la fraîcheur est servie par le rail « Recently added ». Filtres = **clé, mode, signature rythmique, genre** (DL-17). Tri **par popularité** = increment futur (§4.7). (§4.1)
3. ~~**Autorisation du rôle Curator**~~ — **Tranché (2026-07-12)** : attribut booléen `isCurator` sur User (pas de table de rôles) ; refus **403** (le Catalog est lisible, aucun secret d'énumération à protéger sur l'écriture). (FR-10, NFR-3, addendum)
4. ~~**Source du seed initial**~~ — **Tranché (2026-07-12)** : cible **~50–100 fiches + 3–5 Collections** au lancement (SM-4) ; saisie manuelle + auto-fill, l'import CSV reste un outillage optionnel non bloquant. (§4.4, §7)
5. ~~**Champs canoniques vs perso-only**~~ — **Tranché (2026-07-12 ; corrigé DL-17)** : `CatalogSong` ne calque que le **sous-ensemble intrinsèque** des colonnes de `Song` (la fiche = une entrée canonique par chanson titre+artiste). **Exclus** (perso-only, jamais au Catalog) : `lastPlayed`, historique, playlists, `notes`, `myInstrumentUid`, **et tous les attributs liés à l'instrument** : `instrument`, `instrumentDifficulty`, `instrumentTuning`, `capo`, `technique`, `instrumentLinks` — ils n'ont de sens qu'au niveau perso, réglés après l'`Add`. (FR-4, addendum)
6. ~~**Collection → Playlist perso**~~ — **Tranché (2026-07-12)** : oui, dès la v1 l'import crée/réutilise une Playlist perso miroir. (FR-9, §6.1)

## 9. Assumptions Index

- **§4.1** — Le Catalog est une entrée de navigation de premier niveau, à côté de Songlist.
- **§4.3 / FR-9** — L'import d'une Collection ajoute les chansons à la Songlist **et** crée/réutilise une Playlist perso miroir du même nom.
- **§4.4** — v1 = un seul curateur (northwood) ; le rôle Curator est l'attribut booléen `isCurator` sur User.
- **§0 / addendum** — Le Catalog est une **nouvelle table `CatalogSong`** partagée (sans `userUid`), **aux colonnes calquées sur `Song`** (parité noms/formes) ; `Add` crée une `Song` perso depuis une `CatalogSong` + `sourceCatalogUid`.
- **§6.1** — Surface = même SPA web React, responsive, dark mode ; réutilisation de l'auto-fill SongBPM pour la curation.

---

## 10. Exigences non fonctionnelles transverses

- **NFR-1 (Multi-utilisateur / partagé)** — Le Catalog est un pool **global unique** lu en concurrence par tous les utilisateurs connectés. C'est la première donnée **non scopée par utilisateur** de l'app (rupture vs le pattern « tout est scopé `userUid` ») ; la lecture est ouverte aux connectés, l'écriture réservée au Curator.
- **NFR-2 (Performance / scalabilité)** — Le Catalog est conçu pour croître bien au-delà d'une Songlist perso : browse/search paginés ou virtualisés, index sur la clé canonique et sur les axes de filtre, pas de chargement intégral côté client.
- **NFR-3 (Sécurité / autorisation)** — Nouveau vecteur d'autorisation (**rôle Curator**, booléen `isCurator`) au-delà de l'ownership per-record existant. Les routes d'écriture Catalog exigent le rôle, sinon **403 explicite** : le Catalog étant lisible par tout connecté, l'admin n'est pas un secret d'énumération, donc le pattern 404 anti-oracle (7.5) ne s'y applique pas (exception assumée, à documenter aussi dans `project-context.md`). Lecture Catalog derrière l'auth (NFR hérité de l'app).
- **NFR-4 (Intégrité / découplage)** — La suppression ou l'édition d'une fiche Catalog **ne casse jamais** une Song perso copiée (provenance inerte). Aucune contrainte FK vive entre `Song.sourceCatalogUid` et `CatalogSong` (référence souple, résiliente à la suppression). La correction d'une fiche se fait **en place** (uid stable, FR-11) : une provenance ne « pend » que si le curateur supprime volontairement la fiche source, jamais sur une simple correction.
- **NFR-5 (Cohérence UI)** — Réutilise le design system (Tailwind, thème `brand/primary/accent/secondary`, dark mode), les comboboxes/filtres et les patterns de confirmation/toast existants ; responsive (breakpoints existants).
- **NFR-6 (i18n de contenu)** — Chaînes UI en anglais (site en anglais). Les données de fiches (titres/artistes) sont saisies telles quelles par le curateur.

## 11. Architecture de l'information

- **Nouvelle surface de premier niveau « Catalog »** dans la navigation, distincte de « Songlist ». Sous-vues : **Browse** (fiches) et **Collections**.
- **Détail de fiche** : lecture seule + `Add to my songlist`.
- **Espace d'administration Curator** (protégé par le rôle) : gestion des fiches et composition des Collections — séparé des écrans utilisateurs.
- Point d'entrée du geste : depuis la fiche Catalog (`Add to my songlist`) et depuis une Collection (`Add collection to my songlist`).

## 12. Garde-fous et contraintes

- **Licence / contenu** — Périmètre strictement **métadonnées factuelles + liens officiels**. Interdiction v1 de stocker paroles, tablatures, accords, notation (risque juridique). Attribution à cadrer **le jour** où la contribution communautaire ouvre.
- **Unidirectionnalité** — Copie **one-way** Catalog → Songlist ; aucun write-back utilisateur (FR-7).
- **Découplage snapshot** — La copie ne crée aucune dépendance vive ; la provenance est un pointeur inerte (NFR-4).
- **Autorisation curateur** — Écriture Catalog gated par le rôle Curator (NFR-3) ; principe du moindre privilège pour les utilisateurs standard.

## 13. Plateforme

Application web (SPA React 19 + Express/Sequelize/PostgreSQL existants), responsive, dark mode. Pas d'application native. Déploiement inchangé (push `main` → prod ; **toute migration part en prod**, donc idempotente et testée en local — cf. project-context).
