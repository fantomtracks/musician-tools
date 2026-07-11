---
baseline_commit: fb34be3
arch_decision: "Auto-création de la fiche chanson au débounce (calque 13.1, MÊME machinerie auto-save qui vit dans Songs.tsx), bascule add→edit invisible (editingUid null→uid, zéro rechargement), verrou in-flight anti-double-création (mirror savingRef). Politique doublon UNIQUE symétrique création+édition : garde client (findDuplicateSong déjà en place) + backstop serveur 409 typé (SongConflictError, mirror PlaylistConflictError) = BLOCAGE TOTAL (aucune persistance), durcit 13.1 (qui « prévenait mais sauvait le reste »). Anti-chanson-vide par Seuil 1 : chanson fraîche au titre vidé → DELETE silencieux ; chanson à valeur → popup ConfirmDialog. Décisions northwood 2026-07-10 : (1) blocage de navigation GLOBAL (toutes les sorties, pas seulement Back) → guard app-wide + beforeunload ; (2) DELETE serveur silencieux des chansons fraîches. Débounce = 1200ms (vrai calque 13.1, pas 800). Prérequis 17.1 (409 serveur) DÉJÀ EN PROD (v1.12.0)."
---

# Story 17.2: Auto-création front (sans bouton) + blocage doublon symétrique

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui ajoute une chanson,
I want que ma chanson se crée toute seule dès que je lui donne un titre, sans bouton à cliquer,
so that la création soit aussi fluide que l'édition (auto-save 13.1) et que je ne perde jamais de saisie ni ne crée de chanson vide par accident.

## Contexte & pourquoi

Point d'arrivée de l'Epic 17. La **garde serveur (17.1)** est **déjà en prod (v1.12.0)** : `POST/PUT /api/songs` renvoie un **409 `{ error: 'duplicate_song', message, song }`** sur collision `(titre, artiste)` casse-insensible. Cette story fait la moitié front :

