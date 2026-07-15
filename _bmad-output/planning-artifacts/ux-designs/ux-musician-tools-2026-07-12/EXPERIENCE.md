---
name: Musician Tools — Catalog (expérience)
status: final
updated: 2026-07-12
sources:
  - prds/prd-musician-tools-2026-07-12/prd.md
  - prds/prd-musician-tools-2026-07-12/addendum.md
  - ux-designs/ux-musician-tools-2026-07-04/EXPERIENCE.md
design_ref: ./DESIGN.md
---

# EXPERIENCE.md — Catalog (pool partagé)

> Comportement, états et interactions du **Catalog** : la surface partagée depuis laquelle un utilisateur parcourt des fiches et les **copie dans sa Songlist**. Les tokens visuels vivent dans `{design_ref}`. En cas de conflit avec une maquette, ce spine gagne. Le Catalog **hérite** de l'identité visuelle (`{design_ref}`) et du delta responsive d'`ux-musician-tools-2026-07-04` (breakpoints `lg`/`sm`, cap tableau, disclosure filtres) — il ne les rejoue pas, il s'y branche.

## Foundation

- **Form-factor** : web responsive, du téléphone (~360px, cible iPhone 13 / 390px) au desktop. Même SPA React 19 + react-router (data-router, Epic 18) ; **aucune app native**.
- **UI system** : Tailwind 3.4 (`darkMode:'class'`), pas de lib UI tierce, dark mode partout. Le Catalog **hérite** du design system (`{design_ref}`) et des breakpoints `lg` (1024px, layout) / `sm` (640px, grilles de formulaire). Il n'ajoute que les surfaces neuves (cartes, rails, fiche, admin).
- **Rupture assumée** : le Catalog est la **première donnée partagée non-scopée `userUid`** de l'app. Lecture ouverte à tout connecté ; écriture réservée au **Curator**. Conséquence UX : pas de 404 anti-oracle sur l'admin (→ **403** franc), voir State Patterns.
- **Contrainte langue** : toute microcopie **en anglais** (règle projet stricte), même si ce doc est en français.

## Information Architecture

Le Catalog ajoute une **surface de premier niveau** et ses sous-vues, sans toucher aux surfaces existantes (sauf le crochet Songlist vide, DL-13). **Nav = 7e lien, juste après Songlist** (DL-Nav) : `Songlist · Catalog · Heatmap · Sessions · Playlists · Topics · Instruments`. Tient desktop (`gap-8`) et mobile (hamburger).

```
Catalog (nav, 7e lien après Songlist)
├── /catalog  ── Browse (route par défaut)
│   ├── Search (input plein largeur)      ── TOUJOURS au-dessus des rails (DL-5)
│   ├── Collections rail (scroll H)        ── se replie dès la saisie (DL-6)
│   ├── Recently added strip (scroll H)    ── se replie dès la saisie (DL-6)
│   └── Liste filtrable (tri artiste→titre, DL-15)
│       ├── filtres = Key · Genre · Mode · Time signature + recherche texte titre/artiste (DL-17)
│       ├── recherche texte = filtre EN PLACE de la liste ; titre passe à « Results (n) » (DL-6)
│       ├── search + filtres dans l'URL (query params, DL-10)
│       └── chaque row : Artist · Title · Key · BPM (artiste d'abord, DL-18) + bouton Add inline en fin de ligne (DL-8)
├── /catalog/:uid  ── Fiche détail (vraie route, DL-9)
│   └── lecture seule — champs intrinsèques SEULEMENT (title, artist, album, key, bpm, mode, timeSignature, durationSeconds, language, genre, pitchStandard) + liens streaming + Add (3 états) (DL-17)
├── /catalog/collections/:uid  ── Détail Collection
│   └── nom + description éventuelle (FR-8) + compteur + liste des fiches + « Add collection to my songlist » (DL-12)
└── /catalog/admin  ── Espace curateur (role-gated isCurator, DL-4/DL-14)
    ├── entrée dans le DROPDOWN COMPTE (près de Profile / Sign out), visible si isCurator
    ├── Curator entry form (structure SongForm, auto-fill, DL-14)
    └── Curator composer (search + Add/Remove, DL-14)
```

