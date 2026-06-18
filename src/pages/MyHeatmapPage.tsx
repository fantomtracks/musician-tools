import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { practiceSessionService, type DayPlay, type HeatmapDay, type PracticeSession } from '../services/practiceSessionService';
import { songService, type Song } from '../services/songService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { buildYearGrid, computeLevels, formatLocalDate } from '../utils/heatmap';

// Non-punitive palette (FR18): empty days stay neutral, activity ramps green.
// No red, no streak counters, no guilt-tripping copy anywhere on this page.
const LEVEL_CLASSES = [
  // Empty days must read as cells, not blend into the page gradient
  // (northwood's field feedback) — still neutral, never aggressive (FR18).
  // NOT shown in the legend: an empty day is not an activity level
  'bg-gray-200 dark:bg-gray-700',
  // The whole ramp starts saturated: level 1 must be unmistakably green on
  // the glass cards in both modes (northwood field feedback, iterated)
  'bg-green-400 dark:bg-green-700',
  'bg-green-500 dark:bg-green-600',
  'bg-green-600 dark:bg-green-500',
  'bg-green-800 dark:bg-green-300',
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// All 7 labels: the GitHub-style sparse labelling (Mon/Wed/Fri) reads as
// "3-day weeks" to first-time users (northwood's field feedback)
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MyHeatmapPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [days, setDays] = useState<HeatmapDay[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySessions, setDaySessions] = useState<PracticeSession[] | null>(null);
  const [dayPlays, setDayPlays] = useState<DayPlay[] | null>(null);
  const [dayFailed, setDayFailed] = useState(false);
  const [playsFailed, setPlaysFailed] = useState(false);
  const [deleteSessionUid, setDeleteSessionUid] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [deleteInFlight, setDeleteInFlight] = useState(false);
  // Bumped after a deletion: the day's aggregate changed, the grid must refetch
  const [heatmapVersion, setHeatmapVersion] = useState(0);
  // Song catalog, loaded once: a session item only snapshots the title (FR4),
  // so the artist is resolved from the live catalog for display — same as the
  // Sessions history. Purely cosmetic: a load failure just omits the artist.
  const [songs, setSongs] = useState<Song[]>([]);
  // Mirrors selectedDate for async completions (a slow DELETE must not touch
  // the panel of a day selected afterwards)
  const selectedDateRef = useRef<string | null>(null);

  useEffect(() => {
    // Cancellation guard: rapid year changes (or a delete-refetch racing a
    // year change) must never let a stale response paint the wrong year
    let cancelled = false;
    setFailed(false);
    (async () => {
      try {
        const data = await practiceSessionService.getHeatmap(year);
        if (!cancelled) setDays(data ?? []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [year, heatmapVersion]);

  // Song catalog fetched once on mount: artist is a display-only enrichment of
  // the day-detail entries (Story 5.5 "Artist - Title" consistency). A failure
  // is swallowed — the title snapshot still renders without an artist.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await songService.getAllSongs();
        if (!cancelled) setSongs(data ?? []);
      } catch {
        // Artist is optional: keep songs empty, entries render title-only
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Day detail (FR16): sessions and projected plays (FR22) fetched in parallel
  // per selected day; a slow response for a previously selected day must not
  // land on the current one. allSettled: each list fails independently — the
  // surviving one still renders, with a failure message for the other.
  useEffect(() => {
    selectedDateRef.current = selectedDate;
    // A pending delete dialog must not survive a context change
    setDeleteSessionUid(null);
    if (!selectedDate) {
      setDaySessions(null);
      setDayPlays(null);
      setDayFailed(false);
      setPlaysFailed(false);
      return;
    }
    let cancelled = false;
    setDaySessions(null);
    setDayPlays(null);
    setDayFailed(false);
    setPlaysFailed(false);
    setDeleteFailed(false);
    (async () => {
      const [sessionsResult, playsResult] = await Promise.allSettled([
        practiceSessionService.getAll(selectedDate),
        practiceSessionService.getDayPlays(selectedDate),
      ]);
      if (cancelled) return;
      if (sessionsResult.status === 'fulfilled') setDaySessions(sessionsResult.value ?? []);
      else setDayFailed(true);
      if (playsResult.status === 'fulfilled') setDayPlays(playsResult.value ?? []);
      else setPlaysFailed(true);
    })();
    return () => { cancelled = true; };
  }, [selectedDate]);

  const handleDeleteSession = async () => {
    if (!deleteSessionUid) return;
    const uid = deleteSessionUid;
    const dayAtDelete = selectedDateRef.current;
    // Close the dialog before the request (anti double-submit, house pattern)
    setDeleteSessionUid(null);
    try {
      setDeleteFailed(false);
      setDeleteInFlight(true);
      await practiceSessionService.remove(uid);
      // The grid refetches regardless; the PANEL is only touched if the user
      // is still on the day the deletion was issued from (a null daySessions
      // means a fresh fetch is in flight — never fake an empty day)
      setHeatmapVersion(v => v + 1);
      if (dayAtDelete && selectedDateRef.current === dayAtDelete) {
        setDaySessions(prev => (prev === null ? prev : prev.filter(s => s.uid !== uid)));
        // 4.2: deleting a session CASCADES its linked plays, so the "Played"
        // list is now stale. Refetch it from the server (we cannot know which
        // plays cascaded optimistically). A separate try: a plays-refresh
        // failure must not report the (successful) delete as failed.
        try {
          const freshPlays = await practiceSessionService.getDayPlays(dayAtDelete);
          if (selectedDateRef.current === dayAtDelete) setDayPlays(freshPlays ?? []);
        } catch {
          // Keep the current list rather than blanking it; a reload reconciles
        }
      }
    } catch {
      if (selectedDateRef.current === dayAtDelete) {
        setDeleteFailed(true);
      }
    } finally {
      setDeleteInFlight(false);
    }
  };

  const changeYear = (delta: number) => {
    const next = year + delta;
    setYear(next);
    setSelectedDate(null);
    setFocusedDate(null);
    setDeleteSessionUid(null);
    setDays(null);
    setFailed(false);
    // A bound can disable the button under keyboard focus — keep focus alive
    if (delta > 0 && next >= currentYear) {
      document.getElementById('heatmap-prev-year')?.focus();
    }
    if (delta < 0 && next <= 1900) {
      document.getElementById('heatmap-next-year')?.focus();
    }
  };

  // Resolve artists from the live catalog (the session item only snapshots the
  // title). Only songs with an artist are mapped — orphan/topic entries and
  // artist-less songs fall back to title-only, like the Sessions history.
  const artistBySongUid = useMemo(() => {
    const map = new Map<string, string>();
    songs.forEach(song => { if (song.artist) map.set(song.uid, song.artist); });
    return map;
  }, [songs]);

  const grid = useMemo(() => buildYearGrid(year), [year]);
  const levelFor = useMemo(() => computeLevels(days ?? []), [days]);
  const dayByDate = useMemo(() => new Map((days ?? []).map(d => [d.date, d])), [days]);

  // Since 4.1, a "Mark as Played" creates both a SongPlay and a session entry,
  // so the same song would appear twice in the panel. Hide a play only when the
  // SAME song is a session entry on the SAME instrument that day — keyed on
  // (instrument, songUid). A different-instrument play (e.g. a Bass play of a
  // song that also sits in a Guitar session) or a no-instrument play stays
  // visible; it is genuine history, not a mirror of the session entry.
  const visiblePlays = useMemo(() => {
    if (!dayPlays) return dayPlays;
    const sessionKeys = new Set(
      (daySessions ?? []).flatMap(s =>
        (s.items ?? [])
          .filter(i => !!i.songUid)
          .map(i => `${s.instrumentType}|${i.songUid}`)
      )
    );
    return dayPlays.filter(play => !sessionKeys.has(`${play.instrumentType}|${play.songUid}`));
  }, [dayPlays, daySessions]);

  // Month labels above the columns: shown on the first week containing the 1st
  const monthByWeek = useMemo(() => grid.weeks.map(week => {
    const firstOfMonth = week.find(date => date !== null && date.endsWith('-01'));
    return firstOfMonth ? MONTH_LABELS[Number(firstOfMonth.slice(5, 7)) - 1] : null;
  }), [grid]);

  // Guard against a stale focusedDate (e.g. the year rolled over while the
  // page was mounted): the grid must always keep one tabbable cell
  const tabbableDate = focusedDate && grid.days.includes(focusedDate) ? focusedDate : grid.days[0];

  // A discreet marker on today's cell (northwood field feedback) — an outline,
  // not a ring, so it stacks with the selection ring instead of replacing it
  const todayStr = formatLocalDate(new Date());

  const labelFor = (date: string): string => {
    // "today" must not be conveyed by the amber outline alone (a11y/NFR6)
    const todaySuffix = date === todayStr ? ' (today)' : '';
    const day = dayByDate.get(date);
    if (!day) return `${date} — no practice${todaySuffix}`;
    const playCount = day.playCount ?? 0;
    const playsPart = `${playCount} play${playCount === 1 ? '' : 's'}`;
    // Play-only day (FR22 retro-import): presence, not a session
    if (day.sessionCount === 0) {
      return (playCount > 0 ? `${date} — played (${playsPart})` : `${date} — no practice`) + todaySuffix;
    }
    const minutesPart = `${day.totalMinutes} minute${day.totalMinutes === 1 ? '' : 's'}`;
    const sessionsPart = `${day.sessionCount} session${day.sessionCount === 1 ? '' : 's'}`;
    const base = `${date} — ${minutesPart}, ${sessionsPart}`;
    return (playCount > 0 ? `${base}, ${playsPart}` : base) + todaySuffix;
  };

  // Roving tabindex (NFR6), APG grid pattern: the DOM rows are weekdays, so
  // Right/Left = next/previous cell in the row (= ±1 week = ±7 days) and
  // Down/Up = same column next/previous row (= ±1 day). At an edge, focus
  // does NOT move (no clamping across rows). Modifier chords (Alt+Arrow =
  // browser back…) are left alone. Home/End jump within the row.
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const currentIndex = grid.days.indexOf(tabbableDate);
    if (currentIndex === -1) return;

    // APG activation: Enter/Space toggles the focused day's detail (FR16);
    // re-activating the selected day closes the panel
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedDate(prev => (prev === tabbableDate ? null : tabbableDate));
      return;
    }

    let nextIndex: number;
    switch (e.key) {
      case 'ArrowDown': nextIndex = currentIndex + 1; break;
      case 'ArrowUp': nextIndex = currentIndex - 1; break;
      case 'ArrowRight': nextIndex = currentIndex + 7; break;
      case 'ArrowLeft': nextIndex = currentIndex - 7; break;
      case 'Home': {
        nextIndex = currentIndex;
        while (nextIndex - 7 >= 0) nextIndex -= 7;
        break;
      }
      case 'End': {
        nextIndex = currentIndex;
        while (nextIndex + 7 < grid.days.length) nextIndex += 7;
        break;
      }
      default: return;
    }
    e.preventDefault();
    if (nextIndex < 0 || nextIndex >= grid.days.length || nextIndex === currentIndex) return;
    const nextDate = grid.days[nextIndex];
    setFocusedDate(nextDate);
    document.getElementById(`heatmap-day-${nextDate}`)?.focus();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-950 text-gray-900 dark:text-gray-100">
      <ConfirmDialog
        isOpen={!!deleteSessionUid}
        title="Delete session"
        message={(() => {
          const target = (daySessions ?? []).find(s => s.uid === deleteSessionUid);
          return target
            ? `Are you sure you want to delete the session of ${target.date} (${target.instrumentType})?`
            : 'Are you sure you want to delete this session?';
        })()}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={handleDeleteSession}
        onCancel={() => setDeleteSessionUid(null)}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="card-base glass-effect p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Practice heatmap {year}</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="heatmap-prev-year"
                aria-label="Previous year"
                className="btn-secondary text-sm"
                onClick={() => changeYear(-1)}
                disabled={year <= 1900}
              >
                ← {year - 1}
              </button>
              <button
                type="button"
                id="heatmap-next-year"
                aria-label="Next year"
                className="btn-secondary text-sm"
                onClick={() => changeYear(1)}
                disabled={year >= currentYear}
              >
                {year + 1} →
              </button>
            </div>
          </div>

          <div role="status" aria-label="Heatmap status" className="text-sm text-gray-600 dark:text-gray-400">
            {failed
              ? 'Heatmap could not be loaded.'
              : days === null
                ? 'Loading...'
                : days.length === 0
                  ? `No practice logged in ${year} yet.`
                  : null}
          </div>

          {!failed && days !== null && (
            <div className="overflow-x-auto pb-2">
              <div className="inline-flex flex-col gap-1">
                {/* Month labels row */}
                <div className="flex gap-1 ml-9" aria-hidden="true">
                  {monthByWeek.map((label, weekIndex) => (
                    <div key={weekIndex} className="w-3 text-[10px] text-gray-500 dark:text-gray-400 overflow-visible whitespace-nowrap">
                      {label ?? ''}
                    </div>
                  ))}
                </div>
                <div className="flex gap-1">
                  {/* Weekday labels column */}
                  <div className="flex flex-col gap-1 w-8" aria-hidden="true">
                    {WEEKDAY_LABELS.map((label, dayIndex) => (
                      <div key={dayIndex} className="h-3 text-[10px] leading-3 text-gray-500 dark:text-gray-400">{label}</div>
                    ))}
                  </div>
                  {/* APG-conformant structure: each ARIA row IS a weekday row
                      (Mon..Sun), cells run left-to-right across the weeks —
                      DOM order matches what arrow keys and screen readers
                      announce. Padding cells stay out of the a11y tree. */}
                  <div
                    role="grid"
                    aria-label={`Practice heatmap ${year}`}
                    className="flex flex-col gap-1"
                    onKeyDown={handleGridKeyDown}
                  >
                    {Array.from({ length: 7 }, (_, dayOfWeek) => (
                      <div key={dayOfWeek} role="row" className="flex gap-1">
                        {grid.weeks.map((week, weekIndex) => {
                          const date = week[dayOfWeek];
                          return date === null ? (
                            <div key={`pad-${weekIndex}`} className="w-3 h-3" aria-hidden="true" />
                          ) : (
                            <div
                              key={date}
                              id={`heatmap-day-${date}`}
                              role="gridcell"
                              tabIndex={date === tabbableDate ? 0 : -1}
                              aria-label={labelFor(date)}
                              aria-selected={date === selectedDate}
                              title={labelFor(date)}
                              onFocus={() => setFocusedDate(date)}
                              onClick={() => {
                                setFocusedDate(date);
                                // Clicking the selected day again closes the panel
                                setSelectedDate(prev => (prev === date ? null : date));
                              }}
                              className={`w-3 h-3 rounded-sm cursor-pointer ${LEVEL_CLASSES[levelFor(date)]} ${date === selectedDate ? 'ring-2 ring-brand-500 dark:ring-brand-400' : ''} ${date === todayStr ? 'outline outline-1 outline-gray-400 dark:outline-gray-500' : ''}`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Legend — a quiet scale, not a scoreboard */}
                <div className="flex items-center gap-1 justify-end text-[10px] text-gray-500 dark:text-gray-400" aria-hidden="true">
                  <span>Less</span>
                  {/* Activity levels only — the empty-day gray was mistaken
                      for the lowest level (northwood field feedback) */}
                  {LEVEL_CLASSES.slice(1).map((cls, level) => (
                    <div key={level} className={`w-3 h-3 rounded-sm ${cls}`} />
                  ))}
                  <span>More</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedDate && (
          <div className="card-base glass-effect p-4 sm:p-5 space-y-4">
            {/* The DATEONLY string is displayed verbatim (FR19 read-side trap) */}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedDate}</h3>
            <div role="status" aria-label="Day detail status" className="text-sm text-gray-600 dark:text-gray-400">
              {dayFailed
                // Loaded plays still render below — only claim a total loss
                // when there is truly nothing to show
                ? dayPlays !== null && dayPlays.length > 0
                  ? 'Sessions could not be loaded.'
                  : 'Day detail could not be loaded.'
                : deleteFailed
                  ? 'Session could not be deleted.'
                  : playsFailed
                    ? 'Plays could not be loaded.'
                    : daySessions === null || dayPlays === null
                      ? 'Loading...'
                      : daySessions.length === 0 && dayPlays.length === 0
                        ? `No practice on ${selectedDate}.`
                        : null}
            </div>
            {/* No dead-end CTA: a future day cannot be logged (the target form
                rejects future dates), so the link is simply not offered */}
            {!dayFailed && daySessions !== null && daySessions.length === 0
              && selectedDate <= formatLocalDate(new Date()) && (
              <Link
                to={`/my-sessions?date=${selectedDate}`}
                className="btn-secondary text-sm inline-flex items-center"
              >
                Log a session for this day
              </Link>
            )}
            {!dayFailed && daySessions !== null && daySessions.length > 0 && (
              <ul aria-label="Day sessions" className="space-y-3">
                {daySessions.map(session => (
                  <li key={session.uid} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{session.instrumentType}</span>
                      {session.durationMinutes ? (
                        <span className="text-sm text-gray-600 dark:text-gray-400">· {session.durationMinutes} min</span>
                      ) : null}
                      <div className="flex gap-2 ml-auto">
                        <Link
                          to={`/my-sessions?edit=${session.uid}`}
                          aria-label={`Edit session of ${session.date}`}
                          className="btn-secondary text-sm"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          aria-label={`Delete session of ${session.date}`}
                          className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50"
                          onClick={() => setDeleteSessionUid(session.uid)}
                          disabled={deleteInFlight}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {session.note && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{session.note}</p>
                    )}
                    {session.items && session.items.length > 0 && (
                      <ul className="space-y-1">
                        {session.items.map(item => {
                          const artist = item.songUid ? artistBySongUid.get(item.songUid) : undefined;
                          return (
                          <li key={item.uid} className="text-sm text-gray-700 dark:text-gray-300 pl-3 border-l-2 border-gray-200 dark:border-gray-700 break-words">
                            {artist ? <span>{artist} - </span> : null}
                            <span className="font-medium">{item.label}</span>
                            {item.minutes ? <span className="text-gray-500 dark:text-gray-400"> · played during {item.minutes} {item.minutes > 1 ? 'minutes' : 'minute'}</span> : null}
                            {item.note ? <span className="text-gray-500 dark:text-gray-400 italic"> · {item.note}</span> : null}
                          </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {/* Projected play history (FR22), below the real sessions:
                presence markers, deliberately more sober than session cards —
                no duration, no actions (a play is not an editable session).
                Independent of dayFailed: loaded plays survive a sessions
                failure. */}
            {visiblePlays !== null && visiblePlays.length > 0 && (
              <ul aria-label="Day plays" className="space-y-1">
                {visiblePlays.map(play => (
                  <li key={play.uid} className="text-sm text-gray-700 dark:text-gray-300 pl-3 border-l-2 border-gray-200 dark:border-gray-700 break-words">
                    <span className="font-medium">{play.title}</span>
                    {play.instrumentType ? <span className="text-gray-500 dark:text-gray-400"> — {play.instrumentType}</span> : null}
                    <span className="text-gray-500 dark:text-gray-400 italic"> · Played</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MyHeatmapPage;
