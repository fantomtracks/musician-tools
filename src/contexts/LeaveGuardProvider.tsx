import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LeaveGuardContext, useLeaveGuard, type LeaveAttempt } from './LeaveGuardContext';

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<LeaveAttempt | null>(null);
  const registerLeaveGuard = useCallback((fn: LeaveAttempt | null) => {
    guardRef.current = fn;
  }, []);
  const attemptLeave = useCallback<LeaveAttempt>((proceed) => {
    if (guardRef.current) guardRef.current(proceed);
    else proceed();
  }, []);
  return (
    <LeaveGuardContext.Provider value={{ registerLeaveGuard, attemptLeave }}>
      {children}
    </LeaveGuardContext.Provider>
  );
}

// A drop-in replacement for react-router's <Link> that routes the navigation
// through the leave guard. Modifier clicks (cmd/ctrl/shift/alt/middle) fall back to
// the native link so "open in new tab" still works; only a plain left-click is
// intercepted.
export function GuardedLink({
  to,
  state,
  className,
  role,
  onClick,
  children,
}: {
  to: string;
  state?: unknown;
  className?: string;
  role?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const { attemptLeave } = useLeaveGuard();
  const navigate = useNavigate();
  return (
    <Link
      to={to}
      state={state}
      className={className}
      role={role}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // native new-tab
        e.preventDefault();
        onClick?.();
        attemptLeave(() => navigate(to, state !== undefined ? { state } : undefined));
      }}
    >
      {children}
    </Link>
  );
}