- **`/catalog` porte son état dans l'URL** (DL-10) : texte de recherche + filtres actifs vivent en **query params**. Conséquences : back-button natif depuis la fiche **restaure position + filtres** ; une Browse filtrée est **partageable** (crochet future landing). S'aligne sur le travail refresh/back/deep-link d'Epic 18.
- **Collections** n'ont **pas** d'onglet séparé (DL-3) : elles vivent en rail sur `/catalog` + pages détail dédiées.
- **Admin** n'alimente **pas** la nav principale (déjà 7 liens) : elle vit sous le menu compte, affichée seulement si `isCurator` (DL-4).

> **[NOTE amont] — Attributs instrument hors Catalog (DL-17), divergence PRD/addendum à corriger.** La fiche Catalog est **une entrée canonique par chanson (titre+artiste)** : elle ne porte que les champs **intrinsèques** (`title`, `artist`, `album`, `key`, `bpm`, `mode`, `timeSignature`, `durationSeconds`, `language`, `genre`, `streamingLinks`, `pitchStandard`). Tout attribut lié à **un utilisateur et à *son* instrument sort du Catalog** — non stocké, non affiché, non filtré : `instrument`, `instrumentDifficulty` (difficulté), `instrumentTuning` (accordage), `capo`, `technique`, `instrumentLinks`. Les **filtres Browse** deviennent `Key · Genre · Mode · Time signature` + recherche texte. ⚠️ Ceci **contredit** **FR-2** du PRD (listait instrument + difficulté comme filtres) et l'**addendum** (`CatalogSong` calquait toutes les colonnes de `Song`, dont `instrumentDifficulty`/`instrument`/`instrumentTuning`). **Action requise : un `bmad-correct-course` sur le PRD + l'addendum** pour retirer ces champs du modèle canonique, sinon l'architecture aval les réintroduira. Le spine UX gagne sur conflit mais **ne peut pas amender le PRD à lui seul**.

→ Références de composition : [wireframe ordre Browse](wireframes/flow-browse-catalog-2026-07-12.excalidraw) (ordre Browse validé) et [maquette Browse dense](mockups/key-browse-catalog.html) (layout serré light+dark, état doublon). Le spine gagne sur conflit.

## Voice and Tone

Microcopie **en anglais** (strings user-facing). Le ton marque vit dans `{design_ref}`.

| Contexte | String (EN) |
|---|---|
| Nav / entrée | `Catalog` · `Browse catalog` |
| Ajout unitaire (bouton) | `Add to my songlist` |
| Ajout unitaire (succès, toast) | `Added to your songlist` |
| Doublon calme (bouton, DL-11) | `✓ Already in your songlist` (cliquable → la Song existante) |
| Import Collection (bouton) | `Add collection to my songlist` |
| Import Collection (confirm, DL-12) | `Add 20 songs to your Songlist? A "Rock 90" playlist will be created.` |
| Import Collection (récap, toast, DL-12) | `Added 18 · 2 already in your songlist` (variante échec : `Added 17 · 2 already in your songlist · 1 failed`) |
| Browse — liste par défaut (titre) | `All songs` |
| Browse — recherche active, titre de liste (DL-6) | `Results (n)` (ex. `Results (3)`) |
| Browse — aucun résultat (FR-2) | `No songs match your search.` |
| Catalog vide (seed non fait) | `The Catalog is filling up — check back soon.` |
| Fiche introuvable/supprimée (deep-link périmé) | `This song is no longer in the Catalog.` + lien `Browse the Catalog` |
| Collection introuvable/supprimée | `This collection is no longer in the Catalog.` + lien `Browse the Catalog` |
| Erreur de fetch (Browse / Collection) | `Something went wrong.` + bouton `Retry` |
| Songlist vide → crochet Catalog (DL-13) | `Your songlist is empty — Browse the Catalog to fill it in seconds` + bouton `Browse the Catalog` |
| Curator — création refusée (FR-13) | `A "{title}" by {artist} is already in the Catalog.` |
| Curator — accès refusé (403) | `You don't have curator access.` |

