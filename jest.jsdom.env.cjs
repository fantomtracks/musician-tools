// Story 18.2 — custom jsdom test environment that bridges Node's Fetch primitives
// (Request/Response/Headers/fetch — available in this Node-realm module but NOT on
// jsdom's global) into the test global. react-router's data router (createMemoryRouter,
// needed to render components using useBlocker) requires `Request`. Zero new npm dep:
// it reuses Node's built-in globals.
const JSDOMEnvironmentImport = require('jest-environment-jsdom');
const JSDOMEnvironment = JSDOMEnvironmentImport.TestEnvironment || JSDOMEnvironmentImport.default || JSDOMEnvironmentImport;

module.exports = class DataRouterJsdomEnvironment extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context);
    // The whole fetch family must come from ONE realm — Node's — so createMemoryRouter's
    // internal Request/AbortSignal interop (an instanceof check) doesn't mix jsdom's
    // AbortSignal with Node's Request. Override jsdom's where Node provides one.
    const fetchFamily = ['Request', 'Response', 'Headers', 'fetch', 'AbortController', 'AbortSignal', 'ReadableStream'];
    for (const key of fetchFamily) {
      if (typeof globalThis[key] !== 'undefined') this.global[key] = globalThis[key];
    }
    // These only if jsdom lacks them.
    for (const key of ['TextEncoder', 'TextDecoder']) {
      if (this.global[key] === undefined && typeof globalThis[key] !== 'undefined') {
        this.global[key] = globalThis[key];
      }
    }
  }
};
