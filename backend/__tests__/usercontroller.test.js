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

// Session-fixation hardening: loginUser / verifyEmail call req.session.regenerate
// before setting loggedIn/user. Simulate express-session's rotation: clear the
// session fields and swap the id, then invoke the callback.
function mockSession(id = 'sid-old') {
  const session = { id };
  session.regenerate = jest.fn((cb) => {
    session.id = 'sid-new';
    delete session.loggedIn;
    delete session.user;
    delete session.csrfToken;
    cb();
  });
  return session;
}

function mockNewUser(uid = 'new-user-1') {
  // createUser reads newUser.uid (logging, topic seed, verify-token issuance).
  // Story 7.13: it no longer logs in or echoes the user, so dataValues/getHandle
  // aren't read on the create path anymore — kept here for completeness.
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
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('a new email does NOT auto-log-in: generic pending response, no session (hard gate 7.13)', async () => {
    const newUser = mockNewUser();
    User.create.mockResolvedValue(newUser);

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    // Same generic response as an existing email → register is uniform (anti-enum).
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ auth: false, pending: true });
    // No session is opened — the user must verify before signing in.
    expect(req.session.loggedIn).toBeUndefined();
    expect(req.session.user).toBeUndefined();
  });

  test('registration still succeeds (200) when seeding the topic fails', async () => {
    User.create.mockResolvedValue(mockNewUser());
    Topic.findOrCreate.mockRejectedValueOnce(new Error('seed boom'));

    const req = { body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.createUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
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

  test('new-email and existing-email responses are INDISTINGUISHABLE (story 7.13 anti-enum)', async () => {
    // New email
    User.create.mockResolvedValueOnce(mockNewUser());
    const resNew = mockRes();
    await controller.createUser({ body: { name: 'Ada', email: 'new@example.com', password: VALID_PW }, session: {} }, resNew, mockNext());

    // Existing email
    const dup = new Error('dup');
    dup.name = 'SequelizeUniqueConstraintError';
    dup.errors = [{ path: 'email' }];
    User.create.mockRejectedValueOnce(dup);
    const resExisting = mockRes();
    await controller.createUser({ body: { name: 'Ada', email: 'taken@example.com', password: VALID_PW }, session: {} }, resExisting, mockNext());

    expect(resNew.status.mock.calls).toEqual(resExisting.status.mock.calls);
    expect(resNew.json.mock.calls).toEqual(resExisting.json.mock.calls);
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

    expect(res.status).toHaveBeenCalledWith(200);
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
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('usercontroller.loginUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockLoginUser(overrides = {}) {
    return {
      uid: 'user-1',
      name: 'Ada',
      discriminator: '0001',
      email: 'ada@example.com',
      isAdmin: false,
      emailVerified: true, // story 7.13: only verified accounts can sign in
      validPassword: jest.fn().mockResolvedValue(true),
      getHandle() { return `${this.name}#${this.discriminator}`; },
      ...overrides,
    };
  }

  test('logs in by EMAIL only — scoped query on email, no JWT (story 7.7/7.1)', async () => {
    const user = mockLoginUser();
    const findOne = jest.fn().mockResolvedValue(user);
    User.scope.mockReturnValue({ findOne });

    const req = { body: { login: 'ada@example.com', password: VALID_PW }, session: mockSession() };
    const res = mockRes();
    const next = mockNext();

    await controller.loginUser(req, res, next);

    // Email is the only identifier — exact match (citext = case-insensitive), no Op.or/iLike.
    expect(findOne).toHaveBeenCalledWith({ where: { email: 'ada@example.com' } });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty('token');
    expect(payload.auth).toBe(true);
    // Session-fixation hardening: the id is rotated BEFORE loggedIn/user are set.
    expect(req.session.regenerate).toHaveBeenCalled();
    expect(req.session.id).toBe('sid-new');
    expect(req.session.loggedIn).toBe(true);
    expect(req.session.user).toBe('user-1');
    expect(next).not.toHaveBeenCalled();
  });

  test('correct credentials but unverified email → 403 email_not_verified, no session (hard gate 7.13)', async () => {
    const user = mockLoginUser({ emailVerified: false });
    const findOne = jest.fn().mockResolvedValue(user);
    User.scope.mockReturnValue({ findOne });

    const req = { body: { login: 'ada@example.com', password: VALID_PW }, session: mockSession() };
    const res = mockRes();
    const next = mockNext();

    await controller.loginUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ auth: false, code: 'email_not_verified' });
    // Rejected before elevation → no session rotation, no login.
    expect(req.session.regenerate).not.toHaveBeenCalled();
    expect(req.session.loggedIn).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  test('a wrong password is rejected BEFORE the verification check → generic 400 (no oracle)', async () => {
    // Even if the account is unverified, a bad password must not reveal the
    // account's existence/state — it gets the same generic 400 as any bad login.
    const user = mockLoginUser({ emailVerified: false, validPassword: jest.fn().mockResolvedValue(false) });
    const findOne = jest.fn().mockResolvedValue(user);
    User.scope.mockReturnValue({ findOne });

    const req = { body: { login: 'ada@example.com', password: 'wrong-password' }, session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.loginUser(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
    expect(res.status).not.toHaveBeenCalledWith(403);
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

describe('usercontroller — email verification (story 7.9 + hard gate 7.13)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('register issues a verify_email token and returns the generic pending response', async () => {
    User.create.mockResolvedValue(mockNewUser());
    Topic.findOrCreate.mockResolvedValue([{ uid: 'fp' }, true]);

    const res = mockRes();
    await controller.createUser({ body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} }, res, mockNext());

    expect(authTokenService.issueToken).toHaveBeenCalledWith('new-user-1', 'verify_email');
    expect(authEmails.sendVerifyEmail).toHaveBeenCalledWith('ada@example.com', 'tok');
    // No auto-login (hard gate): generic pending response, account stays unverified.
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ auth: false, pending: true });
  });

  test('register still succeeds (200) when the verification email fails (best-effort)', async () => {
    User.create.mockResolvedValue(mockNewUser());
    authTokenService.issueToken.mockRejectedValueOnce(new Error('token store down'));

    const res = mockRes();
    await controller.createUser({ body: { name: 'Ada', email: 'ada@example.com', password: VALID_PW }, session: {} }, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(200);
  });

  describe('verifyEmail', () => {
    test('a valid token verifies, auto-logs-in, and returns the user (story 7.13)', async () => {
      authTokenService.verifyToken.mockResolvedValue({ userUid: 'u1', payload: null });
      const verifiedUser = {
        uid: 'u1', name: 'Ada', discriminator: '0001', email: 'ada@example.com', isAdmin: false,
        getHandle() { return `${this.name}#${this.discriminator}`; },
      };
      User.scope.mockReturnValue({ findByPk: jest.fn().mockResolvedValue(verifiedUser) });

      const req = { body: { token: 'good' }, session: mockSession() };
      const res = mockRes();
      await controller.verifyEmail(req, res, mockNext());

      expect(authTokenService.verifyToken).toHaveBeenCalledWith('good', 'verify_email');
      expect(User.update).toHaveBeenCalledWith({ emailVerified: true }, { where: { uid: 'u1' } });
      // Auto-login WITH session-fixation rotation: regenerate before set.
      expect(req.session.regenerate).toHaveBeenCalled();
      expect(req.session.id).toBe('sid-new');
      expect(req.session.loggedIn).toBe(true);
      expect(req.session.user).toBe('u1');
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.user).toMatchObject({ uid: 'u1', email: 'ada@example.com', emailVerified: true, handle: 'Ada#0001' });
    });

    test('an invalid/expired/used token → generic 400, no update, no session', async () => {
      authTokenService.verifyToken.mockResolvedValue(null);
      const req = { body: { token: 'bad' }, session: {} };
      const next = mockNext();
      await controller.verifyEmail(req, mockRes(), next);
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(User.update).not.toHaveBeenCalled();
      expect(req.session.loggedIn).toBeUndefined();
    });

    test('missing token → 400', async () => {
      const next = mockNext();
      await controller.verifyEmail({ body: {}, session: {} }, mockRes(), next);
      expect(next.mock.calls[0][0].status).toBe(400);
    });
  });

  describe('resendVerificationPublic (by email, story 7.13)', () => {
    test('an unverified email gets a fresh token + email', async () => {
      const findOne = jest.fn().mockResolvedValue({ uid: 'u1', email: 'ada@example.com', emailVerified: false });
      User.scope.mockReturnValue({ findOne });
      const res = mockRes();
      await controller.resendVerificationPublic({ body: { email: 'ada@example.com' } }, res);

      expect(findOne).toHaveBeenCalledWith({ where: { email: 'ada@example.com' } });
      expect(authTokenService.issueToken).toHaveBeenCalledWith('u1', 'verify_email');
      expect(authEmails.sendVerifyEmail).toHaveBeenCalledWith('ada@example.com', 'tok');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('an already-verified email → generic 200, no email (no oracle)', async () => {
      const findOne = jest.fn().mockResolvedValue({ uid: 'u1', email: 'ada@example.com', emailVerified: true });
      User.scope.mockReturnValue({ findOne });
      const res = mockRes();
      await controller.resendVerificationPublic({ body: { email: 'ada@example.com' } }, res);

      expect(authTokenService.issueToken).not.toHaveBeenCalled();
      expect(authEmails.sendVerifyEmail).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('an unknown email → generic 200, no email (no oracle)', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      User.scope.mockReturnValue({ findOne });
      const res = mockRes();
      await controller.resendVerificationPublic({ body: { email: 'nobody@example.com' } }, res);

      expect(authTokenService.issueToken).not.toHaveBeenCalled();
      expect(authEmails.sendVerifyEmail).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('no email in body → generic 200, no lookup', async () => {
      const findOne = jest.fn();
      User.scope.mockReturnValue({ findOne });
      const res = mockRes();
      await controller.resendVerificationPublic({ body: {} }, res);

      expect(findOne).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('a lookup/send failure still returns the generic success (never an oracle)', async () => {
      const findOne = jest.fn().mockRejectedValue(new Error('db down'));
      User.scope.mockReturnValue({ findOne });
      const res = mockRes();
      await controller.resendVerificationPublic({ body: { email: 'ada@example.com' } }, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