- Jamais de rouge/erreur pour un doublon : `Already in your songlist` est un état **positif** (SM-C2). Pas de point d'exclamation, pas de gamification.

## Component Patterns

Comportemental. Specs visuelles dans `{design_ref}.Components`.

| Composant | Usage | Règles comportementales |
|---|---|---|
| Browse landing | `/catalog` | Composition fixe (DL-5) : Search en tête, puis Collections rail, puis Recently added strip, puis liste filtrable. À l'ouverture (champ vide) = layout **découverte complet** — donne le « plein de matière » (DL-2). |
| Search-to-collapse (filtre en place, DL-6) | `/catalog` | La recherche du haut **filtre la liste « All songs » EN PLACE** — texte + filtres à facettes agissent sur **UNE seule surface de résultats** (la liste). Dès une frappe : les **deux rails s'effacent** (ils ne sont **pas** poussés par un bloc intercalé — **rien n'apparaît entre le champ et l'emplacement des Collections**), la liste **remonte** directement sous le champ + ses filtres, et son titre passe de **`All songs`** à **`Results (n)`**. **Après** un résultat : clic sur une ligne → fiche `/catalog/:uid`, ou `Add` inline sur la ligne. Champ vidé → rails réapparaissent, titre redevient `All songs`. **Rejeté : dropdown autocomplete/select** → créerait une 2e surface de résultats en concurrence avec les filtres à facettes, et diverge de la recherche Songlist existante (qui filtre en place) ; suggestions = évolution future hors v1. **Le nouveau nombre de résultats et l'effacement des rails sont annoncés** via la région `aria-live="polite"` de la liste (le repli se fait pendant que le focus est dans le champ → pas de piège), cf. Accessibility Floor (WCAG 4.1.3). |
| Collection card | Rail + grille | **Stretched-link** : le nom est le lien `<a>` couvrant la tuile → `/catalog/collections/:uid` (pas de `<div onClick>` englobant). Nom + compteur (`Rock 90 · 20`). Le détail Collection affiche nom + **description éventuelle** (FR-8) + compteur. |
| Recently-added card | Strip | **Artiste en tête** puis titre lisible dessous (DL-18). **Stretched-link** : le titre reste le lien `<a>` couvrant la carte → `/catalog/:uid` (nom accessible « Zombie by The Cranberries », chanson identifiable même si le label mène par l'artiste) ; le bouton Add et le badge doublon sont des **frères** au-dessus du lien (`relative z-*`), jamais imbriqués dedans. Puces = **Key/BPM uniquement** (champs intrinsèques, DL-17). Add = geste inline (ne quitte pas Browse). |
| Catalog list row | Liste | **Stretched-link** : le titre est le lien `<a>` couvrant la ligne → fiche (nom accessible « Zombie by The Cranberries », chanson identifiable) ; la cellule d'action (Add, badge doublon) est un **frère** au-dessus du lien, jamais imbriqué. Colonnes = **Artist · Title · Key · BPM** (artiste d'abord, DL-18 ; + cellule d'action en fin de ligne) — aucune colonne Difficulty/Instrument (DL-17). Tri défaut artiste→titre (DL-15, cohérent avec l'ordre des colonnes). |
| Inline Add (DL-8) | Row, carte, fiche | Un tap ajoute **sans confirm** (« 10 secondes », UJ-1). Succès optimiste : flash `✓ Added` puis bascule en `✓ Already in your songlist`. Le toast succès `Added to your songlist` est **annoncé** (conteneur toast `role="status"`/`aria-live`) et le changement de nom accessible du bouton (Add → Added → Already) est perceptible au lecteur d'écran. Échec → revient à `Add to my songlist` + toast d'erreur annoncé, l'action est re-tentable. |
| Duplicate calm state (DL-11) | Row, carte, fiche | Si la **clé canonique** est déjà en Songlist, le bouton **naît** en `✓ Already in your songlist` (vert, cliquable vers la Song existante). Jamais un clic « raté » : pas d'insertion, pas d'erreur rouge (FR-6). |
| Collection import (DL-12) | Détail Collection | `Add collection to my songlist` → **ConfirmDialog** (annonce le N + la Playlist miroir créée) → à la confirmation, import best-effort → **toast récap** (`role="status"`/`aria-live`, annoncé aux lecteurs d'écran). Asymétrie assumée avec l'unitaire (batch = engagement lourd). Réf. visuelle : [maquette import Collection](mockups/key-import-dialog.html). |
| Curator entry form (DL-14) | `/catalog/admin` | Structure `SongForm` réutilisée mais **restreinte aux champs intrinsèques** (DL-17 : pas de instrument/difficulté/accordage/capo/technique/instrumentLinks), titre requis, **auto-fill SongBPM** (BPM/durée) sans écraser une saisie existante (FR-11). Édition **in-place** (uid préservé). |
| Curator composer (DL-14) | `/catalog/admin` | Recherche de fiches → boutons **Add**/**Remove** (pas de drag). Accessible clavier. Une fiche peut vivre dans plusieurs Collections (FR-12). |

## State Patterns

| Surface | État | Rendu attendu |
|---|---|---|
| Browse | Catalog vide (seed non fait) | Empty-state doux : `The Catalog is filling up — check back soon.` Pas de rails vides. |
| Browse | Recherche/filtres actifs → résultats (DL-6) | Rails **effacés** (pas poussés) ; la liste **remonte** sous le champ + filtres, titre `All songs` → **`Results (n)`**. Filtre en place, **une seule surface** ; pas de dropdown. Chaque row garde son `Add` inline / son clic vers la fiche. Le nombre est **annoncé** via `aria-live="polite"`. |
| Browse | Recherche/filtres → 0 résultat (FR-2) | Reste dans la surface `Results` : `No songs match your search.` (titre `Results (0)`) — filtres restent visibles/effaçables ; rails restés effacés (recherche active). L'état « aucun résultat » est **annoncé** via la région `aria-live="polite"` de la liste (WCAG 4.1.3). |
| Browse | Chargement liste (FR-1) | Liste **paginée/virtualisée** (le Catalog grossit au-delà d'une Songlist) ; skeleton de rangées, pas de rendu intégral en un bloc. |
| Browse / Détail Collection | Erreur de fetch de la liste | État d'erreur calme avec **affordance de retry** (`Something went wrong. Try again.` + bouton `Retry`) ; ne casse pas le layout, ne montre pas de rails vides. |
| Fiche `/catalog/:uid` | uid inconnu / fiche supprimée (deep-link périmé, DL-9) | **Not-found calme** (404 scopé Epic 18, pas un crash) : `This song is no longer in the Catalog.` + lien retour `Browse the Catalog`. Cas attendu : liens partagés/périmés après suppression curateur (provenance pendante tolérée). |
| Détail Collection `/catalog/collections/:uid` | uid inconnu / Collection supprimée | **Not-found calme** : `This collection is no longer in the Catalog.` + lien retour `Browse the Catalog`. |
| Détail Collection | Collection à 0 fiche / chargement | Empty doux (`This collection is empty for now.`) ; cold-load réutilise le skeleton de rangées de la liste. |
| Row/carte/fiche | Ajout OK | Optimiste : `✓ Added` (flash) → `✓ Already in your songlist` ; toast `Added to your songlist` **annoncé** (conteneur toast `role="status"`/`aria-live`). |
| Row/carte/fiche | Doublon connu à l'ajout (FR-6) | Bouton **déjà** en `✓ Already in your songlist` (vert), cliquable vers la Song existante. Aucune insertion, aucune erreur rouge (DL-11 / SM-C2). |
| Import Collection | Doublon dans le lot (FR-9) | Fiche déjà présente **skippée** à l'insert, **mais rattachée** à la Playlist miroir (regroupement complet). Récap : `… · N already in your songlist`. |
| Import Collection | Best-effort avec échec (FR-9) | Un échec par fiche **n'annule pas** le lot ; récap inclut `· N failed`. Idempotent : ré-importer ne duplique ni chansons ni entrées de playlist. |
| Route écriture Catalog | Non-curateur (FR-10) | **403 explicite** (`You don't have curator access.`) — **pas** de 404 anti-oracle : la fiche est lisible par tout connecté, aucun secret d'énumération à protéger (exception assumée, addendum). Entrée admin absente du menu si `!isCurator`. |
| Songlist (page existante) | Songlist vide (DL-13) | Crochet Catalog : `Your songlist is empty — Browse the Catalog to fill it in seconds` + bouton `/catalog` + aperçu de **2–3 Collections**. **Dégradation propre** : si le fetch Catalog échoue → CTA seul, jamais d'empty-state cassé. |
| Curator | (title+artist) déjà au Catalog (FR-13) | Création **refusée** : `A "{title}" by {artist} is already in the Catalog.` (unicité canonique **globale**, 409 typé). |

## Interaction Primitives

- **Inline Add** (DL-8) : un tap = un ajout, sans confirm, partout (row, carte, fiche). Optimiste, re-tentable en cas d'échec.
- **Search-to-collapse** (DL-6) : la frappe replie les rails ; vider le champ les restaure. Sert le chemin tâche.
- **Swipe horizontal** sur les rails (Collections, Recently added) : glissement tactile + molette/trackpad ; `snap-x` cale les cartes ; la carte suivante « dépasse » (affordance de scroll). Ne vole pas le scroll de page en butée.
- **Back-button natif** restaure Browse (position + filtres + recherche) via l'état en query params (DL-10). Deep-link `/catalog/:uid` et Browse filtrée **partageables**.
- **Retour du focus sur back-nav** (a11y) : sur `/catalog → /catalog/:uid → back`, en plus du scroll + filtres, le **focus clavier revient sur la row/carte d'origine** (l'élément qui a ouvert la fiche) — on persiste son id/ref dans l'état history/router. Sans ça, `history.back()` d'un data-router SPA laisse le focus sur `<body>` et l'utilisateur clavier/SR perd sa place.
- **Clavier** : réutilise `comboboxKeyboard` pour les filtres et le composer curateur ; les boutons Add et les cartes sont focusables et activables à `Enter`/`Espace`.
- **Confirm + toast** : `ConfirmDialog` (import Collection) et pattern `setToastMessage` + `setTimeout(2500)` — pas de lib (DL-12).
- **Banni** : drag-and-drop (composer = search+Add/Remove, DL-14) ; carrousels auto ; confirm sur l'ajout unitaire ; rouge/erreur pour un doublon.

## Accessibility Floor

Comportemental. Le contraste visuel relève de `{design_ref}` (dont la cible chiffrée de la tuile gradient : scrim → compteur ≥4.5:1, nom ≥3:1 si large/gras).

- **Pas de contrôles interactifs imbriqués — motif stretched-link** : la surface cliquable d'une carte/ligne (Collection card, Recently-added card, Catalog list row) **n'enveloppe jamais** le bouton Add. Le **titre** est le lien `<a>` couvrant la surface (vers la route détail) ; le bouton Add et le badge `Already in your songlist` sont des **frères** remontés au-dessus (`position:relative; z-*`), donc des tab-stops indépendants — jamais des descendants du lien. Interdit : `<a>`/`<div onClick>` contenant un `<button>` (HTML invalide, activation clavier/SR ambiguë).
- **Retour du focus sur back-nav** : `/catalog → /catalog/:uid → back` restaure scroll + filtres **et** rend le focus clavier à la row/carte d'origine (id/ref de l'élément activateur persisté dans l'état history/router), pas seulement `<body>`.
- **Annonces live-region (WCAG 4.1.3)** : la liste filtrable Browse vit dans une région `aria-live="polite"` qui **annonce le nombre de résultats** (`12 songs` / `No songs match your search.`) ; la transition search-to-collapse et l'état « aucun résultat » sont ainsi non silencieux (le repli se fait pendant que le focus est dans le champ → pas de piège). Le conteneur de toasts porte `role="status"`/`aria-live="polite"` pour **tous** les toasts (succès d'ajout unitaire `Added to your songlist`, récap d'import), et le changement de nom accessible du bouton Add (Add → Added → Already) est perceptible au SR.
- **Rails = listes nommées** : chaque rail porte `role="list"` (ou `ul`/`li`) + `aria-label` (`Collections`, `Recently added`) ; chaque carte est un item de liste. Le conteneur à scroll focusable (`tabindex="0"`) reçoit un nom accessible. Le fallback grille de cartes sous `lg` garde la même sémantique liste/item.
- **Rails focusables au clavier** : conteneur à scroll horizontal `tabindex="0"` (scroll clavier), cartes tabulables dans l'ordre visuel. Le swipe n'est pas le seul moyen d'atteindre une carte hors-champ.
- **Boutons Add labellisés** : quand la place force l'icône `+` seule, `aria-label="Add to my songlist"` complet. L'état doublon annonce `Already in your songlist` (rôle + état), lien vers la Song existante.
- **Doublon pas uniquement par la couleur** (DL-11) : l'état porte **icône ✓ + texte** `Already in your songlist`, pas seulement le vert — lisible en daltonisme et lecteur d'écran.
- **Cibles ≥ 44px, sans exception compacte** : boutons Add, cartes, entrées de rail. Le `+` **icône seule** en cellule de liste serrée **et** le badge `Already in your songlist` cliquable gardent une **hit-area ≥44×44px** (via `min-h`/`min-w` ou padding/pseudo-élément), jamais de rétrécissement silencieux sous 44px. Ordre de focus = ordre de lecture (Search → rails → liste).
- **ConfirmDialog** : focus piégé, `Esc` ferme, bouton par défaut sûr ; récap d'import annoncé via toast (`aria-live`).
- Ne pas régresser l'ARIA formulaires hérité (curator form = structure SongForm).

## Responsive & Platform

Le Catalog se branche sur les seuils hérités (`lg` layout, `sm` grilles). Delta propre aux surfaces neuves :

| Zone | < sm (640px) | sm–lg | ≥ lg (1024px) |
|---|---|---|---|
| Browse — Search | plein largeur, collant en tête | plein largeur | plein largeur |
| Rails (Collections / Recently) | scroll horizontal, cartes plus étroites | scroll horizontal | scroll horizontal ; piste discrète |
| Search-collapse | replie les rails → gagne un scroll précieux avant la liste | idem | idem |
| Liste filtrable | grille cartes 1 col **ou** tableau à scroll H/V (cap 65vh) | tableau, cap 65vh | tableau + filtres en sidebar statique |
| Filtres | disclosure « Filters · N » (hérité) | disclosure | sidebar statique |
| Fiche `/catalog/:uid` | une colonne | une colonne | une colonne centrée |
| Curator form | grilles 1 col (`sm:grid-cols-3`) | 3 col | 3 col |

- **Dark mode** partout : tuiles gradient, cartes, badges d'état déclinent en `dark:` (cf. `{design_ref}`).
- **Aucune régression desktop** : les surfaces existantes (Songs, etc.) sont inchangées hormis le crochet Songlist vide (DL-13).

## Copy semantics & provenance

Le geste `Add to my songlist` est une **copie snapshot**, pas un lien vif — invariant produit à ne jamais rendre visible en v1.

- **Snapshot / deep-clone** (FR-4) : l'ajout crée une **Song perso** en copiant les champs **intrinsèques** de la `CatalogSong` (deep-clone des structures JSON — aucun partage de référence) + `sourceCatalogUid` **inerte**. `CatalogSong` ne porte que le **sous-ensemble intrinsèque** des colonnes de `Song` (cf. [NOTE amont] / DL-17 : les champs instrument-scoped — instrument, difficulté, accordage, capo, technique, instrumentLinks — n'y sont pas) ; la copie remplit ces champs perso à vide, l'utilisateur les renseigne côté Songlist.
- **Éditable et indépendante** (FR-5) : la copie se modifie comme toute chanson perso ; éditer/supprimer la fiche Catalog **n'affecte pas** la copie, et éditer la copie n'écrit **rien** au Catalog.
- **Unidirectionnel** (FR-7) : aucun chemin UI/API ne laisse un non-curateur écrire au Catalog. Sens strict Catalog → Songlist.
- **Provenance invisible en v1** : `sourceCatalogUid` n'est **jamais** affiché ; pas de badge « from Catalog », pas de proposition de re-sync (crochet futur uniquement, PRD §4.5).
- **Ce qui n'est PAS copié** : historique de pratique, playlists, notes perso, `lastPlayed` (champs perso, vierges à la création). L'import Collection est la **seule** exception qui touche une Playlist — et encore, elle **crée/réutilise** une Playlist perso miroir, sans copier de playlist du Catalog.

## Key Flows

### Flow 1 — Léa ajoute une chanson déjà remplie en dix secondes (UJ-1)

Léa, guitariste, vient d'entendre « Zombie » des Cranberries. Connectée, sur sa Songlist.

1. Elle clique **Catalog** (7e lien nav) → `/catalog` s'ouvre sur le layout découverte : rails de Collections et de nouveautés, liste dessous.
2. Elle tape `zombie` dans la recherche → les rails **se replient** (DL-6), la liste se réduit au résultat.
3. La ligne « The Cranberries · Zombie » montre déjà clé Em, BPM ~84 (colonnes artiste→titre, DL-18 ; intrinsèques, DL-17).
4. **Climax** : elle clique `Add to my songlist` **sur la row** — sans ouvrir la fiche, sans confirm. Flash `✓ Added`, toast `Added to your songlist`. La chanson est **dans sa Songlist, complète**, zéro saisie.
5. **Résolution** : elle ouvre la Song côté Songlist, ajuste son accordage, logge sa session.

*Edge case (DL-11 / FR-6)* : si « Zombie » est **déjà** en Songlist, le bouton naît en `✓ Already in your songlist` (vert). Un clic l'emmène à la chanson existante — jamais une erreur rouge.

### Flow 2 — Marc peuple sa Songlist avec une Collection « Rock 90 » (UJ-2)

Marc débute, veut un répertoire prêt. Connecté, section Catalog.

1. Sur `/catalog`, il fait défiler le **rail Collections** et ouvre `Rock 90` (`/catalog/collections/:uid`) — 20 fiches listées.
2. Il clique `Add collection to my songlist`.
3. **ConfirmDialog** (DL-12) : `Add 20 songs to your Songlist? A "Rock 90" playlist will be created.` — il confirme.
4. Import best-effort : chaque fiche passe la garde de doublon ; 18 ajoutées, 2 déjà présentes (skippées à l'insert mais **rattachées** à la Playlist miroir).
5. **Climax** : toast récap `Added 18 · 2 already in your songlist`. Sa Songlist est pleine de matière **et** regroupée dans une **Playlist « Rock 90 »** prête à enchaîner.
6. **Résolution** : il ouvre la Playlist et commence à jouer. Ré-importer plus tard ne duplique rien (idempotent).

### Flow 3 — northwood cure le Catalog sans toucher au SQL (UJ-3)

northwood, mainteneur (`isCurator`), veut ajouter des fiches et monter une Collection.

1. Il ouvre le **dropdown compte** (près de Profile / Sign out) — l'entrée `Curate` n'apparaît que parce qu'il est curateur (DL-4) → `/catalog/admin`.
2. **Curator entry form** (structure SongForm) : il saisit titre + artiste ; l'**auto-fill SongBPM** propose BPM/durée **sans écraser** ce qu'il a déjà tapé ; il complète clé/mode/signature (champs intrinsèques, DL-17), enregistre.
3. Il ouvre le **Curator composer** : cherche des fiches, clique `Add` sur chacune (pas de drag, DL-14), nomme la Collection.
4. **Climax** : fiches et Collection sont **immédiatement visibles** de tous les connectés — le rail Collections et la liste Browse les portent sans intervention en base.
5. **Résolution** : le catalogue s'enrichit de façon tenable.

*Edge case (FR-13)* : il tente une fiche dont (titre + artiste) existe déjà au Catalog → création **refusée** : `A "Zombie" by The Cranberries is already in the Catalog.` (unicité canonique globale). Il corrige la fiche existante **en place** plutôt que d'en recréer une.
