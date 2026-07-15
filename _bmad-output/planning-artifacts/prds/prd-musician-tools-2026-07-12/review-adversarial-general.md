# Revue adversariale — PRD Catalog (musician-tools)

_Revue « reviewer cynique ». Ton volontairement dur. Objectif : trouver le raisonnement le plus faible, les hypothèses non validées, les pièges de scope et les endroits où le PRD sonne confiant sans l'avoir mérité. Portée : `prd.md`, `addendum.md`, `.decision-log.md`, `project-context.md`. Classement par sévérité selon l'impact sur l'utilité du PRD en aval (UX, archi, epics/stories)._

---

## Verdict global

Le PRD est bien écrit, honnête sur ses ruptures et discipliné sur le vocabulaire. Mais il **maquille en « décisions tranchées » plusieurs choix qui sont en réalité des questions ouvertes bloquantes**, et il **empile deux paris fondateurs (identité canonique globale + provenance) qui s'auto-sabotent mutuellement** dès la 2ᵉ chanson curée. Trois faiblesses tueraient la valeur en aval si on les laisse filer : (1) le mapping des champs Catalog→Song n'est pas figé alors que c'est le pré-requis pour construire le geste central ; (2) l'index unique canonique **global** est hostile aux variantes et sans workflow de correction, il verrouille des données fausses à vie ; (3) la provenance — seule justification de la complexité ajoutée — casse silencieusement dès qu'un curateur corrige un titre (delete+recreate → nouvel uid → tous les pointeurs pendent). Le reste est du colmatage : métriques dimensionnées pour une échelle que le produit n'a pas (3-4 users), un pattern anti-oracle cargo-culté là où son threat model ne tient pas, et une promesse UX de Collections qui s'évapore à l'import.

**Ce PRD n'est pas prêt pour `bmad-create-epics-and-stories`** tant que les points CRITICAL ne sont pas tranchés — plusieurs FR ont des « Consequences (testable) » **non testables** parce qu'elles référencent des champs/codes de retour encore indécis.

---

## CRITICAL

### C1 — Le mapping de champs Catalog→Song n'est pas figé, et c'est une **question ouverte** (§8.5) alors que c'est le pré-requis dur du geste central (FR-4)

FR-4 affirme « le système crée une Song perso **à partir des champs de la fiche** ». L'addendum liste les champs de `CatalogSong` (`instrumentTypes`, `difficulty`, `tunings`, `language`, `genre`, `durationSeconds`…). **Nulle part le PRD ne vérifie que la table `Song` perso possède les colonnes correspondantes.** Or `project-context.md` décrit une `Song` centrée pratique/heatmap/`lastPlayed`/`SongPlays` — rien ne garantit qu'elle porte `language`, `genre` ou `difficulty`.

Conséquences que le PRD ignore :
- Si `Song` n'a pas `genre`/`language`, le snapshot **perd des données silencieusement**, OU il faut une **migration de la table `Song` perso** (non mentionnée, non estimée) — ce qui touche l'entité existante la plus critique de l'app.
- La sémantique de `difficulty` diverge : Catalog = « difficulté suggérée » (objective), perso = candidat à une « difficulté pour moi » (subjective, §8.5). Copier l'une dans l'autre **conflate deux notions** que le CLAUDE.md du projet exigerait justement de garder séparées.

C'est marqué « Question ouverte §8.5 » et « Fast path, à confirmer ». Traduction : **la feature centrale du PRD n'est pas spécifiable tant que ce tableau de correspondance champ-par-champ n'existe pas.** Un epic ne peut pas être découpé sur « copie les champs » quand la liste des champs et leur destination sont indécises. À figer **maintenant**, pas « en architecture ».

### C2 — L'identité canonique **globale** est hostile aux variantes et sans workflow de correction : le premier curateur qui se trompe verrouille la donnée à vie

Le decision-log **le savait** (« titre+artiste collisionne (covers, live) ») puis a tranché « une entrée canonique, pas de variantes en v1 » + index unique **global**. Le PRD répète que c'est un « miroir direct » de l'index Epic 17. **C'est un abus de langage dangereux :**