1. **Retirer le bouton `Add`** interne du form et **auto-créer au débounce** (calque exact de l'auto-save 13.1), avec une **bascule add→edit invisible**.
2. Poser la **politique doublon unique** de toute l'app : blocage symétrique création **et** édition, adossé au 409 serveur.
3. Anti-chanson-vide : régimes Seuil 1 (fraîche → suppression silencieuse ; à valeur → popup).

**⚠️ Ce que 17.2 révise dans 13.1 (shippée) :** aujourd'hui, sur un doublon en **édition**, l'auto-save « gèle » l'identité (retire `title`/`artist` du payload) mais **sauve le reste** (`Songs.tsx` `frozen`). 17.2 durcit : sur collision, **aucune persistance** (bannière « not saved — already exists »), jusqu'à différenciation. Une seule règle doublon dans l'app.

**Périmètre :** front uniquement. **Aucun changement backend** (17.1 a tout posé). Mais **plus large que 17.1** : le blocage de navigation global (décision northwood) touche la **nav app-wide** (`Header`, `App`) en plus de `Songs.tsx`/`SongForm.tsx`/`songService.ts`.

## Décisions verrouillées (brainstorm 2026-07-10 + arbitrages northwood 2026-07-10)

1. **Débounce = 1200 ms** — **vrai calque 13.1** (le brainstorm disait « ~800ms » par approximation ; on s'aligne sur la valeur réelle de l'auto-save existant pour une seule logique mentale).
2. **Bascule add→edit invisible** — après le CREATE, `editingUid: null → newSong.uid`, `editBaselineJson` seedé, la chanson injectée en tête de `songs`, `page` reste `'form'`, pastille « Saved », **zéro rechargement**. Les frappes suivantes passent par l'auto-save 13.1 existant (désormais `editingUid` est set).
3. **Verrou in-flight obligatoire** — un CREATE en vol bloque un 2ᵉ CREATE (mirror `savingRef`) ; les frappes pendant le vol sont rejouées en UPDATE une fois l'UID connu. **10.2 avait sciemment omis ce verrou** (`creatingPlaylistRef` non implémenté, deferred) — ici il est **obligatoire**.
4. **Blocage doublon = TOTAL et symétrique** (durcit 13.1) — garde client `findDuplicateSong` (déjà en place) en 1re ligne + **backstop 409 serveur** ; sur collision, **rien n'est persisté** (ni create ni update, identité **et** autres champs), bannière « not saved — already exists », débloqué dès qu'on différencie titre ou artiste. Ne PAS revenir au « freeze » de 13.1.
5. **Anti-vide par Seuil 1** — pas de titre non-vide ⇒ jamais de chanson. Chanson auto-créée puis titre vidé : **fraîche** (rien d'autre que le titre : form == `initialSong` sauf titre, `lastPlayed` nul, aucune appartenance playlist) → **DELETE serveur silencieux** (décision northwood) ; **à valeur** → **popup `ConfirmDialog`** « ⚠️ your song has no title anymore — Delete / Continue editing ».
6. **Blocage de navigation GLOBAL** (décision northwood) — la popup titre-vide (régime « à valeur ») s'affiche sur **TOUTES** les sorties, pas seulement le bouton Back. ⚠️ L'app n'a **aucun blocage de nav** aujourd'hui (`<BrowserRouter>` composant, pas de data-router → `useBlocker` indisponible ; le form est un `page:'form'` local, pas une route). Il faut donc un **guard app-wide maison** (contexte partagé consulté par toutes les sorties in-app) + `beforeunload` pour l'unload navigateur (prompt natif). **Scope/risque assumé** : touche `Header.tsx` + `App.tsx` (nav de toute l'app, chemin sensible car déploie prod).

## Carte du code (état actuel — lu intégralement via exploration)

### `src/pages/Songs.tsx` — TOUTE la persistance + l'auto-save 13.1 vivent ici
- **Discriminant de mode** : `editingUid: string | null` (`:47`) — `null` = **add**, non-null = **edit**. Passé au form : `mode={editingUid ? 'edit' : 'add'}` (`:1860`).
- **Auto-save 13.1** (noms exacts) : `savingRef` (`:818`, verrou in-flight), `saveTimerRef` (`:819`, timer débounce), `autoSaveSong()` (`:821-871`, **early-return si `editingUid === null` `:822` ou `savingRef.current` `:823`**), `autoSaveRef` (`:874`), `flushAutoSave()` (`:889-895`), `flushOnUnmountRef` (`:899`), `backToList()` (`:904-917`), state `saveStatus`/`lastSavedAt` (`:52/54`), `editBaselineJson` (`:50`, snapshot `JSON.stringify(form)` = « dernier sauvé »).
- **Effet débounce** (`:878-884`, deps `[form, editingUid, editBaselineJson]`) : early-return si `editingUid === null` (`:879`) ou form == baseline (`:880`) ; sinon `setTimeout(() => autoSaveRef.current(), 1200)`.
- **`autoSaveSong`** : bâtit le payload UPDATE, `delete payload.lastPlayed` (`:835`, **exclusion serveur-managed — HIGH de 13.1**) ; branche `frozen = !!liveDuplicate` → `delete payload.title/artist` (`:836-841`, **c'est ce qu'on durcit**) ; `setSaveStatus('saving')`, `updateSong`, `setSongs(map-replace)` (`:848`), `setEditBaselineJson(snapshot)`, plancher 500ms « Saving… » (`:853-854`), `finally savingRef=false` (`:869`).
- **Création actuelle** = `handleSubmit` branche create (`:1289-1346`) : edit → `flushAutoSave()` puis return (`:1294-1297`) ; create → normalise payload, **guard `liveDuplicate`** `setError('This song already exists…')` (`:1314-1318`), `createSong` (`:1320`), ajoute la chanson aux playlists sélectionnées (`:1323-1331`), `setForm(initialSong); setPage('list')` (`:1336-1339`).
- **Entrée « Add song »** = `onAddNew` (`:1805-1811`) : `setForm(initialSong); setEditingUid(null); setPage('form')`. (Ne set PAS `editBaselineJson`.)
- **Transition edit template** = `openSongForEdit` (`:1233-1253`) : set `editingUid`, `setForm(builtForm)`, **`setEditBaselineJson(JSON.stringify(builtForm))`** (`:1246`) — le modèle à mirrorer pour la bascule post-create.
- **Doublon client** = `liveDuplicate` useMemo (`:1278-1287`, `findDuplicateSong(songs, {title, artist}, editingUid)` de `src/utils/songDuplicate.ts` — NFC+lower+trim, accents distincts, match titre **et** artiste). Pilote la bannière (`SongForm duplicate` prop `:1877`), le guard create (`:1314`) et le freeze (`:836`).
- **Pastille statut** = sticky Back bar (`:1822-1849`), gate `{editingUid && (...)}` (`:1830`) — **à montrer aussi en add**. Heading `{editingUid ? 'Edit song' : 'Add song'}` (`:1852`).
- **Reload liste** : retour `page==='list'` déclenche l'effet `[page]` (`:578-609`) qui re-fetch songs/playlists/plays.
- **Reseed playlists once-per-edit** = `seededPlaylistsForEditRef` (`:727-734`, **fix du HIGH reseed-clobber 10.2**) — à surveiller à la bascule `editingUid: null→uid`.

### `src/components/SongForm.tsx` — présentational, zéro persistance
- `mode: 'add' | 'edit'` (prop, `:13`). **Bouton Add/Cancel** = bloc `{mode === 'add' && (...)}` (`:835-853`, submit `type="submit"` → `onSubmit` du form `:188`). Commentaire `:833-834` : « edit auto-saves … Create keeps explicit Add » = le bloc à **retirer**.
- Tout remonte au parent par callbacks (`onChange`, `onSubmit`, `onCancel`, `onDelete?`, `duplicate?`, `onEditDuplicate?`…). Aucune logique de nav/blur/unmount ici.

### `src/services/songService.ts` — le body du 409 est aujourd'hui JETÉ
- `createSong` (`:58-71`) / `updateSong` (`:74-87`) : `if (!response.ok) throw new Error('Failed to …')` — **aucune branche `status === 409`, body ignoré**. C'est le trou à combler.

### Mirror 409 à suivre = `PlaylistConflictError` (10.2)
- `src/services/playlistService.ts:17-24` : classe typée portant l'entité ; `createPlaylist:61-68` : `if (response.status === 409) { const body = await response.json().catch(()=>({})); throw new PlaylistConflictError(body.playlist); }` **avant** le `!ok` générique. UI : `catch (err) { if (err instanceof PlaylistConflictError) {...} }` (`Songs.tsx:789-810`). (Idem `RateLimitError` 15.1 : détection par `response.status`, jamais le body.)

### Seuil 1 — check « fraîche » 100% client-side
- **Autres champs** : `form` vs `initialSong` (`Songs.tsx:16-35`).
- **Pratique** : `song.lastPlayed` (non-null ⇒ jouée) — déjà sur l'objet, aucun appel ; sinon `songPlayService.getPlays(uid)`.
- **Playlist** : `playlists.some(pl => pl.songUids?.includes(uid))` (playlists déjà en state).

### Navigation — AUCUN blocage aujourd'hui (le point dur du guard global)
- `grep useBlocker|usePrompt|beforeunload` = **0 hit**. `main.tsx:10` = `<BrowserRouter>` (pas `createBrowserRouter`) → `useBlocker` **indisponible** sans refactor router.
- 3 sorties in-app : (1) **Back/Cancel** → `backToList()` (`:904-917`, seule sortie **gateable synchroniquement**) ; (2) **lien header « Songlist »** → `state:{resetToList:true}` (`Header.tsx:8-9`) → effet `Songs.tsx:344-356` ; (3) **route change / unmount** (logo→`/`, profil, logout) → cleanup `useEffect(()=>()=>flushOnUnmountRef.current(),[])` (`:897-901`).

## Acceptance Criteria

**Given** un formulaire de création vierge (mode `add`, `editingUid === null`) (volet **déclencheur & bascule**)
**When** je saisis un titre non vide (trimmé), sans doublon client, et que la frappe se stabilise (**débounce 1200ms**, calque 13.1)
**Then** la chanson est **créée** (`songService.createSong`, champs serveur-managed exclus comme `lastPlayed`) ; la **bascule add→edit est invisible** — `editingUid` passe à `newSong.uid`, `editBaselineJson` seedé (mirror `openSongForEdit`), la chanson injectée en tête de `songs`, `page` **reste** `'form'`, pastille « Saved », **zéro rechargement** ; les frappes suivantes passent par l'auto-save 13.1 existant ; le **bouton `Add` interne a disparu** (`SongForm` bloc `:835-853` retiré) ; l'entrée « Add song » de la songlist (`onAddNew`) est inchangée

**Given** un CREATE déjà en vol (réseau lent) (volet **verrou in-flight**)
**When** un nouveau débounce se déclenche avant la réponse
**Then** on ne tire **pas** un 2ᵉ CREATE (verrou mirror `savingRef` couvrant le POST) ; les frappes faites pendant le vol ne sont pas perdues : une fois l'UID connu (`editingUid` set), le prochain débounce les rejoue en **UPDATE** (l'écart `form` ≠ `editBaselineJson` le déclenche) — **aucune double-création**

