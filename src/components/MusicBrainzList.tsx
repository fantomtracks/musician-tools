import type { ReactNode } from 'react';
import type { MusicBrainzHit } from '../services/catalogService';
import type { Song } from '../services/songService';
import MusicBrainzImportButton from './MusicBrainzImportButton';

export default function MusicBrainzList({
  items,
  existingFor,
  onAdded,
  footer,
}: {
  items: MusicBrainzHit[];
  existingFor?: (hit: MusicBrainzHit) => Song | null;
  onAdded?: (song: Song) => void;
  footer?: ReactNode;
}) {
  return (
    <div data-lazy-root className="overflow-auto max-h-[65vh] rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
          <tr className="text-left text-gray-500 dark:text-gray-400">
            <th className="px-3 py-2 font-medium">Artist</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium sr-only">Import</th>
          </tr>
        </thead>
        <tbody>
          {items.map(hit => (
            <tr
              key={hit.mbid || `${hit.title}|${hit.artist ?? ''}`}
              className="border-t border-gray-100 dark:border-gray-700 min-w-0"
            >
              <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{hit.artist || '—'}</td>
              <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{hit.title}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right">
                <MusicBrainzImportButton
                  hit={hit}
                  existingSong={existingFor ? existingFor(hit) : null}
                  onAdded={onAdded}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {footer}
    </div>
  );
}