- L'index Epic 17 est **per-user** : seules *tes* chansons collisionnent, et si tu te trompes tu corriges *ta* ligne. L'index Catalog est **global** : la première fiche « Wonderwall — Oasis » **verrouille la clé canonique pour tout le monde**. Si son BPM/accordage/clé est faux, il n'existe **aucun workflow de correction/merge décrit** — juste FR-11 « éditer » (voir C3 pour pourquoi éditer ne suffit pas) et FR-13 qui **refuse** toute seconde fiche.
- Concrètement, le curateur ne peut pas seeder deux entrées légitimes de même (titre+artiste) : version studio vs live, standard vs drop-D, original vs acoustique — mêmes titre+artiste, métadonnées différentes. Le modèle n'est pas « variant-ready », il est **variant-hostile** : passer aux variantes en v2 exigera de **changer la clé unique** (migration sur donnée partagée en prod, avec l'invariant d'idempotence du projet). Le PRD affirme (§4.4, §4.6) que le modèle « ne ferme pas la porte » — **il la ferme à moitié et prétend l'inverse.**

Le besoin de variante n'émerge pas « en v2 si le besoin émerge » (§6.2) : il émerge à la **chanson n°2 qui est une reprise**. Sous-estimer ce délai est la faiblesse de raisonnement la plus optimiste du document.

### C3 — La provenance (seule justification de la complexité) casse silencieusement dès qu'un curateur corrige un titre

Toute la mécanique snapshot **+provenance** (vs snapshot pur) est justifiée par un seul usage futur : proposer « la fiche source a changé, revoir ? » (§4.5). C'est le prétexte à `sourceCatalogUid` + `sourceCatalogVersion`. Or :

- `sourceCatalogUid` est une **référence souple sans FK** (NFR-4, voulu). Un pointeur pendant est « voulu » à la suppression. Soit.
- **Mais** : l'unicité canonique (C2) + FR-13 impliquent que **corriger une faute dans un titre** (« Zombie » saisi « Zombie ») ne peut pas toujours se faire par simple édition si ça entre en conflit, et surtout que **supprimer+recréer** une fiche (pratique courante de curation) génère un **nouvel `uid`**. Résultat : **toutes les copies déjà distribuées voient leur provenance pendre d'un coup**, silencieusement.

Donc le mécanisme qui existe *uniquement* pour permettre le futur re-sync est **fragile dès le jour 1** face à l'activité normale de curation. Le PRD n'exige nulle part une **édition in-place stable de l'uid** ni un garde-fou « ne jamais delete+recreate une fiche référencée ». Sans cette garantie, on paie la dette (colonne, version, doc de rupture) pour un bénéfice futur qui aura de fortes chances d'être vide. **Soit on garantit la stabilité de l'uid par contrat, soit on assume que la provenance est décorative et on arrête de la vendre comme la raison d'être du snapshot+provenance.**

---

## HIGH

### H1 — Le pattern anti-oracle 403/404 est cargo-culté sur l'admin Catalog : son threat model **ne s'applique pas** à une donnée partagée

FR-10 et l'addendum §Autorisation laissent traîner « 404 **ou** 403 selon le pattern retenu, à trancher en architecture ». Le pattern durci 7.5 existe pour **une raison précise** : empêcher un user d'énumérer les ressources *d'autrui* (« pas à toi » indistinguable de « n'existe pas »). **Sur le Catalog, il n'y a pas de ressource d'autrui à cacher : la fiche est publiquement lisible par tout connecté (FR-1/FR-3).** Un user standard *sait déjà* que `/catalog/:uid` existe — il vient de la lire. Renvoyer 404 sur la **route d'écriture** de cette même ressource est du **théâtre** : ça ne protège aucun secret d'énumération, puisque l'existence est déjà publique.

Donc « rester aligné avec 7.5 en renvoyant 404 » est un **réflexe mal appliqué**. Le bon choix est un **403 franc** (l'espace admin n'est pas un secret de ressource utilisateur). Laisser ça « à trancher en archi » est une erreur : c'est une **décision de sécurité conceptuelle**, pas d'implémentation, et elle conditionne le middleware `requireCurator`, chaque route d'écriture, et les tests d'AC. Pire : tant que c'est indécis, **FR-10 a une « Consequence testable » (`sinon 404/403`) qu'on ne peut pas tester** (voir M4).

