import { useEffect, useRef, useState } from 'react';
import { practiceSessionService, type CreatePracticeSessionDTO } from '../services/practiceSessionService';
import { instrumentTypeOptions } from '../constants/instrumentTypes';

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

  const today = todayLocalDate();

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

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
    try {
      setLoading(true);
      setError(null);
      const payload: CreatePracticeSessionDTO = {
        date,
        instrumentType,
        // '' means "no duration"; anything typed (including 0) is sent so the
        // server can reject invalid values instead of silently dropping them
        durationMinutes: duration === '' ? undefined : Number(duration),
        note: note.trim() || undefined,
      };
      await practiceSessionService.create(payload);
      setDuration('');
      setNote('');
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
                value={duration}
                onChange={e => setDuration(e.target.value)}
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
          </form>
        </div>
      </div>
    </div>
  );
}

export default MySessionsPage;
