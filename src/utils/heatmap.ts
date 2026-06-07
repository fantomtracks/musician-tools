import type { HeatmapDay } from '../services/practiceSessionService';

// The session day is a client-local DATEONLY string (FR19). All year-grid math
// uses LOCAL Date constructors and manual formatting — never new Date('YYYY-MM-DD'),
// which parses as UTC midnight and shifts the day in negative-offset timezones.
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type YearGrid = {
  days: string[]; // every date of the year, in order
  weeks: (string | null)[][]; // Monday-first weeks, padded with nulls
};

export function buildYearGrid(year: number): YearGrid {
  const days: string[] = [];
  // Noon, not midnight: engines with the historical DST resolution can land a
  // skipped local midnight on the PREVIOUS day and duplicate a date.
  // setFullYear dodges the two-digit-year Date quirk (0-99 → 19xx).
  const cursor = new Date(year, 0, 1, 12);
  cursor.setFullYear(year);
  while (cursor.getFullYear() === year) {
    days.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Monday-first: getDay() is 0=Sunday, shift so Monday=0
  const leading = (new Date(year, 0, 1).getDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return { days, weeks };
}

// Relative intensity tiers (FR15, GitHub-quartile style): thresholds are
// nearest-rank quantiles of the user's own positive day-totals. Any active day
// lights up at least at level 1 — a 2-minute or duration-less session counts.
export function computeLevels(activeDays: HeatmapDay[]): (date: string) => number {
  const byDate = new Map(activeDays.map(day => [day.date, day]));
  // Non-finite values (a malformed API row) count as 0 — never level 4
  const sanitize = (value: number) => (Number.isFinite(value) ? value : 0);
  const positives = activeDays
    .map(day => sanitize(day.totalMinutes))
    .filter(minutes => minutes > 0)
    .sort((a, b) => a - b);

  const max = positives.length > 0 ? positives[positives.length - 1] : 0;
  const rank = (q: number) => positives[Math.floor(q * (positives.length - 1))];
  const q1 = positives.length > 0 ? rank(0.25) : 0;
  const q2 = positives.length > 0 ? rank(0.5) : 0;
  const q3 = positives.length > 0 ? rank(0.75) : 0;

  return (date: string): number => {
    const day = byDate.get(date);
    if (!day || day.sessionCount === 0) return 0;
    const minutes = sanitize(day.totalMinutes);
    if (minutes <= 0 || positives.length === 0) return 1;
    // The personal best is always the brightest green: a perfectly consistent
    // practice (the same minutes every day) must not render as the dimmest
    // year — that would be the demotivating mirror FR15/FR18 forbid.
    if (minutes >= max) return 4;
    if (minutes <= q1) return 1;
    if (minutes <= q2) return 2;
    if (minutes <= q3) return 3;
    return 4;
  };
}
