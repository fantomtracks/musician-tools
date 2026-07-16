import { useRef, useState } from 'react';
import {
  comboboxInputAria,
  comboboxOptionAria,
  handleComboKeyDown,
  useScrollHighlightIntoView,
} from '../utils/comboboxKeyboard';

// Shared editable autocomplete combobox — the artist/album picker extracted from
// SongForm (story 19.11) and reused by the Catalog form (replacing its native
// <datalist>). It owns the open/highlight state, the open-policy, the case-insensitive
// filtering, the keyboard (via the shared comboboxKeyboard utils), the mouse, and the
// a11y wiring. The domain (value, suggestions, styling, id, label) comes in via props;
// the <label> stays with the caller.
//
// Open policy (kept identical to the former SongForm inline combobox):
//   • typing → open iff there is a match AND it is not a single EXACT match (so we don't
//     pop a 1-item list of exactly what's already typed).
//   • focus → same rule against the current value.
//   • ArrowDown → open. Escape / Tab / select / blur(200ms) → close.
// The list the keyboard indexes IS the list rendered (same `filtered`), so the highlight
// always matches what's shown.

export interface AutocompleteInputProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  suggestions: string[];
  // The <input> className — REQUIRED because it differs per caller (SongForm's full
  // tailwind input vs the Catalog form's `input-base`); passing it keeps each iso-visual.
  inputClassName: string;
  // Wrapper className — defaults to `relative`. The album field passes `relative z-[25]`
  // to stack its dropdown between the Genres (z-30) and Languages (z-20) blocks.
  wrapperClassName?: string;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  autoComplete?: string;
}

export function AutocompleteInput({
  id,
  value,
  onValueChange,
  suggestions,
  inputClassName,
  wrapperClassName = 'relative',
  disabled,
  placeholder,
  name,
  // Default 'off': a custom listbox must not compete with the browser's native autofill
  // dropdown (which would stack on top). Callers can override if they really want it.
  autoComplete = 'off',
}: AutocompleteInputProps) {
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // The single source of truth for both the rendered options and the keyboard index.
  const filtered = suggestions.filter(s => !value || s.toLowerCase().includes(value.toLowerCase()));

  useScrollHighlightIntoView(listRef, activeIndex, open);

  const select = (option: string) => {
    onValueChange(option);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className={wrapperClassName}>
      <input
        id={id}
        name={name}
        className={inputClassName}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value;
          onValueChange(next);
          if (next.length === 0) {
            setOpen(suggestions.length > 0);
          } else {
            const f = suggestions.filter(s => s.toLowerCase().includes(next.toLowerCase()));
            const isSingleExactMatch = f.length === 1 && f[0] === next;
            setOpen(f.length > 0 && !isSingleExactMatch);
          }
          setActiveIndex(-1);
        }}
        onKeyDown={(e) => handleComboKeyDown(e, filtered, activeIndex, setActiveIndex, setOpen, select)}
        onFocus={() => {
          const isSingleExactMatch = filtered.length === 1 && filtered[0] === value;
          setOpen(filtered.length > 0 && !isSingleExactMatch);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        {...comboboxInputAria(listId, open, activeIndex)}
      />
      {open && suggestions.length > 0 && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto"
        >
          {filtered.map((option, index) => (
            <button
              key={option}
              type="button"
              {...comboboxOptionAria(listId, index, activeIndex)}
              className={`w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 last:border-b-0 ${
                index === activeIndex ? 'bg-brand-100 dark:bg-brand-900/40' : ''
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default AutocompleteInput;
