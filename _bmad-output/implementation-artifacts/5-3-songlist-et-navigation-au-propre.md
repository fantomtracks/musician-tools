---
baseline_commit: 1d28415
---

# Story 5.3: Songlist & navigation au propre

Status: done

## Contexte

Polish UI hors PRD (UI existante ; **CM2** : ne pas dégrader l'usage répertoire). Formalisé 2026-06-10 (Correct Course), committé `8dc2f06`.

## Story

As a utilisateur du répertoire,
I want une Songlist et une navigation plus directes et cohérentes,
so that j'ouvre une chanson d'un clic et je m'y retrouve dans le menu.

## Acceptance Criteria

1. Cliquer sur une **ligne** de la Songlist ouvre le formulaire d'édition de la chanson ; la sélection (cases) est réservée à la **checkbox** (qui stoppe la propagation).
2. La colonne **« Actions »** (bouton Edit) est retirée — le clic-ligne la remplace.
3. Le menu de navigation est : **Songlist · Heatmap · Sessions · Playlists · Topics · Instruments** (Instruments en dernier).
4. Le terme est harmonisé en **« Songlist »** : libellé du menu, titre de page, et bouton retour.
5. L'éditeur de chanson a un bouton **« ← Songlist »** qui réinitialise le formulaire et revient à la liste.
6. La colonne **« Last played »** est réduite au contenu, alignée à droite, avec une marge à droite équivalente à la marge gauche (checkbox).

## Tasks / Subtasks

- [x] `SongsList` : clic-ligne → `onEdit` ; suppression de la colonne Actions
- [x] `Header` : réordonnancement + renommage « Songlist »
- [x] `Songs` : bouton retour « ← Songlist » ; `SongsList` : titre « Songlist »
- [x] Last played : `w-px` + `text-right` + `pr-4`
- [x] **Committer le lot** (`8dc2f06`) → story `done`

## Dev Notes

Aucune régression (178 tests verts). ⚠️ La dette « **nav mobile cassée** » (deferred-work, `hidden md:flex` sans hamburger) reste ouverte — réordonner le menu desktop ne la résout pas (NFR3).
