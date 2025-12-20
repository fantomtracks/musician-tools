import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import SongsPage from './pages/SongsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

function HomePage() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center px-6">
      <div className="max-w-xl w-full text-center space-y-6">
        <h1 className="text-3xl font-semibold">Musician Tools</h1>
        <p className="text-gray-700">
          Manage your songs, tempos, keys, and last played dates. Open your list to add or edit tracks.
        </p>
        <div className="flex items-center justify-center gap-4">
          {isAuthenticated ? (
            <>
              <Link
                to="/songs"
                className="inline-flex items-center rounded-md bg-brand-500 text-white px-4 py-2 hover:bg-brand-600"
              >
                Go to songs
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  window.location.href = '/';
                }}
                className="inline-flex items-center rounded-md bg-gray-200 text-gray-800 px-4 py-2 hover:bg-gray-300"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex items-center rounded-md bg-brand-500 text-white px-4 py-2 hover:bg-brand-600"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center rounded-md bg-gray-200 text-gray-800 px-4 py-2 hover:bg-gray-300"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/songs"
        element={isAuthenticated ? <SongsPage /> : <Navigate to="/login" replace />}
      />
      <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/songs" replace />} />
      <Route
        path="/register"
        element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/songs" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
