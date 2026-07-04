import { render, screen, fireEvent } from '@testing-library/react';
import FiltersDisclosureButton from '../components/FiltersDisclosureButton';

test('shows "Filters" alone when no active filters', () => {
  render(<FiltersDisclosureButton open={false} onToggle={jest.fn()} activeFilterCount={0} />);
  const btn = screen.getByRole('button', { name: /show filters/i });
  expect(btn).toHaveTextContent('Filters');
  expect(btn).not.toHaveTextContent('·');
  expect(btn).toHaveAttribute('aria-expanded', 'false');
  expect(btn).toHaveAttribute('aria-controls', 'songs-sidebar');
});

test('shows the active-filter count as "Filters · N"', () => {
  render(<FiltersDisclosureButton open={false} onToggle={jest.fn()} activeFilterCount={2} />);
  expect(screen.getByRole('button')).toHaveTextContent('Filters · 2');
});

test('reflects open state via aria-expanded and aria-label', () => {
  render(<FiltersDisclosureButton open onToggle={jest.fn()} activeFilterCount={0} />);
  const btn = screen.getByRole('button', { name: /hide filters/i });
  expect(btn).toHaveAttribute('aria-expanded', 'true');
});

test('calls onToggle when clicked', () => {
  const onToggle = jest.fn();
  render(<FiltersDisclosureButton open={false} onToggle={onToggle} activeFilterCount={0} />);
  fireEvent.click(screen.getByRole('button'));
  expect(onToggle).toHaveBeenCalledTimes(1);
});
