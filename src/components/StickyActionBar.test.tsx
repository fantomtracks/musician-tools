import { render, screen } from '@testing-library/react';
import { StickyActionBar } from './StickyActionBar';

test('renders its children', () => {
  render(<StickyActionBar><button>Back</button><span>Saved</span></StickyActionBar>);
  expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  expect(screen.getByText('Saved')).toBeInTheDocument();
});

test('applies the shared sticky shell classes', () => {
  const { container } = render(<StickyActionBar><span>x</span></StickyActionBar>);
  const bar = container.firstChild as HTMLElement;
  expect(bar).toHaveClass('sticky', 'top-16', 'z-20', 'justify-between');
});

test('appends an optional className without dropping the shell', () => {
  const { container } = render(<StickyActionBar className="extra-x"><span>x</span></StickyActionBar>);
  const bar = container.firstChild as HTMLElement;
  expect(bar).toHaveClass('sticky', 'top-16', 'extra-x');
});
