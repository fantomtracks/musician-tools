import { useEffect, useRef, useState } from 'react';
import { practiceSessionService, type CreatePracticeSessionDTO, type CreateSessionItemDTO } from '../services/practiceSessionService';
import { songService, type Song } from '../services/songService';
import { topicService, type Topic } from '../services/topicService';
import { instrumentTypeOptions } from '../constants/instrumentTypes';

type EntryDraft = {
  key: number;
  ref: string; // '' | 'song:<uid>' | 'topic:<uid>'
  minutes: string;
  note: string;
};

// The session day is the device's LOCAL date (FR19) — toISOString() would give
// the UTC date, which is yesterday around midnight in timezones ahead of UTC.
function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MySessionsPage() {
  const [date, setDate] = useState(todayLocalDate());
  const [instrumentType, setInstrumentType] = useState('');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [entries, setEntries] = useState<EntryDraft[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [durationTouched, setDurationTouched] = useState(false);
  const entryKeyRef = useRef(0);

  const today = todayLocalDate();

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    (async () => {
      // allSettled: one failing catalog must not discard the other — the form
      // stays usable (possibly with a partial picker)
      const [songsResult, topicsResult] = await Promise.allSettled([
        songService.getAllSongs(),
        topicService.getAll(),
      ]);
      if (songsResult.status === 'fulfilled') setSongs(songsResult.value ?? []);
      if (topicsResult.status === 'fulfilled') setTopics(topicsResult.value ?? []);
      if (songsResult.status === 'rejected' || topicsResult.status === 'rejected') {
        setError('Failed to load songs and topics');
      }
    })();
  }, []);

  // FR13: when every entry has minutes, the total duration is pre-computed as
  // their sum — unless the user typed a duration manually (override wins).
  // A sum beyond the 1440 server cap is never auto-applied: the feature must
  // not manufacture an invalid value the user did not type.
  const entryMinutes = entries.map(e => (e.minutes === '' ? null : Number(e.minutes)));
  const rawSum = entries.length > 0 && entryMinutes.every(m => m !== null && Number.isFinite(m))
    ? entryMinutes.reduce((total, m) => (total as number) + (m as number), 0)
    : null;
  const autoSum = rawSum !== null && rawSum >= 1 && rawSum <= 1440 ? rawSum : null;
  const effectiveDuration = durationTouched ? duration : (autoSum !== null ? String(autoSum) : duration);

  const addEntry = () => {
    entryKeyRef.current += 1;
    setEntries(prev => [...prev, { key: entryKeyRef.current, ref: '', minutes: '', note: '' }]);
  };

  const updateEntry = (key: number, patch: Partial<EntryDraft>) => {
    setEntries(prev => prev.map(e => (e.key === key ? { ...e, ...patch } : e)));
  };

  const removeEntry = (key: number) => {
    setEntries(prev => prev.filter(e => e.key !== key));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !instrumentType) return;
    // Recompute "today" at submit time: the render-time value goes stale if
    // the page stays open across local midnight.
    const submitToday = todayLocalDate();
    if (date > submitToday) {
      setError('Date cannot be in the future');
      return;
    }
    // An entry row without a song/topic would be silently dropped (and its
    // minutes still counted in the auto-sum) — refuse instead of losing data
    if (entries.some(e => e.ref === '')) {
      setError('Each entry needs a song or topic — fill or remove empty entries');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const items: CreateSessionItemDTO[] = entries
        .filter(e => e.ref !== '')
        .map(e => {
          const separator = e.ref.indexOf(':');
          const kind = e.ref.slice(0, separator);
          const uid = e.ref.slice(separator + 1);
          return {
            ...(kind === 'song' ? { songUid: uid } : { topicUid: uid }),
            minutes: e.minutes === '' ? undefined : Number(e.minutes),
            note: e.note.trim() || undefined,
          };
        });
      const payload: CreatePracticeSessionDTO = {
        date,
        instrumentType,
        // '' means "no duration"; anything typed (including 0) is sent so the
        // server can reject invalid values instead of silently dropping them
        durationMinutes: effectiveDuration === '' ? undefined : Number(effectiveDuration),
        note: note.trim() || undefined,
        items: items.length > 0 ? items : undefined,
      };
      await practiceSessionService.create(payload);
      setDuration('');
      setDurationTouched(false);
      setNote('');
      setEntries([]);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastMessage('Session logged');
      toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2500);
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to create session'
        ? err.message
        : 'Failed to log session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-950 text-gray-900 dark:text-gray-100">
      {/* Always mounted: a live region must exist in the DOM before its content
          changes, or screen readers may never announce the toast */}
      <div
        role="status"
        className={toastMessage
          ? 'fixed bottom-6 right-6 z-50 rounded-lg bg-green-600 dark:bg-green-700 text-white px-4 py-2 shadow-lg'
          : 'sr-only'}
      >
        {toastMessage}
      </div>
      {error && (
        <div role="alert" className="mx-4 my-4 card-base glass-effect text-red-700 bg-red-50/80 border border-red-200 dark:text-red-300 dark:bg-red-900/40 dark:border-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" className="btn-secondary text-xs" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        <div className="card-base glass-effect p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">New session</h2>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="session-date" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Date
              </label>
              <input
                id="session-date"
                type="date"
                value={date}
                min="1900-01-01"
                max={today}
                onChange={e => setDate(e.target.value)}
                className="input-base text-sm"
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="session-instrument" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Instrument
              </label>
              <select
                id="session-instrument"
                value={instrumentType}
                onChange={e => setInstrumentType(e.target.value)}
                className="input-base text-sm"
                disabled={loading}
              >
                <option value="">Select instrument</option>
                {instrumentTypeOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="session-duration" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Duration
              </label>
              <input
                id="session-duration"
                type="number"
                min={1}
                max={1440}
                placeholder="Minutes (optional)"
                value={effectiveDuration}
                onChange={e => {
                  setDuration(e.target.value);
                  // Typing freezes the auto-sum; truly clearing the field
                  // re-arms it. badInput ('1e'…) reads as '' but must NOT
                  // re-arm, or it would wipe a manual override.
                  setDurationTouched(e.target.value !== '' || (e.target.validity?.badInput ?? false));
                }}
                className="input-base text-sm"
                disabled={loading}
              />
            </div>
            <div className="flex flex-col justify-end">
              <button
                type="submit"
                className="btn-primary justify-center"
                disabled={loading || !date || !instrumentType}
              >
                Log session
              </button>
            </div>
            <div className="flex flex-col gap-1 md:col-span-4">
              <label htmlFor="session-note" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Note
              </label>
              <textarea
                id="session-note"
                placeholder="How did it go? (optional)"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="input-base text-sm"
                rows={2}
                maxLength={5000}
                disabled={loading}
              />
            </div>

            <fieldset className="md:col-span-4 space-y-2">
              <legend className="float-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Entries
              </legend>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={addEntry}
                  disabled={loading}
                >
                  Add entry
                </button>
              </div>
              {entries.map((entry, index) => (
                <div key={entry.key} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-start">
                  <select
                    aria-label={`Entry ${index + 1}`}
                    value={entry.ref}
                    onChange={e => updateEntry(entry.key, { ref: e.target.value })}
                    className="input-base text-sm"
                    disabled={loading}
                  >
                    <option value="">Select a song or topic</option>
                    <optgroup label="Songs">
                      {songs.map(song => (
                        <option key={song.uid} value={`song:${song.uid}`}>{song.title}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Topics">
                      {topics.map(topic => (
                        <option key={topic.uid} value={`topic:${topic.uid}`}>{topic.name}</option>
                      ))}
                    </optgroup>
                  </select>
                  <input
                    aria-label={`Entry ${index + 1} minutes`}
                    type="number"
                    min={1}
                    max={1440}
                    placeholder="Minutes (optional)"
                    value={entry.minutes}
                    onChange={e => updateEntry(entry.key, { minutes: e.target.value })}
                    className="input-base text-sm"
                    disabled={loading}
                  />
                  <input
                    aria-label={`Entry ${index + 1} note`}
                    placeholder="e.g. at 30 BPM (optional)"
                    value={entry.note}
                    onChange={e => updateEntry(entry.key, { note: e.target.value })}
                    className="input-base text-sm"
                    maxLength={1000}
                    disabled={loading}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      aria-label={`Remove entry ${index + 1}`}
                      className="btn-secondary text-sm"
                      onClick={() => removeEntry(entry.key)}
                      disabled={loading}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </fieldset>
          </form>
        </div>
      </div>
    </div>
  );
}

export default MySessionsPage;
