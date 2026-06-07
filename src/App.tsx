import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Songs from './pages/Songs';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MyInstrumentsPage from './pages/MyInstrumentsPage';
import MyPlaylistsPage from './pages/MyPlaylistsPage';
import MyTopicsPage from './pages/MyTopicsPage';
import MySessionsPage from './pages/MySessionsPage';
import MyHeatmapPage from './pages/MyHeatmapPage';
import Header from './components/Header';
import Footer from './components/Footer';

function HomePage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="flex-1 bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-950 flex items-center justify-center px-6">
      <div className="max-w-2xl w-full text-center space-y-8">
        {isAuthenticated && user ? (
          <div className="space-y-6">
            <h1 className="text-5xl font-bold text-gradient">Hello, {user.name}!</h1>
            <p className="text-2xl text-gray-700 dark:text-gray-200">
              What will you practice today?
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-4xl">♪</span>
              </div>
            </div>
            <h1 className="text-5xl font-bold text-gradient">Musician Tools</h1>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Practice management for musicians. Track your songs, tempos, keys, and progress.
            </p>
          </div>
        )}
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
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-950">
      <Header />
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/songs"
            element={isAuthenticated ? <Songs /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/my-instruments"
            element={isAuthenticated ? <MyInstrumentsPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/my-playlists"
            element={isAuthenticated ? <MyPlaylistsPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/my-topics"
            element={isAuthenticated ? <MyTopicsPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/my-sessions"
            element={isAuthenticated ? <MySessionsPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/my-heatmap"
            element={isAuthenticated ? <MyHeatmapPage /> : <Navigate to="/login" replace />}
          />
          <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/songs" replace />} />
          <Route
            path="/register"
            element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/songs" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
