# Revue qualité PRD — Musician Tools : Journal de sessions, heatmap et sujets de travail

> Rubrique : `prd-validation-checklist.md` · Enjeux : lancement public d'une app web hobby (développeur solo) · Aval : bmad-create-epics-and-stories · Date : 2026-06-06

## Verdict global

PRD solide et honnête : la thèse « la session est l'unité atomique, la heatmap n'en est qu'une projection » (§1) structure réellement le périmètre, les métriques et les exclusions, et la philosophie « motivation par le miroir, jamais par le fouet » est traduite en exigence testable (FR16) plutôt qu'en slogan. Les deux risques pour l'aval sont la sous-spécification du pont FR18/FR19 (règles de fusion et de synchronisation inverse, pourtant désignées comme mitigation du risque « double comptage » au §7) et l'absence de glossaire avec une dérive « entrée »/« item », alors que ce PRD alimente directement la création d'epics et de stories.

## Decision-readiness — strong

Les décisions sont posées comme des décisions, pas comme des « considérations » : modèle Session minimal avec la tentation d'enrichissement nommée comme obstacle (§7, ligne 3 du tableau des risques ; repris dans l'addendum), mode temps réel « v2 explicitement arbitrée » (addendum), exclusions listées avec leur destination (« backlog, itérations futures », §4). Le trade-off central — capturer peu mais sans friction plutôt que riche mais coûteux — est assumé : « Aucune durée minimale » (FR5), entrées à minutes optionnelles (FR6). Quelqu'un qui voudrait pousser vers les streaks ou la gamification trouve son objection traitée frontalement (FR16, risque Duolingo/Anki au §7).

Seule réserve : les « Questions ouvertes » du §8 n'en sont pas vraiment — les deux portent leur réponse dans la phrase suivante.

### Findings
- **low** Questions ouvertes pré-répondues (§8) — Q2 s'auto-répond immédiatement : « `[ASSUMPTION]` Non — comme GitHub, la grille est visible dès le premier jour » ; Q1 est déjà tranchée au §1 (« L'app reste gratuite pour cette itération »). Ce sont des décisions déguisées en questions. *Fix :* requalifier en décisions/hypothèses assumées, ou supprimer la section ; ne garder en « ouvert » que ce qui n'est réellement pas tranché.

## Substance over theater — strong

Rien ne ressemble à du mobilier. Deux personas seulement (Léa, Marc), et chacun porte des décisions : Léa justifie la cible < 30 s et la session rétroactive (UJ-1, UJ-2, FR5, FR10) ; Marc justifie à lui seul le Groupe D (UJ-3 → FR18). La différenciation (§1) s'appuie sur un digest concurrentiel réel (addendum : Modacity, Tonara, Andante…) et — fait rare — signale honnêtement sa limite : « recherche effectuée hors web […] à revérifier avant lancement » (§7, dépendances). Les NFR portent des seuils produit, pas du boilerplate : « < 30 s par un utilisateur récurrent » (NFR1), « rendu < 1 s avec une année complète » (NFR2), middleware d'ownership existant nommé (NFR4). La Vision ne pourrait pas être copiée dans un autre PRD de la catégorie : « Pas de streak punitif, pas de notification culpabilisante, pas de rouge agressif » (§1).

## Strategic coherence — strong

Le PRD a une thèse et la tient : « La **session est l'unité atomique** du système » (§1, « Le pari produit »), et toutes les exclusions du §4 sont des projections futures qui « se brancheront dessus sans le modifier ». Les métriques valident la thèse plutôt que l'activité brute : M2 (< 30 s de saisie) teste l'hypothèse « friction = cause n°1 d'abandon », M4 (≥ 30 % de sessions avec sujet) teste que le journal dépasse bien le répertoire — c'est le cœur du problème énoncé au §1. Les contre-métriques existent et sont les bonnes : CM1 (churn post-rupture) garde le risque heatmap, CM2 protège l'usage existant. Périmètre MVP de type résolution de problème, cohérent avec la logique de découpe.

Une faiblesse : M2 est annoncée « mesurée » (NFR1 : « mesuré, cf. M2 ») mais aucune exigence d'instrumentation n'existe — voir Done-ness.

## Done-ness clarity — adequate

La majorité des FR portent une conséquence testable : FR4 énonce le comportement post-suppression d'un sujet (« les sessions passées qui le référencent continuent d'afficher son nom »), FR13 tranche le cas limite des sessions sans durée (« intensité minimale visible »), FR17 fixe la règle de fuseau horaire. C'est nettement au-dessus de la moyenne. Mais c'est la dimension sur laquelle la création de stories va s'appuyer le plus fort, et le Groupe D — le pont, c'est-à-dire la partie la plus délicate en brownfield — laisse des trous que le développeur devra trancher seul.

