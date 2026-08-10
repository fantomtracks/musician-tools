import { StrictMode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination';

const renderPager = (page: number, totalPages: number, onPageChange = jest.fn()) => {
  render(<StrictMode><Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} /></StrictMode>);
  return onPageChange;
};

test('renders nothing when there is a single page (the guard lives here)', () => {
  const { container } = render(
    <StrictMode><Pagination page={1} totalPages={1} onPageChange={() => {}} /></StrictMode>
  );
  expect(container).toBeEmptyDOMElement();
});

test('shows the position and steps one page at a time', () => {
  const onPageChange = renderPager(2, 5);
  expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(onPageChange).toHaveBeenCalledWith(3);
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(onPageChange).toHaveBeenCalledWith(1);
});

test('the edges are disabled, so no out-of-range page can be requested', () => {
  renderPager(1, 3);
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
});

// The guard must behave exactly like the `{totalPages > 1 && ...}` it replaced —
// including on the values where `<= 1` would disagree with it.
test('a non-numeric page count renders nothing (no "Page 1 of NaN" with Next enabled)', () => {
  const { container } = render(
    <StrictMode><Pagination page={1} totalPages={NaN} onPageChange={() => {}} /></StrictMode>
  );
  expect(container).toBeEmptyDOMElement();
});

test('a zero page count renders nothing', () => {
  const { container } = render(
    <StrictMode><Pagination page={1} totalPages={0} onPageChange={() => {}} /></StrictMode>
  );
  expect(container).toBeEmptyDOMElement();
});

test('the last page disables Next', () => {
  renderPager(3, 3);
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
});
