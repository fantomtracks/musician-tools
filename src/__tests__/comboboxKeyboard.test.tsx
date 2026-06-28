import { render } from '@testing-library/react';
import { useRef } from 'react';
import {
  handleComboKeyDown,
  useScrollHighlightIntoView,
  useScrollAriaSelectedIntoView,
  comboboxOptionAria,
} from '../utils/comboboxKeyboard';

function keyEvent(key: string) {
  return { key, preventDefault: jest.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
}

describe('handleComboKeyDown', () => {
  const options = ['a', 'b', 'c'];
  let setIndex: jest.Mock;
  let setOpen: jest.Mock;
  let onSelect: jest.Mock;

  beforeEach(() => {
    setIndex = jest.fn();
    setOpen = jest.fn();
    onSelect = jest.fn();
  });

  test('ArrowDown opens, prevents default, and increments the index (bounded)', () => {
    const e = keyEvent('ArrowDown');
    handleComboKeyDown(e, options, 0, setIndex, setOpen, onSelect);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(setOpen).toHaveBeenCalledWith(true);
    const updater = setIndex.mock.calls[0][0] as (prev: number) => number;
    expect(updater(0)).toBe(1);
    expect(updater(2)).toBe(2); // clamped at options.length - 1
  });

  test('ArrowUp decrements, floored to -1 from 0', () => {
    const e = keyEvent('ArrowUp');
    handleComboKeyDown(e, options, 1, setIndex, setOpen, onSelect);
    expect(e.preventDefault).toHaveBeenCalled();
    const updater = setIndex.mock.calls[0][0] as (prev: number) => number;
    expect(updater(2)).toBe(1);
    expect(updater(0)).toBe(-1);
  });

  test('Enter on a highlighted option selects it and never submits (preventDefault)', () => {
    const e = keyEvent('Enter');
    handleComboKeyDown(e, options, 1, setIndex, setOpen, onSelect);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  test('Enter with no highlight still prevents submit but selects nothing', () => {
    const e = keyEvent('Enter');
    handleComboKeyDown(e, options, -1, setIndex, setOpen, onSelect);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('Escape closes and resets the index', () => {
    handleComboKeyDown(keyEvent('Escape'), options, 1, setIndex, setOpen, onSelect);
    expect(setOpen).toHaveBeenCalledWith(false);
    expect(setIndex).toHaveBeenCalledWith(-1);
  });
});

describe('comboboxOptionAria', () => {
  test('keeps options out of the tab order (Tab leaves the combobox, not into the list)', () => {
    expect(comboboxOptionAria('list', 2, 2).tabIndex).toBe(-1);
  });

  test('wires role/id/aria-selected for the active descendant pattern', () => {
    expect(comboboxOptionAria('list', 2, 2)).toMatchObject({
      role: 'option',
      id: 'list-opt-2',
      'aria-selected': true,
    });
    expect(comboboxOptionAria('list', 0, 2)['aria-selected']).toBe(false);
  });
});

describe('scroll-into-view hooks', () => {
  test('useScrollHighlightIntoView scrolls the child at the highlighted index', () => {
    const scrollSpy = jest.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollSpy;
    try {
      function Harness() {
        const ref = useRef<HTMLDivElement>(null);
        useScrollHighlightIntoView(ref, 1, true);
        return (
          <div ref={ref}>
            <button type="button">one</button>
            <button type="button">two</button>
          </div>
        );
      }
      render(<Harness />);
      expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  test('useScrollAriaSelectedIntoView scrolls the aria-selected option in a grouped listbox', () => {
    const scrollSpy = jest.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollSpy;
    try {
      function Harness() {
        const ref = useRef<HTMLDivElement>(null);
        useScrollAriaSelectedIntoView(ref, 2, true);
        return (
          <div ref={ref}>
            <div role="group">
              <button type="button" role="option" aria-selected={false}>a</button>
              <button type="button" role="option" aria-selected>b</button>
            </div>
          </div>
        );
      }
      render(<Harness />);
      expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  test('hooks are no-ops when closed (no scroll)', () => {
    const scrollSpy = jest.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollSpy;
    try {
      function Harness() {
        const ref = useRef<HTMLDivElement>(null);
        useScrollHighlightIntoView(ref, 1, false);
        return <div ref={ref}><button type="button">one</button></div>;
      }
      render(<Harness />);
      expect(scrollSpy).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});
