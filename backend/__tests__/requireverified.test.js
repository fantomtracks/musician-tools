jest.mock('../models', () => ({ User: { findByPk: jest.fn() } }));

const { User } = require('../models');
const requireVerified = require('../middleware/requireverified');

const mockRes = () => ({});
const mockNext = () => jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('requireVerified middleware (story 7.9)', () => {
  test('blocks an unverified user with a generic 403', async () => {
    User.findByPk.mockResolvedValue({ uid: 'u1', emailVerified: false });
    const next = mockNext();
    await requireVerified({ session: { user: 'u1' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(403);
  });

  test('lets a verified user through (next with no error)', async () => {
    User.findByPk.mockResolvedValue({ uid: 'u1', emailVerified: true });
    const next = mockNext();
    await requireVerified({ session: { user: 'u1' } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  test('401 when the session user no longer exists', async () => {
    User.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await requireVerified({ session: { user: 'ghost' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(401);
  });
});
