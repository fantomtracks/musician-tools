const { MIN_PASSWORD_LENGTH, validateNewPassword } = require('../utils/passwordPolicy');

describe('validateNewPassword', () => {
  const valid = 'a'.repeat(MIN_PASSWORD_LENGTH);

  test('null when long enough and confirmed', () => {
    expect(validateNewPassword(valid, valid)).toBeNull();
  });

  test('rejects a too-short password', () => {
    expect(validateNewPassword('short', 'short')).toMatch(/at least 10/);
  });

  test('rejects a non-string', () => {
    expect(validateNewPassword(undefined, undefined)).toMatch(/at least 10/);
  });

  test('rejects a confirmation mismatch', () => {
    expect(validateNewPassword(valid, `${valid}x`)).toMatch(/do not match/);
  });
});
