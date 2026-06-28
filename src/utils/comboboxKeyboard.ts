import type React from 'react';
import { useEffect } from 'react';

// ARIA wiring for an editable combobox (focus stays on the input; the active
// option is referenced, not focused). `listId` is the listbox element's id;
// options get `${listId}-opt-${index}`. Spread onto the <input>.
export function comboboxInputAria(listId: string, isOpen: boolean, activeIndex: number) {
  return {
    role: 'combobox' as const,
    'aria-expanded': isOpen,
    'aria-controls': listId,
    'aria-activedescendant': activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined,
  };
}

// Spread onto each option element so the active descendant the input points at
// actually exists and is marked selected. `activeIndex` drives the highlight;
// pair with `onMouseEnter={() => setActiveIndex(index)}` so mouse and keyboard
// share ONE active state (and one visual style). `tabIndex: -1` keeps the
// options OUT of the tab order — Tab leaves the combobox instead of stepping
// into the list; navigation stays on the input via arrows + aria-activedescendant.
export function comboboxOptionAria(listId: string, index: number, activeIndex: number) {
  return {
    role: 'option' as const,
    id: `${listId}-opt-${index}`,
    'aria-selected': index === activeIndex,
    tabIndex: -1,
  };
}

// Shared keyboard navigation for the app's search comboboxes: arrows move the
// highlight, Enter selects the highlighted option WITHOUT submitting a parent
// <form> (preventDefault), Escape closes. `options` must be the SAME filtered
// list the dropdown renders, so the highlight index matches what's shown.
export function handleComboKeyDown<T>(
  e: React.KeyboardEvent<HTMLInputElement>,
  options: T[],
  index: number,
  setIndex: React.Dispatch<React.SetStateAction<number>>,
  setOpen: React.Dispatch<React.SetStateAction<boolean>>,
  onSelect: (option: T) => void,
): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setOpen(true);
    setIndex(prev => (prev < options.length - 1 ? prev + 1 : prev));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setIndex(prev => (prev > 0 ? prev - 1 : -1));
  } else if (e.key === 'Enter') {
    e.preventDefault(); // never let Enter submit the form while picking
    if (index >= 0 && index < options.length) onSelect(options[index]);
  } else if (e.key === 'Escape') {
    setOpen(false);
    setIndex(-1);
  }
}

// Keep the keyboard-highlighted option scrolled into view. `listRef` points at
// the scroll container whose DIRECT children are the option elements, one per
// option in highlight order. No-op when closed or nothing is highlighted; the
// optional call tolerates jsdom (which doesn't implement scrollIntoView).
export function useScrollHighlightIntoView<E extends HTMLElement>(
  listRef: React.RefObject<E | null>,
  index: number,
  isOpen: boolean,
): void {
  useEffect(() => {
    if (isOpen && index >= 0) {
      listRef.current?.children[index]?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [listRef, index, isOpen]);
}

// Variant for grouped (non-flat) listboxes where options are nested under group
// wrappers, so the highlight isn't a direct child at `index`. The highlighted
// option must carry `aria-selected="true"`. `activeIndex` is just the change
// trigger. Tolerates jsdom (no scrollIntoView).
export function useScrollAriaSelectedIntoView<E extends HTMLElement>(
  listRef: React.RefObject<E | null>,
  activeIndex: number,
  isOpen: boolean,
): void {
  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [listRef, activeIndex, isOpen]);
}
