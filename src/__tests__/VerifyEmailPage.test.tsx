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

test('a valid token verifies, hydrates auth from the returned user, and shows success (hard gate 7.13)', async () => {
  const applyAuthenticatedUser = jest.fn();
  // Clicked while logged OUT (register no longer auto-logs-in); verify returns
  // the user the server just signed in, which the page applies to auth state.
  mockedUseAuth.mockReturnValue({ isAuthenticated: false, user: null, patchUser: jest.fn(), applyAuthenticatedUser });
  const user = { uid: 'u1', name: 'Ada', email: 'ada@example.com', emailVerified: true, isAdmin: false };
  svc.verify.mockResolvedValue({ user });

  renderAt('/verify-email?token=good');

  await screen.findByText(/email confirmed/i);
  expect(svc.verify).toHaveBeenCalledWith('good');
  expect(applyAuthenticatedUser).toHaveBeenCalledWith(user);
});

test('a consumed-but-valid token shows "already verified" + Sign in even when logged OUT (story 12.1)', async () => {
  // The 2nd-device case: never logged in here, the server says alreadyVerified.
  mockedUseAuth.mockReturnValue({ isAuthenticated: false, user: null, patchUser: jest.fn(), applyAuthenticatedUser: jest.fn() });
  svc.verify.mockResolvedValue({ alreadyVerified: true });

  renderAt('/verify-email?token=usedonotherdevice');

  await screen.findByRole('heading', { name: /already verified/i });
  expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  expect(screen.queryByText(/invalid or expired/i)).not.toBeInTheDocument();
});

test('an invalid token shows the error state', async () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: false, user: null, patchUser: jest.fn(), applyAuthenticatedUser: jest.fn() });
  svc.verify.mockRejectedValue(new Error('bad'));

  renderAt('/verify-email?token=bad');

  await screen.findByText(/invalid or expired/i);
});

test('a logged-in redundant click (server says alreadyVerified) lands on success → "Go to the app", not "Sign in"', async () => {
  // The real backend now returns 200 { alreadyVerified: true } for a consumed
  // token + verified user; a logged-in re-clicker should be sent INTO the app.
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, user: { emailVerified: true }, patchUser: jest.fn(), applyAuthenticatedUser: jest.fn() });
  svc.verify.mockResolvedValue({ alreadyVerified: true });

  renderAt('/verify-email?token=alreadyused');

  await screen.findByText(/email confirmed/i);
  expect(screen.getByRole('link', { name: /go to the app/i })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
});

test('a still-throwing verify keeps the logged-in+verified fallback to success (belt)', async () => {
  // A genuine non-2xx (e.g. truly invalid link) while logged-in+verified still
  // shows success via the .catch fallback — unchanged safety net.
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, user: { emailVerified: true }, patchUser: jest.fn(), applyAuthenticatedUser: jest.fn() });
  svc.verify.mockRejectedValue(new Error('token used'));

  renderAt('/verify-email?token=bad');

  await screen.findByText(/email confirmed/i);
});

test('a missing token shows the error state without calling the service', async () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: false, patchUser: jest.fn(), applyAuthenticatedUser: jest.fn() });

  renderAt('/verify-email');

  await screen.findByText(/invalid or expired/i);
  expect(svc.verify).not.toHaveBeenCalled();
});

test('flow=change-email confirms the change (own copy) and patches the new email — story 7.11', async () => {
  const patchUser = jest.fn();
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, user: { emailVerified: true }, patchUser, applyAuthenticatedUser: jest.fn() });
  svc.confirmEmailChange.mockResolvedValue({ email: 'new@example.com' });

  renderAt('/verify-email?token=chg&flow=change-email');

  await screen.findByText(/email updated/i);
  expect(svc.confirmEmailChange).toHaveBeenCalledWith('chg');
  expect(svc.verify).not.toHaveBeenCalled();
  expect(patchUser).toHaveBeenCalledWith({ email: 'new@example.com' });
});

test('flow=change-email, consumed link, logged OUT → "already updated" + Sign in, not an error (12.1 twin)', async () => {
  // 2nd-device redundant click on an already-confirmed change link.
  mockedUseAuth.mockReturnValue({ isAuthenticated: false, user: null, patchUser: jest.fn(), applyAuthenticatedUser: jest.fn() });
  svc.confirmEmailChange.mockResolvedValue({ alreadyChanged: true, email: 'new@example.com' });

  renderAt('/verify-email?token=reused&flow=change-email');

  await screen.findByRole('heading', { name: /already updated/i });
  expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  expect(screen.queryByText(/invalid or expired/i)).not.toBeInTheDocument();
});

test('flow=change-email, alreadyChanged while logged IN → success (Go to the app), email refreshed', async () => {
  const patchUser = jest.fn();
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, user: { emailVerified: true }, patchUser, applyAuthenticatedUser: jest.fn() });
  svc.confirmEmailChange.mockResolvedValue({ alreadyChanged: true, email: 'new@example.com' });

  renderAt('/verify-email?token=reused&flow=change-email');

  await screen.findByText(/email updated/i);
  expect(screen.getByRole('link', { name: /go to the app/i })).toBeInTheDocument();
  expect(patchUser).toHaveBeenCalledWith({ email: 'new@example.com' });
});
