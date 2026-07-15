import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { RootLayout, HomePage } from './App';
import { RequireAuth, GuestOnly } from './components/RequireAuth';
import Songs from './pages/Songs';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MyInstrumentsPage from './pages/MyInstrumentsPage';
import MyPlaylistsPage from './pages/MyPlaylistsPage';
import MyTopicsPage from './pages/MyTopicsPage';
import MySessionsPage from './pages/MySessionsPage';
import MyHeatmapPage from './pages/MyHeatmapPage';
import ProfilePage from './pages/ProfilePage';
import CatalogAdmin from './pages/CatalogAdmin';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// Story 18.1 — data-router route tree. Exact equivalent of the previous <Routes>:
// same paths, same auth redirects (RequireAuth -> /login ; GuestOnly -> /songs ;
// unknown -> /). Auth stays a client context (no loaders). Of the two former
// <BrowserRouter> future flags, v7_relativeSplatPath is router-level (here);
// v7_startTransition is render-level (on <RouterProvider> in main.tsx).
// Exported so the smoke test can exercise the exact same route tree (paths + auth
// guards + catch-all) via useRoutes + <MemoryRouter>. Note: the data-router wiring
// itself (createBrowserRouter / RouterProvider / future flags below) is validated by
// tsc + manual QA, not by jsdom unit tests — createMemoryRouter needs the Fetch
// primitives (Request/Response) which jsdom doesn't provide.
export const routes: RouteObject[] = [
    {
      element: <RootLayout />,
      children: [
        { index: true, element: <HomePage /> },
        {
          element: <RequireAuth />,
          children: [
            // Story 18.2: the song form is a real route now — /songs (list),
            // /songs/new (add), /songs/:uid (edit). All render <Songs/>, which reads
            // useParams to pick the mode.
            { path: 'songs', element: <Songs /> },
            { path: 'songs/new', element: <Songs /> },
            { path: 'songs/:uid', element: <Songs /> },
            { path: 'my-instruments', element: <MyInstrumentsPage /> },
            { path: 'my-playlists', element: <MyPlaylistsPage /> },
            { path: 'my-topics', element: <MyTopicsPage /> },
            { path: 'my-sessions', element: <MySessionsPage /> },
            { path: 'my-heatmap', element: <MyHeatmapPage /> },
            { path: 'profile', element: <ProfilePage /> },
            // Story 19.2 — Catalog curator admin. Auth-gated here; the curator role
            // check lives inside CatalogAdmin (redirects non-curators to /).
            { path: 'catalog/admin', element: <CatalogAdmin /> },
          ],
        },
        // Public — reached from the email link, possibly while signed out (story 7.9/7.10)
        { path: 'verify-email', element: <VerifyEmailPage /> },
        { path: 'forgot-password', element: <ForgotPasswordPage /> },
        { path: 'reset-password', element: <ResetPasswordPage /> },
        {
          element: <GuestOnly />,
          children: [
            { path: 'login', element: <LoginPage /> },
            { path: 'register', element: <RegisterPage /> },
          ],
        },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
];

export const router = createBrowserRouter(routes, {
  future: { v7_relativeSplatPath: true },
});