**Given** un titre vidé après une auto-création (volet **anti-vide, Seuil 1**)
**When** j'essaie de sortir de la fiche (Back, lien header, changement de route, unload navigateur — **toutes** les sorties, décision « blocage global »)
**Then** si la chanson est **fraîche** (Seuil 1 : `form` == `initialSong` sauf le titre effacé, `lastPlayed` nul, aucune appartenance playlist) → **DELETE serveur silencieux** (`deleteSong`), aucune alerte ; sinon (à valeur) → **popup `ConfirmDialog`** « ⚠️ your song has no title anymore — Delete / Continue editing » : **Delete** → `deleteSong` + sortie ; **Continue** → reste, re-vérifie **au prochain essai de sortie** (événementiel, aucun minuteur) ; la popup ne se déclenche **pas** au simple changement de champ (titre vide = état transitoire toléré) ; un titre vide n'est **jamais** persisté (l'auto-save est suspendu tant que le titre trimmé est vide)

**Given** un CREATE qui échoue (réseau / 500, **hors 409**) (volet **résilience**)
**When** la requête n'aboutit pas
**Then** la donnée **vit côté client**, statut « **Not saved — retrying** », le **prochain débounce réessaie** ; aucune saisie perdue ; **quitter en plein CREATE parti = la chanson naît quand même** (on n'annule pas un CREATE en vol — quitter = garder)

**Given** une saisie qui collisionne avec une chanson existante — **création OU édition** (volet **blocage doublon symétrique**)
**When** la clé `(titre + artiste)` casse-insensible collisionne — détectée soit par la garde client `findDuplicateSong` (1re ligne), soit par le **409 serveur** (backstop liste client périmée)
**Then** **aucune persistance** (ni create ni update, **ni identité ni autres champs** — durcit le « freeze » 13.1) ; le service lève un **`SongConflictError`** typé (portant `song`, mirror `PlaylistConflictError`) sur `response.status === 409` ; bannière « **not saved — already exists** » ; statut « not saved » tant que non différencié ; **débloqué** dès qu'on change titre ou artiste ; invariant : **bloquer = refuser d'écrire, jamais supprimer/corrompre** (la chanson garde sa dernière valeur valide) ; le blocage **n'enferme pas** (titre non vide → pas de popup titre-vide → on peut toujours quitter)

**And** ⚠️ **révise 13.1 (shippée)** : la politique doublon en **édition** passe de « prévient mais sauve le reste » à « **bloque tout** » — AC dédiée ci-dessus, décision du 30/06 à mettre à jour dans `deferred-work.md`. UI/messages **en anglais** ; réutiliser les patterns existants (statut Saving/Saved 13.1, `ConfirmDialog` pour la popup titre-vide, bannières manuelles `setToastMessage`/`setError` — **pas de lib**) ; suite front verte (tests : débounce-create + bascule invisible, verrou in-flight, Seuil 1 delete-silencieux vs popup, blocage 409 en création ET édition, guard de nav global). `[src/components/SongForm.tsx, src/pages/Songs.tsx, src/services/songService.ts, + guard nav app-wide]`

## Tasks / Subtasks

### Task 1 — Service : `SongConflictError` + parsing 409 (create & update) (AC doublon)
- [x] `src/services/songService.ts` — déclarer `export class SongConflictError extends Error { song?: Song; constructor(song?) { super('Song already exists'); this.name = 'SongConflictError'; this.song = song; } }` (mirror `PlaylistConflictError`).
- [x] `createSong` **et** `updateSong` : **avant** le `!response.ok` générique, ajouter `if (response.status === 409) { const body = await response.json().catch(() => ({})); throw new SongConflictError(body.song ?? undefined); }`. (⚠️ mirror 10.2 : 10.2 n'avait mis le 409 que sur `createPlaylist` — ici **les deux** car blocage symétrique.)

### Task 2 — Auto-création au débounce + bascule add→edit invisible + verrou in-flight (AC déclencheur, in-flight, résilience)
- [x] `Songs.tsx` — étendre l'auto-save au mode `add`. Introduire un chemin `autoCreateSong()` (ou brancher `autoSaveSong` sur `editingUid === null`) : déclenché par l'effet débounce (`:878-884`) quand `editingUid === null` **et** `form.title` trimmé non-vide **et** pas de `liveDuplicate` **et** `form` ≠ `initialSong`.
- [x] Verrou in-flight : réutiliser/mirror `savingRef` pour couvrir le POST (bloque un 2ᵉ CREATE tant que le 1er est en vol). Champs serveur-managed exclus du payload (`lastPlayed`).
- [x] Bascule invisible au succès : `setEditingUid(newSong.uid)`, `setEditBaselineJson(JSON.stringify(form))`, `setSongs(prev => [newSong, ...prev])`, `page` reste `'form'`, `setSaveStatus('saved')`, `setLastSavedAt(...)`. **Zéro** `setPage('list')`. Vérifier que la bascule ne déclenche pas le reseed-clobber playlists (`seededPlaylistsForEditRef` `:727-734`).
- [x] Retirer le bouton `Add` : `SongForm.tsx` bloc `{mode === 'add' && (...)}` (`:835-853`). Adapter `handleSubmit` (Enter en add ne doit plus « soumettre-créer » : soit flush, soit no-op — la création vient du débounce).
- [x] Pastille statut visible en add aussi (`:1830` gate) : montrer Saving/Saved/Not-saved dès qu'il y a de quoi sauver en `page==='form'`.
- [x] Résilience : CREATE en échec (hors 409) → `saveStatus='error'` rendu « Not saved — retrying », la donnée reste dans `form`, le prochain débounce réessaie ; `savingRef` relâché en `finally`. Quitter en vol n'annule pas le POST.

### Task 3 — Blocage doublon symétrique (durcit 13.1) (AC doublon)
- [x] `Songs.tsx` `autoSaveSong` : remplacer la branche `frozen` (`:836-841`, qui `delete title/artist` mais sauve le reste) par un **blocage total** — si `liveDuplicate`, **ne rien persister**, `setSaveStatus` → état « not saved — already exists » (bannière), ne pas appeler `updateSong`.
- [x] Catch `SongConflictError` dans **les deux** chemins (auto-create + auto-save update) : pas de persistance, bannière « not saved — already exists », statut « not saved » ; ne pas router vers un 500/toast générique. (Distinguer de `RateLimitError` déjà propagé par `apiFetch`.)
- [x] Garde client `liveDuplicate` = 1re ligne : suspend l'auto-create/‑update tant que le doublon n'est pas différencié ; réutiliser la bannière `SongForm duplicate`/`onEditDuplicate` existante. Débloqué quand titre/artiste changent (l'effet `[form,...]` re-tourne).

### Task 4 — Anti-vide Seuil 1 : DELETE silencieux vs popup (AC anti-vide)
- [x] Suspendre l'auto-save quand `form.title` trimmé est vide (état transitoire, jamais persisté).
- [x] Helper `isFreshSong()` : `form` == `initialSong` (hors titre) **&&** `!song.lastPlayed` **&&** `!playlists.some(pl => pl.songUids?.includes(editingUid))`.
- [x] À la **tentative de sortie** (voir Task 5, toutes les sorties) avec `editingUid` set et titre vide : fraîche → `deleteSong(editingUid)` silencieux + sortie ; à valeur → `ConfirmDialog` (`isOpen/title/message/confirmText:'Delete'/cancelText:'Continue editing'/onConfirm→deleteSong+sortie/onCancel→reste, isDangerous`). « Continue » re-vérifie au prochain essai (événementiel).
- [x] Si aucune chanson n'a jamais été créée (titre jamais non-vide) → rien à nettoyer, sortie libre.

### Task 5 — Guard de navigation GLOBAL (décision northwood) (AC anti-vide, toutes sorties)
- [x] ⚠️ `<BrowserRouter>` → `useBlocker` indisponible. Implémenter un **guard maison app-wide** : un contexte léger (`LeaveGuardContext` ou hook) où `Songs` enregistre un prédicat `attemptLeave(): Promise<boolean>` (résout la popup titre-vide / le delete silencieux, renvoie « ok de partir »). **Toutes** les sorties in-app le consultent :
  - `backToList()` (`:904-917`) — déjà async, gate direct.
  - Lien header « Songlist » (`Header.tsx` → effet `resetToList` `:344-356`) et autres liens header (logo→`/`, profil, logout) — les faire consulter le guard avant de naviguer (via le contexte).
  - Unmount route change (`:897-901`) — dernier filet.
- [x] `beforeunload` (`useEffect` + `window.addEventListener`) pour l'unload navigateur (refresh/fermeture d'onglet) tant qu'un draft titre-vide-à-valeur existe : prompt natif (non-customisable, acceptable).
- [x] ⚠️ **Scope app-wide** : touche `Header.tsx` + éventuellement `App.tsx` (provider du contexte). Ne rien casser de la nav existante (tests `Header.test.tsx`). Chemin sensible (déploie prod).

### Task 6 — Tests front (AC toutes)
- [x] Étendre `src/__tests__/SongsAutoSave.test.tsx` + nouveaux tests : (a) taper un titre en add → débounce → `createSong` appelé une fois + bascule `editingUid` set sans `setPage('list')` ; (b) verrou in-flight : 2 débounces pendant un CREATE lent → un seul POST, puis un UPDATE ; (c) Seuil 1 : titre vidé sur chanson fraîche → `deleteSong` silencieux ; sur chanson à valeur → `ConfirmDialog` ouvert ; (d) doublon : `createSong`/`updateSong` levant `SongConflictError` (409) → pas de persistance + bannière, en **création ET édition** ; (e) résilience : CREATE réseau KO → statut « Not saved — retrying », retry au débounce suivant.
- [x] `Header.test.tsx` : non-régression de la nav + guard consulté.
- [x] `cd .. && npm test` (front) vert ; `npm run lint` propre ; husky vert.

### Task 7 — Doc
- [x] `deferred-work.md` : mettre à jour la **décision 13.1 du 30/06** (« prévient mais sauve » → « bloque », aussi en édition). `CHANGELOG.md` `[Unreleased]` : entrée user-facing (auto-création + plus de doublons).

## Dev Notes

### Pièges hérités des reviews 13.1 / 10.2 (à NE PAS répéter)
- **HIGH 13.1 — `lastPlayed` clobbered** : tout POST/PUT whole-form doit **scrubber les champs serveur-managed** (`delete payload.lastPlayed`). S'applique au nouveau chemin create.
- **Med 13.1 — sorties sans flush** : multiples chemins de sortie, facile d'en oublier un. Le guard global (Task 5) doit couvrir **les 3** + `beforeunload`. C'est exactement la classe de bug qui a mordu 13.1.
- **Med 13.1 — « Saved ✓ » menteur pendant freeze** : ne pas afficher « Saved » quand rien n'est persisté (doublon) → état « not saved — already exists ».
- **Med 13.1 — cancel-lock partagé** : `savingRef` + timer en ref pour éviter les POST/PUT concurrents/désordonnés. Étendre au create.
- **Med 13.1 — Back pendant un save échoué** : `flushAutoSave` renvoie un booléen ; toast si échec ; ne pas perdre en silence.
- **HIGH 10.2 — reseed-clobber** : `seededPlaylistsForEditRef` seede une fois par session d'édition (`:727-734`). La bascule `editingUid: null→uid` **rouvre** ce risque → vérifier que la sélection playlist n'est pas re-clobbée à la bascule.
- **Trap 10.2 — pas de verrou create** : `creatingPlaylistRef` avait été **omis** (deferred) → double-submit possible. Ici le verrou in-flight est **obligatoire** (AC).

### Conventions (project-context.md)
- **`import type`** obligatoire (verbatimModuleSyntax) ; pas de variable morte (`noUnusedLocals`) ; imports relatifs.
- Services front : `xxxService` + `fetch`/`apiFetch`, `credentials:'include'`, erreurs typées par `response.status` (jamais le body pour le routage) — mirror `PlaylistConflictError`/`RateLimitError`.
- Tailwind only, couleurs thème, `dark:` sur chaque élément ; toasts = pattern manuel `setToastMessage`+`setTimeout(2500)`, pas de lib ; confirmations = `ConfirmDialog`.
- localStorage lazy-init pour la persistance UI (si un flag est ajouté). Tout **en anglais** (UI + commentaires).

### Garde-fous workflow
- **Jamais sur `main`** : branche `feat/epic-17-auto-create-song` (ré-ouvrable — 17.1 y était) ou nouvelle `feat/epic-17-2-...`. Merge main = **prod** ; northwood merge à la main.
- Hook pre-commit lance front + back — **jamais `--no-verify`**. Commits Conventional (`feat(songs): ...`).
- 17.1 (409 serveur) est **déjà en prod** → le backstop 409 est réellement testable en bout de chaîne.

### Project Structure Notes
- **EDIT** : `src/services/songService.ts` (SongConflictError + 409), `src/pages/Songs.tsx` (auto-create + in-flight + bascule + blocage doublon + Seuil 1 + guard), `src/components/SongForm.tsx` (retrait bouton Add), `src/components/Header.tsx` (consulte le guard), possiblement `src/App.tsx` (provider guard).
- **NEW (probable)** : un `src/contexts/LeaveGuardContext.tsx` (ou hook `useLeaveGuard`) pour le blocage global.
- **Tests** : `src/__tests__/SongsAutoSave.test.tsx` (étendu) + nouveaux ; `Header.test.tsx` (non-régression).
- **Pas de backend, pas de migration, pas de dépendance npm.**

### References
- [Source: _bmad-output/implementation-artifacts/13-1-autosave-fiche-chanson.md] — machinerie auto-save à étendre + pièges review (HIGH lastPlayed, Med multi-sorties, cancel-lock)
- [Source: _bmad-output/implementation-artifacts/10-2-creer-playlist-a-la-volee.md] — mirror `PlaylistConflictError` 409 + trap « pas de verrou create » + HIGH reseed-clobber
- [Source: _bmad-output/implementation-artifacts/17-1-unicite-chanson-serveur.md] — le 409 serveur `{ error:'duplicate_song', song }` (déjà en prod v1.12.0)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 17] — cadrage + décisions verrouillées
- [Source: _bmad-output/brainstorming/brainstorming-session-2026-07-10-0810.md] — design d'origine (14 décisions)
- [Source: src/pages/Songs.tsx:818-917,1233-1346,1805-1811,1822-1852] — auto-save 13.1, create flow, onAddNew, sticky bar
- [Source: src/components/SongForm.tsx:13,188,835-853] — mode prop, form onSubmit, bloc bouton Add
- [Source: src/services/songService.ts:58-87] — createSong/updateSong (body 409 jeté)
- [Source: src/services/playlistService.ts:17-24,61-68] — patron `PlaylistConflictError`
- [Source: src/utils/songDuplicate.ts] — `findDuplicateSong` (garde client déjà en place)
- [Source: src/components/ConfirmDialog.tsx:3-12] — props popup titre-vide
- [Source: src/main.tsx:10, src/components/Header.tsx:8-9] — `<BrowserRouter>` (pas de blocker) + liens de nav à gater
- [Décisions northwood 2026-07-10 : (1) blocage nav global ; (2) DELETE silencieux fresh ; débounce 1200ms]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

**Avancement (2026-07-10, branche `feat/epic-17-2-auto-creation-front`) :**
- ✅ **Task 1** (service) : `SongConflictError` + parsing 409 sur `createSong` **et** `updateSong` (mirror `PlaylistConflictError`).
- ✅ **Task 2** (auto-création) : `autoSaveSong` unifié create+update ; effet débounce 1200ms armé aussi en add (dès titre non-vide) ; **bascule add→edit invisible** (`editingUid` null→uid, song injectée, baseline seedé, `page` reste `'form'`) ; **verrou in-flight** `savingRef` couvre le POST ; bouton `Add`/`Cancel` retiré de `SongForm` (+ prop `onCancel` supprimée) ; pastille statut visible en add ; `handleSubmit` = flush ; `onAddNew` réarme une session propre.
- ✅ **Task 3** (blocage doublon symétrique) : le « freeze » 13.1 (retirait title/artist, sauvait le reste) devient **blocage total** (`liveDuplicate` → `saveStatus:'conflict'`, aucune écriture) ; catch `SongConflictError` (409) dans le chemin unifié → réconcilie la liste locale (ajoute la chanson existante) + statut `conflict` ; nouveau statut `'conflict'` = « ⚠️ Not saved — already exists » (ambre).
- ✅ Tests existants alignés : `SongsAutoSave.test.tsx` (mock spread pour garder `SongConflictError` ; test « freeze » → « block total »), `SongForm.test.tsx` (prop `onCancel` retirée). **328/328 front verts, tsc -b + eslint clean.**
- ⏳ **Restant : Task 4** (Seuil 1 : suspend auto-save si titre vide — déjà fait dans `autoSaveSong` ; reste `isFreshSong` + DELETE silencieux vs `ConfirmDialog` à la sortie), **Task 5** (guard de nav GLOBAL app-wide — `Header`/`App`, chemin sensible), **Task 6** (nouveaux tests), **Task 7** (docs).

### Completion Notes List

- **Tasks 4 + 5 + 6 + 7 livrées (2026-07-11)** en plus des Tasks 1-3 du log ci-dessus.
- **Task 4 (Seuil 1)** : auto-save suspendu si titre trimmé vide (jamais persisté). `isFreshSong()` = `form` == `initialSong` (hors titre) + `editingSongPlays` vide + `lastPlayed` nul + aucune appartenance playlist. `deleteEditingSong()` best-effort. `attemptLeave(proceed)` = le **gate de sortie unique** : titre vide + fresh → DELETE silencieux puis `proceed` ; titre vide + à valeur → `ConfirmDialog` « This song has no title » (Delete → delete+proceed ; Continue editing → reste, re-check au prochain essai). `backToList` restructuré (`returnToList` partagé) + passe par le gate.
- **Task 5 (guard nav global)** : `<BrowserRouter>` → `useBlocker` indispo → **guard maison** — `src/contexts/LeaveGuardContext.ts` (contexte + `useLeaveGuard`, split `.ts` façon `AuthContext`) + `src/contexts/LeaveGuardProvider.tsx` (`LeaveGuardProvider` + `GuardedLink`). `App` wrappe le provider (autour de `Header` + routes). `Header` : tous les `<Link>` (logo, nav desktop+mobile, profil) → `<GuardedLink>` ; logout enrobé dans `attemptLeave`. `Songs` enregistre le gate (`registerLeaveGuard`, délégué via ref pour rester frais) + `beforeunload` natif tant qu'un draft titre-vide est ouvert. `GuardedLink` laisse passer les clics modifiés (cmd/ctrl/shift/alt/middle) pour « ouvrir dans un nouvel onglet ».
- **Task 6 (tests)** : `SongsAutoSave.test.tsx` +9 tests (auto-create+bascule, titre vide jamais créé, verrou in-flight, échec create → « retrying », 409 block create ET update, Seuil 1 delete-silencieux vs popup, popup Delete). **Front 337/337** (+9), back 265/265, tsc + 2 lints clean.
- **Task 7 (docs)** : `deferred-work.md` — décision 🅰️ de 13.1 (« freeze identité, sauve le reste ») marquée **RÉVISÉE par 17.2** (blocage total). `CHANGELOG.md [Unreleased]` — 2 entrées user-facing (auto-création sans bouton + doublons bloqués).
- **Divergences/limites assumées** : (1) le **bouton browser back / popstate** n'est pas intercepté par le guard (react-router BrowserRouter sans blocker) — un draft titre-vide fresh n'y est alors pas supprimé (le serveur garde le dernier titre valide) ; couvert par `beforeunload` pour refresh/fermeture. (2) Le heading passe « Add song » → « Edit song » à la bascule (l'URL/state ne bouge pas ; jugé acceptable — la bascule « invisible » vise le zéro-rechargement).

### File List

- `src/services/songService.ts` (EDIT — `SongConflictError` + branche 409 dans `createSong` et `updateSong`)
- `src/pages/Songs.tsx` (EDIT — `autoSaveSong` unifié create/update + blocage doublon total + 409 ; effet débounce/flush add-mode ; bascule add→edit ; `handleSubmit`=flush ; `onAddNew` réarmé ; Seuil 1 `isFreshSong`/`deleteEditingSong`/`attemptLeave`/`returnToList`/`backToList` ; enregistrement du guard + `beforeunload` ; `ConfirmDialog` titre-vide ; pastille statut `conflict` + visible en add)
- `src/components/SongForm.tsx` (EDIT — bloc bouton `Add`/`Cancel` retiré ; prop `onCancel` supprimée)
- `src/contexts/LeaveGuardContext.ts` (NEW — contexte + `useLeaveGuard`)
- `src/contexts/LeaveGuardProvider.tsx` (NEW — `LeaveGuardProvider` + `GuardedLink`)
- `src/App.tsx` (EDIT — wrap `LeaveGuardProvider`)
- `src/components/Header.tsx` (EDIT — `<Link>` → `<GuardedLink>` partout, logout via `attemptLeave`)
- `src/__tests__/SongsAutoSave.test.tsx` (EDIT — mock spread `SongConflictError` ; test freeze→block ; +9 tests 17.2)
- `src/__tests__/SongForm.test.tsx` (EDIT — prop `onCancel` retirée des deux render helpers)
- `_bmad-output/implementation-artifacts/deferred-work.md` (EDIT — révision décision 13.1 🅰️)
- `CHANGELOG.md` (EDIT — `[Unreleased]`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (EDIT — 17-2 → review)

## Change Log

| Date       | Version | Description                                                                 |
|------------|---------|-----------------------------------------------------------------------------|
| 2026-07-11 | 0.1     | Story 17.2 — auto-création fiche chanson sans bouton (débounce 1200ms, calque 13.1) + bascule add→edit invisible + verrou in-flight ; **blocage doublon symétrique TOTAL** (`SongConflictError` 409 sur create+update, durcit le freeze 13.1) ; Seuil 1 titre-vide (DELETE silencieux fresh vs popup) ; **guard de navigation GLOBAL** (`LeaveGuardContext/Provider` + `GuardedLink`, `App`/`Header`) + `beforeunload`. Front 337 ✓ (+9), back 265 ✓, tsc + eslint clean. Statut → review. |
| 2026-07-11 | 0.2     | Code review 3 couches (Acceptance Auditor 0 violation ; Edge Case Hunter réfute 2 faux positifs du Blind). **4 patches appliqués** : (HIGH) race création-en-vol + sortie → `formActiveRef` garde la transition post-await + toast `backToList` gaté sur `!savingRef` (+ test de régression) ; (Med) `conflictKeyRef` anti-re-création sur 409 sans `song` ; (Low) `setSaveStatus('idle')` sur titre vidé ; (Low) `setPlaylistFilter('')` à la création. 2 defer (beforeunload draft add non-créé ; back navigateur/popstate). Front 338 ✓ (+1), tsc + eslint clean. Statut → done. |

## Review Findings

_Code review adversariale 3 couches (Blind / Edge Case / Acceptance) — 2026-07-11. **Acceptance Auditor : tous les volets/décisions satisfaits.** L'Edge Case Hunter (accès projet) a **réfuté les 2 « High » du Blind Hunter** (faux positifs, cf. dismiss). Reste **un vrai HIGH convergent** (race création-en-vol + sortie). Triage : 4 patches, 2 defer, 4 dismiss._

- [x] [Review][Patch→Fixed][HIGH] **Création en vol + sortie vers la liste → `editingUid` orphelin (perte de données)** [src/pages/Songs.tsx autoSaveSong/backToList] — si l'utilisateur clique Back (ou vide le titre) pendant qu'un CREATE est en vol (réseau lent, `editingUid` encore `null`), `returnToList` remet `editingUid=null`, puis le CREATE résout et fait `setEditingUid(created.uid)` alors que `page==='list'` → (a) toast trompeur « could not be saved » (le create réussit) ; (b) `beforeunload` s'arme sur la LISTE ; (c) pire : `attemptLeave` voit un « draft fresh titre-vide » → la **prochaine navigation supprime silencieusement la chanson** qu'on venait de créer. Fix : garder la transition post-await sur un `formActiveRef` (si on a quitté → garder la chanson dans la liste mais NE PAS réarmer `editingUid`) + ne toaster dans `backToList` que si `!savingRef.current`.
- [x] [Review][Patch→Fixed][Med] **409 sans `song` dans le body → re-création à chaque frappe** [src/pages/Songs.tsx catch 409] — si le 409 serveur n'inclut pas `song` (lookup best-effort → null), la liste locale n'est pas réconciliée, `liveDuplicate` ne bloque pas côté client → chaque frappe re-tire `createSong` → 409 en boucle. Fix : mémoriser la clé (titre+artiste) qui a 409 (`conflictKeyRef`) et suspendre les re-créations tant que la clé est inchangée.
- [x] [Review][Patch→Fixed][Low] **« Saved ✓ » périmé quand on vide le titre en édition** [src/pages/Songs.tsx autoSaveSong early-return] — l'auto-save sort avant tout `setSaveStatus`, la pastille ment « Saved ✓ » alors que le titre vidé n'est pas persisté. Fix : `setSaveStatus('idle')` sur titre vide.
- [x] [Review][Patch→Fixed][Low] **Filtre playlist non réinitialisé à la création → nouvelle chanson potentiellement masquée au retour liste** [src/pages/Songs.tsx create success] — l'ancien flux create faisait `setPlaylistFilter('')` ; parité perdue. Fix : `setPlaylistFilter('')` après un create réussi.
- [x] [Review][Defer] **`beforeunload` ne couvre pas un draft add titré-mais-pas-encore-créé (fenêtre < 1.2s)** [src/pages/Songs.tsx] — deferred : cohérent avec le modèle auto-save (le create arrive après le débounce), fenêtre marginale, mono-user.
- [x] [Review][Defer] **Bouton back navigateur / popstate non gardé** [BrowserRouter] — deferred : déjà documenté (limite assumée) ; react-router `<BrowserRouter>` n'expose pas de blocker ; `beforeunload` couvre refresh/fermeture.

### Findings écartés (dismiss — faux positif / vérifié)
- **Assignation playlist perdue à la création** (Blind HIGH) — **faux positif** : l'Edge Case Hunter a vérifié que le picker playlist est masqué en mode add (`playlistSlot` gated `editingUid ? … : undefined`) → aucune sélection possible avant la bascule ; l'assignation se fait en mode edit (post-bascule), non perdue.
- **Suppression silencieuse d'une chanson sauvée « titre seul »** (Blind Med) — **faux positif** : `openSongForEdit` construit le form via `{...song}` qui embarque `createdAt`/`updatedAt`/`uid` → `isFreshSong` renvoie false pour toute chanson ouverte en édition (≠ `initialSong`) ; seul un draft auto-créé de la session est « fresh ».
- **`payload as CreateSongDTO` (cast non vérifié)** (Blind Low) — bénin : `payload` = `{...form, …}` porte tous les champs de `CreateSongDTO` ; les shapes coïncident.
- **`onAddNew` modifié malgré l'AC « inchangée »** (Auditor) — amélioration (reset du statut périmé), pas une régression.
