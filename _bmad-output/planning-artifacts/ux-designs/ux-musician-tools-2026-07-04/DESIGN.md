---
name: Musician Tools — confort mobile (Songlist + édition)
status: final
updated: 2026-07-04
inherits: Tailwind CSS 3.4 (darkMode:'class') + tokens projet brand/primary/accent/secondary (50→900)
tokens:
  spacing:
    table_scroll_cap: 65vh        # D2 — hauteur max de la zone scrollable du tableau
  breakpoints:
    stack: 1024px                 # `lg` — bascule sidebar↔empilé + activation disclosure filtres (D5)
  components:
    table_scroll_container: "overflow-auto max-h-[65vh] min-w-0"
    table_header_sticky: "sticky top-0 z-10 bg-<surface>"
    filters_disclosure: "collapsed < lg ; static sidebar >= lg"
    form_grid: "grid-cols-1 sm:grid-cols-3 gap-4"
---

# DESIGN.md — Confort mobile

> **Identité visuelle inchangée.** Ce spine ne crée pas de nouvelle marque : il hérite du design system Tailwind existant (couleurs `brand/primary/accent/secondary`, `card-base`, `glass-effect`, `input-base`, `btn-primary`, dark mode `class`). Il ne fixe que le **delta responsive**. En cas de conflit avec une maquette, ce spine gagne.

## Layout & Spacing

- **Breakpoint de bascule = `lg` (1024px)** — un seul seuil, déjà en place (`SongsList.tsx:123`). Sous `lg` : sidebar filtres → disclosure replié ; le tableau reçoit son cap de hauteur. Au-dessus : layout desktop actuel intact.
- **Cap tableau = `65vh`** (`{spacing.table_scroll_cap}`) — la zone de lignes du tableau ne dépasse jamais 65 % de la hauteur du viewport ; au-delà elle scrolle en interne. Recherche, titre, filtres et save-bar restent hors de cette zone. La page cesse de grandir avec le nombre de chansons.
- **`min-w-0` obligatoire** sur la colonne contenu `flex-1` (`SongsList.tsx:202`) — sans lui, l'enfant tableau force la largeur de tout le flex parent et fait déborder la page. Règle non négociable (cf. Do's & Don'ts).

## Components

### Table scroll container
Enveloppe le tableau des chansons : `overflow-auto max-h-[65vh]` + le parent `min-w-0`. Le scroll est **bidirectionnel** : vertical (lignes au-delà du cap) et horizontal (colonnes plus larges que l'écran, D4). Aucune colonne masquée, aucun reflow en cartes.

### Table header (sticky)
En-tête de colonnes `sticky top-0 z-10` avec fond de surface opaque (`bg-white dark:bg-gray-800`) pour qu'il reste lisible pendant le scroll vertical interne. Le `z-10` reste **sous** les dropdowns de combobox (`z-50`) et la save-bar (`z-20`).

### Filters disclosure (mobile)
Sous `lg` : bouton pleine largeur « Filters » avec compteur de filtres actifs (« Filters · 2 »), replié par défaut, chevron `▸/▾`. Style aligné sur l'accordéon existant du SongForm (`SongForm.tsx:388` : `w-full flex items-center justify-between px-3 h-10`). Au-dessus de `lg` : le bouton disparaît, la sidebar filtres s'affiche en statique (comportement actuel).

### Form grid (édition)
Les grilles de champs du SongForm passent de `grid-cols-3` à **`grid-cols-1 sm:grid-cols-3`** (`{components.form_grid}`) : une colonne empilée sous `sm` (640px), trois colonnes dès `sm+`. Applique aux deux grilles (`SongForm.tsx:624`, `:697`).

## Do's and Don'ts

- ✅ Toujours `min-w-0` sur un enfant flex qui contient un tableau ou du contenu large.
- ✅ Le cap de hauteur vit sur le **conteneur de scroll du tableau**, jamais sur la page entière (pas de `height:100vh` sur `<body>`/page → on a rejeté le lock plein écran, D2).
- ✅ En-tête sticky avec fond **opaque** (sinon les lignes transparaissent dessous).
- ❌ Ne pas masquer de colonnes ni reflow en cartes sous un seuil (D4 : report assumé).
- ❌ Ne pas introduire de nouveau breakpoint : tout se joue sur `lg` (layout) et `sm` (grille formulaire), déjà présents.
- ❌ Ne pas persister l'état déplié du disclosure filtres (D7).
