const { normalizeInt, normalizeDurationSeconds, normalizeLanguage, normalizeMode } = require('../utils/normalize');

describe('normalizeInt', () => {
  const bounds = { min: 1, max: 1000 };

  test('undefined passes through (absent field on a partial PUT)', () => {
    expect(normalizeInt(undefined, bounds)).toBeUndefined();
  });
  test('null and empty string -> null', () => {
    expect(normalizeInt(null, bounds)).toBeNull();
    expect(normalizeInt('', bounds)).toBeNull();
  });
  test('a valid integer (number or numeric string) is kept', () => {
    expect(normalizeInt(120, bounds)).toBe(120);
    expect(normalizeInt('120', bounds)).toBe(120);
  });
  test('a decimal -> null (INTEGER column would 500)', () => {
    expect(normalizeInt(3.5, bounds)).toBeNull();
    expect(normalizeInt('3.5', bounds)).toBeNull();
  });
  test('a non-numeric string -> null', () => {
    expect(normalizeInt('abc', bounds)).toBeNull();
  });
  test('below min / above max / negative -> null', () => {
    expect(normalizeInt(0, bounds)).toBeNull();
    expect(normalizeInt(1001, bounds)).toBeNull();
    expect(normalizeInt(-5, bounds)).toBeNull();
  });
  test('beyond INT4 (2147483647) -> null (no Postgres overflow)', () => {
    expect(normalizeInt(9999999999, { min: 1, max: 1000 })).toBeNull();
  });
  test('the bounds are inclusive', () => {
    expect(normalizeInt(1, bounds)).toBe(1);
    expect(normalizeInt(1000, bounds)).toBe(1000);
  });
  test('non-scalars (array / boolean / object) -> null, never a coerced integer', () => {
    expect(normalizeInt([5], bounds)).toBeNull(); // Number([5]) === 5
    expect(normalizeInt(true, bounds)).toBeNull(); // Number(true) === 1
    expect(normalizeInt({}, bounds)).toBeNull();
  });
});

describe('normalizeDurationSeconds (parity with the former inline helper)', () => {
  test('1..86400 kept, out-of-range -> null, undefined passthrough', () => {
    expect(normalizeDurationSeconds(200)).toBe(200);
    expect(normalizeDurationSeconds(0)).toBeNull();
    expect(normalizeDurationSeconds(86401)).toBeNull();
    expect(normalizeDurationSeconds(3.5)).toBeNull();
    expect(normalizeDurationSeconds(undefined)).toBeUndefined();
    expect(normalizeDurationSeconds(null)).toBeNull();
  });
});

describe('normalizeLanguage', () => {
  test('undefined passthrough, null -> null', () => {
    expect(normalizeLanguage(undefined)).toBeUndefined();
    expect(normalizeLanguage(null)).toBeNull();
  });
  test('an array is title-cased and emptied entries dropped', () => {
    expect(normalizeLanguage(['english', 'BRAZILIAN portuguese', '', null])).toEqual(['English', 'Brazilian Portuguese']);
  });
  test('an all-empty array -> null', () => {
    expect(normalizeLanguage(['', '   '])).toBeNull();
  });
  test('a single string is title-cased', () => {
    expect(normalizeLanguage('english')).toBe('English');
  });
  test('a blank string -> null', () => {
    expect(normalizeLanguage('   ')).toBeNull();
  });
});

describe('normalizeMode', () => {
  test('undefined passthrough (partial PUT), null -> null', () => {
    expect(normalizeMode(undefined)).toBeUndefined();
    expect(normalizeMode(null)).toBeNull();
  });
  test('lowercase canonical -> exact capitalized spelling (the Catalog case)', () => {
    expect(normalizeMode('major')).toBe('Major');
    expect(normalizeMode('minor')).toBe('Minor');
    expect(normalizeMode('mixolydian')).toBe('Mixolydian');
  });
  test('any casing maps to canonical, case-insensitively', () => {
    expect(normalizeMode('MAJOR')).toBe('Major');
    expect(normalizeMode('DoRiAn')).toBe('Dorian');
    expect(normalizeMode('  aeolian ')).toBe('Aeolian');
  });
  test('already-canonical is left as-is', () => {
    expect(normalizeMode('Major')).toBe('Major');
    expect(normalizeMode('Locrian')).toBe('Locrian');
  });
  test('an unknown non-empty value is title-cased, never dropped', () => {
    expect(normalizeMode('ionian')).toBe('Ionian');
  });
  test('blank / non-string -> null', () => {
    expect(normalizeMode('   ')).toBeNull();
    expect(normalizeMode(5)).toBeNull();
    expect(normalizeMode(['Major'])).toBeNull();
  });
});
