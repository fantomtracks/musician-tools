import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
const mockedUseAuth = useAuth as jest.Mock;

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

// The desktop nav links are always in the DOM (only CSS-hidden below md), so a link
// shows up once when only the desktop nav is rendered and twice once the mobile menu opens.

test('authenticated: the hamburger reveals the mobile nav links and flips aria-expanded', () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, logout: jest.fn() });
  renderHeader();

  const toggle = screen.getByRole('button', { name: /open navigation menu/i });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getAllByRole('link', { name: 'Sessions' })).toHaveLength(1); // desktop only

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getAllByRole('link', { name: 'Sessions' })).toHaveLength(2); // desktop + mobile
  // All six links are present in the mobile menu
  for (const label of ['Songlist', 'Heatmap', 'Sessions', 'Playlists', 'Topics', 'Instruments']) {
    expect(screen.getAllByRole('link', { name: label })).toHaveLength(2);
  }
});

test('Escape closes the mobile nav', () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, logout: jest.fn() });
  renderHeader();

  fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));
  expect(screen.getAllByRole('link', { name: 'Topics' })).toHaveLength(2);

  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(screen.getAllByRole('link', { name: 'Topics' })).toHaveLength(1);
});

test('clicking a mobile link closes the menu', () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, logout: jest.fn() });
  renderHeader();

  fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));
  const heatmapLinks = screen.getAllByRole('link', { name: 'Heatmap' });
  expect(heatmapLinks).toHaveLength(2);

  fireEvent.click(heatmapLinks[1]); // the mobile-menu one
  expect(screen.getAllByRole('link', { name: 'Heatmap' })).toHaveLength(1);
});

test('authenticated mobile: Sign out lives inside the menu and logs out', () => {
  const logout = jest.fn().mockResolvedValue(undefined);
  mockedUseAuth.mockReturnValue({ isAuthenticated: true, logout });
  renderHeader();

  fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));
  const menu = document.getElementById('mobile-nav') as HTMLElement;
  const signOut = within(menu).getByRole('button', { name: 'Sign out' });

  fireEvent.click(signOut);
  expect(logout).toHaveBeenCalled();
});

test('unauthenticated: no hamburger and no nav links, but sign-in actions remain', () => {
  mockedUseAuth.mockReturnValue({ isAuthenticated: false, logout: jest.fn() });
  renderHeader();

  expect(screen.queryByRole('button', { name: /navigation menu/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sessions' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /create account/i })).toBeInTheDocument();
});
