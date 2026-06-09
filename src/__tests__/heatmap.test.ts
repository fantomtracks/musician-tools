import { buildYearGrid, computeLevels, formatLocalDate } from '../utils/heatmap';
import type { HeatmapDay } from '../services/practiceSessionService';

describe('formatLocalDate', () => {
  test('formats with local components, zero-padded', () => {
    // Local constructor — no string parsing anywhere (FR19 read-side trap)
    expect(formatLocalDate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(formatLocalDate(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(formatLocalDate(new Date(2024, 8, 5))).toBe('2024-09-05');
  });
});

describe('buildYearGrid', () => {
  test('produces 365 days for 2026 and 366 for leap 2024', () => {
    expect(buildYearGrid(2026).days).toHaveLength(365);
    expect(buildYearGrid(2024).days).toHaveLength(366);
  });

  test('starts on January 1st and ends on December 31st', () => {
    const { days } = buildYearGrid(2026);
    expect(days[0]).toBe('2026-01-01');
    expect(days[days.length - 1]).toBe('2026-12-31');
  });

  test('weeks start on Monday: 2026-01-01 is a Thursday, so 3 leading paddings', () => {
    const { weeks } = buildYearGrid(2026);
    expect(weeks[0][0]).toBeNull(); // Monday
    expect(weeks[0][1]).toBeNull(); // Tuesday
    expect(weeks[0][2]).toBeNull(); // Wednesday
    expect(weeks[0][3]).toBe('2026-01-01'); // Thursday
    // Every week is exactly 7 cells
    weeks.forEach(week => expect(week).toHaveLength(7));
  });
});

describe('computeLevels', () => {
  const day = (date: string, totalMinutes: number, sessionCount = 1): HeatmapDay => ({ date, totalMinutes, sessionCount });

  test('absent days are level 0, zero-minute active days are level 1 (every session lights up)', () => {
    const levelFor = computeLevels([day('2026-03-10', 0, 1), day('2026-03-11', 60)]);
    expect(levelFor('2026-01-01')).toBe(0);
    expect(levelFor('2026-03-10')).toBe(1);
  });

  test('quartile tiers are relative to the user own distribution', () => {
    // Distribution: 10, 20, 30, 40 → nearest-rank thresholds q1=10, q2=20, q3=30
    const levelFor = computeLevels([
      day('2026-01-01', 10),
      day('2026-01-02', 20),
      day('2026-01-03', 30),
      day('2026-01-04', 40),
    ]);
    expect(levelFor('2026-01-01')).toBe(1); // <= q1
    expect(levelFor('2026-01-02')).toBe(2); // <= q2
    expect(levelFor('2026-01-03')).toBe(3); // <= q3
    expect(levelFor('2026-01-04')).toBe(4); // > q3
  });

  test('with no positive minutes at all, every active day is level 1', () => {
    const levelFor = computeLevels([day('2026-01-01', 0, 2), day('2026-01-02', 0, 1)]);
    expect(levelFor('2026-01-01')).toBe(1);
    expect(levelFor('2026-01-02')).toBe(1);
  });

  test('the personal best is always the brightest level — even alone', () => {
    const levelFor = computeLevels([day('2026-01-01', 45)]);
    // The only value IS the user's max → brightest green, not the dimmest
    expect(levelFor('2026-01-01')).toBe(4);
  });

  test('a perfectly consistent practice renders bright, not dim (FR18)', () => {
    const levelFor = computeLevels([
      day('2026-01-01', 30),
      day('2026-01-02', 30),
      day('2026-01-03', 30),
    ]);
    expect(levelFor('2026-01-01')).toBe(4);
    expect(levelFor('2026-01-03')).toBe(4);
  });

  test('tied top values all reach level 4, lower values keep their tier', () => {
    const levelFor = computeLevels([
      day('2026-01-01', 10),
      day('2026-01-02', 40),
      day('2026-01-03', 40),
      day('2026-01-04', 40),
    ]);
    expect(levelFor('2026-01-01')).toBe(1);
    expect(levelFor('2026-01-02')).toBe(4);
    expect(levelFor('2026-01-04')).toBe(4);
  });

  test('non-finite minutes are sanitized to 0 — never level 4', () => {
    const levelFor = computeLevels([
      day('2026-01-01', Number.NaN),
      day('2026-01-02', 60),
    ]);
    expect(levelFor('2026-01-01')).toBe(1);
    expect(levelFor('2026-01-02')).toBe(4);
  });

  test('a play-only day lights at the minimal level (FR22 retro-import)', () => {
    const levelFor = computeLevels([
      { date: '2026-02-01', totalMinutes: 0, sessionCount: 0, playCount: 3 },
      day('2026-03-10', 60),
    ]);
    expect(levelFor('2026-02-01')).toBe(1);
    // Sessions keep their own scale — plays never inflate it (FR22)
    expect(levelFor('2026-03-10')).toBe(4);
  });

  test('plays on a session day never change its level (no double counting, FR22)', () => {
    const withPlays = computeLevels([
      { date: '2026-01-01', totalMinutes: 10, sessionCount: 1, playCount: 7 },
      { date: '2026-01-02', totalMinutes: 40, sessionCount: 1, playCount: 0 },
    ]);
    const withoutPlays = computeLevels([
      day('2026-01-01', 10),
      day('2026-01-02', 40),
    ]);
    expect(withPlays('2026-01-01')).toBe(withoutPlays('2026-01-01'));
    expect(withPlays('2026-01-02')).toBe(withoutPlays('2026-01-02'));
  });

  test('a day with neither sessions nor plays stays dark, NaN playCount is sanitized', () => {
    const levelFor = computeLevels([
      { date: '2026-01-01', totalMinutes: 0, sessionCount: 0, playCount: 0 },
      { date: '2026-01-02', totalMinutes: 0, sessionCount: 0, playCount: Number.NaN },
    ]);
    expect(levelFor('2026-01-01')).toBe(0);
    expect(levelFor('2026-01-02')).toBe(0);
  });

  test('playCount absent (pre-3.3 payload) is tolerated', () => {
    const levelFor = computeLevels([day('2026-01-01', 30)]);
    expect(levelFor('2026-01-01')).toBe(4);
  });
});

describe('buildYearGrid edge years', () => {
  test('two-digit years do not fall into the 19xx Date quirk', () => {
    const { days } = buildYearGrid(50);
    expect(days).toHaveLength(365);
    expect(days[0].endsWith('-01-01')).toBe(true);
  });
});
