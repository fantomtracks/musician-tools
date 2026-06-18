import { parseDurationToSeconds, formatSecondsToMmss } from '../utils/duration';

describe('parseDurationToSeconds', () => {
  test('parses m:ss form', () => {
    expect(parseDurationToSeconds('3:30')).toBe(210);
    expect(parseDurationToSeconds('4:00')).toBe(240);
    expect(parseDurationToSeconds('0:45')).toBe(45);
    expect(parseDurationToSeconds('10:05')).toBe(605);
  });

  test('treats a single-digit seconds part as tens (3:3 → 3:30)', () => {
    expect(parseDurationToSeconds('3:3')).toBe(210); // 3:30
    expect(parseDurationToSeconds('3:5')).toBe(230); // 3:50
    expect(parseDurationToSeconds('3:0')).toBe(180); // 3:00
    expect(parseDurationToSeconds('0:3')).toBe(30);  // 0:30
    // Two digits stay exact
    expect(parseDurationToSeconds('3:05')).toBe(185);
  });

  test('parses a bare whole number as minutes', () => {
    expect(parseDurationToSeconds('4')).toBe(240);
    expect(parseDurationToSeconds('10')).toBe(600);
  });

  test('rejects decimal and comma input (m:ss or whole minutes only)', () => {
    expect(parseDurationToSeconds('3.5')).toBeNull();
    expect(parseDurationToSeconds('3,3')).toBeNull();
    expect(parseDurationToSeconds('4.0')).toBeNull();
  });

  test('rejects empty, blank and unparseable input', () => {
    expect(parseDurationToSeconds('')).toBeNull();
    expect(parseDurationToSeconds('   ')).toBeNull();
    expect(parseDurationToSeconds('abc')).toBeNull();
    expect(parseDurationToSeconds('3:xx')).toBeNull();
    expect(parseDurationToSeconds('3:')).toBeNull();
    expect(parseDurationToSeconds('1:2:3')).toBeNull();
  });

  test('rejects seconds over 59, including single-digit tens that exceed 59', () => {
    expect(parseDurationToSeconds('3:60')).toBeNull(); // 60 > 59
    expect(parseDurationToSeconds('3:90')).toBeNull(); // 90 > 59
    expect(parseDurationToSeconds('3:7')).toBeNull();  // 7 → 70s > 59
    expect(parseDurationToSeconds('3:6')).toBeNull();  // 6 → 60s > 59
  });

  test('rejects zero, negatives and out-of-range totals', () => {
    expect(parseDurationToSeconds('0:00')).toBeNull(); // zero
    expect(parseDurationToSeconds('-2')).toBeNull();
    expect(parseDurationToSeconds('99999')).toBeNull(); // > 24h
  });
});

describe('formatSecondsToMmss', () => {
  test('formats seconds as m:ss with zero-padded seconds', () => {
    expect(formatSecondsToMmss(210)).toBe('3:30');
    expect(formatSecondsToMmss(240)).toBe('4:00');
    expect(formatSecondsToMmss(45)).toBe('0:45');
    expect(formatSecondsToMmss(198)).toBe('3:18');
  });

  test('returns empty string for null/undefined', () => {
    expect(formatSecondsToMmss(null)).toBe('');
    expect(formatSecondsToMmss(undefined)).toBe('');
  });

  test('round-trips with the parser', () => {
    expect(formatSecondsToMmss(parseDurationToSeconds('3:30'))).toBe('3:30');
  });
});