### H2 — SM-1 mesure la **couverture** du catalogue déguisée en **adoption**, et est trivialement gonflable par les imports de Collection

SM-1 (« >50 % des ajouts passent par le Catalog une fois seedé ») est le KPI primaire, et il est **mal raisonné sur deux axes** :

1. **Coverage ≠ adoption.** Au lancement le catalogue est maigre : la majorité des chansons qu'un user veut *n'y sont pas* → il saisit à la main → SM-1 est bas. Ça **pénalise un bon produit pour un petit catalogue**. SM-1 mesure en réalité si northwood a assez seedé, pas si les users aiment le geste. « Une fois seedé » porte tout le poids et n'est jamais quantifié (cf. H3).
2. **Gonflable.** Un import de Collection = 20 « adds Catalog » d'un coup. SM-1 franchit >50 % trivialement dès qu'un user importe une Collection, **sans aucune intention discrète**. C'est exactement le remplissage vide que SM-C1 dénonce — mais SM-1 garde une cible chiffrée naïve qui récompense ce comportement.

Un KPI primaire qui monte quand le catalogue grossit *et* quand les gens l'ignorent (imports en masse jamais joués) ne pilote rien.

### H3 — Le goulot « un seul curateur » + volume de seed **non décidé** (§8.4) rend SM-1/SM-4 inatteignables et non pilotables

Tout le catalogue dépend d'**une** personne (northwood) saisissant les fiches une par une dans une mini-UI (UJ-3 : créer → auto-fill → compléter → enregistrer, ×30…). Or :
- Le **volume de seed au lancement** est une **question ouverte** (§8.4 : « combien de fiches ? saisie / auto-fill / CSV ? »). Donc « une fois seedé » (SM-1) n'a **pas de définition**.
- SM-4 (« couverture ») est un KPI de santé sans **cible** ni **capacité de production** estimée. Combien de fiches/heure un curateur produit-il via la mini-UI, aller-retours auto-fill compris ? Le PRD ne le sait pas et l'UJ-3 glisse dessus (« le catalogue s'enrichit de façon tenable » — affirmation non étayée).
- Le CSV import, seul levier réaliste pour atteindre un volume crédible, est **repoussé en question ouverte** au lieu d'être tranché. Sans lui, le goulot humain plafonne l'offre, donc SM-1.

Poser des cibles produit (>50 %) au-dessus d'un pipeline de production non dimensionné, c'est bâtir la métrique sur du sable.

### H4 — La valeur promise des Collections (UJ-2 « monter un répertoire Rock 90 ») **s'évapore à l'import** : l'`[ASSUMPTION]` FR-9 + Q §8.6 la vident

FR-9 assume que l'import « ne crée pas de Playlist perso ; il ne fait qu'ajouter les chansons à la Songlist ». Conséquence non dite : après import de « Rock 90 » (20 titres), le user obtient **20 chansons en vrac** noyées dans sa Songlist, **sans aucun regroupement « Rock 90 »**. Le JTBD émotionnel (« je monte un répertoire thématique ») et le climax d'UJ-2 (« sa Songlist est pleine de matière ») **promettent une cohérence thématique que le résultat ne livre pas.** Le mapping Collection→Playlist perso, qui sauverait la promesse, est une **question ouverte reléguée en v2** (§6.2, §8.6). On vend « peupler par thème » et on livre « 20 lignes anonymes ». C'est un décalage UX qui contredit directement le parcours-clé n°2 — à trancher côté UX **avant** de figer FR-9, sinon la feature phare de la §4.3 est un anti-climax.

### H5 — La garde de doublon (FR-6/FR-9) **rate** sur les données saisies avant le Catalog, dans les deux sens

