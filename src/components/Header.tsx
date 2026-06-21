import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';

// Single source of truth for the nav links, mapped for both the desktop bar and the mobile menu.
const navLinks: { to: string; label: string; state?: { resetToList: boolean } }[] = [
  { to: '/songs', label: 'Songlist', state: { resetToList: true } },
  { to: '/my-heatmap', label: 'Heatmap' },
  { to: '/my-sessions', label: 'Sessions' },
  { to: '/my-playlists', label: 'Playlists' },
  { to: '/my-topics', label: 'Topics' },
  { to: '/my-instruments', label: 'Instruments' },
];

function Header() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => {
      const saved = localStorage.getItem('darkMode');
      if (saved === null) {
        setDarkMode(event.matches);
      }
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  // Close the mobile menu on Escape.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 glass-effect border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">♪</span>
            </div>
            <h1 className="text-xl font-bold text-gradient hidden sm:block">
              Musician Tools
            </h1>
          </Link>

          {/* Navigation (desktop) */}
          <nav className="hidden md:flex items-center gap-8">
            {isAuthenticated && navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                state={link.state}
                className="text-gray-700 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:text-brand-400"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center gap-4">
            {/* Hamburger (mobile only, authenticated — the nav links are auth-gated) */}
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(open => !open)}
                className="md:hidden w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav"
              >
                <span className="text-lg">{mobileMenuOpen ? '✕' : '☰'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <span className="text-lg">☀️</span>
              ) : (
                <span className="text-lg">🌙</span>
              )}
            </button>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleLogout}
                className="btn-secondary text-sm"
              >
                Sign out
              </button>
            ) : (
              <>
                <Link to="/login" className="btn-secondary text-sm">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary text-sm">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation (mobile dropdown) */}
      {isAuthenticated && mobileMenuOpen && (
        <nav id="mobile-nav" className="md:hidden border-t border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 flex flex-col">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                state={link.state}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-3 text-gray-700 hover:bg-gray-100 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-brand-400"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

export default Header;
