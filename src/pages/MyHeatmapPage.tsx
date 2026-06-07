import { useEffect, useMemo, useState } from 'react';
import { practiceSessionService, type HeatmapDay } from '../services/practiceSessionService';
import { buildYearGrid, computeLevels } from '../utils/heatmap';

// Non-punitive palette (FR18): empty days stay neutral, activity ramps green.
// No red, no streak counters, no guilt-tripping copy anywhere on this page.
const LEVEL_CLASSES = [
  // Empty days must read as cells, not blend into the page gradient
  // (northwood's field feedback) — still neutral, never aggressive (FR18)
  'bg-gray-200 dark:bg-gray-700',
  'bg-green-200 dark:bg-green-900',
  'bg-green-400 dark:bg-green-700',
  'bg-green-600 dark:bg-green-500',
  'bg-green-800 dark:bg-green-300',
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// All 7 labels: the GitHub-style sparse labelling (Mon/Wed/Fri) reads as
// "3-day weeks" to first-time users (northwood's field feedback)
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MyHeatmapPage() {
  const year = new Date().getFullYear();
  const [days, setDays] = useState<HeatmapDay[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await practiceSessionService.getHeatmap(year);
        setDays(data ?? []);
      } catch {
        setFailed(true);
      }
    })();
  }, [year]);

  const grid = useMemo(() => buildYearGrid(year), [year]);
  const levelFor = useMemo(() => computeLevels(days ?? []), [days]);
  const dayByDate = useMemo(() => new Map((days ?? []).map(d => [d.date, d])), [days]);

  // Month labels above the columns: shown on the first week containing the 1st
  const monthByWeek = useMemo(() => grid.weeks.map(week => {
    const firstOfMonth = week.find(date => date !== null && date.endsWith('-01'));
    return firstOfMonth ? MONTH_LABELS[Number(firstOfMonth.slice(5, 7)) - 1] : null;
  }), [grid]);

  // Guard against a stale focusedDate (e.g. the year rolled over while the
  // page was mounted): the grid must always keep one tabbable cell
  const tabbableDate = focusedDate && grid.days.includes(focusedDate) ? focusedDate : grid.days[0];

  const labelFor = (date: string): string => {
    const day = dayByDate.get(date);
    if (!day) return `${date} — no practice`;
    const minutesPart = `${day.totalMinutes} minute${day.totalMinutes === 1 ? '' : 's'}`;
    const sessionsPart = `${day.sessionCount} session${day.sessionCount === 1 ? '' : 's'}`;
    return `${date} — ${minutesPart}, ${sessionsPart}`;
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="card-base glass-effect p-4 sm:p-5 space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Practice heatmap {year}</h2>

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
                              title={labelFor(date)}
                              onFocus={() => setFocusedDate(date)}
                              className={`w-3 h-3 rounded-sm ${LEVEL_CLASSES[levelFor(date)]}`}
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
                  {LEVEL_CLASSES.map((cls, level) => (
                    <div key={level} className={`w-3 h-3 rounded-sm ${cls}`} />
                  ))}
                  <span>More</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyHeatmapPage;
