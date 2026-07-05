import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import { useAuth } from '../contexts/AuthContext';
import { verificationService } from '../services/verificationService';
import { RateLimitError } from '../services/rateLimit';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/verificationService', () => ({
  verificationService: { resend: jest.fn(), verify: jest.fn(), confirmEmailChange: jest.fn() },
}));

const mockedUseAuth = useAuth as jest.Mock;
const svc = verificationService as jest.Mocked<typeof verificationService>;

function renderPage() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

function fillAndSubmit({ email = 'a@b.com', password = 'password123' } = {}) {
  fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
}

beforeEach(() => jest.clearAllMocks());

describe('LoginPage — unverified account branch (story 7.13)', () => {
  test('needsVerification shows the verify prompt and does not navigate', async () => {
    mockedUseAuth.mockReturnValue({ login: jest.fn().mockResolvedValue({ needsVerification: true }) });

    renderPage();
    fillAndSubmit();

    await screen.findByText(/verify your email to sign in/i);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('clicking Resend calls verificationService.resend with the email + confirms', async () => {
    mockedUseAuth.mockReturnValue({ login: jest.fn().mockResolvedValue({ needsVerification: true }) });
    svc.resend.mockResolvedValue(undefined);

    renderPage();
    fillAndSubmit({ email: 'ada@example.com' });

    fireEvent.click(await screen.findByRole('button', { name: /resend verification email/i }));

    await waitFor(() => expect(svc.resend).toHaveBeenCalledWith('ada@example.com'));
    await screen.findByText(/verification email sent/i);
  });

  test('a verified login navigates to /songs', async () => {
    mockedUseAuth.mockReturnValue({ login: jest.fn().mockResolvedValue({ needsVerification: false }) });

    renderPage();
    fillAndSubmit();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/songs'));
  });
});

describe('LoginPage — rate-limit signal (story 15.1)', () => {
  test('a 429 shows the "too many attempts" copy, not a credential error', async () => {
    mockedUseAuth.mockReturnValue({ login: jest.fn().mockRejectedValue(new RateLimitError()) });

    renderPage();
    fillAndSubmit();

    // The rate-limit copy surfaces...
    await screen.findByText(/too many attempts/i);
    // ...and it is NOT mislabelled as a login/credential failure.
    expect(screen.queryByText(/login failed/i)).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
