import { createContext, useContext } from 'react';

// A recap channel that OUTLIVES the page that started the batch (story 24.2).
//
// ⚠️ This deliberately reverses a written decision. `src/components/Toast.tsx` says
// "deliberately NO global toast provider", and that was right in story 22.5: every toast then
// belonged to the page that raised it. It stopped being right here, for one precise reason —
// when a bulk action is abandoned by navigating away, the recap has to survive the unmount of
// the very component that would have shown it. A page-local toast dies with its component, so
// it CANNOT carry that message.
//
// Scope of the reversal, on purpose: batches only. The existing page-local toasts
// (`useState` + `setTimeout(2500)`, the project convention) are untouched, and nothing here
// invites migrating them.
//
// Split into a .ts (context + hook) and a .tsx (component) because the ESLint rule
// `react-refresh/only-export-components` rejects a file exporting both — the same split as
// AuthContext / AuthProvider.
export interface GlobalToastValue {
  /** Show a message that survives navigation and unmounting. */
  showGlobalToast: (message: string) => void;
}

// A no-op default so a component used outside the provider (an isolated test, a Storybook-ish
// render) does not crash — it simply says nothing, which is the honest degradation here.
export const GlobalToastContext = createContext<GlobalToastValue>({
  showGlobalToast: () => {},
});

export function useGlobalToast(): GlobalToastValue {
  return useContext(GlobalToastContext);
}
