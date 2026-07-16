import { useEffect, useRef, type DependencyList, type MutableRefObject } from 'react';

// Shared autosave engine for the Song form and the Catalog form (story 19.7). The
// two pages copied-then-diverged the same mechanics; the 19.6 QA proved that silently
// loses guards (4 review patches: conflict surfacing, title-required, baseline, flush).
// This hook owns the GENERIC lifecycle so it can never drift again:
//   • savingRef        — an in-flight create/update can never overlap another save.
//   • debounce timer   — one cancellable ~1.2 s timer, shared by every scheduled save.
//   • baseline no-op    — skip a save when the form is byte-identical to the last one.
//   • create-lazy       — editingUid === null → the first save CREATEs, then it UPDATEs.
//   • min-visible        — keep "Saving…" perceptible even on an instant local save.
//   • flush              — cancel the timer and persist NOW (Back / Enter / navigation).
//   • unmount flush      — the leave that no handler catches (a header link, browser Back).
// Everything DOMAIN-specific (the real network call, the add→edit transition, list
// reconciliation, the duplicate rule, the conflict handling) is injected via callbacks.
// The page keeps ownership of its saveStatus state and baseline storage; the hook only
// DRIVES them through the callbacks so no page-specific coupling leaks in here.

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface AutosaveCreateResult {
  // false → skip the 'saved' finalize (e.g. the user left the form mid-create: the
  // create still resolves and the record is kept, but we must NOT flip to 'saved' /
  // re-arm editing on a screen the user already left — story 17.2 HIGH regression).
  finalize: boolean;
}

export interface UseAutosaveOptions<TForm> {
  // The live form value. Its JSON is the baseline unit + the create/update payload source.
  form: TForm;
  // null = create mode (the first save lazily CREATEs); a uid = edit mode (saves UPDATE).
  editingUid: string | null;
  // JSON of the form as last saved/loaded (owned by the PAGE — editBaselineJson state /
  // a baselineRef). null = no baseline yet (a fresh add). Read for the no-op skip.
  baseline: string | null;
  // Effect deps that (re)arm the debounce — pass the same array the page used before.
  deps: DependencyList;
  debounceMs?: number; // default 1200
  minVisibleMs?: number; // default 0 — the floor for how long 'saving' stays visible
  // What to do on unmount:
  //   'flush'          → run flush() (add mode CAN create — the Song form's quitter=garder).
  //   'edit-only-save' → save only if editingUid !== null (never CREATE on unmount — 19.6 F2).
  //   'none'           → nothing.
  unmount?: 'flush' | 'edit-only-save' | 'none';
  // Arm the debounce? (add: title present ; edit: form diverges from baseline). Page-owned.
  scheduleWhen: () => boolean;
  // On an explicit flush, is there anything to persist? Returns true when there is nothing
  // to save (a clean/empty form) so flush() resolves true WITHOUT a spurious failure.
  flushWhen: () => boolean;
  // Pre-save gate. Return:
  //   • null      → proceed with the save.
  //   • 'block'   → block the save WITHOUT touching the status (e.g. an emptied title the
  //                 page leaves as-is).
  //   • a status  → block AND surface it (Songs' duplicate → 'conflict', empty → 'idle').
  blockedStatus: () => SaveStatus | 'block' | null;
  // The page owns the saveStatus state cell; the hook drives it through this setter.
  setSaveStatus: (status: SaveStatus) => void;
  // Create the record (add mode). Owns the payload shape, the add→edit transition, list
  // reconciliation. Returns finalize:false to skip the 'saved' finalize (see above).
  onCreate: (form: TForm, snapshot: string) => Promise<AutosaveCreateResult>;
  // Update the record (edit mode). Owns the payload shape, list reconciliation, baseline write.
  onUpdate: (uid: string, form: TForm, snapshot: string) => Promise<void>;
  // Catch handler: return the status to surface (a conflict → 'conflict'/'idle', else 'error').
  // The page does any side effect here (reconcile the list, remember the conflicting key…).
  onError: (err: unknown) => SaveStatus;
  // Optional post-save side effect, run AFTER the min-visible delay and BEFORE 'saved'
  // (e.g. stamp a "Saved · HH:mm" time) so the exact original ordering is preserved.
  onStatusSaved?: () => void;
}

export interface UseAutosaveApi {
  // Cancel the pending debounce and persist now. Returns false ONLY when a save was
  // attempted and FAILED (a blocked/no-op flush returns true — nothing to persist).
  flush: () => Promise<boolean>;
  // The in-flight guard, exposed so a caller can tell "a save is still resolving" from
  // "the save failed" (Songs' Back-to-list suppresses the failure toast while in flight).
  savingRef: MutableRefObject<boolean>;
}

export function useAutosave<TForm>(opts: UseAutosaveOptions<TForm>): UseAutosaveApi {
  // Always read the LATEST options from effects/handlers without re-subscribing them —
  // mirrors the page-level autoSaveRef pattern the two copies used.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const runSave = async (): Promise<boolean> => {
    const o = optsRef.current;
    if (savingRef.current) return false; // a create/update is already in flight
    const blocked = o.blockedStatus();
    if (blocked !== null) {
      if (blocked !== 'block') o.setSaveStatus(blocked);
      return false;
    }
    const snapshot = JSON.stringify(o.form);
    if (o.baseline !== null && snapshot === o.baseline) return true; // nothing changed
    savingRef.current = true;
    const startedAt = Date.now();
    try {
      o.setSaveStatus('saving');
      if (o.editingUid === null) {
        const res = await o.onCreate(o.form, snapshot);
        if (!res.finalize) return true; // e.g. the user left mid-create — keep, don't finalize
      } else {
        await o.onUpdate(o.editingUid, o.form, snapshot);
      }
      const minMs = o.minVisibleMs ?? 0;
      if (minMs > 0) {
        const elapsed = Date.now() - startedAt;
        if (elapsed < minMs) await new Promise(res => setTimeout(res, minMs - elapsed));
      }
      o.onStatusSaved?.();
      o.setSaveStatus('saved');
      return true;
    } catch (err) {
      o.setSaveStatus(o.onError(err));
      return false;
    } finally {
      savingRef.current = false;
    }
  };
  const runSaveRef = useRef(runSave);
  runSaveRef.current = runSave;

  const flush = async (): Promise<boolean> => {
    clearTimer(); // cancel the debounce so it can't fire a second, overlapping save
    if (!optsRef.current.flushWhen()) return true; // nothing to persist → not a failure
    return runSaveRef.current();
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Debounced auto-persist. The deps array is provided by the page (stable length).
  const debounceMs = opts.debounceMs ?? 1200;
  useEffect(() => {
    if (!optsRef.current.scheduleWhen()) return;
    clearTimer();
    timerRef.current = setTimeout(() => { void runSaveRef.current(); }, debounceMs);
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, opts.deps);

  // Flush the latest pending change on unmount (19.6 F4) — the leave no handler catches.
  const unmount = opts.unmount ?? 'edit-only-save';
  useEffect(() => () => {
    const o = optsRef.current;
    if (unmount === 'flush') {
      void flushRef.current();
    } else if (unmount === 'edit-only-save' && o.editingUid !== null) {
      void runSaveRef.current(); // never CREATE on unmount (19.6 F2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { flush, savingRef };
}
