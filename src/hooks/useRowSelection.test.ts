import { renderHook, act } from '@testing-library/react';
import { useRowSelection } from './useRowSelection';

beforeEach(() => localStorage.clear());

test('toggle adds then removes a uid; isSelected + size track it', () => {
  const { result } = renderHook(() => useRowSelection());
  expect(result.current.isSelected('a')).toBe(false);
  act(() => result.current.toggle('a'));
  expect(result.current.isSelected('a')).toBe(true);
  expect(result.current.size).toBe(1);
  act(() => result.current.toggle('a'));
  expect(result.current.isSelected('a')).toBe(false);
  expect(result.current.size).toBe(0);
});

test('clear empties the selection', () => {
  const { result } = renderHook(() => useRowSelection());
  act(() => { result.current.toggle('a'); result.current.toggle('b'); });
  expect(result.current.size).toBe(2);
  act(() => result.current.clear());
  expect(result.current.size).toBe(0);
});

test('allDisplayedSelected: false on empty list, true only when every displayed uid is selected', () => {
  const { result } = renderHook(() => useRowSelection());
  expect(result.current.allDisplayedSelected([])).toBe(false); // nothing displayed → not "all selected"
  act(() => result.current.selectOnly(['a', 'b']));
  expect(result.current.allDisplayedSelected(['a', 'b'])).toBe(true);
  expect(result.current.allDisplayedSelected(['a', 'b', 'c'])).toBe(false); // c not selected
});

test('selectOnly REPLACES the whole selection (Songlist select-all semantics)', () => {
  const { result } = renderHook(() => useRowSelection());
  act(() => { result.current.toggle('x'); result.current.selectOnly(['a', 'b']); });
  expect(result.current.isSelected('x')).toBe(false); // dropped by the replace
  expect(result.current.isSelected('a')).toBe(true);
  expect(result.current.size).toBe(2);
});

test('addMany / removeMany union and subtract (Catalog within-page semantics)', () => {
  const { result } = renderHook(() => useRowSelection());
  act(() => { result.current.toggle('keep'); result.current.addMany(['a', 'b']); });
  expect(result.current.size).toBe(3); // keep + a + b (union preserves existing)
  act(() => result.current.removeMany(['a', 'b']));
  expect(result.current.isSelected('keep')).toBe(true); // untouched
  expect(result.current.isSelected('a')).toBe(false);
  expect(result.current.size).toBe(1);
});

test('persistKey: selection round-trips through localStorage', () => {
  const first = renderHook(() => useRowSelection({ persistKey: 'sel' }));
  act(() => { first.result.current.toggle('a'); first.result.current.toggle('b'); });
  expect(JSON.parse(localStorage.getItem('sel')!).sort()).toEqual(['a', 'b']);
  // A fresh mount restores from localStorage.
  const second = renderHook(() => useRowSelection({ persistKey: 'sel' }));
  expect(second.result.current.isSelected('a')).toBe(true);
  expect(second.result.current.isSelected('b')).toBe(true);
});

test('no persistKey: nothing is written to localStorage (ephemeral, Catalog)', () => {
  const setItem = jest.spyOn(Storage.prototype, 'setItem');
  const { result } = renderHook(() => useRowSelection());
  act(() => result.current.toggle('a'));
  expect(setItem).not.toHaveBeenCalled();
  setItem.mockRestore();
});

test('persistKey: a fresh mount with no stored value starts empty', () => {
  const { result } = renderHook(() => useRowSelection({ persistKey: 'none-yet' }));
  expect(result.current.size).toBe(0);
});

test('persistKey: a corrupt or non-array stored value falls back to empty (no crash, no garbage)', () => {
  localStorage.setItem('bad', '"ab"'); // valid JSON, but a string — new Set("ab") would be {a,b}
  const asString = renderHook(() => useRowSelection({ persistKey: 'bad' }));
  expect(asString.result.current.size).toBe(0);
  localStorage.setItem('broken', '{not json'); // invalid JSON → parse throws → caught
  const asBroken = renderHook(() => useRowSelection({ persistKey: 'broken' }));
  expect(asBroken.result.current.size).toBe(0);
});
