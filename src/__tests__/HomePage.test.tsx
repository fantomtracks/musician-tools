import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../App';
import { useAuth } from '../contexts/AuthContext';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
const mockedUseAuth = useAuth as jest.Mock;

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('signed-out: shows Create account and Sign in CTAs pointing at register/login', () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: false, user: null });
  renderHome();

  expect(screen.getByRole('link', { name: /create account/i })).toHaveAttribute('href', '/register');
  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
});

test('signed-in: greets the user and shows no auth CTAs', () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, user: { name: 'Ada' } });
  renderHome();

  expect(screen.getByText(/hello, ada/i)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /create account/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
});
