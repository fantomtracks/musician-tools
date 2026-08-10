// A COMPLETE jest mock of `catalogService`, derived from the real module's own keys.
//
// Why this exists (retro Epic 20 action item #2, deferred twice, then it bit us in
// Epic 21): suites used to hand-write a PARTIAL mock — `{ listCatalog: jest.fn(),
// deleteCatalogEntry: jest.fn() }`. The day the page called one more service method,
// every test in the file died on `not a function`, in a place unrelated to the change.
//
// Deriving the mock from `Object.keys` of the real service means a new service method
// is automatically stubbed: a suite can only fail for a real reason.
//
// Usage — `jest.mock` factories are hoisted, so require this INSIDE the factory:
//
//   jest.mock('../services/catalogService', () => {
//     const actual = jest.requireActual('../services/catalogService');
//     const { makeCatalogServiceMock } = jest.requireActual('../test/catalogServiceMock');
//     return { ...actual, catalogService: makeCatalogServiceMock() };
//   });
//
// Spreading `actual` keeps the real error classes (CatalogNotFoundError,
// CollectionNotFoundError, …) so `instanceof` checks in the page still work.
export function makeCatalogServiceMock(): Record<string, jest.Mock> {
  const { catalogService } = jest.requireActual('../services/catalogService');
  const mock: Record<string, jest.Mock> = {};
  for (const key of Object.keys(catalogService)) {
    // Resolve, don't just return undefined: every service method is async and callers
    // do `.then(...)` / `await`. A bare jest.fn() returns undefined, so an unstubbed
    // method still kills the suite — one line further down, on `undefined.then`. That
    // is the very failure this factory exists to prevent.
    mock[key] = jest.fn().mockResolvedValue(undefined);
  }
  return mock;
}
