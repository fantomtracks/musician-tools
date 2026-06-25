jest.mock('../models', () => ({
  User: { findOne: jest.fn(), findByPk: jest.fn(), scope: jest.fn() },
  Topic: {},
}));
jest.mock('../services/authEmails', () => ({
  sendSignupAttemptNotice: jest.fn(),
  sendVerifyEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));
jest.mock('../services/authTokenService', () => ({ issueToken: jest.fn(async () => 'tok'), verifyToken: jest.fn() }));
jest.mock('../services/sessionService', () => ({ invalidateOtherSessions: jest.fn() }));

const { User } = require('../models');
const authEmails = require('../services/authEmails');
const authTokenService = require('../services/authTokenService');
const sessionService = require('../services/sessionService');
const { CHECK_YOUR_INBOX } = require('../constants/messages');
const controller = require('../controllers/usercontroller');

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const mockNext = () => jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('forgotPassword (story 7.10 — anti-enumeration)', () => {
  test('a non-existent email → generic 200, NO token, NO email', async () => {
    User.findOne.mockResolvedValue(null);
    const res = mockRes();
    await controller.forgotPassword({ body: { email: 'nobody@example.com' } }, res, mockNext());

    expect(res.json).toHaveBeenCalledWith({ message: CHECK_YOUR_INBOX });
    expect(authTokenService.issueToken).not.toHaveBeenCalled();
    expect(authEmails.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('an existing email → same generic 200 + password_reset token issued & emailed', async () => {
    User.findOne.mockResolvedValue({ uid: 'u1', email: 'ada@example.com' });
    const res = mockRes();
    await controller.forgotPassword({ body: { email: 'ada@example.com' } }, res, mockNext());

    expect(res.json).toHaveBeenCalledWith({ message: CHECK_YOUR_INBOX });
    expect(authTokenService.issueToken).toHaveBeenCalledWith('u1', 'password_reset');
    expect(authEmails.sendPasswordResetEmail).toHaveBeenCalledWith('ada@example.com', 'tok');
  });

  test('a send failure still returns the generic response (best-effort)', async () => {
    User.findOne.mockResolvedValue({ uid: 'u1', email: 'ada@example.com' });
    authEmails.sendPasswordResetEmail.mockRejectedValueOnce(new Error('resend down'));
    const res = mockRes();
    await controller.forgotPassword({ body: { email: 'ada@example.com' } }, res, mockNext());
    expect(res.json).toHaveBeenCalledWith({ message: CHECK_YOUR_INBOX });
  });
});

describe('resetPassword (story 7.10)', () => {
  function scopeReturns(user) {
    User.findByPk.mockResolvedValue(user); // resetPassword uses default-scope findByPk (review 7.10)
  }

  test('a valid token sets the new password and invalidates the user\'s sessions', async () => {
    authTokenService.verifyToken.mockResolvedValue({ userUid: 'u1', payload: null });
    const update = jest.fn();
    scopeReturns({ uid: 'u1', update });

    const res = mockRes();
    await controller.resetPassword({ body: { token: 'good', newPassword: 'brandnewpass', confirmPassword: 'brandnewpass' }, sessionID: 'anon-sid' }, res, mockNext());

    expect(authTokenService.verifyToken).toHaveBeenCalledWith('good', 'password_reset');
    expect(update).toHaveBeenCalledWith({ password: 'brandnewpass' });
    expect(sessionService.invalidateOtherSessions).toHaveBeenCalledWith('u1', 'anon-sid');
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ success: true });
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i);
  });

  test('an invalid/expired/reused token → generic 400, no update', async () => {
    authTokenService.verifyToken.mockResolvedValue(null);
    const next = mockNext();
    await controller.resetPassword({ body: { token: 'bad', newPassword: 'brandnewpass', confirmPassword: 'brandnewpass' }, sessionID: 's' }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(sessionService.invalidateOtherSessions).not.toHaveBeenCalled();
  });

  test('a new password shorter than 10 → 400 (token not even checked)', async () => {
    const next = mockNext();
    await controller.resetPassword({ body: { token: 'good', newPassword: 'short', confirmPassword: 'short' }, sessionID: 's' }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(authTokenService.verifyToken).not.toHaveBeenCalled();
  });

  test('a confirmation mismatch → 400', async () => {
    const next = mockNext();
    await controller.resetPassword({ body: { token: 'good', newPassword: 'brandnewpass', confirmPassword: 'different123' }, sessionID: 's' }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('a missing token → 400', async () => {
    const next = mockNext();
    await controller.resetPassword({ body: { newPassword: 'brandnewpass', confirmPassword: 'brandnewpass' }, sessionID: 's' }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
  });
});
