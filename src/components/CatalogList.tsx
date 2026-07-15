import { Link, useNavigate } from 'react-router-dom';
import type { CatalogSong } from '../services/catalogService';

// Read-only filterable list of Catalog entries (story 19.3). Columns Artist · Title ·
// Key · BPM (artist first, DL-18). The Title cell is a real <Link> (keyboard/SR
// affordance); the whole row also navigates on mouse click for convenience. When
// story 19.4 adds the inline Add button, this becomes a proper stretched-link with
// the Add button as a sibling action cell (no nested interactive controls).
export default function CatalogList({ items }: { items: CatalogSong[] }) {
  const navigate = useNavigate();
  return (
    <div className="overflow-auto max-h-[65vh] rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
          <tr className="text-left text-gray-500 dark:text-gray-400">
            <th className="px-3 py-2 font-medium">Artist</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 font-medium">BPM</th>
          </tr>
        </thead>
        <tbody>
          {items.map(entry => (
            <tr
              key={entry.uid}
              onClick={() => navigate(`/catalog/${entry.uid}`)}
              className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 min-w-0 cursor-pointer"
            >
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{entry.artist || '—'}</td>
              <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                <Link to={`/catalog/${entry.uid}`} className="hover:text-brand-600 dark:hover:text-brand-400">
                  {entry.title}
                </Link>
              </td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{entry.key || '—'}</td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{entry.bpm ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
