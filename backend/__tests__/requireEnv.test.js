const requireEnv = require('../config/requireEnv');

describe('requireEnv (boot-time fail-fast)', () => {
  const ORIGINAL = process.env.SESSION_SECRET;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = ORIGINAL;
    }
  });

  test('throws when a required variable is missing', () => {
    delete process.env.SESSION_SECRET;
    expect(() => requireEnv(['SESSION_SECRET'])).toThrow(/SESSION_SECRET/);
  });

  test('throws when a required variable is empty', () => {
    process.env.SESSION_SECRET = '';
    expect(() => requireEnv(['SESSION_SECRET'])).toThrow(/SESSION_SECRET/);
  });

  test('does not throw when all required variables are present', () => {
    process.env.SESSION_SECRET = 'a-real-secret';
    expect(() => requireEnv(['SESSION_SECRET'])).not.toThrow();
  });
});
