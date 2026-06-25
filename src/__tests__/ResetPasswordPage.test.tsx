import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import { passwordResetService } from '../services/passwordResetService';

jest.mock('../services/passwordResetService', () => ({
  passwordResetService: { requestReset: jest.fn(), reset: jest.fn() },
}));
const svc = passwordResetService as jest.Mocked<typeof passwordResetService>;

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ResetPasswordPage />
    </MemoryRouter>
  );
}

function fill(pw: string, confirm = pw) {
  fireEvent.change(screen.getByPlaceholderText('New password (at least 10 characters)'), { target: { value: pw } });
  fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));
}

beforeEach(() => jest.clearAllMocks());

test('a valid token + matching password calls reset and shows success', async () => {
  svc.reset.mockResolvedValue(undefined);
  renderAt('/reset-password?token=good');
  fill('brandnewpass');

  await waitFor(() => expect(svc.reset).toHaveBeenCalledWith('good', 'brandnewpass', 'brandnewpass'));
  await screen.findByText(/password has been changed/i);
});

test('a password under 10 chars is rejected client-side; reset not called', async () => {
  renderAt('/reset-password?token=good');
  fill('short');
  await screen.findByText(/at least 10 characters/i);
  expect(svc.reset).not.toHaveBeenCalled();
});

test('no token in the URL shows the invalid-link state (no form)', () => {
  renderAt('/reset-password');
  expect(screen.getByText(/this reset link is invalid/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /change password/i })).toBeNull();
});
