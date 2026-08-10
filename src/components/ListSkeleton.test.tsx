import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { DetailPageSkeleton, ListSkeleton } from './ListSkeleton';

test('renders the requested number of placeholder rows', () => {
  const { container } = render(<StrictMode><ListSkeleton rows={4} /></StrictMode>);
  expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4);
});

test('defaults to a full page of rows', () => {
  const { container } = render(<StrictMode><ListSkeleton /></StrictMode>);
  expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
});

test('placeholders are hidden from assistive tech, and outer spacing is composable', () => {
  const { container } = render(<StrictMode><ListSkeleton rows={2} className="mt-4" /></StrictMode>);
  const wrapper = container.firstChild as HTMLElement;
  expect(wrapper).toHaveAttribute('aria-hidden', 'true');
  expect(wrapper).toHaveClass('space-y-2', 'mt-4');
});

test('the detail placeholder renders a title bar and a content block, also hidden', () => {
  const { container } = render(<StrictMode><DetailPageSkeleton /></StrictMode>);
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
});
