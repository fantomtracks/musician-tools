import { runBounded, BatchSkippedError } from './runBounded';

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

// ---------------------------------------------------------------------------
// Story 24.2 — arrêter de tirer des items quand le lot est abandonné
// ---------------------------------------------------------------------------

describe('runBounded — annulation (story 24.2)', () => {
  test('cesse de démarrer de nouveaux items dès que le signal est déclenché', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const items = [1, 2, 3, 4, 5, 6, 7, 8];

    const results = await runBounded(items, 2, async (item) => {
      started.push(item);
      if (started.length === 2) controller.abort(); // on abandonne après les 2 premiers
      return item;
    }, controller.signal);

    // Le vrai gain : ce qui n'est jamais parti n'a RIEN écrit.
    expect(started.length).toBeLessThan(items.length);
    expect(results).toHaveLength(items.length); // l'ordre et la taille restent contractuels
  });

  test('un item jamais démarré est distinct d\'un échec', async () => {
    const controller = new AbortController();
    controller.abort(); // rien ne doit partir du tout

    const results = await runBounded([1, 2, 3], 2, async () => 'écrit', controller.signal);

    for (const result of results) {
      expect(result.status).toBe('rejected');
      // Le compter en « failed » ferait chercher une panne serveur qui n'existe pas.
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(BatchSkippedError);
    }
  });

  test('sans signal, le comportement est strictement celui d\'avant', async () => {
    const results = await runBounded([1, 2, 3], 2, async (n) => n * 10);
    expect(results.map(r => (r as PromiseFulfilledResult<number>).value)).toEqual([10, 20, 30]);
  });

  test('l\'ordre des résultats reste celui des items, même interrompu', async () => {
    const controller = new AbortController();
    const results = await runBounded([1, 2, 3, 4], 1, async (n) => {
      if (n === 2) controller.abort();
      return n;
    }, controller.signal);

    // Les récaps segmentés lisent results[i] en face de items[i] : l'ordre est contractuel.
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1]).toEqual({ status: 'fulfilled', value: 2 });
    expect((results[2] as PromiseRejectedResult).reason).toBeInstanceOf(BatchSkippedError);
    expect((results[3] as PromiseRejectedResult).reason).toBeInstanceOf(BatchSkippedError);
  });
});
