import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';

function Header() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
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

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {isAuthenticated && (
              <>
                <Link
                  to="/songs"
                  state={{ resetToList: true }}
                  className="text-gray-700 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:text-brand-400"
                >
                  Songs
                </Link>
                <Link
                  to="/my-instruments"
                  className="text-gray-700 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:text-brand-400"
                >
                  Instruments
                </Link>
                <Link
                  to="/my-playlists"
                  className="text-gray-700 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:text-brand-400"
                >
                  Playlists
                </Link>
                <Link
                  to="/my-topics"
                  className="text-gray-700 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:text-brand-400"
                >
                  Topics
                </Link>
                <Link
                  to="/my-sessions"
                  className="text-gray-700 hover:text-brand-600 font-medium transition-colors dark:text-gray-300 dark:hover:text-brand-400"
                >
                  Sessions
                </Link>
              </>
            )}
          </nav>

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
    </header>
  );
}

export default Header;
