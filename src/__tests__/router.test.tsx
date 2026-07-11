import { render, screen } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';

// Story 18.1 — verify the route TREE (paths + auth guards + catch-all) resolves
// exactly as the old <Routes> did. Mounted via useRoutes + <MemoryRouter> (component
// router) rather than the real data-router, because createMemoryRouter needs the
// Fetch primitives jsdom lacks — so this covers the tree/redirects, not the
// createBrowserRouter/RouterProvider wiring (that's tsc + manual QA). Pages and the
// layout chrome are stubbed; auth is mocked (client context).
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../App', () => {
  const { Outlet } = jest.requireActual('react-router-dom');
  return {
    RootLayout: () => <div data-testid="layout"><Outlet /></div>,
    HomePage: () => <div>HOME</div>,
  };
});
jest.mock('../pages/Songs', () => ({ __esModule: true, default: () => <div>SONGS</div> }));
jest.mock('../pages/LoginPage', () => ({ __esModule: true, default: () => <div>LOGIN</div> }));
jest.mock('../pages/RegisterPage', () => ({ __esModule: true, default: () => <div>REGISTER</div> }));
jest.mock('../pages/MyInstrumentsPage', () => ({ __esModule: true, default: () => <div>INSTRUMENTS</div> }));
jest.mock('../pages/MyPlaylistsPage', () => ({ __esModule: true, default: () => <div>PLAYLISTS</div> }));
jest.mock('../pages/MyTopicsPage', () => ({ __esModule: true, default: () => <div>TOPICS</div> }));
jest.mock('../pages/MySessionsPage', () => ({ __esModule: true, default: () => <div>SESSIONS</div> }));
jest.mock('../pages/MyHeatmapPage', () => ({ __esModule: true, default: () => <div>HEATMAP</div> }));
jest.mock('../pages/ProfilePage', () => ({ __esModule: true, default: () => <div>PROFILE</div> }));
jest.mock('../pages/VerifyEmailPage', () => ({ __esModule: true, default: () => <div>VERIFY</div> }));
jest.mock('../pages/ForgotPasswordPage', () => ({ __esModule: true, default: () => <div>FORGOT</div> }));
jest.mock('../pages/ResetPasswordPage', () => ({ __esModule: true, default: () => <div>RESET</div> }));

import { routes } from '../router';
import { useAuth } from '../contexts/AuthContext';
const mockAuth = useAuth as jest.Mock;

// Render the SAME `routes` array via the component router (useRoutes + <MemoryRouter>)
// — no data-router / Fetch primitives needed, yet it exercises the exact tree.
function RoutedApp() {
  return useRoutes(routes);
}

function renderAt(path: string, isAuthenticated: boolean) {
  mockAuth.mockReturnValue({ isAuthenticated, loading: false, user: null });
  render(
    <MemoryRouter initialEntries={[path]}>
      <RoutedApp />
    </MemoryRouter>,
  );
}

describe('router — data-router route tree (story 18.1)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('index / renders HomePage', () => {
    renderAt('/', false);
    expect(screen.getByText('HOME')).toBeInTheDocument();
  });

  test('an unknown path redirects to home (catch-all → /)', () => {
    renderAt('/does-not-exist', false);
    expect(screen.getByText('HOME')).toBeInTheDocument();
  });

  test('a protected route redirects to /login when signed out', () => {
    renderAt('/songs', false);
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });

  test('a protected route renders when signed in', () => {
    renderAt('/songs', true);
    expect(screen.getByText('SONGS')).toBeInTheDocument();
  });

  test.each(['/my-instruments', '/my-playlists', '/my-topics', '/my-sessions', '/my-heatmap', '/profile'])(
    'protected route %s redirects to /login when signed out',
    (path) => {
      renderAt(path, false);
      expect(screen.getByText('LOGIN')).toBeInTheDocument();
    },
  );

  test('a guest-only route (login) redirects to /songs when signed in', () => {
    renderAt('/login', true);
    expect(screen.getByText('SONGS')).toBeInTheDocument();
  });

  test('a guest-only route renders when signed out', () => {
    renderAt('/register', false);
    expect(screen.getByText('REGISTER')).toBeInTheDocument();
  });

  test('public routes render regardless of auth', () => {
    renderAt('/verify-email', false);
    expect(screen.getByText('VERIFY')).toBeInTheDocument();
  });
});
