jest.mock('../services/authTokenService', () => ({ issueToken: jest.fn() }));
jest.mock('../services/authEmails', () => ({
  sendVerifyEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendChangeEmail: jest.fn(),
}));

const authTokenService = require('../services/authTokenService');
const authEmails = require('../services/authEmails');
const { issueAndSend } = require('../services/authFlows');

describe('issueAndSend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authTokenService.issueToken.mockResolvedValue('tok');
  });

  test('verify_email: issues a 2-arg token (no payload) and sends the verify email', async () => {
    const ok = await issueAndSend('verify_email', { uid: 'u1', email: 'a@b.com' });
    expect(ok).toBe(true);
    expect(authTokenService.issueToken).toHaveBeenCalledWith('u1', 'verify_email');
    expect(authEmails.sendVerifyEmail).toHaveBeenCalledWith('a@b.com', 'tok');
  });

  test('change_email: forwards the payload as the 3rd arg and sends the change email', async () => {
    await issueAndSend('change_email', { uid: 'u1', email: 'new@b.com', payload: { pendingEmail: 'new@b.com' } });
    expect(authTokenService.issueToken).toHaveBeenCalledWith('u1', 'change_email', { pendingEmail: 'new@b.com' });
    expect(authEmails.sendChangeEmail).toHaveBeenCalledWith('new@b.com', 'tok');
  });

  test('password_reset routes to the reset sender', async () => {
    await issueAndSend('password_reset', { uid: 'u1', email: 'a@b.com' });
    expect(authEmails.sendPasswordResetEmail).toHaveBeenCalledWith('a@b.com', 'tok');
  });

  test('best-effort: a token failure is swallowed → false, no email sent', async () => {
    authTokenService.issueToken.mockRejectedValueOnce(new Error('store down'));
    const ok = await issueAndSend('verify_email', { uid: 'u1', email: 'a@b.com' });
    expect(ok).toBe(false);
    expect(authEmails.sendVerifyEmail).not.toHaveBeenCalled();
  });

  test('best-effort: a send failure is swallowed → false', async () => {
    authEmails.sendVerifyEmail.mockRejectedValueOnce(new Error('smtp down'));
    const ok = await issueAndSend('verify_email', { uid: 'u1', email: 'a@b.com' });
    expect(ok).toBe(false);
  });
});
