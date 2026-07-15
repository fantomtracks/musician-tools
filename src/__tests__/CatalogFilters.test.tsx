import { render, screen, fireEvent } from '@testing-library/react';
import CatalogFilters from '../components/CatalogFilters';

const FACETS = { genre: ['Rock', 'Reggae'], key: ['Em'], mode: [], timeSignature: [] };

test('renders a pill per facet value; only non-empty dimensions; reflects selection', () => {
  render(
    <CatalogFilters
      facets={FACETS}
      selected={{ genre: ['Rock'], key: [], mode: [], timeSignature: [] }}
      onToggle={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: 'Rock' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Reggae' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByText('Genre')).toBeInTheDocument();
  expect(screen.getByText('Key')).toBeInTheDocument();
  expect(screen.queryByText('Mode')).toBeNull(); // empty dimension not shown
});

test('clicking a pill calls onToggle with the dimension and value', () => {
  const onToggle = jest.fn();
  render(
    <CatalogFilters
      facets={FACETS}
      selected={{ genre: [], key: [], mode: [], timeSignature: [] }}
      onToggle={onToggle}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reggae' }));
  expect(onToggle).toHaveBeenCalledWith('genre', 'Reggae');
});
