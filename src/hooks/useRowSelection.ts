import { useEffect, useState } from 'react';

// Shared row-selection engine for the Songlist table and the Catalog manage table
// (story 19.9). Both pages carried a byte-identical `Set<string>` + toggle / isSelected
// / select-all / clear boilerplate; this hook is the one tested source so it can't
// drift (same spirit as story 19.7's useAutosave).
//
// It owns ONLY the generic selection mechanics + optional localStorage persistence.
// The three things that legitimately DIFFER between the two pages stay in the pages,
// composed from the primitives below:
//   1. "select all" semantics — Songlist REPLACEs (new Set of the displayed uids, so a
//      filtered-out selection is dropped) ; Catalog unions/subtracts only the displayed
//      uids INTO the set (preserving selections on other paginated pages). → compose
//      with selectOnly / clear (replace) or addMany / removeMany (within).
//   2. persistence — Songlist persists (persistKey), Catalog does not (no key).
//   3. the delete flow — 100% domain (different services, 404 tolerance, pagination…);
//      only the post-delete set cleanup goes through clear() / removeMany().

export interface UseRowSelectionOptions {
  // When set, the selection is restored from and mirrored to localStorage[persistKey]
  // (a JSON array of uids). Omit for an ephemeral selection (the Catalog manage table).
  persistKey?: string;
}

export interface RowSelection {
  selected: Set<string>;
  isSelected: (uid: string) => boolean;
  size: number;
  toggle: (uid: string) => void;
  clear: () => void;
  selectOnly: (uids: string[]) => void; // replace the whole selection with exactly these
  addMany: (uids: string[]) => void; // union these into the current selection
  removeMany: (uids: string[]) => void; // subtract these from the current selection
  allDisplayedSelected: (uids: string[]) => boolean; // non-empty AND every uid selected
}

export function useRowSelection(opts: UseRowSelectionOptions = {}): RowSelection {
  const { persistKey } = opts;

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (!persistKey || typeof window === 'undefined') return new Set();
    try {
      const saved = window.localStorage.getItem(persistKey);
      const parsed = saved ? JSON.parse(saved) : null;
      // Guard against a stored value that parses to a non-array (e.g. a bare string,
      // which `new Set(...)` would iterate char-by-char into a garbage selection).
      return Array.isArray(parsed) ? new Set<string>(parsed) : new Set();
    } catch {
      return new Set();
    }
  });

  // Mirror the selection to localStorage (persistKey only). try/catch: storage may be
  // full / disabled — persistence is best-effort, never a crash.
  useEffect(() => {
    if (!persistKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(persistKey, JSON.stringify(Array.from(selected)));
    } catch { /* ignore */ }
  }, [selected, persistKey]);

  const toggle = (uid: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    return next;
  });

  const clear = () => setSelected(new Set());
  const selectOnly = (uids: string[]) => setSelected(new Set(uids));
  const addMany = (uids: string[]) => setSelected(prev => {
    const next = new Set(prev);
    uids.forEach(u => next.add(u));
    return next;
  });
  const removeMany = (uids: string[]) => setSelected(prev => {
    const next = new Set(prev);
    uids.forEach(u => next.delete(u));
    return next;
  });

  return {
    selected,
    isSelected: (uid: string) => selected.has(uid),
    size: selected.size,
    toggle,
    clear,
    selectOnly,
    addMany,
    removeMany,
    allDisplayedSelected: (uids: string[]) => uids.length > 0 && uids.every(u => selected.has(u)),
  };
}
