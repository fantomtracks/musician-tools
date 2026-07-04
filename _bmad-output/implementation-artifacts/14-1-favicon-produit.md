---
baseline_commit: 08226d1446a3fa5f55d27522aea8c70447e4cef0
---

# Story 14.1: Favicon produit

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visiteur,
I want voir une icône propre au produit dans l'onglet du navigateur,
so that l'app n'affiche plus le favicon Vite par défaut et paraît finie.

## Acceptance Criteria

1. **Given** l'app chargée dans un navigateur **Then** le favicon affiché dans l'onglet est une icône propre au produit (remplace le `vite.svg` par défaut), déclarée dans `index.html` (racine du repo).
2. **Given** l'asset favicon **Then** il est dans un/des format(s) raisonnable(s) : SVG (recommandé, cohérent avec le `type="image/svg+xml"` actuel) **ou** PNG 32×32 / 180×180 ; l'asset vit dans `public/` (pour être copié tel quel au build Vite).
3. **Given** l'ancien asset `vite.svg` **Then** plus aucune référence ne pointe vers lui (pas de 404 sur l'ancien asset) ; `public/vite.svg` est supprimé **ou** conservé mais alors plus référencé nulle part.
4. **Given** un build de prod (`both.Dockerfile` → `backend/public/`) **Then** le favicon est bien servi (asset présent dans le build, chemin absolu `/<fichier>` correct derrière le SPA fallback).
5. **And** quick-win : **aucune dépendance npm** ajoutée ; **aucun impact fonctionnel** ; les deux suites de tests (front + back) restent vertes.

## Tasks / Subtasks

- [x] **Task 1 — Ajouter l'asset favicon produit** (AC: #1, #2)
  - [x] Créer l'icône produit dans `public/` (`public/favicon.svg`). SVG retenu : un seul fichier, net à toutes les tailles, cohérent avec la déclaration `type="image/svg+xml"` déjà en place. Glyph = **réplique du logo du site** (Header `Header.tsx:105`, HomePage `App.tsx:35`) : carré arrondi en dégradé `brand-500 (#4f6cff) → purple-600 (#9333ea)` avec une **croche (♪) blanche**. La note est **dessinée en vecteur** (pas le caractère `♪`) → aucune dépendance de police, rendu identique partout.
  - [x] (Optionnel PNG) non retenu : SVG unique suffit, aucun apple-touch-icon ajouté (V1 sobre).
