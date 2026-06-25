jest.mock('../models', () => ({
  User: {
    create: jest.fn(),
    scope: jest.fn(),
  },
  Topic: {
    findOrCreate: jest.fn(async () => [{ uid: 'free-practice-uid' }, true]),
  },
}));

// emailService is the sole send point (7.6); story 7.7 notifies the owner on an
// existing-email signup attempt. Mock it so no real email is sent in tests.
jest.mock('../services/emailService', () => ({ sendEmail: jest.fn() }));

const { User, Topic } = require('../models');
const emailService = require('../services/emailService');
const controller = require('../controllers/usercontroller');
const { FREE_PRACTICE_NAME } = require('../constants/topics');

// >= 10 chars: story 7.7 enforces a minimum password length at registration.
const VALID_PW = 'password123';

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

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} };
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

  test('a new email logs in directly: 201 + auth, no JWT in response or session (7.1/7.7)', async () => {
    const newUser = mockNewUser();
    User.create.mockResolvedValue(newUser);

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty('token');
    expect(payload.auth).toBe(true);
    expect(req.session).not.toHaveProperty('token');
    expect(req.session.loggedIn).toBe(true);
  });

  test('registration still succeeds (201) when seeding the topic fails', async () => {
    User.create.mockResolvedValue(mockNewUser());
    Topic.findOrCreate.mockRejectedValueOnce(new Error('seed boom'));

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('a password shorter than 10 chars → 400, no account created (story 7.7)', async () => {
    const next = mockNext();
    await controller.createUser({ body: { name: 'Ada', email: 'a@b.com', password: 'short' }, session: {} }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  test('without a JSON body → 400 (req.body guard + password check), no create', async () => {
    const next = mockNext();
    await controller.createUser({ session: {} }, mockRes(), next); // req.body undefined
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  test('an existing email → generic pending response + owner notified (anti-enumeration, no oracle)', async () => {
    const uniqueError = new Error('dup');
    uniqueError.name = 'SequelizeUniqueConstraintError';
    uniqueError.errors = [{ path: 'email' }]; // email conflict
    User.create.mockRejectedValue(uniqueError);

    const req = { body: { name: 'Ada', email: 'taken@example.com', password: VALID_PW }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    // Generic response — never "email already taken", no account, no 4xx oracle.
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ auth: false, pending: true });
    expect(next).not.toHaveBeenCalled();
    // Real owner is notified via the sole send point.
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail.mock.calls[0][0]).toMatchObject({ to: 'taken@example.com' });
    // No account / no topic seeded.
    expect(Topic.findOrCreate).not.toHaveBeenCalled();
    expect(req.session.loggedIn).toBeUndefined();
  });

  test('the owner notification is best-effort: a send failure still returns the generic response', async () => {
    const uniqueError = new Error('dup');
    uniqueError.name = 'SequelizeUniqueConstraintError';
    uniqueError.errors = [{ path: 'email' }];
    User.create.mockRejectedValue(uniqueError);
    emailService.sendEmail.mockRejectedValueOnce(new Error('resend down'));

    const res = mockRes();
    const next = mockNext();
    await controller.createUser({ body: { name: 'Ada', email: 'taken@example.com', password: VALID_PW }, session: {} }, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ auth: false, pending: true });
    expect(next).not.toHaveBeenCalled();
  });

  test('assigns a 4-digit discriminator on registration (story 7.2)', async () => {
    User.create.mockResolvedValue(mockNewUser());

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(User.create.mock.calls[0][0].discriminator).toMatch(/^\d{4}$/);
  });

  test('retries with a new discriminator on a (name, discriminator) collision (7.2)', async () => {
    const collision = new Error('dup');
    collision.name = 'SequelizeUniqueConstraintError';
    collision.errors = [{ path: 'discriminator' }]; // NOT email -> retry
    User.create.mockRejectedValueOnce(collision).mockResolvedValueOnce(mockNewUser());

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} };
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

  test('logs in by EMAIL only — scoped query on email, no JWT (story 7.7/7.1)', async () => {
    const user = mockLoginUser();
    const findOne = jest.fn().mockResolvedValue(user);
    User.scope.mockReturnValue({ findOne });

    const req = { body: { login: 'ada@example.com', password: VALID_PW }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.loginUser(req, res, next);

    // Email is the only identifier — exact match (citext = case-insensitive), no Op.or/iLike.
    expect(findOne).toHaveBeenCalledWith({ where: { email: 'ada@example.com' } });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty('token');
    expect(payload.auth).toBe(true);
    expect(req.session.loggedIn).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  test('login by name no longer works → 400 (no row matches the email query)', async () => {
    const findOne = jest.fn().mockResolvedValue(null); // a name is not an email → no match
    User.scope.mockReturnValue({ findOne });

    const req = { body: { login: 'Ada', password: VALID_PW }, session: {} };
    const next = mockNext();

    await controller.loginUser(req, mockRes(), next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('without a JSON body (or missing login/password) → generic 400', async () => {
    const next = mockNext();
    await controller.loginUser({ session: {} }, mockRes(), next); // req.body undefined
    expect(next.mock.calls[0][0].status).toBe(400);
  });
});
