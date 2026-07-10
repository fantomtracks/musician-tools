---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Auto-création de la fiche chanson — retirer le bouton "Add" en mode création (cohérence avec l''auto-save 13.1)'
session_goals: 'Cadrer design-avant-code : déclencheur de création, anti-chanson-vide, transition add→edit'
selected_approach: 'ai-recommended'
techniques_used: ['First Principles Thinking', 'Reverse Brainstorming']
ideas_generated: 14
context_file: ''
session_active: false
workflow_completed: true
---

# Brainstorming Session Results

**Facilitator:** northwood
**Date:** 2026-07-10

## Session Overview

**Topic:** Auto-création de la fiche chanson — retirer le bouton « Add » en mode création, pour une cohérence totale avec l'édition (auto-save 13.1, édition-only aujourd'hui).

**Goals:** Cadrer le design AVANT de coder (mirror du brainstorm auto-save 13.1). Verrouiller : (a) le déclencheur de création (titre non vide ? autre champ requis ?) ; (b) l'anti-chanson-vide (ne rien créer si on quitte sans rien taper) ; (c) la transition `add → edit` (récupérer l'UID créé, l'auto-save 13.1 prend le relais, MAJ URL/state).

### Context Guidance

- L'auto-save (Epic 13 / story 13.1) est **édition-only** : débounce + flush au blur, `lastPlayed` exclu, statut « Saving/Saved », sticky Back.
- La **création** garde un bouton `Add` explicite (`SongForm.tsx` bas de form, mode `add` = submit qui crée la chanson).
- ⚠️ Retirer `Add` tel quel **casse la création** (plus aucune soumission) → il faut étendre l'auto-save/auto-création au mode `add`.
- Fichiers : `src/components/SongForm.tsx` (bas de form, mode `add`), `src/pages/Songs.tsx` (flux create / onSubmit).

### Session Setup

**Approche :** Techniques recommandées par l'IA (option 2).

**Séquence retenue (3 phases) :**
- **Phase 1 — `First Principles Thinking`** : casser l'hypothèse « une chanson existe au clic sur Add » → définir le seuil de création (nœud a).
- **Phase 2 — `Reverse Brainstorming`** : « comment saboter l'auto-création ? » → faire remonter l'anti-chanson-vide (b) et les modes d'échec add→edit (c).
- **Phase 3 — `Role Playing`** : rejouer les parcours réels (rature, mis-click, abandon, retour) → décisions de design finales prêtes à devenir des ACs.

## Idées générées

### Phase 1 — First Principles Thinking (nœuds a + b)

