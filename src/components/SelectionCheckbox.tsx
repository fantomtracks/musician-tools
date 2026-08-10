import type { ReactNode } from 'react';

// The two shared row-selection checkboxes of the list screens (story 22.1): the
// header "select all" box and the per-row box. Pair them with <BulkActionBar> and the
// useRowSelection hook (19.9) — see BulkActionBar.tsx for the "no generic
// <MultiSelectTable>" decision (epic 22, C).
//
// What the primitives GUARANTEE, so no page has to repeat it:
//   • an explicit aria-label ("Select all" / "Deselect all", "Select {label}"),
//   • a hit area covering the WHOLE cell, not just the 16px box,
//   • stopPropagation on the row box: ticking it never triggers the row's onClick.
//
// The input styling is the Songlist one (epic 22, decision D): the Catalog's former
// short variant (no bg/border/rounded) is gone.
const INPUT =
  'h-4 w-4 cursor-pointer accent-brand-500 dark:accent-brand-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded';

// Hit area: the <label> is stretched over the entire cell (padding included) and the
// box is centred inside it — same pixels on screen (the cell paddings are symmetric),
// a target as large as the cell instead of 16px.
//
// An in-flow wrapper CANNOT do this: its height is intrinsic (16px + padding), so on a
// row made taller by its text cells it leaves a live strip above and below, and a click
// there falls through to the row's onClick — which used to be swallowed by the cell's
// own handler. Stretching is what actually keeps that promise.
//
// Deliberately NOT inflated beyond the cell to reach 44px tall: rows are ~36px, and an
// overflowing target would cover the neighbouring row and steal its clicks. 48px wide
// (`w-12` cells) × the row height stays well above the WCAG 2.5.8 minimum of 24×24.
// The hosting cell must carry the positioning context this overlay needs: build its
// className with `selectionCell()` from src/utils/selectionCell.ts.
const OVERLAY = 'absolute inset-0 flex items-center justify-center cursor-pointer';

// Only the CLICK is isolated. The row is a <tr onClick> with no key handler, so
// swallowing keydown here would buy nothing and would eat window-level shortcuts
// (the header's Escape listener) whenever focus sits on a row checkbox.
const stopClick = (e: { stopPropagation: () => void }) => e.stopPropagation();

function CheckboxCell({ children, isolate }: { children: ReactNode; isolate: boolean }) {
  return <label className={OVERLAY} {...(isolate ? { onClick: stopClick } : {})}>{children}</label>;
}

export interface SelectAllCheckboxProps {
  allSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function SelectAllCheckbox({ allSelected, onToggle, disabled }: SelectAllCheckboxProps) {
  const label = allSelected ? 'Deselect all' : 'Select all';
  return (
    // The header cell is never clickable, so this one needs no click isolation.
    <CheckboxCell isolate={false}>
      <input
        type="checkbox"
        className={INPUT}
        checked={allSelected}
        onChange={onToggle}
        disabled={disabled}
        aria-label={label}
        title={label}
      />
    </CheckboxCell>
  );
}

export interface RowSelectionCheckboxProps {
  checked: boolean;
  onChange: () => void;
  // What the row is, for the label: "Select {label}". Required — no anonymous box.
  // Qualify it when the list can hold two rows with the same title (songs are unique
  // on title+artist, not on title alone), or both rows answer to the same name.
  label: string;
  disabled?: boolean;
}

export function RowSelectionCheckbox({ checked, onChange, label, disabled }: RowSelectionCheckboxProps) {
  return (
    <CheckboxCell isolate>
      <input
        type="checkbox"
        className={INPUT}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={`Select ${label}`}
      />
    </CheckboxCell>
  );
}
