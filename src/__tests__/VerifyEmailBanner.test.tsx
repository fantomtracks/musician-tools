import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VerifyEmailBanner from '../components/VerifyEmailBanner';
import { useAuth } from '../contexts/AuthContext';
import { verificationService } from '../services/verificationService';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/verificationService', () => ({
  verificationService: { verify: jest.fn(), resend: jest.fn() },
}));

const mockedUseAuth = useAuth as jest.Mock;
const svc = verificationService as jest.Mocked<typeof verificationService>;

beforeEach(() => jest.clearAllMocks());

test('shows the banner and resends when emailVerified is false', async () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, user: { uid: 'u1', emailVerified: false } });
  svc.resend.mockResolvedValue(undefined);

  render(<VerifyEmailBanner />);
  expect(screen.getByText(/please verify your email/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /resend link/i }));
  await waitFor(() => expect(svc.resend).toHaveBeenCalled());
  await screen.findByText(/verification email sent/i);
});

test('renders nothing when the email is verified', () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, user: { uid: 'u1', emailVerified: true } });
  const { container } = render(<VerifyEmailBanner />);
  expect(container).toBeEmptyDOMElement();
});

test('renders nothing when emailVerified is undefined (user stored before 7.9)', () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, user: { uid: 'u1' } });
  const { container } = render(<VerifyEmailBanner />);
  expect(container).toBeEmptyDOMElement();
});

test('renders nothing when not authenticated', () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: false, user: null });
  const { container } = render(<VerifyEmailBanner />);
  expect(container).toBeEmptyDOMElement();
});
