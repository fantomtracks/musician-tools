import '@testing-library/jest-dom';

// jsdom does not implement matchMedia; provide a minimal stub so components that read
// prefers-color-scheme (e.g. Header's dark-mode init) can render in tests.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}