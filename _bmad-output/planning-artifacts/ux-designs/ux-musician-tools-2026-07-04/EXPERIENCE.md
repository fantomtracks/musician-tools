---
name: Musician Tools — confort mobile (Songlist + édition)
status: final
updated: 2026-07-04
design: ./DESIGN.md
sources:
  - _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/prd.md   # NFR3 responsive complet
  - _bmad-output/project-context.md                                             # stack, règle langue EN
---

# EXPERIENCE.md — Confort mobile (Songlist + édition)

> Comportement, états et interactions du delta responsive. Les tokens visuels vivent dans `{./DESIGN.md}`. En cas de conflit avec une maquette, ce spine gagne. **Rien de neuf côté fonctionnel** : mêmes données, mêmes actions — on rend la page existante utilisable sous 1024px sans régresser le desktop.

## Foundation

- **Form-factor** : web responsive, du téléphone (~360px) au desktop. Cible mobile de référence : **iPhone 13 (390px)**.
- **UI system** : React 19 + react-router 6, Tailwind 3.4 (`darkMode:'class'`), pas de lib UI tierce. Dark mode partout (NFR3). Ce spine hérite du système ; il ne spécifie que le **delta comportemental** responsive.
- **Surfaces concernées** : (1) **Vue liste** = page Songs (`src/pages/Songs.tsx` → `SongsList.tsx` + `SongsSidebar.tsx`) ; (2) **Vue édition** = `SongForm.tsx` + son wrapper dans `Songs.tsx` (save-bar sticky).
- **Contrainte langue** : toute microcopie **en anglais** (règle projet stricte), même si ce doc est en français.

## Information Architecture

Aucune nouvelle surface, aucune nouvelle route. La page Songs garde ses deux zones :

```
Songs (route /songs)
├── Vue liste
│   ├── Titre + sous-titre ("Songlist" / "Manage your songs…")
│   ├── Recherche (input plein largeur)
│   ├── Filtres           ── desktop ≥lg : sidebar latérale (SongsSidebar)
│   │                        mobile  <lg : disclosure "Filters" replié
│   └── Tableau des chansons  ── zone à scroll interne (cap 65vh), header sticky
└── Vue édition (SongForm, via state.editUid)
    ├── Save-bar sticky (top-16) + statut Saving/Saved
    ├── Champs (title/artist/album/genre/language/…)
    │   └── grilles de méta : 1 col <sm, 3 col ≥sm
    └── Playlist picker + actions (Delete / Back)
```

La bascule desktop↔mobile se joue au **seul breakpoint `lg` (1024px)** pour la liste et `sm` (640px) pour la grille du formulaire (`{./DESIGN.md}` Layout & Spacing).

## Voice and Tone (microcopie — EN)

- Bouton filtres replié : **« Filters »**, avec compteur quand des filtres sont actifs : **« Filters · 2 »** (point médian + nombre). Zéro filtre actif → **« Filters »** seul.
- `aria-label` du bouton disclosure : **« Show filters »** / **« Hide filters »** selon l'état.
- Aucune autre chaîne nouvelle : titres, placeholders et libellés de colonnes restent ceux en place.

## Component Patterns (comportemental)

### Tableau à scroll interne
- Le conteneur du tableau borne sa hauteur à `65vh` et **scrolle en interne** dès que les lignes dépassent. La page hôte ne grandit plus avec le nombre de chansons.
- Scroll **horizontal** activé sur le même conteneur : si les colonnes dépassent la largeur, l'utilisateur glisse latéralement **dans le tableau** ; les blocs voisins (recherche, filtres) ne bougent pas et ne débordent pas (`min-w-0`).
- **En-tête sticky** : les libellés de colonnes restent visibles pendant le scroll vertical interne.

