import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from '../pages/RegisterPage';
import { useAuth } from '../contexts/AuthContext';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
const mockedUseAuth = useAuth as jest.Mock;

function renderPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  );
}

function fillAndSubmit({ password = 'password123', confirm = 'password123', email = 'a@b.com' } = {}) {
  fireEvent.change(screen.getByPlaceholderText(/choose a username/i), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('Create a password'), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
}

beforeEach(() => jest.clearAllMocks());

describe('RegisterPage (story 7.7 — two outcomes)', () => {
  test('a created result navigates to /songs', async () => {
    const register = jest.fn().mockResolvedValue({ status: 'created', user: { uid: 'u1' } });
    mockedUseAuth.mockReturnValue({ register });

    renderPage();
    fillAndSubmit();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/songs'));
  });

  test('a pending result shows the neutral screen, never navigates, never reveals existence', async () => {
    const register = jest.fn().mockResolvedValue({ status: 'pending' });
    mockedUseAuth.mockReturnValue({ register });

    renderPage();
    fillAndSubmit({ email: 'taken@example.com' });

    await screen.findByText(/check your email/i);
    expect(mockNavigate).not.toHaveBeenCalled();
    // Anti-enumeration: the screen must not use an oracle phrasing that reveals
    // the email exists (the ambiguous "isn't already registered / if you already
    // have an account" copy is intentionally non-revealing).
    expect(screen.queryByText(/taken|in use|already exists/i)).toBeNull();
  });

  test('a password under 10 chars is rejected client-side; register is not called (mirror of the server rule)', async () => {
    const register = jest.fn();
    mockedUseAuth.mockReturnValue({ register });

    renderPage();
    fillAndSubmit({ password: 'short', confirm: 'short' });

    await screen.findByText(/at least 10 characters/i);
    expect(register).not.toHaveBeenCalled();
  });
});
