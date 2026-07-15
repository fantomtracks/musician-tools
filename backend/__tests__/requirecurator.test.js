jest.mock('../models', () => ({
  User: {
    findByPk: jest.fn(),
  },
}));

const { User } = require('../models');
const requireCurator = require('../middleware/requirecurator');

function mockNext() {
  return jest.fn();
}

describe('requireCurator middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('curator passes -> next() with no error', async () => {
    User.findByPk.mockResolvedValue({ uid: 'u1', isCurator: true });
    const next = mockNext();
    await requireCurator({ session: { user: 'u1' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  test('non-curator -> 403 (never 404: catalog write is a privilege secret, not a resource oracle)', async () => {
    User.findByPk.mockResolvedValue({ uid: 'u1', isCurator: false });
    const next = mockNext();
    await requireCurator({ session: { user: 'u1' } }, {}, next);
    expect(next.mock.calls[0][0].status).toBe(403);
  });

  test('unknown user -> 403', async () => {
    User.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await requireCurator({ session: { user: 'ghost' } }, {}, next);
    expect(next.mock.calls[0][0].status).toBe(403);
  });

  test('no session user -> 401 (does not hit the DB)', async () => {
    const next = mockNext();
    await requireCurator({ session: {} }, {}, next);
    expect(next.mock.calls[0][0].status).toBe(401);
    expect(User.findByPk).not.toHaveBeenCalled();
  });
});
