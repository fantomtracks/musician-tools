jest.mock('../models', () => ({
  User: {
    create: jest.fn(),
    scope: jest.fn(),
    update: jest.fn(),
    findByPk: jest.fn(),
  },
  Topic: {
    findOrCreate: jest.fn(async () => [{ uid: 'free-practice-uid' }, true]),
  },
}));

// Email composition (7.7/7.9) + token issuance (7.6/7.9) are mocked: no real
// email/token in tests.
jest.mock('../services/authEmails', () => ({ sendSignupAttemptNotice: jest.fn(), sendVerifyEmail: jest.fn() }));
jest.mock('../services/authTokenService', () => ({ issueToken: jest.fn(async () => 'tok'), verifyToken: jest.fn() }));

const { User, Topic } = require('../models');
const authEmails = require('../services/authEmails');
const authTokenService = require('../services/authTokenService');
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
  // createUser reads newUser.uid, newUser.dataValues (to strip the password) and
  // newUser.getHandle() (story 7.8 — model prototype method).
  return {
    uid,
    name: 'Ada',
    discriminator: '0001',
    email: 'ada@example.com',
    getHandle() { return `${this.name}#${this.discriminator}`; },
    dataValues: { uid, name: 'Ada', discriminator: '0001', email: 'ada@example.com', password: 'hashed' },
  };
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
    expect(authEmails.sendSignupAttemptNotice).toHaveBeenCalledTimes(1);
    expect(authEmails.sendSignupAttemptNotice).toHaveBeenCalledWith('taken@example.com');
    // No account / no topic seeded.
    expect(Topic.findOrCreate).not.toHaveBeenCalled();
    expect(req.session.loggedIn).toBeUndefined();
  });

  test('the owner notification is best-effort: a send failure still returns the generic response', async () => {
    const uniqueError = new Error('dup');
    uniqueError.name = 'SequelizeUniqueConstraintError';
    uniqueError.errors = [{ path: 'email' }];
    User.create.mockRejectedValue(uniqueError);
    authEmails.sendSignupAttemptNotice.mockRejectedValueOnce(new Error('resend down'));

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
      discriminator: '0001',
      email: 'ada@example.com',
      isAdmin: false,
      validPassword: jest.fn().mockResolvedValue(true),
      getHandle() { return `${this.name}#${this.discriminator}`; },
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

describe('usercontroller — email verification (story 7.9)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('register issues a verify_email token and stays unverified (soft gate)', async () => {
    User.create.mockResolvedValue(mockNewUser());
    Topic.findOrCreate.mockResolvedValue([{ uid: 'fp' }, true]);

    const res = mockRes();
    await controller.createUser({ body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} }, res, mockNext());

    expect(authTokenService.issueToken).toHaveBeenCalledWith('new-user-1', 'verify_email');
    expect(authEmails.sendVerifyEmail).toHaveBeenCalledWith('ada@example.com', 'tok');
    // logged in directly; emailVerified is not forced true here (defaults false).
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].auth).toBe(true);
  });

  test('register still succeeds (201) when the verification email fails (best-effort)', async () => {
    User.create.mockResolvedValue(mockNewUser());
    authTokenService.issueToken.mockRejectedValueOnce(new Error('token store down'));

    const res = mockRes();
    await controller.createUser({ body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} }, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(201);
  });

  describe('verifyEmail', () => {
    test('a valid token marks the user verified and returns success', async () => {
      authTokenService.verifyToken.mockResolvedValue({ userUid: 'u1', payload: null });
      const res = mockRes();
      await controller.verifyEmail({ body: { token: 'good' } }, res, mockNext());

      expect(authTokenService.verifyToken).toHaveBeenCalledWith('good', 'verify_email');
      expect(User.update).toHaveBeenCalledWith({ emailVerified: true }, { where: { uid: 'u1' } });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('an invalid/expired/used token → generic 400, no update', async () => {
      authTokenService.verifyToken.mockResolvedValue(null);
      const next = mockNext();
      await controller.verifyEmail({ body: { token: 'bad' } }, mockRes(), next);
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(User.update).not.toHaveBeenCalled();
    });

    test('missing token → 400', async () => {
      const next = mockNext();
      await controller.verifyEmail({ body: {} }, mockRes(), next);
      expect(next.mock.calls[0][0].status).toBe(400);
    });
  });

  describe('resendVerification', () => {
    test('an unverified user gets a fresh token + email', async () => {
      User.findByPk.mockResolvedValue({ uid: 'u1', email: 'ada@example.com', emailVerified: false });
      const res = mockRes();
      await controller.resendVerification({ session: { user: 'u1' } }, res, mockNext());

      expect(authTokenService.issueToken).toHaveBeenCalledWith('u1', 'verify_email');
      expect(authEmails.sendVerifyEmail).toHaveBeenCalledWith('ada@example.com', 'tok');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('an already-verified user → generic 200, no email', async () => {
      User.findByPk.mockResolvedValue({ uid: 'u1', email: 'ada@example.com', emailVerified: true });
      const res = mockRes();
      await controller.resendVerification({ session: { user: 'u1' } }, res, mockNext());

      expect(authTokenService.issueToken).not.toHaveBeenCalled();
      expect(authEmails.sendVerifyEmail).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('401 when unauthenticated', async () => {
      const next = mockNext();
      await controller.resendVerification({ session: {} }, mockRes(), next);
      expect(next.mock.calls[0][0].status).toBe(401);
    });
  });
});
