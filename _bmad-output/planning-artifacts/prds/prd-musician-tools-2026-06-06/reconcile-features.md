# Réconciliation — FEATURES.md (existant) vs PRD « Journal de sessions, heatmap et sujets de travail »

> Source de référence de l'existant : `docs/FEATURES.md` (généré 2026-01-13).
> Documents comparés : `prd.md` + `addendum.md` (2026-06-06).
> Vérifications croisées avec le code : `backend/models/songplay.js`, `backend/models/song.js`, `backend/controllers/songcontroller.js` (markSongPlayed, getSongPlays).

---

## 1. Points d'intégration couverts

Le PRD reflète correctement plusieurs piliers de l'existant :

| Existant (FEATURES.md) | Couverture PRD | Remarque |
|---|---|---|
| « Mark as Played Now » par instrument (§1.2, §6.3) | FR18/FR19 (pont bidirectionnel), UJ-3 | Le pont est le cœur de l'intégration ; couvert au niveau intention |
| Vérification de propriété sur tout CRUD (§3.1) | FR2 (« propriété vérifiée, comme pour les chansons »), NFR4 (« middleware d'ownership existant, appliqué aux nouvelles routes ») | Bien aligné |
| Dialogue de confirmation avant suppression (§5.3) | FR9 (« dialogue de confirmation (pattern existant) ») | Réutilise explicitement `ConfirmDialog` |
| Dark mode complet (§5.1) | NFR3 (« Dark mode supporté partout (standard existant) ») | Bien aligné |
| Accessibilité : labels, ARIA, clavier (§5.5) | NFR6 | Bien aligné, étendu à la heatmap |
| Responsive mobile/desktop (§1.5) | NFR3 | Bien aligné |
| Migrations Sequelize idempotentes (§4.3 + fix e5400c5) | NFR5 | Bien aligné |
| Modèle `Song` et `lastPlayed` | §7 Dépendances du PRD ; addendum « point d'ancrage naturel du pont FR18/FR19 » | Cité, mais voir écarts 2.1–2.3 |
| LocalStorage pour préférences UI (§2.3, §8.3) | Addendum uniquement (« pattern réutilisable pour les préférences de la heatmap ») | Couvert hors contrat seulement — voir écart 2.6 |

---

## 2. Écarts trouvés

### 2.1 — `SongPlay` : un historique de lectures existe déjà, le PRD du corps l'ignore (écart majeur)

FEATURES.md §6.3 documente un **historique des lectures** : enregistrements `SongPlay` (`songUid`, `instrumentUid`, `instrumentType`, `playedAt` — confirmé dans `backend/models/songplay.js`). Le contrôleur `markSongPlayed` crée un `SongPlay` à chaque clic et met à jour `Song.lastPlayed` « en fallback ».

Le corps du PRD (le contrat) ne mentionne **jamais** `SongPlay` — seul l'addendum (« ne fait pas partie du contrat PRD ») le cite. Conséquences non traitées :

1. **Double source de vérité** : après cette itération, un clic « Mark as Played Now » devra-t-il créer à la fois un `SongPlay` (comportement actuel) ET une entrée de session (FR18) ? Coexistence, remplacement, ou `SessionItem` devient-il le successeur de `SongPlay` ? Non spécifié. Le risque « double comptage » du §7 du PRD ne couvre que manuel-vs-pont, pas `SongPlay`-vs-`SessionItem`.
2. **Opportunité de rétro-import ignorée** : l'historique `SongPlay` existant pourrait pré-remplir la heatmap (jours déjà « allumés » pour les utilisateurs actuels). Le PRD se demande (§8 Q2) si une grille vide décourage un nouvel utilisateur, mais ne dit rien des utilisateurs existants qui ont déjà des mois d'historique exploitable. Aucune FR de migration de données.
3. **L'endpoint `getSongPlays`** (historique par chanson) existe ; sa cohérence avec le futur journal (FR12) n'est pas arbitrée.

### 2.2 — Granularité de `lastPlayed` : FR19 suppose un « dernier joué par instrument » qui n'existe pas comme champ

FEATURES.md §1.2 présente « Dernier moment joué » comme une propriété **par instrument** ; mais le modèle `Song` (§4.4 et `song.js`) n'a qu'**un seul champ `lastPlayed` global**. Le per-instrument est en réalité **dérivé des enregistrements `SongPlay`** (via `instrumentType`/`instrumentUid`).

FR19 (« met à jour son “dernier joué” pour l'instrument de la session ») n'est donc implémentable **que via la création d'un `SongPlay`** (ou un mécanisme équivalent) — ce que le PRD ne spécifie pas, faute d'avoir nommé `SongPlay` (cf. 2.1). De plus, le code actuel identifie l'instrument par le couple `instrumentUid` (FK vers instrument personnel) + `instrumentType` (string) ; le PRD parle d'« instrument » sans préciser lequel des deux concepts l'entité Session référence.

### 2.3 — FR19 « si la date de session est plus récente » contredit le comportement actuel et omet la rétroactivité descendante

Le contrôleur actuel met à jour `Song.lastPlayed` **inconditionnellement** avec `new Date()`. FR19 introduit une mise à jour conditionnelle (date plus récente) — correct pour les sessions rétroactives, mais le PRD ne traite pas le cas symétrique : **supprimer ou rééditer une session** (FR8/FR9) qui était la source du `lastPlayed` le plus récent. Faut-il recalculer `lastPlayed` à la baisse ? Sans règle, le « dernier joué » affiché dans le répertoire peut devenir faux — ce qui casse le filtre « dernier joué » que Marc utilise dans UJ-3.

### 2.4 — Fuseau horaire : FR17 (fuseau local de l'appareil) vs `playedAt` serveur

FR17 fixe le « jour » d'une session au fuseau local de l'appareil. Mais le pont FR18 passe par `markSongPlayed`, qui horodate côté serveur (`new Date()` — heure serveur/UTC). Autour de minuit, le `SongPlay` et la « session du jour » peuvent tomber sur des jours différents → case de heatmap incohérente avec le `lastPlayed` affiché. Le PRD ne spécifie pas comment le pont transmet le jour local.

### 2.5 — Session mono-instrument vs système multi-instruments par chanson

L'existant est profondément multi-instruments : une chanson porte plusieurs instruments, chacun avec difficulté/accordage/liens/dernier joué (§1.2). FR5 donne à la Session **un seul instrument**. FR18 dit que « Mark as Played Now » « crée la session du jour (si absente) ou la complète » — mais si Marc marque une chanson à la guitare puis une autre au piano le même jour, la « session du jour » a déjà un instrument. Fusionner dans la même session (instrument faux pour une entrée) ou créer une seconde session du jour ? La règle de fusion promise au §7 (« règles de fusion explicites ») n'est explicite nulle part dans les FR.

### 2.6 — Persistance localStorage non contractualisée

L'existant fait de la persistance localStorage un standard UX (filtres, accordéons, préférences — §2.3, §8.3). Le PRD vise une saisie < 30 s avec « instrument par défaut pré-rempli » (FR5/FR10, UJ-1) mais ne dit pas d'où vient cet instrument par défaut (préférence utilisateur persistée ? dernière session ? localStorage comme les filtres ?). Idem pour les préférences de la heatmap (année affichée). L'addendum identifie le pattern mais aucune FR/NFR ne le reprend dans le contrat. Notons qu'il n'existe pas aujourd'hui de notion d'« instrument par défaut de l'utilisateur » dans le modèle documenté.

### 2.7 — Vocabulaire : « Sujets de travail » vs « Techniques » existantes

L'existant possède déjà des **Techniques** (multi-sélection par chanson, filtrées par instrument, avec autocomplétion — §1.1, §1.2, §6.2). Le nouveau concept « Sujet de travail » (FR1 : nom + catégorie libre) recouvre sémantiquement le même territoire pour l'utilisateur : « Pentatonique » est à la fois une technique existante et l'exemple canonique de sujet du PRD (UJ-1). Le PRD exclut le lien chanson ↔ sujets (backlog), mais ne dit rien de la relation sujets ↔ techniques : risque de double vocabulaire et de double saisie (l'utilisateur tague « fingerstyle » comme technique sur la chanson ET le recrée comme sujet). À minima, une note de cadrage terminologique manque.

### 2.8 — NFRs : standards backend existants partiellement repris

- **Erreurs HTTP standardisées** (§9.1 : 400/401/403/404/500) et **double validation client + serveur** (§9.3) : aucun NFR n'impose ces standards aux nouvelles routes sessions/sujets. NFR4 couvre l'ownership mais pas la grammaire d'erreurs ni la validation.
- **Logging avec masquage des secrets** (§9.2) : non repris — mineur, probablement hérité d'office.
- **Auth par sessions Express** (§3.1) : implicite via NFR4 ; acceptable.

---

## 3. Risques de collision avec l'existant

| # | Collision | Gravité | Détail |
|---|---|---|---|
| C1 | **`SongPlay` vs `SessionItem`** | Haute | Deux systèmes d'historique de lecture coexistent sans arbitrage. Risque de double écriture, de stats divergentes (heatmap vs historique par chanson), et de migration de données impensée (cf. 2.1). |
| C2 | **Recalcul de `lastPlayed` à l'édition/suppression de session** | Haute | FR8/FR9 + FR19 sans règle de recalcul descendant → le tri/filtre « dernier joué » du répertoire (usage central de Marc, UJ-3) peut afficher des données fausses (cf. 2.3). CM2 (« ne pas dégrader l'usage existant ») est directement menacée. |
| C3 | **Session mono-instrument vs journée multi-instruments** | Moyenne | La « session du jour » de FR18 entre en collision avec le multi-instruments existant dès que deux instruments sont joués le même jour (cf. 2.5). |
| C4 | **Jour local (FR17) vs horodatage serveur de `markSongPlayed`** | Moyenne | Décalage de jour possible entre heatmap et `lastPlayed` autour de minuit ou en déplacement (cf. 2.4). |
| C5 | **Sujets vs Techniques** | Moyenne | Doublon conceptuel pour l'utilisateur ; pollue la promesse « saisie < 30 s » si l'utilisateur hésite entre deux taxonomies (cf. 2.7). |
| C6 | **Identifiant d'instrument** | Faible/Moyenne | L'existant manipule `instrumentType` (string du tableau JSON de Song) ET `instrumentUid` (instrument personnel, `myInstrumentUid`). L'entité Session doit choisir — le PRD et l'addendum disent juste « instrument » (cf. 2.2). |
| C7 | **FR4 (suppression de sujet sans trouer l'historique)** | Faible | Pattern nouveau dans l'app : la suppression de chanson existante est définitive (§1.4). FR4 implique soft-delete ou dénormalisation du nom — incohérence assumée mais non signalée avec le pattern de suppression existant ; à expliciter pour l'architecture. Question annexe non traitée : que devient une entrée de session référençant une **chanson** supprimée (FR4 ne couvre que les sujets) ? |

---

## 4. Synthèse

Le PRD réutilise correctement les patterns transverses de l'existant (ownership, confirmation, dark mode, accessibilité, migrations, responsive). L'écart structurant est l'**absence de `SongPlay` dans le contrat** : tout le pont FR18/FR19 repose sur un mécanisme existant (historique de lectures + `lastPlayed` global dérivé) que le PRD ne nomme ni n'arbitre, d'où les collisions C1–C4. Second angle mort : la **fusion mono-instrument** de la « session du jour » face au multi-instruments existant. Troisième : le **chevauchement Sujets/Techniques**, jamais cadré. Ces points relèvent du contrat produit (règles de cohérence des données visibles par l'utilisateur), pas seulement de l'architecture aval.
