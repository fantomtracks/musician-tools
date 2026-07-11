import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import Songs from '../pages/Songs';

// Story 18.2 — the Songs page now uses useBlocker + useParams, so it must be rendered
// inside a DATA router (createMemoryRouter), not <MemoryRouter>, with the same 3 song
// routes as production. The custom jest environment (jest.jsdom.env.cjs) provides the
// Fetch primitives createMemoryRouter needs.
export function renderSongs(initialPath = '/songs') {
  const router = createMemoryRouter(
    [
      { path: '/songs', element: <Songs /> },
      { path: '/songs/new', element: <Songs /> },
      { path: '/songs/:uid', element: <Songs /> },
    ],
    { initialEntries: [initialPath] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
