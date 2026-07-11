import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import Songs from '../pages/Songs';

// Story 18.2 — the Songs page now uses useBlocker + useParams, so it must be rendered
// inside a DATA router (createMemoryRouter), not <MemoryRouter>, with the same 3 song
// routes as production. The custom jest environment (jest.jsdom.env.cjs) provides the
// Fetch primitives createMemoryRouter needs.
//
// `strict` wraps in <StrictMode> to reproduce dev's mount→unmount→mount double-invoke,
// which surfaces mount-flag / effect-cleanup bugs the single-pass test render hides.
export function renderSongs(initialPath = '/songs', { strict = false } = {}) {
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
