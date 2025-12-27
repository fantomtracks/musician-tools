import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type PageHeaderProps = {
  loading?: boolean;
};

export function PageHeader({ loading = false }: PageHeaderProps) {
  const { user, logout } = useAuth();

  return (
    <div className="flex items-center justify-between mb-6">
      <Link to="/" className="text-2xl font-semibold text-gray-900 hover:text-brand-500 transition">Musician Tools</Link>
      <div className="flex items-center gap-3">
        {user && <span className="text-sm text-gray-600">Hello, {user.name}</span>}
        <Link
          to="/songs"
          className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600"
        >
          Songs
        </Link>
        <Link
          to="/my-instruments"
          className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600"
        >
          My Instruments
        </Link>
        <Link
          to="/my-playlists"
          className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600"
        >
          My Playlists
        </Link>
        <button
          className="inline-flex items-center rounded-md bg-gray-300 text-gray-800 px-3 py-2 hover:bg-gray-400 disabled:opacity-50"
          onClick={async () => {
            await logout();
            window.location.href = '/';
          }}
          disabled={loading}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
