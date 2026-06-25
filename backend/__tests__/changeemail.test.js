jest.mock('../models', () => ({
  User: { findByPk: jest.fn(), findOne: jest.fn(), update: jest.fn(), scope: jest.fn() },
  Topic: {},
}));
jest.mock('../services/authTokenService', () => ({ issueToken: jest.fn(async () => 'tok'), verifyToken: jest.fn() }));
jest.mock('../services/authEmails', () => ({
  sendSignupAttemptNotice: jest.fn(),
  sendVerifyEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendChangeEmail: jest.fn(),
}));
jest.mock('../services/sessionService', () => ({ invalidateOtherSessions: jest.fn() }));

const { User } = require('../models');
const authTokenService = require('../services/authTokenService');
const authEmails = require('../services/authEmails');
const { CHECK_YOUR_INBOX } = require('../constants/messages');
const accountController = require('../controllers/accountcontroller');
const userController = require('../controllers/usercontroller');

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const mockNext = () => jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('requestEmailChange (story 7.11 — verify-before-switch)', () => {
  test('a FREE new address → pendingEmail set + change_email token (payload) + email sent, email never touched, generic reply', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue({ uid: 'u1', update });
    User.findOne.mockResolvedValue(null); // address is free

    const res = mockRes();
    await accountController.requestEmailChange({ session: { user: 'u1' }, body: { newEmail: 'new@example.com' } }, res, mockNext());

    expect(update).toHaveBeenCalledWith({ pendingEmail: 'new@example.com' });
    expect(update.mock.calls[0][0]).not.toHaveProperty('email'); // email NEVER overwritten directly
    expect(authTokenService.issueToken).toHaveBeenCalledWith('u1', 'change_email', { pendingEmail: 'new@example.com' });
    expect(authEmails.sendChangeEmail).toHaveBeenCalledWith('new@example.com', 'tok');
    expect(res.json).toHaveBeenCalledWith({ message: CHECK_YOUR_INBOX });
  });

  test('a TAKEN new address → same generic reply, no token/send; pendingEmail still recorded (anti-enumeration, no oracle)', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue({ uid: 'u1', update });
    User.findOne.mockResolvedValue({ uid: 'other', email: 'taken@example.com' }); // taken

    const res = mockRes();
    await accountController.requestEmailChange({ session: { user: 'u1' }, body: { newEmail: 'taken@example.com' } }, res, mockNext());

    expect(update).toHaveBeenCalledWith({ pendingEmail: 'taken@example.com' }); // set regardless → getProfile can't leak availability
    expect(authTokenService.issueToken).not.toHaveBeenCalled(); // but the link is only sent if free
    expect(authEmails.sendChangeEmail).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: CHECK_YOUR_INBOX });
  });

  test('an invalid email format → 400 via the model isEmail guard, no token issued', async () => {
    const validationErr = new Error('Invalid email address');
    validationErr.name = 'SequelizeValidationError';
    const update = jest.fn().mockRejectedValue(validationErr);
    User.findByPk.mockResolvedValue({ uid: 'u1', update });

    const next = mockNext();
    await accountController.requestEmailChange({ session: { user: 'u1' }, body: { newEmail: 'not-an-email' } }, mockRes(), next);

    expect(next.mock.calls[0][0].status).toBe(400);
    expect(authTokenService.issueToken).not.toHaveBeenCalled();
  });
});

describe('confirmEmailChange (story 7.11)', () => {
  test('a valid token switches pendingEmail (from payload) into email', async () => {
    authTokenService.verifyToken.mockResolvedValue({ userUid: 'u1', payload: { pendingEmail: 'new@example.com' } });
    const res = mockRes();
    await userController.confirmEmailChange({ body: { token: 'good' } }, res, mockNext());

    expect(authTokenService.verifyToken).toHaveBeenCalledWith('good', 'change_email');
    expect(User.update).toHaveBeenCalledWith({ email: 'new@example.com', pendingEmail: null }, { where: { uid: 'u1' } });
    expect(res.json).toHaveBeenCalledWith({ success: true, email: 'new@example.com' });
  });

  test('an invalid/expired/reused token → generic 400', async () => {
    authTokenService.verifyToken.mockResolvedValue(null);
    const next = mockNext();
    await userController.confirmEmailChange({ body: { token: 'bad' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(User.update).not.toHaveBeenCalled();
  });

  test('a token without a pendingEmail payload → generic 400', async () => {
    authTokenService.verifyToken.mockResolvedValue({ userUid: 'u1', payload: null });
    const next = mockNext();
    await userController.confirmEmailChange({ body: { token: 'weird' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('a unique collision on switch (address taken meanwhile) → generic 400', async () => {
    authTokenService.verifyToken.mockResolvedValue({ userUid: 'u1', payload: { pendingEmail: 'new@example.com' } });
    const dup = new Error('dup');
    dup.name = 'SequelizeUniqueConstraintError';
    User.update.mockRejectedValueOnce(dup);
    const next = mockNext();
    await userController.confirmEmailChange({ body: { token: 'good' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('a missing token → 400', async () => {
    const next = mockNext();
    await userController.confirmEmailChange({ body: {} }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
  });
});