FR-6 réutilise `findDuplicateSong` per-user et prétend « miroir de la clé canonique ». Mais les chansons que le user a **déjà saisies à la main** n'ont **jamais** transité par la normalisation canonique du Catalog. Cas concrets :
- User a créé « Zombie / Cranberries » ; Catalog a « Zombie / The Cranberries ». Normalisation différente → **la garde ne matche pas** → doublon quasi-identique créé, en silence.
- Inversement, deux titres légitimement distincts que la normalisation agressive fusionne → **blocage perçu comme un bug** (exactement SM-C2).

Le récap « 18 added, 2 already » d'UJ-2/FR-9 peut donc être **faux dans les deux sens**, et l'utilisateur n'a aucun moyen de le savoir. Le PRD affirme un « miroir » alors que la qualité du dédup est plafonnée par l'hygiène de données pré-existante de chaque user. À spécifier : quelle normalisation exacte, et que fait-on des collisions partielles/near-miss.

---

## MEDIUM

### M1 — Import de Collection best-effort : la panne partielle **réelle** n'a pas d'état dans le récap

L'addendum recommande un import **best-effort** (un skip n'annule pas le lot). Mais le récap FR-9 ne connaît que deux seaux : `added` / `already`. **Que se passe-t-il si un `INSERT` échoue en cours de lot** (erreur DB, validation, contrainte) ? Best-effort → le user se retrouve avec 15/20, **sans seau « failed »**, sans rollback, sans re-tentative. Le format « 18 added, 2 already » ne peut pas exprimer « 3 échoués ». À spécifier : troisième issue (`failed`), idempotence de la re-tentative, et perf (20 dédup + 20 INSERT par clic — aucune mention de transaction ou de coût).

### M2 — La « version » de provenance est **indécise** (§8.1) mais listée comme conséquence **testable** de FR-4

FR-4 « Consequences (testable) » : « La Song porte `sourceCatalogUid` **+ version** ». L'addendum dit `sourceCatalogVersion` **« Optionnel »**, à trancher §8.1. On ne peut pas écrire un AC vert sur un champ dont l'existence n'est pas décidée. Soit la version est dans le MVP (et on la spécifie), soit elle n'y est pas (et on la retire des consequences testables de FR-4). En l'état : contradiction interne.

### M3 — NFR-2 promet la « scalabilité » sans aucune conception : pas de cache, « immédiatement visible à tous »

UJ-3 climax : fiches « immédiatement visibles par tous les utilisateurs connectés ». NFR-2 promet un Catalog « conçu pour croître bien au-delà d'une Songlist perso ». Mais l'addendum ne prévoit **que** pagination/virtualisation + index — **aucune couche de cache**, aucune stratégie d'invalidation. « Immédiatement visible » + « conçu pour grossir » + « chaque browse/search tape la DB avec filtres » = affirmation de scalabilité **non étayée**. Pour 3-4 users c'est un non-problème ; le problème est que le PRD **affiche une confiance de scalabilité qu'il n'a pas méritée**, ce qui masquera la dette au moment où le Catalog grossira vraiment (l'argument même de NFR-2).

### M4 — Plusieurs « Consequences (testable) » ne sont pas testables (codes/champs indécis)

Symptôme récurrent qui trahit un PRD pas prêt pour le découpage : FR-10 (`404/403 selon le pattern`, cf. H1), FR-4 (`+ version`, cf. M2). Un AC qui contient un « ou » non résolu ou un champ optionnel n'est pas un AC. Tant que ces indécisions vivent dans les FR, les stories aval hériteront de trous.

### M5 — Le CLAUDE.md du projet **interdit** la donnée `userUid`-scopée par `uid` seul ; la lecture Catalog non scopée va déclencher les gardes du hook/tests/review à chaque story

`project-context.md` grave dans le marbre : « Toute route à record DOIT scoper par `userUid` → 404 » et « ne jamais réintroduire de lecture scopée par `uid` seul » (faille `getSong` fermée en 7.5). La lecture Catalog **viole délibérément** cette règle (assumé, NFR-1/addendum). Le PRD dit « bien la documenter ». Insuffisant en pratique : chaque agent dev / reviewer / `bmad-code-review` **flaggera la lecture non scopée comme une régression 7.5** par réflexe, à chaque story touchant le Catalog. Il faut plus qu'une note : une **exception nommée et référencée dans project-context.md lui-même** (pas seulement dans l'addendum PRD), sinon on rejoue l'argument à chaque revue. Coût de friction récurrent sous-estimé.