**[Fondation #1] : Le titre EST l'identité**
_Concept_ : Une chanson existe dès qu'elle a un titre non vide. L'artiste est **facultatif** — cas réel jazz : on connaît le standard (« Autumn Leaves ») sans forcément l'auteur/interprète.
_Novelty_ : Renverse le formulaire à plat actuel ; le titre devient le **pivot unique**, tout le reste optionnel et différable.

**[Fondation #2] : Pas de titre = pas de chanson, mais suppression jamais silencieuse (par défaut)**
_Concept_ : Effacer le titre fait disparaître la chanson ; on prévient au lieu de détruire en douce (« ⚠️ ta chanson n'a plus de titre — Supprimer / Continuer »).
_Novelty_ : Le titre est un **invariant permanent** (pas juste requis à la création), et la popup transforme une règle destructrice en garde-fou.

**[Fondation #3] : Deux régimes selon l'enjeu**
_Concept_ : Titre vidé sur brouillon frais sans rien → nettoyage **silencieux** ; titre vidé sur chanson à valeur → **popup**. Friction proportionnelle à ce qu'il y a à perdre.
_Novelty_ : « Titre requis » devient un **curseur de risque**, pas une validation binaire.

**[Fondation #4] : « Frais » = titre seul, rien d'autre (Seuil 1, décision northwood)**
_Concept_ : Silence **uniquement** si la chanson n'a rien d'autre que le titre effacé. Dès qu'un seul autre champ est rempli (artiste, album, tuning, tempo, genre, langue…) OU qu'il y a pratique/playlist → popup.
_Novelty_ : Règle ultra-simple à évaluer (« vide à part ce titre ? ») → facile à coder et à expliquer. Prudence max.

**[Fondation #5] : Création au débounce (calque 13.1)**
_Concept_ : La chanson naît sur une **pause de frappe** (~800ms), pas au premier caractère. Une seule logique mentale que l'auto-save édition.
_Novelty_ : Le débounce **neutralise le brouillon-éclair** (titre tapé puis effacé en <1s = jamais créé) → le nœud (b) tombe presque gratuitement.

**[Transition #6] : Popup à la navigation seulement, « Continuer » événementiel (décision northwood)**
_Concept_ : La popup « titre vide » (régime B) ne se déclenche qu'à la **sortie de la fiche** (navigation / autre chanson / autre page) — pas sur un changement de champ interne (titre vide = état transitoire toléré). « Continuer à éditer » ferme la popup et re-vérifie **au prochain essai de sortie** (événementiel, aucun minuteur).
_Novelty_ : Zéro nag pendant la correction, garde-fou dur au seul moment qui compte.

### Phase 2 — Reverse Brainstorming (nœud c : transition add → edit)

**[Robustesse #A] : Verrou in-flight (parade au sabotage « double-création par la latence »)**
_Concept_ : Tant qu'un CREATE est en vol (réseau lent), on ne tire pas un 2ᵉ CREATE au débounce suivant — on **empile** la frappe et on la rejoue en UPDATE une fois l'UID connu. Miroir de `savingRef` / `creatingPlaylistRef` (10.2/13.1).
_Novelty_ : Neutralise la famille de bug qui a mordu en 10.2 et 13.1.

**[Robustesse #B] : Clé de doublon = (titre + artiste)**
_Concept_ : Alerte doublon seulement si titre ET artiste collident (deux sans-artiste = doublon ; même titre + artistes différents = deux entrées légitimes). Découle de Fondation #1.
_Novelty_ : L'identité, c'est la **paire**, pas le titre seul.

**[Robustesse #C] : Échec CREATE = pas de perte, retry au prochain débounce**
_Concept_ : Si le CREATE échoue (réseau/500), la donnée vit côté client, statut « Not saved — retrying », le prochain débounce réessaie. On ne tape jamais dans le vide.

**[Robustesse #D] : Quitter en plein CREATE = la chanson naît quand même**
_Concept_ : La requête est partie → le serveur crée. Cohérent « pas de bouton, tout persiste » (quitter = garder). Pas d'annulation d'un CREATE en vol.

**[Transition #7] : Point d'entrée inchangé, seul le commit disparaît + bascule invisible**
_Concept_ : Le « Add song » de la songlist reste (il ouvre un form vierge). On retire le **bouton de validation interne**. À la naissance : pastille « Saved » + URL/state basculent en douce vers l'édition, **zéro rechargement**.
_Novelty_ : Un seul geste explicite conservé, tout le reste automatique.

**[Transition #8] : Blocage doublon SYMÉTRIQUE (création ET édition) — révise 13.1**
_Concept_ : Sur collision exacte (titre + artiste), **aucune persistance** — ni création, ni update. Bannière « pas sauvé — existe déjà », débloqué dès qu'on différencie. Invariant : bloquer = refuser d'écrire, **jamais** supprimer/corrompre ; la chanson garde sa dernière valeur valide.
_Novelty_ : Une seule règle doublon dans toute l'app. **Divergence assumée vs 13.1** (qui « prévenait mais sauvait ») — northwood a choisi de durcir aussi l'édition.

**[Transition #9] : Doublon = blocage total tant que non résolu (y compris legacy)**
_Concept_ : Sur collision, rien ne se persiste quel que soit le champ touché — éditer le tuning d'un doublon legacy est bloqué tant qu'on n'a pas différencié. L'app **force la résolution**. Garde-fou : on peut toujours quitter (titre non vide → pas de popup) ; le blocage n'enferme pas dans la page.
_Novelty_ : Nettoyage **organique** des doublons Epic 16.

**[Transition #10] : Garde serveur = doublon impossible en base**
_Concept_ : Index unique sur `(user_uid, lower(title), COALESCE(lower(artist), ''))` + 409 (mirror 10.1/7.12). Le `COALESCE('')` gère le NULL artiste (deux sans-artiste collident). Casse-insensible recommandé (à confirmer), accents laissés de côté. Ferme la course multi-appareils (aujourd'hui 🧊) pour les chansons.
_Novelty_ : Anti-doublon **garanti** (structurel), plus seulement cosmétique.
_⚠️ Prérequis migration_ : on ne peut poser un index unique que si la base n'a plus de doublon exact. 16.1 ayant trimmé, des doublons EXACTS peuvent subsister → **rouvre le merge FK** (réassigner SongPlays + liens playlists du doublon → gardé, puis supprimer) que 16.1 avait esquivé. Reco : **interroger la prod d'abord** (combien de doublons exacts post-16.1 ?) puis merge ciblé plutôt qu'un moteur générique.


---

## Synthèse — Design & découpage stories

### Thèmes

**Thème 1 — Identité & cycle de vie de la chanson**
Le titre EST l'identité (#1), invariant permanent (#2), la chanson naît au débounce (#5). L'artiste est facultatif mais discriminant.

**Thème 2 — Titre vidé : garde-fous proportionnels**
Deux régimes (#3) selon Seuil 1 (#4) : brouillon frais sans rien → nettoyage silencieux ; chanson à valeur → popup. Popup uniquement à la navigation, « Continuer » événementiel (#6).

**Thème 3 — Transition add→edit robuste**
Verrou in-flight anti-double-création (#A), échec CREATE = retry sans perte (#C), quitter en vol = garder (#D), point d'entrée « Add song » inchangé + bascule invisible (#7).

**Thème 4 — Politique doublon (client + serveur)**
Clé (titre + artiste) (#B). Blocage symétrique création ET édition (#8, révise 13.1). Forcer la résolution y compris legacy (#9). Garde serveur = index unique + 409, doublon impossible en base (#10).

### Décisions verrouillées (prêtes à devenir des ACs)

1. **Déclencheur** : titre non vide (trimmé) ; création au **débounce** (~800ms, calque 13.1).
2. **Anti-vide** : pas de titre → jamais de chanson. Titre effacé → **silencieux** si la chanson n'a rien d'autre (Seuil 1), sinon **popup « Supprimer / Continuer »**.
3. **Popup** : déclenchée à la **navigation/sortie** seulement (pas au changement de champ) ; « Continuer » re-vérifie au prochain essai de sortie (événementiel).
4. **Bascule add→edit** : invisible — pastille « Saved », URL/state en douce, zéro rechargement. **Verrou in-flight** obligatoire.
5. **Échec réseau** : « Not saved — retrying », retry au débounce suivant, aucune perte.
6. **Quitter en vol** : la chanson naît quand même (quitter = garder).
7. **Point d'entrée** : « Add song » de la songlist conservé ; seul le **bouton de validation interne** disparaît.
8. **Doublon** : clé **(titre + artiste)**, casse-insensible (à confirmer). **Blocage symétrique** création + édition ; **forcer la résolution** (bloque tout tant que non résolu). **Garde serveur** : index unique `(user_uid, lower(title), COALESCE(lower(artist), ''))` + 409.

### Découpage proposé (mirror Epic 10 / Epic 16 : back d'abord, puis front)

- **Story 1 — Back : unicité chanson serveur (prérequis)**
  Interroger la prod (compter les doublons exacts post-16.1) → dédup + **merge FK ciblé** (réassigner SongPlays + liens playlists du doublon → gardé, supprimer) → **index unique** `(user_uid, lower(title), COALESCE(lower(artist), ''))` → **409** + erreur typée. Mirror 10.1.

- **Story 2 — Front : auto-création + cohérence édition**
  Retirer le bouton Add interne → **auto-création au débounce** + verrou in-flight + bascule add→edit invisible (UID/URL/state) → **popup titre-vide** (régimes Seuil 1) → **blocage doublon symétrique** (durcit 13.1 : bloquer au lieu d'avertir) + statut « Not saved — retrying ». Mirror 13.1.

### Notes de périmètre (à ne pas cacher)

- ⚠️ **Revisite 13.1 (shippée)** : la politique doublon passe de « prévient mais sauve » à « bloque » **aussi en édition**. AC dédiée à prévoir. Mettre à jour la décision du 30/06 dans deferred-work.
- ⚠️ **Merge FK rouvert** : 16.1 l'avait volontairement esquivé. Le garde serveur l'impose pour les doublons exacts résiduels. Interroger la prod avant de dimensionner.
- ❓ **À confirmer** : casse-insensible pour la clé doublon (recommandé, cohérent 7.12/10.1) ; accents laissés de côté.
- 🔒 **Ferme un item 🧊** : la course find-or-create pour les chansons devient couverte côté serveur.

### Prochaine étape BMad

`bmad-create-epics-and-stories` (fenêtre fraîche) — cadrer l'epic « Auto-création fiche chanson + unicité serveur » et ses 2 stories à partir de cette synthèse. Ensuite cycle create-story → dev-story → code-review.
