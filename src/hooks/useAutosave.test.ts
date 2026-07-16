import { renderHook, act } from '@testing-library/react';
import { useAutosave, type UseAutosaveOptions } from './useAutosave';

// Unit tests for the GENERIC autosave engine (story 19.7). The domain wiring is
// covered end-to-end by the page suites (SongsAutoSave, CatalogAdmin); here we pin the
// lifecycle the hook owns: debounce, baseline no-op, create-lazy, flush, unmount rule,
// blocked gate, in-flight lock.

type Form = { title: string; body?: string };

// A tiny options factory with sane defaults; every test overrides only what it needs.
function makeOpts(over: Partial<UseAutosaveOptions<Form>>): UseAutosaveOptions<Form> {
  return {
    form: { title: 'a' },
    editingUid: 'u1',
    baseline: null,
    deps: [] as unknown[],
    debounceMs: 1200,
    scheduleWhen: () => true,
    flushWhen: () => true,
    blockedStatus: () => null,
    setSaveStatus: () => {},
    onCreate: async () => ({ finalize: true }),
    onUpdate: async () => {},
    onError: () => 'error',
    ...over,
  };
}

// Advance past the debounce and let the (async) save settle.
async function tick(ms = 1200) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

test('debounce fires exactly one save after debounceMs (edit mode → onUpdate)', async () => {
  const onUpdate = jest.fn().mockResolvedValue(undefined);
  renderHook(() => useAutosave(makeOpts({ editingUid: 'u1', form: { title: 'b' }, onUpdate })));
  expect(onUpdate).not.toHaveBeenCalled(); // still within the debounce window
  await tick(1200);
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith('u1', { title: 'b' }, JSON.stringify({ title: 'b' }));
});

test('baseline no-op: an unchanged form never saves', async () => {
  const onUpdate = jest.fn().mockResolvedValue(undefined);
  const form = { title: 'same' };
  renderHook(() => useAutosave(makeOpts({ editingUid: 'u1', form, baseline: JSON.stringify(form), onUpdate })));
  await tick(1200);
  expect(onUpdate).not.toHaveBeenCalled();
});

test('create-lazy: add mode CREATEs once, never UPDATEs', async () => {
  const onCreate = jest.fn().mockResolvedValue({ finalize: true });
  const onUpdate = jest.fn().mockResolvedValue(undefined);
  renderHook(() => useAutosave(makeOpts({ editingUid: null, baseline: null, onCreate, onUpdate })));
  await tick(1200);
  expect(onCreate).toHaveBeenCalledTimes(1);
  expect(onUpdate).not.toHaveBeenCalled();
});

test('in-flight lock: a second debounce during a slow save does not fire a second save', async () => {
  let resolve!: () => void;
  const onCreate = jest.fn().mockImplementation(() => new Promise<{ finalize: boolean }>(r => { resolve = () => r({ finalize: true }); }));
  const { rerender } = renderHook((props: { form: Form }) =>
    useAutosave(makeOpts({ editingUid: null, baseline: null, onCreate, form: props.form, deps: [props.form] })),
    { initialProps: { form: { title: 'a' } as Form } },
  );
  await tick(1200);
  expect(onCreate).toHaveBeenCalledTimes(1); // create in flight (savingRef held)
  rerender({ form: { title: 'a', body: 'more' } }); // deps change → re-arms a second debounce
  await tick(1200);
  expect(onCreate).toHaveBeenCalledTimes(1); // still one — the in-flight lock held
  await act(async () => { resolve(); });
});

test('flush() cancels the pending debounce and persists immediately', async () => {
  const onUpdate = jest.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useAutosave(makeOpts({ editingUid: 'u1', form: { title: 'b' }, onUpdate })));
  let ok!: boolean;
  await act(async () => { ok = await result.current.flush(); });
  expect(ok).toBe(true);
  expect(onUpdate).toHaveBeenCalledTimes(1);
  // The cancelled timer must not fire a second save afterwards.
  await tick(1200);
  expect(onUpdate).toHaveBeenCalledTimes(1);
});

test('flush() with nothing to persist resolves true without saving', async () => {
  const onUpdate = jest.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useAutosave(makeOpts({ editingUid: 'u1', flushWhen: () => false, onUpdate })));
  let ok!: boolean;
  await act(async () => { ok = await result.current.flush(); });
  expect(ok).toBe(true);
  expect(onUpdate).not.toHaveBeenCalled();
});

test('blockedStatus blocks the save and surfaces the returned status', async () => {
  const onUpdate = jest.fn().mockResolvedValue(undefined);
  const setSaveStatus = jest.fn();
  renderHook(() => useAutosave(makeOpts({ editingUid: 'u1', form: { title: 'b' }, blockedStatus: () => 'conflict', setSaveStatus, onUpdate })));
  await tick(1200);
  expect(onUpdate).not.toHaveBeenCalled();
  expect(setSaveStatus).toHaveBeenCalledWith('conflict');
});

test("unmount 'edit-only-save' never CREATEs (add mode)", async () => {
  const onCreate = jest.fn().mockResolvedValue({ finalize: true });
  const { unmount } = renderHook(() => useAutosave(makeOpts({ editingUid: null, baseline: null, unmount: 'edit-only-save', onCreate })));
  await act(async () => { unmount(); });
  expect(onCreate).not.toHaveBeenCalled();
});

test("unmount 'flush' persists a pending add (create on unmount)", async () => {
  const onCreate = jest.fn().mockResolvedValue({ finalize: true });
  const { unmount } = renderHook(() => useAutosave(makeOpts({ editingUid: null, baseline: null, unmount: 'flush', onCreate })));
  await act(async () => { unmount(); });
  expect(onCreate).toHaveBeenCalledTimes(1);
});

test('onError status is surfaced when the save throws', async () => {
  const onUpdate = jest.fn().mockRejectedValue(new Error('boom'));
  const setSaveStatus = jest.fn();
  renderHook(() => useAutosave(makeOpts({ editingUid: 'u1', form: { title: 'b' }, onUpdate, setSaveStatus, onError: () => 'error' })));
  await tick(1200);
  expect(setSaveStatus).toHaveBeenCalledWith('saving');
  expect(setSaveStatus).toHaveBeenCalledWith('error');
});

test('create finalize:false skips the saved finalize', async () => {
  const onCreate = jest.fn().mockResolvedValue({ finalize: false });
  const setSaveStatus = jest.fn();
  renderHook(() => useAutosave(makeOpts({ editingUid: null, baseline: null, onCreate, setSaveStatus })));
  await tick(1200);
  expect(onCreate).toHaveBeenCalledTimes(1);
  expect(setSaveStatus).toHaveBeenCalledWith('saving');
  expect(setSaveStatus).not.toHaveBeenCalledWith('saved');
});