### Disclosure filtres (mobile <lg)
- Bouton pleine largeur, replié par défaut. Tap → déplie la sidebar filtres **dans le flux** (pas d'overlay), re-tap ou sélection → l'utilisateur referme manuellement (pas d'auto-fermeture, cohérent avec un réglage multi-filtres).
- Le **compteur** reflète en temps réel le nombre de filtres actifs même replié → aucun filtrage caché.
- ≥lg : le disclosure n'existe pas ; la sidebar est affichée en statique (comportement actuel inchangé).

### Grille de champs (édition)
- `grid-cols-1 sm:grid-cols-3` : les triplets de champs s'empilent verticalement sous 640px (plus de champs écrasés), reviennent en 3 colonnes dès `sm`.

### Save-bar (édition) — préservée
- Reste `sticky top-16 z-20` (posée en 13-1). Sur mobile, vérifier qu'elle ne déborde pas : contenu `flex items-center justify-between gap-3`, le statut « Saving/Saved » tronque si besoin. Aucun changement de comportement d'auto-save.

## State Patterns

| Surface | État | Rendu attendu |
|---|---|---|
| Tableau | Beaucoup de lignes | Scroll vertical interne ; header sticky ; page hôte stable |
| Tableau | Colonnes > largeur écran | Scroll horizontal interne ; voisins non poussés |
| Tableau | Liste vide / filtrée à 0 | Empty-state occupe la zone (pas de scroll) — inchangé |
| Filtres mobile | Replié, 0 actif | Bouton « Filters » |
| Filtres mobile | Replié, N actifs | Bouton « Filters · N » |
| Filtres mobile | Déplié | Sidebar dans le flux, chevron ▾ |
| Édition mobile | <sm | Champs méta empilés 1 colonne |
| Édition | Saving/Saved | Statut dans la save-bar sticky (13-1) — inchangé |

## Interaction Primitives

- **Scroll interne** (tactile + molette + trackpad) sur le conteneur tableau ; ne « vole » pas le scroll de page une fois la zone en butée (comportement natif `overflow-auto`).
- **Tap disclosure** : cible ≥ 44px de haut (le bouton fait `h-10` + padding → OK).
- **Swipe horizontal** dans le tableau pour révéler les colonnes hors-champ.
- Combobox / dropdowns existants (`z-50`) restent **au-dessus** du header sticky (`z-10`) et de la save-bar (`z-20`) — pas de recouvrement.

## Accessibility Floor (comportemental)

- Bouton disclosure : `aria-expanded` reflète l'état, `aria-controls` pointe la région filtres ; libellé explicite (« Show/Hide filters »).
- Le tableau reste un vrai tableau sémantique dans une région scrollable focalisable au clavier (`tabindex="0"` sur le conteneur scroll pour permettre le scroll clavier).
- En-tête sticky : contraste préservé (fond opaque) — le contraste visuel relève de `{./DESIGN.md}`.
- Cibles tactiles ≥ 44px ; ordre de focus inchangé (le disclosure s'insère avant le tableau dans le DOM).
- NFR6 (ARIA formulaires, nav clavier) déjà tenu — ne pas régresser en réorganisant le layout.

## Responsive & Platform

Le cœur du spine. Trois seuils, un comportement par zone :

| Zone | < sm (640px) | sm–lg | ≥ lg (1024px) |
|---|---|---|---|
| Layout liste | empilé, disclosure filtres | empilé, disclosure filtres | sidebar latérale + contenu (actuel) |
| Tableau | cap 65vh, scroll V+H, header sticky | cap 65vh, scroll V+H | cap 65vh, scroll V si besoin |
| Grille SongForm | 1 colonne | 3 colonnes | 3 colonnes |

- **Aucune régression desktop** : à `≥lg` le layout actuel (sidebar + liste) est préservé ; seul s'ajoute le cap de hauteur du tableau (bénéfique aussi sur desktop pour de longues listes).
- **Dark mode** : tous les nouveaux éléments (bouton disclosure, fond sticky) déclinent en dark (`dark:` variants), comme le reste.

## Key Flow — Léa cherche une chanson depuis son téléphone

Léa, guitariste, dans le métro, iPhone 13 (390px). Elle ouvre `/songs`.

1. La page charge : titre, recherche, un bouton **« Filters »** replié, puis **directement la liste des chansons** — plus besoin de scroller un mur de filtres. *(D3)*
2. Sa liste fait 120 titres. Le tableau **scrolle sous son pouce dans sa propre fenêtre** ; l'en-tête « Title / Artist / … » **reste collé en haut** — elle sait toujours quelle colonne elle lit. La page, elle, ne bouge pas. *(D2)*
3. Elle veut filtrer par instrument : tap sur **« Filters »**, le panneau se déplie dans le flux, elle choisit « Guitar ». Le bouton affiche maintenant **« Filters · 1 »** même après repli. *(D3, D6)*
4. **Climax** : elle tape sur un titre → vue édition. Les champs méta, autrefois écrasés sur trois colonnes minuscules, sont **empilés lisiblement**. Elle corrige le tempo ; la save-bar en haut affiche **« Saving… » puis « Saved »** sans qu'elle cherche un bouton. *(D1, D8, 13-1)*
5. Elle revient (Back sticky), le tableau est **exactement où elle l'avait laissé** — pas de saut de scroll de page.

Aucune donnée, aucune action nouvelle : juste une page qui **tient enfin dans la main**.
