jest.mock('../models', () => ({
  User: {
    findByPk: jest.fn(),
    scope: jest.fn(),
  },
}));
jest.mock('../services/sessionService', () => ({ invalidateOtherSessions: jest.fn() }));

const { User } = require('../models');
const sessionService = require('../services/sessionService');
const controller = require('../controllers/accountcontroller');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}
const mockNext = () => jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('accountcontroller.getProfile', () => {
  test('returns the profile with handle, never the password', async () => {
    User.findByPk.mockResolvedValue({
      uid: 'u1', name: 'Ada', discriminator: '0042', email: 'ada@example.com', emailVerified: true, isAdmin: false, isCurator: true,
      getHandle() { return `${this.name}#${this.discriminator}`; },
    });
    const res = mockRes();
    await controller.getProfile({ session: { user: 'u1' } }, res, mockNext());

    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ handle: 'Ada#0042', email: 'ada@example.com' });
    expect(body.isCurator).toBe(true); // story 19.2: profile rehydrates the curator flag
    expect(body).not.toHaveProperty('password');
  });

  test('401 when unauthenticated', async () => {
    const next = mockNext();
    await controller.getProfile({ session: {} }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(401);
  });
});

describe('accountcontroller.updateName', () => {
  test('keeps the current discriminator when (name, disc) is free → handle returned', async () => {
    const update = jest.fn(async function (vals) { Object.assign(this, vals); });
    const user = { name: 'Ada', discriminator: '0042', update, getHandle() { return `${this.name}#${this.discriminator}`; } };
    User.findByPk.mockResolvedValue(user);

    const res = mockRes();
    await controller.updateName({ session: { user: 'u1' }, body: { name: 'Bea' } }, res, mockNext());

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toEqual({ name: 'Bea', discriminator: '0042' });
    expect(res.json.mock.calls[0][0]).toEqual({ name: 'Bea', discriminator: '0042', handle: 'Bea#0042' });
  });

  test('reassigns a free discriminator on a (name, discriminator) collision', async () => {
    const collision = new Error('dup');
    collision.name = 'SequelizeUniqueConstraintError';
    collision.fields = { name: 'Bea', discriminator: '0042' }; // the (name, discriminator) unique pair
    const update = jest.fn()
      .mockRejectedValueOnce(collision) // first try (current disc) collides
      .mockImplementationOnce(async function (vals) { Object.assign(this, vals); }); // retry succeeds
    const user = { name: 'Ada', discriminator: '0042', update, getHandle() { return `${this.name}#${this.discriminator}`; } };
    User.findByPk.mockResolvedValue(user);

    const res = mockRes();
    await controller.updateName({ session: { user: 'u1' }, body: { name: 'Bea' } }, res, mockNext());

    expect(update).toHaveBeenCalledTimes(2);
    expect(res.json.mock.calls[0][0].handle).toMatch(/^Bea#\d{4}$/);
  });

  test('empty name → 400', async () => {
    User.findByPk.mockResolvedValue({ name: 'Ada', discriminator: '0042', update: jest.fn() });
    const next = mockNext();
    await controller.updateName({ session: { user: 'u1' }, body: { name: '   ' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
  });
});

describe('accountcontroller.changePassword', () => {
  function mockUser(valid = true) {
    return {
      validPassword: jest.fn().mockResolvedValue(valid),
      update: jest.fn(),
    };
  }
  function scopeReturns(user) {
    User.scope.mockReturnValue({ findByPk: jest.fn().mockResolvedValue(user) });
  }

  test('missing current password → 400, no update', async () => {
    const user = mockUser();
    scopeReturns(user);
    const next = mockNext();
    await controller.changePassword({ session: { user: 'u1' }, sessionID: 'sid', body: { newPassword: 'abcdefghij' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('new password shorter than 10 → 400', async () => {
    scopeReturns(mockUser());
    const next = mockNext();
    await controller.changePassword({ session: { user: 'u1' }, sessionID: 'sid', body: { currentPassword: 'x', newPassword: 'short', confirmPassword: 'short' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('wrong current password → 400, no update, no session invalidation', async () => {
    const user = mockUser(false); // validPassword resolves false
    scopeReturns(user);
    const next = mockNext();
    await controller.changePassword(
      { session: { user: 'u1' }, sessionID: 'sid', body: { currentPassword: 'wrong', newPassword: 'abcdefghij', confirmPassword: 'abcdefghij' } },
      mockRes(), next
    );
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(user.update).not.toHaveBeenCalled();
    expect(sessionService.invalidateOtherSessions).not.toHaveBeenCalled();
  });

  test('success → updates password, invalidates OTHER sessions (current kept), response has no hash', async () => {
    const user = mockUser(true);
    scopeReturns(user);
    const res = mockRes();
    await controller.changePassword(
      { session: { user: 'u1' }, sessionID: 'current-sid', body: { currentPassword: 'old', newPassword: 'abcdefghij', confirmPassword: 'abcdefghij' } },
      res, mockNext()
    );
    expect(user.update).toHaveBeenCalledWith({ password: 'abcdefghij' });
    expect(sessionService.invalidateOtherSessions).toHaveBeenCalledWith('u1', 'current-sid');
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ success: true });
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i);
  });
});
