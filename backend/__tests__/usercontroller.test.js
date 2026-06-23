jest.mock('../models', () => ({
  User: {
    create: jest.fn(),
    scope: jest.fn(),
  },
  Topic: {
    findOrCreate: jest.fn(async () => [{ uid: 'free-practice-uid' }, true]),
  },
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

  test('does not emit a JWT in the response or session (story 7.1)', async () => {
    const newUser = mockNewUser();
    User.create.mockResolvedValue(newUser);

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: 'pw' }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(res.json.mock.calls[0][0]).not.toHaveProperty('token');
    expect(req.session).not.toHaveProperty('token');
    expect(req.session.loggedIn).toBe(true);
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

  test('does not seed a topic when user creation fails (email taken)', async () => {
    const uniqueError = new Error('dup');
    uniqueError.name = 'SequelizeUniqueConstraintError';
    uniqueError.errors = [{ path: 'email' }]; // email conflict -> propagates, not retried
    User.create.mockRejectedValue(uniqueError);

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: 'pw' }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(Topic.findOrCreate).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('assigns a 4-digit discriminator on registration (story 7.2)', async () => {
    const newUser = mockNewUser();
    User.create.mockResolvedValue(newUser);

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: 'pw' }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(User.create.mock.calls[0][0].discriminator).toMatch(/^\d{4}$/);
  });

  test('without a JSON body → 400, not a 500 crash (story 7.5 req.body guard)', async () => {
    const validationErr = new Error('notNull Violation: User.email cannot be null');
    validationErr.name = 'SequelizeValidationError';
    User.create.mockRejectedValue(validationErr);

    const next = mockNext();
    await controller.createUser({ session: {} }, mockRes(), next); // req.body undefined

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('retries with a new discriminator on a (name, discriminator) collision (7.2)', async () => {
    const collision = new Error('dup');
    collision.name = 'SequelizeUniqueConstraintError';
    collision.errors = [{ path: 'discriminator' }]; // NOT email -> retry
    const newUser = mockNewUser();
    User.create.mockRejectedValueOnce(collision).mockResolvedValueOnce(newUser);

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: 'pw' }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(User.create).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('usercontroller.loginUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockLoginUser() {
    return {
      uid: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      isAdmin: false,
      validPassword: jest.fn().mockResolvedValue(true),
    };
  }

  test('without a JSON body (or missing login/password) → 400, not a 500 (story 7.5)', async () => {
    const next = mockNext();
    await controller.loginUser({ session: {} }, mockRes(), next); // req.body undefined
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('logs in via session only, with no JWT in the response or session (story 7.1)', async () => {
    const user = mockLoginUser();
    User.scope.mockReturnValue({ findOne: jest.fn().mockResolvedValue(user) });

    const req = { body: { login: 'ada@example.com', password: 'pw' }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.loginUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty('token');
    expect(payload.auth).toBe(true);
    expect(payload.userId).toBe('user-1');
    expect(req.session).not.toHaveProperty('token');
    expect(req.session.loggedIn).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });
});
