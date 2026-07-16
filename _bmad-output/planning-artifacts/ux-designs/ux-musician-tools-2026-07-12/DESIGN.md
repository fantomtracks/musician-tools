---
name: Musician Tools — Catalog (pool partagé)
status: final
updated: 2026-07-12
inherits: Tailwind CSS 3.4 (darkMode:'class') + tokens projet brand/primary/accent/secondary (50→900) ; hérite aussi du delta responsive d'ux-musician-tools-2026-07-04
tokens:
  colors:
    collection_tile_gradient: 'from-brand-500 to-purple-600'          # DL-7 — tuile Collection (réutilise le gradient marque, cf. .text-gradient)
    collection_tile_gradient_dark: 'dark:from-brand-600 dark:to-purple-700'
    add_added_flash: 'bg-green-500 text-white'                         # DL-8 — flash succès momentané du bouton Add (état « ✓ Added » ET « ✓ Added » du bouton, token unique)
  spacing:
    rail_gap: 'gap-4'                                                  # écart horizontal entre cartes d'un rail
    rail_edge_peek: 'pr-6'                                             # marge de fin de rail : la carte suivante « dépasse » → affordance de scroll
    grid_gap: 'gap-4'                                                  # écart de la grille de la liste filtrable (fallback carte < sm)
  breakpoints:
    stack: 1024px                                                     # `lg` — hérité 2026-07-04 : rails horizontaux ↔ empilement, sidebar filtres ↔ disclosure
  components:
    rail_scroll_container: 'flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4'
    collection_card: 'relative overflow-hidden snap-start shrink-0 w-40 sm:w-48 aspect-[4/3] rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 dark:from-brand-600 dark:to-purple-700 text-white p-4 flex flex-col justify-end shadow-card'
    collection_card_scrim: 'pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/40 to-transparent'   # scrim contraste (a11y) : garantit ≥4.5:1 du texte blanc sur le stop clair du gradient (brand-500)
    recently_added_card: 'snap-start shrink-0 w-56 card-base p-4 flex flex-col gap-2'
    catalog_list_row: 'flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-700 min-w-0'
    add_button_default: 'btn-primary'                                  # « Add to my songlist »
    add_button_added: '{colors.add_added_flash}'                       # transitoire « ✓ Added » — réutilise le token unique add_added_flash (jamais badge-success pâle)
    add_button_already: 'badge-success cursor-pointer'                 # « ✓ Already in your songlist » — cliquable vers la Song existante
    add_collection_button: 'btn-primary'                              # « Add collection to my songlist »
---

# DESIGN.md — Catalog (pool partagé)

> **Identité visuelle inchangée.** Ce spine ne crée pas de nouvelle marque : il **hérite** du design system Tailwind existant (couleurs `brand/primary/accent/secondary`, `card-base`, `glass-effect`, `input-base`, `btn-primary`/`btn-secondary`/`btn-accent`, `badge-*`, `.text-gradient`, dark mode `class`) **et** du delta responsive d'`ux-musician-tools-2026-07-04` (breakpoint `lg`, cap de tableau, disclosure filtres). Il n'ajoute que le **delta visuel des nouvelles surfaces Catalog** : cartes (Collection, Recently added), rails à scroll horizontal, ligne de liste avec bouton Add inline, fiche détail lecture seule, et l'écran curateur utilitaire. En cas de conflit avec une maquette, ce spine gagne.

## Colors

Le Catalog **ne réutilise aucune couleur nouvelle** ; il pose seulement deux emplois cadrés du thème existant.

