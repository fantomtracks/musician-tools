import { Link, useNavigate } from 'react-router-dom';
import type { CatalogSong } from '../services/catalogService';
import type { Song } from '../services/songService';
import CatalogAddButton from './CatalogAddButton';
import { RowSelectionCheckbox, SelectAllCheckbox } from './SelectionCheckbox';
import { selectionCell } from '../utils/selectionCell';

// Filterable list of Catalog entries (story 19.3 + Add cell in 19.4). Columns Artist ·
// Title · Key · BPM (artist first, DL-18) + a trailing action cell (Add). The Title
// cell is a real <Link> (keyboard/SR); the row also navigates on mouse click. The Add
// button is a SIBLING in its own cell (never nested in the title link); its cell stops
// click propagation so pressing Add doesn't also navigate to the detail route.
// Story 22.4: the checkbox column is OPTIONAL — rendered only when `onToggle` is
// given. The list has a single consumer today, but a future read-only surface must not
// inherit a selection it has no action for.
export default function CatalogList({
  items,
  existingFor,
  onAdded,
  selectedUids,
  onToggle,
  allSelected,
  onToggleAll,
  selectionDisabled,
}: {
  items: CatalogSong[];
  existingFor?: (entry: CatalogSong) => Song | null;
  onAdded?: (song: Song) => void;
  selectedUids?: Set<string>;
  onToggle?: (uid: string) => void;
  allSelected?: boolean;
  onToggleAll?: () => void;
  selectionDisabled?: boolean;
}) {
  const navigate = useNavigate();
  const selectable = !!onToggle;
  return (
    <div className="overflow-auto max-h-[65vh] rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
          <tr className="text-left text-gray-500 dark:text-gray-400">
            {selectable && (
              <th className={selectionCell('px-3 py-2 w-12 text-center')}>
                <SelectAllCheckbox
                  allSelected={!!allSelected}
                  onToggle={() => onToggleAll?.()}
                  disabled={selectionDisabled}
                />
              </th>
            )}
            <th className="px-3 py-2 font-medium">Artist</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 font-medium">Mode</th>
            <th className="px-3 py-2 font-medium text-right">Time signature</th>
            <th className="px-3 py-2 font-medium sr-only">Add</th>
          </tr>
        </thead>
        <tbody>
          {items.map(entry => (
            <tr
              key={entry.uid}
              onClick={() => navigate(`/catalog/${entry.uid}`)}
              className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 min-w-0 cursor-pointer"
            >
              {selectable && (
                // The primitive stops the click, so ticking never navigates to the detail.
                <td className={selectionCell('px-3 py-2 w-12 text-center')}>
                  <RowSelectionCheckbox
                    checked={!!selectedUids?.has(entry.uid)}
                    onChange={() => onToggle?.(entry.uid)}
                    label={entry.artist ? `${entry.title} by ${entry.artist}` : entry.title}
                    disabled={selectionDisabled}
                  />
                </td>
              )}
              <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{entry.artist || '—'}</td>
              <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                <Link to={`/catalog/${entry.uid}`} className="hover:text-brand-600 dark:hover:text-brand-400">
                  {entry.title}
                </Link>
              </td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{entry.key || '—'}</td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{entry.mode || '—'}</td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap text-right">{entry.timeSignature || '—'}</td>
              {/* Action cell: sibling of the title link; stops propagation so clicking
                  Add doesn't also trigger the row's navigate-to-detail. */}
              <td className="px-3 py-2 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                <CatalogAddButton entry={entry} existingSong={existingFor ? existingFor(entry) : null} onAdded={onAdded} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
