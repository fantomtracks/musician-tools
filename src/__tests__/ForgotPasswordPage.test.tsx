import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import { passwordResetService } from '../services/passwordResetService';

jest.mock('../services/passwordResetService', () => ({
  passwordResetService: { requestReset: jest.fn(), reset: jest.fn() },
}));
const svc = passwordResetService as jest.Mocked<typeof passwordResetService>;

beforeEach(() => jest.clearAllMocks());

test('submitting an email shows the generic confirmation (no existence reveal)', async () => {
  svc.requestReset.mockResolvedValue(undefined);
  render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);

  fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: 'ada@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

  await waitFor(() => expect(svc.requestReset).toHaveBeenCalledWith('ada@example.com'));
  await screen.findByText(/if an account matches/i);
  // Anti-enumeration: never confirm/deny the account.
  expect(screen.queryByText(/no account|doesn't exist|not found/i)).toBeNull();
});
