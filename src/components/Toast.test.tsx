import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { Toast } from './Toast';

const renderToast = (message: string | null) =>
  render(<StrictMode><Toast message={message} /></StrictMode>);

test('the live region is mounted even with no message, so an announcement is never missed', () => {
  renderToast(null);
  // Present but silent: the region exists, the visible bubble does not.
  expect(screen.getByRole('status', { name: 'Notification' })).toBeEmptyDOMElement();
});

test('an empty string shows no bubble', () => {
  renderToast('');
  expect(screen.getByRole('status', { name: 'Notification' })).toBeEmptyDOMElement();
});

test('a message is rendered AND announced', () => {
  renderToast('2 entries deleted');
  const region = screen.getByRole('status', { name: 'Notification' });
  expect(region).toHaveAttribute('aria-live', 'polite');
  expect(region).toHaveTextContent('2 entries deleted');
});

// This story exists to unify these exact classes across four screens — lock them, so a
// future edit to one surface cannot silently re-fork the toast.
test('the bubble carries the shared bottom-centre styling', () => {
  renderToast('Saved');
  const bubble = screen.getByText('Saved');
  expect(bubble).toHaveClass(
    'fixed', 'bottom-6', 'left-1/2', '-translate-x-1/2',
    'bg-gray-900', 'text-white', 'text-sm', 'px-4', 'py-2', 'rounded-lg', 'shadow-lg', 'z-50'
  );
});
