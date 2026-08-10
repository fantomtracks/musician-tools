import { runBounded } from './runBounded';

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('returns one settled result per item, in the ORDER OF THE ITEMS', async () => {
  // Later items settle first — the output must still follow the input order.
  const results = await runBounded([30, 20, 10], 3, async n => {
    await new Promise(r => setTimeout(r, n));
    return n;
  });
  expect(results.map(r => r.status === 'fulfilled' && r.value)).toEqual([30, 20, 10]);
});

test('a rejection never aborts the batch (allSettled semantics, best-effort)', async () => {
  const results = await runBounded(['ok', 'boom', 'ok2'], 2, async v => {
    if (v === 'boom') throw new Error('nope');
    return v;
  });
  expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  expect(results[1].status === 'rejected' && (results[1].reason as Error).message).toBe('nope');
});

test('a synchronous throw inside the worker is captured, not propagated', async () => {
  const results = await runBounded([1, 2], 2, (n): Promise<number> => {
    if (n === 1) throw new Error('sync');
    return Promise.resolve(n);
  });
  expect(results[0].status).toBe('rejected');
  expect(results[1].status).toBe('fulfilled');
});

test('never runs more than `limit` calls at once', async () => {
  let inFlight = 0;
  let peak = 0;
  const gates = Array.from({ length: 6 }, () => deferred<void>());

  const promise = runBounded([0, 1, 2, 3, 4, 5], 2, async i => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await gates[i].promise;
    inFlight -= 1;
    return i;
  });

  // Let the pool fill, then release the tasks one at a time.
  await Promise.resolve();
  expect(peak).toBe(2);
  for (const g of gates) {
    g.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
  const results = await promise;
  expect(peak).toBe(2);
  // The ceiling means nothing if the pool silently dropped work.
  expect(results.map(r => r.status === 'fulfilled' && r.value)).toEqual([0, 1, 2, 3, 4, 5]);
});

test('a non-finite limit falls back to serial instead of returning a sparse array', async () => {
  const results = await runBounded([1, 2, 3], NaN as unknown as number, async n => n);
  expect(results).toHaveLength(3);
  expect(results.every(r => r.status === 'fulfilled')).toBe(true);
});

test('an empty list resolves to an empty array without calling the worker', async () => {
  const fn = jest.fn();
  await expect(runBounded([], 4, fn)).resolves.toEqual([]);
  expect(fn).not.toHaveBeenCalled();
});

test('a limit larger than the list is harmless', async () => {
  const results = await runBounded([1, 2], 10, async n => n * 2);
  expect(results.map(r => r.status === 'fulfilled' && r.value)).toEqual([2, 4]);
});
