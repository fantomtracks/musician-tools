import type { ReactNode } from 'react';

export type MusicBrainzEntityRow = {
  mbid: string;
  label: string;
};

export default function MusicBrainzEntityList({
  items,
  onPick,
  pickLabel,
  footer,
}: {
  items: MusicBrainzEntityRow[];
  onPick: (item: MusicBrainzEntityRow) => void;
  pickLabel: (item: MusicBrainzEntityRow) => string;
  footer?: ReactNode;
}) {
  return (
    <div data-lazy-root className="overflow-auto max-h-[65vh] rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-sm">
        <tbody>
          {items.map(item => (
            <tr key={item.mbid} className="border-t border-gray-100 dark:border-gray-700 first:border-t-0 hover:bg-gray-50 dark:hover:bg-gray-800/60">
              <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{item.label}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right">
                <button
                  type="button"
                  className="btn-secondary text-sm min-h-[44px]"
                  onClick={() => onPick(item)}
                  aria-label={pickLabel(item)}
                >
                  Show songs
                  <span aria-hidden="true">→</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {footer}
    </div>
  );
}
