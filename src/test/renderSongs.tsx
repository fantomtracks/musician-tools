import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import Songs from '../pages/Songs';

// Story 18.2 — the Songs page now uses useBlocker + useParams, so it must be rendered
// inside a DATA router (createMemoryRouter), not <MemoryRouter>, with the same 3 song
// routes as production. The custom jest environment (jest.jsdom.env.cjs) provides the
// Fetch primitives createMemoryRouter needs.
//
// Wrapped in <StrictMode> BY DEFAULT — main.tsx mounts the app under StrictMode, so
// tests must exercise the same mount→unmount→mount double-invoke; it surfaces mount-flag /
// effect-cleanup / non-idempotent-effect bugs the single-pass render hides (Epic 18 QA
// caught three of these in prod-dev while the non-strict suite stayed green). Pass
// { strict: false } only to isolate a non-StrictMode baseline when debugging.
export function renderSongs(initialPath = '/songs', { strict = true } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/songs', element: <Songs /> },
      { path: '/songs/new', element: <Songs /> },
      { path: '/songs/:uid', element: <Songs /> },
    ],
    { initialEntries: [initialPath] },
  );
  const tree = <RouterProvider router={router} />;
  return { ...render(strict ? <StrictMode>{tree}</StrictMode> : tree), router };
}
