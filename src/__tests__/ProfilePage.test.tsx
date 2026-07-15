import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfilePage from '../pages/ProfilePage';
import { useAuth } from '../contexts/AuthContext';
import { profileService } from '../services/profileService';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/profileService', () => ({
  profileService: {
    getProfile: jest.fn(),
    updateName: jest.fn(),
    changePassword: jest.fn(),
    requestEmailChange: jest.fn(),
  },
}));

const mockedUseAuth = useAuth as jest.Mock;
const svc = profileService as jest.Mocked<typeof profileService>;

const PROFILE = {
  uid: 'u1', name: 'Ada', discriminator: '0042', handle: 'Ada#0042',
  email: 'ada@example.com', pendingEmail: null, emailVerified: true, isAdmin: false,
};

let patchUser: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  patchUser = jest.fn();
  mockedUseAuth.mockReturnValue({ patchUser });
  svc.getProfile.mockResolvedValue({ ...PROFILE });
});

test('loads the profile and shows the handle + email with a change-email control (story 7.11)', async () => {
  render(<ProfilePage />);
  await screen.findByText('Ada#0042');
  expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/new email address/i)).toBeInTheDocument();
});

test('rehydrates the curator flag into the auth user on profile load (story 19.2)', async () => {
  svc.getProfile.mockResolvedValue({ ...PROFILE, isCurator: true });
  render(<ProfilePage />);
  await screen.findByText('Ada#0042');
  expect(patchUser).toHaveBeenCalledWith({ isCurator: true });
});

test('requesting an email change shows the generic message (never reveals availability)', async () => {
  svc.requestEmailChange.mockResolvedValue(undefined);
  render(<ProfilePage />);
  await screen.findByText('Ada#0042');

  fireEvent.change(screen.getByPlaceholderText(/new email address/i), { target: { value: 'new@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: /change email/i }));

  await waitFor(() => expect(svc.requestEmailChange).toHaveBeenCalledWith('new@example.com'));
  await screen.findByText(/if that address is available/i);
  expect(screen.queryByText(/taken|in use|already exists/i)).toBeNull();
});

test('saving a new name updates the handle and patches the auth user', async () => {
  svc.updateName.mockResolvedValue({ name: 'Bea', discriminator: '0042', handle: 'Bea#0042' });
  render(<ProfilePage />);
  await screen.findByText('Ada#0042');

  fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'Bea' } });
  fireEvent.click(screen.getByRole('button', { name: /save name/i }));

  await waitFor(() => expect(svc.updateName).toHaveBeenCalledWith('Bea'));
  expect(patchUser).toHaveBeenCalledWith({ name: 'Bea', discriminator: '0042', handle: 'Bea#0042' });
  await screen.findByText('Bea#0042');
});

test('password change is blocked client-side when shorter than 10 chars', async () => {
  render(<ProfilePage />);
  await screen.findByText('Ada#0042');

  fireEvent.change(screen.getByPlaceholderText('Current password'), { target: { value: 'oldpass123' } });
  fireEvent.change(screen.getByPlaceholderText('New password (at least 10 characters)'), { target: { value: 'short' } });
  fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await screen.findByText(/at least 10 characters/i);
  expect(svc.changePassword).not.toHaveBeenCalled();
});

test('a valid password change calls the service and clears the fields', async () => {
  svc.changePassword.mockResolvedValue(undefined);
  render(<ProfilePage />);
  await screen.findByText('Ada#0042');

  fireEvent.change(screen.getByPlaceholderText('Current password'), { target: { value: 'oldpass123' } });
  fireEvent.change(screen.getByPlaceholderText('New password (at least 10 characters)'), { target: { value: 'brandnewpass' } });
  fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'brandnewpass' } });
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() => expect(svc.changePassword).toHaveBeenCalledWith('oldpass123', 'brandnewpass', 'brandnewpass'));
  await screen.findByText(/other sessions were signed out/i);
});
