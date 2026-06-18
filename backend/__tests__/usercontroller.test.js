jest.mock('../models', () => ({
  User: {
    create: jest.fn(),
    scope: jest.fn(),
  },
  Topic: {
    findOrCreate: jest.fn(async () => [{ uid: 'free-practice-uid' }, true]),
  },
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'signed-token'),
}));

const { User, Topic } = require('../models');
const controller = require('../controllers/usercontroller');
const { FREE_PRACTICE_NAME } = require('../constants/topics');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function mockNext() {
  return jest.fn();
}

function mockNewUser(uid = 'new-user-1') {
  // createUser reads newUser.uid and newUser.dataValues (to strip the password)
  return { uid, dataValues: { uid, name: 'Ada', email: 'ada@example.com', password: 'hashed' } };
}

describe('usercontroller.createUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Topic.findOrCreate.mockResolvedValue([{ uid: 'free-practice-uid' }, true]);
  });

  test('seeds the Free practice system topic for the new user (story 8.2)', async () => {
    const newUser = mockNewUser();
    User.create.mockResolvedValue(newUser);

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: 'pw' }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(Topic.findOrCreate).toHaveBeenCalledTimes(1);
    const arg = Topic.findOrCreate.mock.calls[0][0];
    expect(arg.where).toEqual({ userUid: newUser.uid, name: FREE_PRACTICE_NAME });
    expect(arg.defaults.isSystem).toBe(true);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('registration still succeeds (201) when seeding the topic fails', async () => {
    const newUser = mockNewUser();
    User.create.mockResolvedValue(newUser);
    Topic.findOrCreate.mockRejectedValueOnce(new Error('seed boom'));

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: 'pw' }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('does not seed a topic when user creation fails', async () => {
    const uniqueError = new Error('dup');
    uniqueError.name = 'SequelizeUniqueConstraintError';
    User.create.mockRejectedValue(uniqueError);

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: 'pw' }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(Topic.findOrCreate).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0].status).toBe(400);
  });
});
