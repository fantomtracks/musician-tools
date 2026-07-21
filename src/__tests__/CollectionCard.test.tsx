import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CollectionCard from '../components/CollectionCard';

// Story 20.4 — the brand-gradient Collection tile (stretched-link to the detail).
test('renders the name, a song count, and a link to the collection detail', () => {
  render(
    <MemoryRouter>
      <CollectionCard collection={{ uid: 'col1', name: 'Rock 90s', songCount: 3 }} />
    </MemoryRouter>
  );
  expect(screen.getByText('Rock 90s')).toBeInTheDocument();
  expect(screen.getByText('3 songs')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'Open the Rock 90s collection' });
  expect(link).toHaveAttribute('href', '/catalog/collections/col1');
});

test('singularizes the song count', () => {
  render(
    <MemoryRouter>
      <CollectionCard collection={{ uid: 'c2', name: 'Solo', songCount: 1 }} />
    </MemoryRouter>
  );
  expect(screen.getByText('1 song')).toBeInTheDocument();
});
