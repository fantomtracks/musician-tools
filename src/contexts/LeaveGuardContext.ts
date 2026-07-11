import { createContext, useContext } from 'react';

// Story 17.2 — app-wide "leave guard". This app uses <BrowserRouter> (not a data
// router), so react-router's useBlocker is unavailable. Instead a page (the song
// form) registers a guard predicate; every in-app navigation consults it via
// `attemptLeave(proceed)`. The guard either calls `proceed()` immediately (safe to
// leave) or defers it behind a popup (e.g. a titleless draft) and calls it later.
// When no guard is registered, `attemptLeave` just proceeds — a no-op everywhere else.

export type LeaveAttempt = (proceed: () => void) => void;

export type LeaveGuardValue = {
  registerLeaveGuard: (fn: LeaveAttempt | null) => void;
  attemptLeave: LeaveAttempt;
};

export const LeaveGuardContext = createContext<LeaveGuardValue>({
  registerLeaveGuard: () => {},
  attemptLeave: (proceed) => proceed(),
});

export function useLeaveGuard() {
  return useContext(LeaveGuardContext);
}
