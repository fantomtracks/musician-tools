import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';

// Single source of truth for the main nav links, mapped for both the desktop bar
// and the mobile menu. Account items (Profile, Sign out) live in the account
// dropdown on desktop / the account section of the mobile menu, not here.
const navLinks: { to: string; label: string }[] = [
  { to: '/songs', label: 'Songlist' },
  { to: '/my-heatmap', label: 'Heatmap' },
  { to: '/my-sessions', label: 'Sessions' },
  { to: '/my-playlists', label: 'Playlists' },
  { to: '/my-topics', label: 'Topics' },
  { to: '/my-instruments', label: 'Instruments' },
];

function Header() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
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

  // Close the account dropdown on Escape or a click outside it.
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [accountMenuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 glass-effect border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: hamburger (mobile, authenticated) + logo */}
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(open => !open)}
                className="lg:hidden w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav"
              >
                <span className="text-lg">{mobileMenuOpen ? '✕' : '☰'}</span>
              </button>
            )}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">♪</span>
              </div>
              {/* Keep the title visible down to ~360px (all common phones); only the
                  very narrowest screens fall back to the ♪ icon alone */}
              <h1 className="text-xl font-bold text-gradient hidden min-[360px]:block whitespace-nowrap">
                Musician Tools
              </h1>
            </Link>

            {/* Navigation (desktop ≥ lg) — flush left, with breathing room after the title */}
            <nav className="hidden lg:flex items-center gap-8 ml-10">
              {isAuthenticated && navLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-gray-700 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:text-brand-400"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-4">
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
            {/* Account dropdown (desktop ≥ lg): Profile + Sign out. On mobile these
               live in the hamburger menu instead, so this is lg-only. Signed-out
               visitors get no header CTAs — Sign in / Create account live on the
               HomePage instead, to keep the mobile header from overflowing. */}
            {isAuthenticated && (
              <div className="relative hidden lg:block" ref={accountMenuRef}>
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen(open => !open)}
                  className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
                  aria-label="Account menu"
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                >
                  <span className="text-lg" aria-hidden="true">👤</span>
                </button>
                {accountMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1 dark:border-gray-700 dark:bg-gray-800 z-50"
                  >
                    {user?.isCurator && (
                      <Link
                        to="/catalog/admin"
                        role="menuitem"
                        onClick={() => setAccountMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-brand-600 transition-colors dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-brand-400"
                      >
                        Curate
                      </Link>
                    )}
                    <Link
                      to="/profile"
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-brand-600 transition-colors dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-brand-400"
                    >
                      Profile
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setAccountMenuOpen(false); handleLogout(); }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-brand-600 transition-colors dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-brand-400"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation (mobile dropdown) */}
      {isAuthenticated && mobileMenuOpen && (
        <nav id="mobile-nav" className="lg:hidden border-t border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 flex flex-col">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-3 text-gray-700 hover:bg-gray-100 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-brand-400"
              >
                {link.label}
              </Link>
            ))}
            {/* Account section (Profile + Sign out) — on mobile these live in the
                menu since the desktop account dropdown is hidden below lg. */}
            <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
              {user?.isCurator && (
                <Link
                  to="/catalog/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-3 text-gray-700 hover:bg-gray-100 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-brand-400"
                >
                  Curate
                </Link>
              )}
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="block rounded-lg px-3 py-3 text-gray-700 hover:bg-gray-100 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-brand-400"
              >
                Profile
              </Link>
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                className="w-full rounded-lg px-3 py-3 text-left text-gray-700 hover:bg-gray-100 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-brand-400"
              >
                Sign out
              </button>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

export default Header;
