const crypto = require('crypto');

jest.mock('../models', () => ({
  AuthToken: {
    create: jest.fn(async (data) => ({ ...data, uid: 'tok-uid' })),
    update: jest.fn(),
    findOne: jest.fn(),
  },
}));

const { Op } = require('sequelize');
const { AuthToken } = require('../models');
const { issueToken, verifyToken, findConsumedToken, invalidatePendingTokens } = require('../services/authTokenService');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

describe('authTokenService (story 7.6)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('issueToken', () => {
    test('returns the clear token and stores only its sha256 (never the clear)', async () => {
      const clear = await issueToken('user-1', 'verify_email', { foo: 'bar' });

      expect(typeof clear).toBe('string');
      expect(clear.length).toBeGreaterThan(0);

      const arg = AuthToken.create.mock.calls[0][0];
      expect(arg.tokenHash).toBe(sha256(clear)); // hash match
      expect(arg.tokenHash).not.toBe(clear);     // clear is never persisted
      expect(arg.userUid).toBe('user-1');
      expect(arg.type).toBe('verify_email');
      expect(arg.payload).toEqual({ foo: 'bar' });
    });

    test('sets expiresAt per type (verify_email 24h, password_reset/change_email 1h)', async () => {
      const before = Date.now();
      await issueToken('user-1', 'verify_email');
      const verifyExp = AuthToken.create.mock.calls[0][0].expiresAt.getTime();
      // ~24h ahead (allow a generous window for execution time)
      expect(verifyExp).toBeGreaterThan(before + 23 * 60 * 60 * 1000);
      expect(verifyExp).toBeLessThan(before + 25 * 60 * 60 * 1000);

      await issueToken('user-1', 'password_reset');
      const resetExp = AuthToken.create.mock.calls[1][0].expiresAt.getTime();
      expect(resetExp).toBeGreaterThan(before + 50 * 60 * 1000);
      expect(resetExp).toBeLessThan(before + 70 * 60 * 1000);
    });

    test('rejects an unknown type', async () => {
      await expect(issueToken('user-1', 'bogus')).rejects.toThrow(/Unknown auth token type/);
      expect(AuthToken.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyToken (atomic single-use)', () => {
    test('valid token → atomic consume guarded on unused+unexpired, returns { userUid, payload }', async () => {
      // 1 row updated → token consumed; returning gives the row.
      AuthToken.update.mockResolvedValue([1, [{ userUid: 'user-1', payload: { foo: 'bar' } }]]);

      const result = await verifyToken('clear-abc', 'password_reset');

      expect(result).toEqual({ userUid: 'user-1', payload: { foo: 'bar' } });
      const [values, options] = AuthToken.update.mock.calls[0];
      expect(values).toEqual({ usedAt: expect.any(Date) });
      // consumed in one UPDATE matched by hash+type, guarded on usedAt:null + expiresAt > now
      expect(options.where.tokenHash).toBe(sha256('clear-abc'));
      expect(options.where.type).toBe('password_reset');
      expect(options.where.usedAt).toBeNull();
      expect(options.where.expiresAt).toHaveProperty([Op.gt]);
      expect(options.returning).toBe(true);
    });

    test('no matching row (unknown / already-used / expired) → null', async () => {
      // The guard (usedAt:null, expiresAt>now) means used/expired/unknown all
      // produce 0 affected rows — indistinguishable, returns null.
      AuthToken.update.mockResolvedValue([0, []]);
      expect(await verifyToken('clear-abc', 'password_reset')).toBeNull();
    });
  });

  describe('findConsumedToken (story 12.1 — redundant-click lookup)', () => {
    test('an already-used token → { userUid, payload } (read-only, by hash+type+used)', async () => {
      AuthToken.findOne.mockResolvedValue({ userUid: 'user-1', payload: { pendingEmail: 'new@example.com' } });

      const result = await findConsumedToken('clear-abc', 'change_email');

      expect(result).toEqual({ userUid: 'user-1', payload: { pendingEmail: 'new@example.com' } });
      const where = AuthToken.findOne.mock.calls[0][0].where;
      expect(where.tokenHash).toBe(sha256('clear-abc'));
      expect(where.type).toBe('change_email');
      expect(where.usedAt).toHaveProperty([Op.ne], null); // only USED tokens
    });

    test('no used token by that hash → null', async () => {
      AuthToken.findOne.mockResolvedValue(null);
      expect(await findConsumedToken('clear-abc', 'change_email')).toBeNull();
    });
  });

  describe('invalidatePendingTokens (story 7.11 deferred — supersede stale links)', () => {
    test('marks every unused token of the type as used, returns the count', async () => {
      AuthToken.update.mockResolvedValue([2]);

      const count = await invalidatePendingTokens('user-1', 'change_email');

      expect(count).toBe(2);
      const [values, options] = AuthToken.update.mock.calls[0];
      expect(values).toEqual({ usedAt: expect.any(Date) });
      expect(options.where).toEqual({ userUid: 'user-1', type: 'change_email', usedAt: null });
    });
  });
});