- **Tuile de Collection = gradient marque** (`{colors.collection_tile_gradient}` → `bg-gradient-to-br from-brand-500 to-purple-600`, dark `{colors.collection_tile_gradient_dark}`). Même **famille** de gradient que `.text-gradient` (marque), remontée en fond de tuile — direction/stop de départ diffèrent (`.text-gradient` = `from-brand-600`, la tuile = `from-brand-500`), le token concret fait foi. Raison (DL-7) : le modèle Catalog ne porte **aucune image** ; la couleur remplace la pochette et donne le « plein de matière » à l'ouverture (JTBD émotionnel). Le texte de la tuile (nom + compte) passe en `text-white`.
- **Contraste de la tuile — cible chiffrée WCAG AA (combinaison porteuse).** Le stop clair du gradient (`brand-500` ≈ #4f6cff) mesure ≈4.27:1 avec le blanc — **sous** le seuil AA 4.5:1 pour le **compteur** en `meta` (petit texte). Règle : le **compteur** (petit) doit atteindre **≥4.5:1** et le **nom** **≥3:1** s'il est ≥18.66px gras, sinon **≥4.5:1**. Réalisation : un **scrim** bas (`{components.collection_card_scrim}` → `bg-gradient-to-t from-black/40 to-transparent`) posé derrière le bloc texte, sur les deux thèmes ; alternative acceptée si le scrim est retiré : rendre le compteur **large/gras** pour viser ≥3:1. Vérifier le blanc contre le stop le **plus clair** dans les deux variantes (light `brand-500`, dark `brand-600`).
- **État doublon = vert calme, jamais rouge** (DL-11 / FR-6). Le bouton `Add` qui bascule en « Already in your songlist » emprunte `badge-success` (`bg-green-100 text-green-700`) — **jamais** `badge-danger` (`bg-red-100`). Un doublon est un confort (SM-C2), pas une erreur : le rouge est réservé aux vraies erreurs et aux confirmations destructives.
- **Flash de succès de l'ajout** : `{colors.add_added_flash}` (`bg-green-500 text-white`) pour l'état transitoire « ✓ Added » d'un bouton Add inline avant qu'il ne se fige en « Already in your songlist ». Momentané, cohérent avec le vert du doublon.

## Layout & Spacing

Le Catalog reprend la logique de bascule au **seul breakpoint `lg` (1024px)** héritée du 2026-07-04. La page Browse s'organise **du haut vers le bas**, ordre non négociable (DL-5) : **Search → rail Collections → strip Recently added → liste filtrable**.

> Références visuelles : [wireframe ordre Browse](wireframes/flow-browse-catalog-2026-07-12.excalidraw) (ordre de composition validé) et [maquette Browse dense](mockups/key-browse-catalog.html) (layout serré light+dark, état doublon).

- **La recherche est toujours au-dessus des rails** (DL-5). Les cartes = découverte **sous** la recherche, jamais avant : elles ne noient pas le chemin « tâche ». Champ vide = layout découverte complet ; dès qu'on tape, les rails **s'effacent** et la liste **remonte** directement sous le champ + ses filtres — **filtre en place, une seule surface de résultats**, titre `All songs` → **`Results (n)`** (DL-6, comportement dans EXPERIENCE). **Pas de dropdown/autocomplete** : rien ne s'intercale entre le champ et l'emplacement des Collections.
- **Rails à scroll horizontal** (`{components.rail_scroll_container}`) : `flex overflow-x-auto` avec `snap-x snap-mandatory`, `{spacing.rail_gap}` entre cartes et `{spacing.rail_edge_peek}` en fin de rail pour laisser la carte suivante **dépasser** (affordance « il y en a d'autres → scrolle »). Débord latéral par `-mx-4 px-4` afin que les cartes touchent visuellement les bords de la page tout en gardant la gouttière de contenu.
- **Liste filtrable** : réutilise la table Songlist et son delta responsive (conteneur `overflow-auto max-h-[65vh]`, header `sticky top-0 z-10`, `min-w-0` obligatoire sur l'enfant flex). Sous `lg`, elle peut retomber en grille de cartes 1 colonne (`{spacing.grid_gap}`), au-dessus elle reste tableau. Recherche + filtres restent hors de la zone scrollable. **Axes de filtre = `Key · Genre · Mode · Time signature`** (+ recherche texte titre/artiste) — **aucun filtre Instrument, Difficulty ni Tuning** (DL-17, champs sortis du Catalog).
- **Fiche détail `/catalog/:uid`** : lecture seule, une seule colonne de contenu centrée (largeur bornée comme le SongForm), champs groupés comme le SongForm miroir, un unique CTA `Add to my songlist` (ou l'état doublon) — pas de save-bar (rien à sauvegarder). Réf. visuelle : [maquette fiche détail](mockups/key-catalog-detail.html) (route lecture seule).

## Shapes

Rien de neuf : cartes et tuiles suivent `rounded-lg` (le rayon de `card-base`). Les tuiles de Collection sont des rectangles `aspect-[4/3]` à coins `rounded-lg` — **pas** de cercles, **pas** de pills de surface. Les badges d'état (doublon, compteur) restent `rounded-full` via `badge-base`.

## Components

Tous les composants réutilisent les classes existantes ; le Catalog n'introduit **aucune** primitive de style.

### Collection card — `{components.collection_card}`
Tuile `aspect-[4/3]` en gradient marque (`{colors.collection_tile_gradient}`), `relative overflow-hidden` avec un **scrim** de contraste (`{components.collection_card_scrim}`) posé derrière le bloc texte, texte blanc aligné en bas : **nom de la Collection** en gras + **compteur** en `meta` (ex. `Rock 90 · 20`). Aucune image, aucune icône décorative (DL-7). **Motif stretched-link** (a11y, cf. Do/Don't) : le **nom** est le lien `<a>` qui couvre la tuile → page détail de la Collection ; pas de `<div onClick>` enveloppant. `shrink-0 snap-start` pour vivre dans un rail. Sous `lg`, mêmes tuiles en grille wrap.

### Collection detail route (`/catalog/collections/:uid`)
En-tête de page : **nom** de la Collection, sa **description éventuelle** juste dessous (champ optionnel du modèle, FR-8), et le **compteur** de chansons — puis la liste des fiches (rows **`Artist · Title · Key · BPM`**, artiste d'abord, DL-18) et le bouton `Add collection to my songlist`. Si la description est absente, la ligne est simplement omise (pas de placeholder).

### Recently-added card — `{components.recently_added_card}`
`card-base` en `w-56` : **artiste en tête** (label meneur, `text-gray-500 dark:text-gray-400`) puis **titre** clairement lisible dessous (`font-medium`, tronqué 1 ligne) — **artiste d'abord** (DL-18, aligné sur l'ordre Artist→Title de la table Songlist), une rangée de **puces clé/BPM** (`badge-primary` compactes), et le bouton `Add to my songlist` en pied (DL-7). **Motif stretched-link** (a11y) : le **titre** reste le lien `<a>` couvrant la carte → fiche `/catalog/:uid`, et son **nom accessible identifie la chanson** (« Zombie by The Cranberries ») même si le label visible mène par l'artiste ; le bouton Add et le badge doublon sont des **frères** au-dessus du lien (`relative z-*`), jamais des descendants du lien. Cliquer Add = geste inline (ne quitte pas Browse).

### Collections rail & Recently-added strip
Deux rails horizontaux (`{components.rail_scroll_container}`) portant respectivement des Collection cards et des Recently-added cards. Chacun précédé d'un petit titre de section (`Collections`, `Recently added`) en `label-base`. Les deux se **replient ensemble** dès la saisie recherche (DL-6). Sur desktop, une piste de scroll discrète suffit ; pas de flèches de carrousel obligatoires.

### Catalog list row — `{components.catalog_list_row}`
Ligne de la liste filtrable : colonnes **`Artist · Title · Key · BPM`** (**artiste d'abord**, DL-18 — même ordre que la table Songlist ; champs intrinsèques uniquement, DL-17 — **pas** de colonne Difficulty/Instrument/Tuning) alignées sur la table Songlist, **plus une cellule d'action fixe à droite** portant le bouton Add (position **inchangée**, en fin de ligne). `min-w-0` sur le conteneur (règle non négociable héritée). Tri par défaut **artiste → titre** (DL-15, cohérent avec l'ordre des colonnes). **Motif stretched-link** (a11y) : le **titre** (cellule) est le lien `<a>` qui couvre la surface de la ligne → `/catalog/:uid`, et son **nom accessible identifie la chanson** (« Zombie by The Cranberries ») même si l'ordre visible mène par l'artiste ; la cellule d'action (bouton Add, badge doublon) est un **frère** au-dessus du lien (`relative z-*`), jamais imbriqué dedans.

### Add button — trois états visuels (DL-8, DL-11)
Présent sur chaque row, chaque Recently-added card, et sur la fiche.
- **Default** — `{components.add_button_default}` (`btn-primary`), libellé `Add to my songlist` (ou icône `+` seule quand la place manque en cellule serrée, `aria-label` complet). Même en `+` seul, la **cible reste ≥44px** via padding/hit-area (voir Accessibility Floor d'EXPERIENCE) — pas de rétrécissement silencieux en cellule serrée.
- **Added (transitoire)** — flash `{colors.add_added_flash}` (`bg-green-500 text-white`, token unique, réutilisé par `{components.add_button_added}`) avec `✓ Added` (~vert), puis résolution vers l'état doublon.
- **Already in your songlist (doublon calme)** — `{components.add_button_already}` (`badge-success cursor-pointer`, `✓ Already in your songlist`), **cliquable** pour aller à la Song existante ; la **cible reste ≥44px** même en badge compact. Vert, jamais rouge, jamais désactivé-grisé façon échec (DL-11). L'état « déjà présent » connu **avant** clic (clé canonique déjà en Songlist) s'affiche directement ainsi, sans passer par le flash.

### Add collection button — `{components.add_collection_button}`
Sur la page détail Collection : `btn-primary` `Add collection to my songlist`. Déclenche un `ConfirmDialog` (batch = engagement lourd, DL-12) puis un toast récap — voir EXPERIENCE. Réf. visuelle : [maquette import Collection](mockups/key-import-dialog.html) (ConfirmDialog + toast récap).

### Catalog detail route layout (`/catalog/:uid`)
Lecture seule (FR-3). Une colonne : en-tête **mené par l'artiste** (DL-18) — artiste en ligne proéminente, titre de la chanson juste à côté/dessous (rendu type « The Cranberries — Zombie », artiste d'abord ; `.text-gradient` possible sur le titre pour l'accent marque), grille de métadonnées **intrinsèques uniquement** (DL-17) : **Key, BPM, Mode, Time signature, Duration, Genre, Language, Album, Pitch standard** — **retirés : Instrument, Difficulty, Tuning, Capo, Technique, Instrument links** (champs perso/instrument, hors Catalog). Liens **YouTube/Spotify cliquables** (streaming, ouverture externe, `btn-secondary` ou liens), et le bloc Add (3 états). Pas de champs éditables, pas de save-bar.

### Curator admin — form + collection composer (utilitaire, DL-14)
Écran d'administration role-gated (`/catalog/admin`), posture **utilitaire** (pas de fioriture) :
- **Curator entry form** : réutilise la **structure `SongForm`** (mêmes grilles `grid-cols-1 sm:grid-cols-3`, mêmes `input-base`/`label-base`) mais **restreinte aux champs intrinsèques** de la fiche Catalog (DL-17 — pas de instrument/difficulté/accordage/capo/technique/instrumentLinks). Titre requis. Bouton d'auto-fill SongBPM (BPM/durée) comme la Songlist, sans écraser une saisie (FR-11). `btn-primary` pour enregistrer, `btn-secondary` pour annuler.
- **Curator composer** : champ de recherche de fiches (`input-base`) → liste de résultats, chaque ligne avec un bouton **Add**/**Remove** (`btn-secondary`) — **pas de drag** (DL-14). Réutilise le style de liste et `comboboxKeyboard`. Une fiche peut être ajoutée à plusieurs Collections (FR-12).

## Do's and Don'ts

| Do | Don't |
|---|---|
| Réutiliser `card-base`, `input-base`, `btn-primary`, `badge-*`, `.text-gradient` tels quels | Introduire une lib UI ou du CSS custom (Tailwind only) |
| Tuiles de Collection en **gradient marque** (`{colors.collection_tile_gradient}`) | Attendre / afficher des **images ou pochettes** — le modèle n'en porte aucune (DL-7) |
| État doublon en **vert calme** (`badge-success`, `✓ Already in your songlist`, cliquable) | Peindre le doublon en **rouge** ou en désactivé-grisé façon erreur (DL-11) |
| Garder l'ordre **Search → Collections → Recently added → liste** ; recherche au-dessus des rails (DL-5) | Placer un rail/carte **au-dessus** de la recherche, ou noyer la liste sous la découverte |
| `min-w-0` sur l'enfant flex portant la liste ; header sticky opaque (hérité 2026-07-04) | Masquer des colonnes ou reflow non maîtrisé sous un seuil |
| Réutiliser `ConfirmDialog` + toast `setToastMessage` (import Collection) | Recoder un système de confirm/toast ou une lib de notifications |
| Bouton Add inline partout (row, carte, fiche) — friction mini (DL-8) | Forcer un détour par la fiche avant de pouvoir ajouter |
| **Stretched-link** : le titre est le lien `<a>` qui couvre la carte/ligne ; Add + badge doublon sont des **frères** au-dessus (`relative z-*`) | Envelopper la carte/ligne dans un `<a>`/`<div onClick>` qui **contient** le bouton Add (contrôles interactifs imbriqués — HTML invalide, clavier/SR cassés) |
| Scrim de contraste sous le texte de la tuile pour tenir ≥4.5:1 (compteur) sur le stop clair du gradient | Poser du blanc sur le gradient sans cible chiffrée ni scrim (compteur illisible sur `brand-500`) |
| Écran curateur **utilitaire**, structure `SongForm` réutilisée | Sur-designer l'admin ; réinventer un formulaire hors du pattern SongForm |
