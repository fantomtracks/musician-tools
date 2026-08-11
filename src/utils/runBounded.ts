// Run an async operation over a list with a bounded number of calls in flight
// (story 22.2). The bulk actions of the Catalog list screens fire N unitary requests
// on the existing endpoints — there is no bulk endpoint (epic 22, decision A) — and
// firing 24 at once would hammer the API for no gain.
//
// Semantics are `Promise.allSettled`'s, deliberately: this is the best-effort,
// non-atomic regime already anchored by the collection import (story 20.3). One
// failing item must never abort the batch, and the caller needs to know WHICH items
// failed to build its segmented recap — hence results in the ORDER OF THE ITEMS,
// not in completion order.
//
// Shared on purpose: stories 22.3 ("Remove selected") and 22.4 ("Add selected to my
// songlist") use it as-is.
// An item the batch never STARTED (story 24.2). It is a rejection so the result array keeps its
// `PromiseSettledResult` shape — no type churn for the three existing callers — but it is a
// distinct TYPE, because the difference matters: a skipped item wrote NOTHING, and counting it
// as "failed" sends the user looking for a server problem that does not exist.
// Same discriminator pattern as SongConflictError / CatalogNotFoundError elsewhere in the app.
export class BatchSkippedError extends Error {
  constructor() {
    super('Not started: the batch was cancelled before reaching this item.');
    this.name = 'BatchSkippedError';
  }
}

export async function runBounded<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      // Checked HERE, before taking the item — cancelling the requests is not enough, the loop
      // would otherwise walk the whole list and start every one of them.
      if (signal?.aborted) {
        results[index] = { status: 'rejected', reason: new BatchSkippedError() };
        continue;
      }
      try {
        // `await fn(...)` inside the try so a SYNCHRONOUS throw in the worker is
        // captured like a rejection instead of escaping the whole batch.
        results[index] = { status: 'fulfilled', value: await fn(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  // A non-finite limit would make Math.min/Math.max produce NaN and
  // Array.from({length: NaN}) an empty pool — the batch would resolve instantly with a
  // sparse array and the caller would read `undefined.status`. Fall back to serial.
  const safeLimit = Number.isFinite(limit) ? Math.floor(limit) : 1;
  const workers = Math.max(1, Math.min(safeLimit, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