### Findings
- **high** Règles de fusion FR18 incomplètes (§5 Groupe D, §7) — Le §7 affirme que la mitigation du double comptage repose sur des « règles de fusion explicites dans la session du jour », mais FR18 ne couvre pas : que faire s'il existe déjà plusieurs sessions ce jour-là ? Si la session du jour porte un autre instrument que « l'instrument concerné » ? Que signifie « l'instrument concerné » quand la chanson a plusieurs instruments — l'app existante trace `lastPlayed` par ligne d'instrument ? Cliquer deux fois crée-t-il deux entrées ? *Fix :* expliciter dans FR18 la règle de sélection/création de la session cible (par jour + instrument ?) et le comportement en cas de clics répétés.
- **medium** FR19 sans règle inverse de la synchronisation (§5 Groupe D) — FR19 met à jour « dernier joué » à l'ajout d'une chanson, mais rien ne dit ce qu'il advient quand la session est supprimée (FR9) ou sa date modifiée (FR8) : le « dernier joué » est-il recalculé, ou reste-t-il faussé ? *Fix :* énoncer la règle (recalcul depuis l'historique, ou « jamais de rollback » assumé).
- **medium** Métriques sans moyen de mesure (§2, NFR1) — M1–M4 et NFR1 (« mesuré, cf. M2 ») supposent une télémétrie (temps de saisie, cohortes de rétention) qu'aucun FR/NFR ne demande. Pour un lancement public, ces métriques resteront invérifiables. *Fix :* ajouter une exigence d'instrumentation minimale, ou requalifier les cibles en heuristiques non mesurées.
- **medium** Échelle d'intensité de la heatmap non bornée (FR13) — « l'intensité visuelle reflète les minutes totales » : paliers fixes ou quantiles ? Combien de niveaux ? Le développeur de la story devra inventer la fonction minutes → couleur. *Fix :* fixer le barème (ex. 4 niveaux à seuils fixes, à la GitHub) ou le déléguer explicitement à la spec UX.
- **low** Dates futures non traitées (FR5) — « toute date passée autorisée » ne dit pas si une date future est bloquée ; une session datée de demain allumerait un jour à venir dans la heatmap. *Fix :* une demi-phrase (« dates futures refusées »).

## Scope honesty — strong

Les omissions sont explicites et localisées : la section « Exclu » (§4) fait un vrai travail — six lignes, chacune nommant ce qui est repoussé et où le retrouver (addendum, brainstorming du 2026-06-06). Trois tags `[ASSUMPTION]` inline aux bons endroits (gratuité §1, pré-calcul de durée FR11, heatmap visible dès le premier jour §8). La densité d'items ouverts est faible, ce qui est cohérent avec les enjeux hobby/solo : rien de bloquant n'est camouflé. Absence de `[NOTE FOR PM]` : acceptable quand le PM, le développeur et le décideur sont la même personne. Le seul accroc — l'absence d'index des hypothèses — est mécanique (voir Notes mécaniques).

## Downstream usability — adequate

C'est un PRD de tête de chaîne (il alimente bmad-create-epics-and-stories), donc cette dimension compte. Les ID sont contigus et uniques (FR1–FR19, UJ-1–UJ-4, M1–M4, CM1–CM2, NFR1–NFR6), les références croisées résolvent toutes (« cf. M2 » FR10/NFR1, « FR16 » et « FR18/FR19 » au §7, « pattern existant » FR9). Chaque UJ a un protagoniste nommé. Mais il n'y a pas de glossaire, et le vocabulaire dérive : le §4 dit « items chanson/sujet », FR6 dit « entrées », l'addendum dit « SessionItem » / « items[] ». Un extracteur de stories devra deviner que c'est le même objet.

### Findings
- **medium** Glossaire absent, dérive « entrée » / « item » (§4 vs FR6 vs addendum) — Les noms de domaine (Session, Entrée/Item, Sujet de travail, « session du jour », « dernier joué ») ne sont définis nulle part et « entrée »/« item » coexistent pour le même concept. Risque direct : des stories qui modélisent deux entités là où il n'y en a qu'une. *Fix :* ajouter un glossaire de 5–6 termes et unifier sur « entrée » (ou « item ») partout, addendum compris.

## Shape fit — strong

La forme épouse le produit. Profil hobby/solo + app grand public avec UX signifiante : la rigueur est légère là où il faut (pas de matrice de traçabilité, pas de persona surnuméraire) et la substance tenue là où ça compte (UJ porteurs avec protagonistes nommés, seuils chiffrés). Brownfield bien traité : les références à l'existant sont précises et vérifiables — « middleware d'ownership existant » (NFR4), « pattern existant » de confirmation (FR9), `lastPlayed`/`SongPlay` ancrés dans l'addendum avec renvoi au commit des migrations idempotentes. La séparation PRD-contrat / addendum-technique (« Ne fait pas partie du contrat PRD ») est exactement la bonne découpe pour nourrir architecture et stories sans contaminer le contrat.

## Notes mécaniques

- **Index des hypothèses absent** : trois `[ASSUMPTION]` inline (§1 gratuité, FR11, §8 Q2) sans index récapitulatif en fin de document ; l'hypothèse de gratuité apparaît deux fois (§1 et §8 Q1) avec deux formulations. Faible coût, utile pour le roundtrip aval.
- **Dérive de libellé du bouton** : « Mark as Played » (§2 CM2) vs « Mark as Played Now » (UJ-3, FR18). Vérifier le libellé réel de l'UI existante et unifier.
- **Dérive « entrée »/« item »** : voir finding Downstream usability ; concerne §4, FR6, et l'addendum (SessionItem).
- ID : aucun trou, aucun doublon (FR1–19, UJ-1–4, M1–4, CM1–2, NFR1–6). Renvois internes tous résolus.
- Protagonistes UJ : nommés et porteurs de contexte inline (Léa ×3, Marc ×1). Conforme.
- Sections attendues pour ces enjeux : présentes ; manque seulement le glossaire (signalé ci-dessus).