### M6 — La curation d'un `Song.difficulty`/`instrumentTypes`/`tunings` copié suppose un modèle perso identique — non vérifié (dépend de C1)

Sous-cas de C1 mais mérite sa ligne pour les stories : `tunings`/`instrumentTypes` sont vraisemblablement des structures (arrays/JSON) côté perso. La copie snapshot doit **cloner ces structures** (pas partager une référence), respecter la convention colonnes (`field: snake_case`, exception `SongPlay` en camelCase DB — piège documenté). Aucune de ces mécaniques n'est spécifiée. Risque de bug de copie superficielle.

---

## LOW

### L1 — L'anti-SQL de UJ-3 est en partie hypocrite

UJ-3 vend « curer sans toucher au SQL ». Or l'addendum §Autorisation : « Le rôle se pose **à la main en base** pour northwood ». Le curateur lui-même naît d'un `UPDATE users SET is_curator=true`. Acceptable pour 1 curateur, mais le narratif « zéro SQL » est faux à la racine. À assumer explicitement plutôt qu'à masquer.

### L2 — Course entre browse et Add (fiche supprimée entre-temps) non spécifiée

User ouvre une fiche, curateur la supprime, user clique `Add` → read 404. Comportement UI non décrit (toast ? retour liste ?). Mineur mais absent.

### L3 — Nouvelle surface d'abus : search/browse sur donnée partagée = scraping du catalogue entier

Endpoints de recherche/filtre sur un pool partagé et croissant = surface d'énumération/scraping (le catalogue **est** l'actif). v1 connectés-seulement limite le risque, mais aucun rate-limit n'est évoqué. À garder à l'œil pour le jour du browse public (déjà noté comme « à cadrer » en §5, cohérent) — mais l'abus existe déjà côté connectés (3-4 users → non-problème aujourd'hui, à ne pas oublier).

### L4 — Métriques quantitatives sur N≈4 users : bruit statistique

Le decision-log note « mono-user beta (3-4 users) ». SM-1 (« >50 % »), SM-3 (« % d'users ayant importé ≥1 Collection »), SM-2 (« baisse nette vs baseline ») sont des cibles chiffrées **sans signal possible à N=4** : un seul user bascule le pourcentage de 25 points. Le framework de métriques est dimensionné pour une échelle que le produit n'a pas. Soit on assume que ce sont des **directions qualitatives** (et on retire les chiffres), soit on attend une base d'users crédible. En l'état, les cibles donnent une fausse rigueur.

---

## Synthèse — ce qui doit bouger AVANT les epics

1. **Figer le tableau de mapping champ-par-champ Catalog→Song** (C1) — bloquant pour FR-4/FR-9, inclut la question « faut-il migrer la table `Song` perso ? ».
2. **Trancher l'identité canonique** : accepter que le modèle est variant-hostile et décider maintenant si l'uid canonique est stable-by-contract (indispensable à la provenance) + prévoir un workflow de correction (C2, C3).
3. **Décider 403 vs 404 sur l'admin** en amont, comme décision de sécurité conceptuelle, pas d'implémentation (H1) — et purger les AC non testables (M4).
4. **Redéfinir SM-1** pour découpler adoption et couverture, neutraliser le gonflage par imports batch, et qualifier « une fois seedé » avec un volume de seed décidé (H2, H3).
5. **Trancher Collection→regroupement perso** avant de figer FR-9, sinon la §4.3 ne tient pas sa promesse (H4).

Le PRD est solide sur la forme et honnête sur ses ruptures — mais il **présente comme acquis un socle qui repose sur trois décisions non prises**, et il **pose des métriques trop musclées pour son échelle**. Corriger ces points le rendra réellement exécutable ; les laisser filer garantit qu'ils resurgiront en dette au milieu des stories.
