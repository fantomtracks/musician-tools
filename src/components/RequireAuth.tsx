import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Story 18.1 — data-router route guards. Auth stays a client context (no loaders):
// these wrapper routes render an <Outlet/> for their children or redirect.

// Protected routes: a signed-out visitor is sent to /login.
export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

// Guest-only routes (login / register): a signed-in user is sent to their songlist.
export function GuestOnly() {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated ? <Outlet /> : <Navigate to="/songs" replace />;
}
