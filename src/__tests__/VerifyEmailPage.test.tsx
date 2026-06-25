import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VerifyEmailPage from '../pages/VerifyEmailPage';
import { useAuth } from '../contexts/AuthContext';
import { verificationService } from '../services/verificationService';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/verificationService', () => ({
  verificationService: { verify: jest.fn(), resend: jest.fn(), confirmEmailChange: jest.fn() },
}));

const mockedUseAuth = useAuth as jest.Mock;
const svc = verificationService as jest.Mocked<typeof verificationService>;

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <VerifyEmailPage />
    </MemoryRouter>
  );
}

beforeEach(() => jest.clearAllMocks());

test('a valid token verifies and (when signed in) refreshes emailVerified', async () => {
  const patchUser = jest.fn();
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, patchUser });
  svc.verify.mockResolvedValue(undefined);

  renderAt('/verify-email?token=good');

  await screen.findByText(/email confirmed/i);
  expect(svc.verify).toHaveBeenCalledWith('good');
  expect(patchUser).toHaveBeenCalledWith({ emailVerified: true });
});

test('an invalid token shows the error state', async () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: false, user: null, patchUser: jest.fn() });
  svc.verify.mockRejectedValue(new Error('bad'));

  renderAt('/verify-email?token=bad');

  await screen.findByText(/invalid or expired/i);
});

test('a consumed token shows success when the logged-in user is already verified (refresh/2nd click)', async () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, user: { emailVerified: true }, patchUser: jest.fn() });
  svc.verify.mockRejectedValue(new Error('token used'));

  renderAt('/verify-email?token=alreadyused');

  await screen.findByText(/email confirmed/i);
});

test('a missing token shows the error state without calling the service', async () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: false, patchUser: jest.fn() });

  renderAt('/verify-email');

  await screen.findByText(/invalid or expired/i);
  expect(svc.verify).not.toHaveBeenCalled();
});

test('flow=change-email confirms the change (own copy) and patches the new email — story 7.11', async () => {
  const patchUser = jest.fn();
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, user: { emailVerified: true }, patchUser });
  svc.confirmEmailChange.mockResolvedValue('new@example.com');

  renderAt('/verify-email?token=chg&flow=change-email');

  await screen.findByText(/email updated/i);
  expect(svc.confirmEmailChange).toHaveBeenCalledWith('chg');
  expect(svc.verify).not.toHaveBeenCalled();
  expect(patchUser).toHaveBeenCalledWith({ email: 'new@example.com' });
});
