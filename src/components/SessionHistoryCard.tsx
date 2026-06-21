import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { sumSessionMinutes, type PracticeSession, type SessionItem } from '../services/practiceSessionService';

// One entry line of a session ("Artist - Title · played during N minutes · note").
// Shared so the Sessions page and the Heatmap day-detail render entries identically.
// A song entry's title links to its edit form; topic entries (no songUid) stay plain text.
export function SessionEntryLine({ item, artist }: { item: SessionItem; artist?: string }) {
  return (
    <li className="text-sm text-gray-700 dark:text-gray-300 pl-3 border-l-2 border-gray-200 dark:border-gray-700 break-words">
      {artist ? <span>{artist} - </span> : null}
      <span className="font-medium">
        {item.songUid ? (
          <Link
            to="/songs"
            state={{ editUid: item.songUid }}
            className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline"
          >
            {item.label}
          </Link>
        ) : (
          item.label
        )}
      </span>
      {item.minutes ? (
        <span className="text-gray-500 dark:text-gray-400"> · played during {item.minutes} {item.minutes > 1 ? 'minutes' : 'minute'}</span>
      ) : null}
      {item.note ? <span className="text-gray-500 dark:text-gray-400 italic"> · {item.note}</span> : null}
    </li>
  );
}

export interface SessionHistoryCardProps {
  session: PracticeSession;
  // songUid -> artist (for the "Artist - Title" entry label).
  artistBySongUid: ReadonlyMap<string, string>;
  // The Sessions history shows the date; the Heatmap day-detail omits it (already grouped by day).
  showDate?: boolean;
  // Edit/Delete controls differ per page (inline button vs navigation Link), so the parent supplies them.
  actions?: ReactNode;
}

// A single session card: header (date · instrument · total) + optional note + entries.
// Extracted from MySessionsPage and MyHeatmapPage, which had drifted out of sync.
export function SessionHistoryCard({ session, artistBySongUid, showDate = true, actions }: SessionHistoryCardProps) {
  const totalMinutes = sumSessionMinutes(session);
  return (
    <li className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* The DATEONLY string is displayed verbatim: new Date('YYYY-MM-DD') would
            parse as UTC midnight and shift the day in some timezones */}
        {showDate && <span className="font-semibold">{session.date}</span>}
        <span className="text-sm text-gray-600 dark:text-gray-400">{session.instrumentType}</span>
        {totalMinutes > 0 ? (
          <span className="text-sm text-gray-600 dark:text-gray-400">· {totalMinutes} min</span>
        ) : null}
        {actions ? <div className="flex gap-2 ml-auto">{actions}</div> : null}
      </div>
      {session.note && (
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{session.note}</p>
      )}
      {session.items && session.items.length > 0 && (
        // pt-3 only when a note precedes: breathing room between the note and entries (northwood feedback)
        <ul className={`space-y-1${session.note ? ' pt-3' : ''}`}>
          {session.items.map(item => (
            <SessionEntryLine
              key={item.uid}
              item={item}
              artist={item.songUid ? artistBySongUid.get(item.songUid) : undefined}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