- [x] **Task 2 — Déclarer le favicon dans `index.html`** (AC: #1, #3, #4)
  - [x] Remplacé `href="/vite.svg"` par `href="/favicon.svg"` (index.html:5), chemin absolu conservé.
  - [x] (apple-touch-icon) non ajouté — hors périmètre V1.
- [x] **Task 3 — Retirer l'ancien asset** (AC: #3)
  - [x] `git rm public/vite.svg` ; grep confirmé : plus aucune référence à `vite.svg` dans le code.
- [x] **Task 4 — Vérifier build + suites** (AC: #4, #5)
  - [x] `npm run build` (Vite) OK ; `favicon.svg` présent à la racine de `dist/`, `dist/index.html` référence `/favicon.svg`, aucun `vite.svg` résiduel.
  - [x] `npm test` (front) : 34 suites / 311 tests verts ; `cd backend && npm test` : 19 suites / 253 tests verts.
  - [x] Vérif visuelle : rendu rasterisé du SVG contrôlé (16/32/48/64/96px + onglets clair/sombre) ; aucune référence `/vite.svg` restante (pas de 404).

### Review Findings

_Code review 2026-07-04 — 3 couches parallèles (Blind Hunter ∥ Edge Case Hunter ∥ Acceptance Auditor). Auditor : 5/5 ACs ✓, réplication du logo vérifiée vs `tailwind.config.ts`._

- [x] [Review][Patch] Nouvel asset `public/favicon.svg` non suivi par git — un commit sans `git add` explicite livrerait `index.html` pointant sur un `/favicon.svg` absent du repo → 404 sur tout build clean-clone (CI, `both.Dockerfile`, prod), en violation de l'AC3. Le build local masque le problème (Docker copie le fichier non suivi). **Résolu 2026-07-04** : `git add public/favicon.svg` (+ `index.html`, `vite.svg` déjà staged) → les 3 fichiers du changement sont staged atomiquement. [public/favicon.svg]
- [x] [Review][Defer] Favicon SVG-only, sans fallback raster/apple-touch-icon [index.html:5] — deferred, pré-existant (`vite.svg` était déjà SVG-only ; AC2 autorise explicitement le SVG seul ; pas de manifest/PWA dans le repo). Enhancement futur si besoin iOS/vieux Safari.

## Dev Notes

### Fichier à modifier (UPDATE) — `index.html` (racine du repo)

État actuel complet :

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Musician Tools</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- **Seule** la ligne 5 change (le `<link rel="icon">`). Ne pas toucher `<title>Musician Tools</title>` (déjà correct), ni la structure, ni `lang="en"`.
- Le `href` doit rester un **chemin absolu** (`/favicon.svg`) : le SPA est servi en prod avec un fallback `*` → `index.html`, un chemin relatif casserait la résolution sur les routes profondes.

### Mécanique des assets statiques (Vite 7 + prod Fly)

- **`public/` est le dossier d'assets statiques Vite** : tout ce qui s'y trouve est copié **tel quel** à la racine du build (donc `public/favicon.svg` → servi à `/favicon.svg`). C'est là que doit vivre le nouvel asset — **pas** dans `src/assets/` (celui-là passe par le bundler et gagne un hash, inutilisable pour un favicon référencé en dur).
- Chaîne de build prod : `both.Dockerfile` (multi-stage) build Vite → sortie copiée dans `backend/public/` → Express sert le SPA. Un asset dans `public/` traverse donc bien toute la chaîne jusqu'à la prod.
- `src/assets/react.svg` existe mais est **hors sujet** (asset de démo React, non référencé par le favicon) — ne pas y toucher.

### Portée et non-régression

- **Zéro impact fonctionnel** : aucune logique applicative, aucun composant React, aucun service touché. Purement `index.html` + assets `public/`.
- **Aucune dépendance npm** (règle projet : quick-win sans dep ; et `node-fetch`/`body-parser` déjà proscrits — ici on n'ajoute rien du tout).
- `index.html` n'est couvert par **aucun test** (jsdom monte les composants React, pas le HTML d'entrée) — donc pas de test à écrire, mais les deux suites doivent rester vertes (le hook husky pre-commit lance front puis back, jamais `--no-verify`).

### Conventions projet applicables

- **Langue** : tout en anglais (nom de fichier d'asset, éventuel commentaire). `Musician Tools` reste le titre.
- **Dark mode** : sans objet pour un favicon (le navigateur gère l'onglet) ; ne pas surinvestir. Un SVG peut porter un `<style>` avec `prefers-color-scheme` si on veut une variante sombre, mais c'est optionnel et hors AC.
- **Commit** : Conventional Commits — ex. `feat(app): product favicon replacing default vite.svg`. Branche de feature (`feat/...`), jamais de travail direct sur `main` (tout merge sur `main` = déploiement prod).

### Testing standards summary

- Pas de test unitaire pour cette story (rien de testable en jsdom sur `index.html`). Validation = **build Vite OK + vérif visuelle de l'onglet + absence de 404 `/vite.svg`** dans l'onglet réseau.
- Ne pas mélanger les deux suites Jest ; ne rien ajouter côté backend.

### Project Structure Notes

- `index.html` vit à la **racine du repo** (le frontend n'est pas dans un sous-dossier `frontend/` — l'app Vite est au root, le backend dans `backend/`).
- Assets favicon → `public/` (root). Convention Vite standard, aucune déviation.
- Aucun conflit de structure détecté.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 14 — Story 14.1: Favicon produit]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-musician-tools-2026-07-04/.decision-log.md] — favicon explicitement « quick-win, **hors UX** » : aucun cadrage design imposé, l'icône est au choix.
- [Source: _bmad-output/project-context.md#Technology Stack] — Vite 7, `both.Dockerfile` copie le build Vite dans `backend/public/`, Express sert le SPA (fallback `*` → index.html).
- [Source: _bmad-output/project-context.md#Development Workflow Rules] — pas de dep superflue ; anglais partout ; branche de feature ; suites vertes (pre-commit husky).
- [Source: index.html:5] — ligne `<link rel="icon">` à remplacer.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `npm run build` → build Vite OK ; `dist/favicon.svg` présent, `dist/index.html` → `/favicon.svg`, `dist/vite.svg` absent.
- `npm test` (front) → Test Suites: 34 passed ; Tests: 311 passed.
- `cd backend && npm test` → Test Suites: 19 passed ; Tests: 253 passed.

### Completion Notes List

- Favicon produit livré : `public/favicon.svg` = **réplique du logo du site** — carré arrondi (`rx=8`) en dégradé diagonal `brand-500 (#4f6cff) → purple-600 (#9333ea)` avec une croche blanche, viewBox 32×32. Cohérent avec le logo affiché dans le Header/menu (`Header.tsx:105`) et sur la HomePage (`App.tsx:35`), qui utilisent `bg-gradient-to-br from-brand-500 to-purple-600` + `♪`. Note dessinée en vecteur (tête d'ellipse inclinée + hampe + hampe-drapeau) pour être indépendante de la police. Le carré en dégradé porte son propre fond → lisible sur onglet clair comme sombre, pas de variante dark-mode nécessaire (AC dark = sans objet). Validé visuellement (16/32/48/64/96px + onglets clair/sombre).
- `index.html:5` : `href="/vite.svg"` → `href="/favicon.svg"` ; `type="image/svg+xml"` inchangé, chemin absolu conservé (compatible fallback SPA `*`).
- `public/vite.svg` supprimé (`git rm`) ; grep exhaustif : aucune référence résiduelle → pas de 404.
- Zéro dépendance npm ajoutée ; aucun impact fonctionnel (aucun composant/service/route touché) ; les deux suites restent vertes.
- Asset dans `public/` (copié tel quel par Vite) → traverse `both.Dockerfile` jusqu'à `backend/public/` en prod ; confirmé par la présence dans `dist/`.

### File List

- `public/favicon.svg` (new)
- `index.html` (modified)
- `public/vite.svg` (deleted)

## Change Log

- 2026-07-04 — Story 14.1 implémentée : favicon produit (`public/favicon.svg`) répliquant le logo du site — carré arrondi dégradé `brand-500 → purple-600` + croche blanche vectorielle — remplaçant `vite.svg` ; déclaration mise à jour dans `index.html` ; ancien asset supprimé. Build Vite + suites front (311) et back (253) vertes. Aucune dépendance, aucun impact fonctionnel.
