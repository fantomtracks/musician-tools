// Mock the Resend SDK before requiring the service. `mockSend` is allowed in the
// factory because jest permits out-of-scope refs prefixed with "mock".
const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

const { sendEmail } = require('../services/emailService');

describe('emailService (story 7.6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_FROM = 'no-reply@musician-tools.app';
  });

  test('sends via Resend with from/to/subject/html', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const data = await sendEmail({ to: 'u@example.com', subject: 'Hi', html: '<p>Hi</p>' });

    expect(mockSend).toHaveBeenCalledWith({
      from: 'no-reply@musician-tools.app',
      to: 'u@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
    });
    expect(data).toEqual({ id: 'email-1' });
  });

  test('a Resend error is surfaced as a 502 (never swallowed)', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });

    await expect(sendEmail({ to: 'u@example.com', subject: 'Hi', html: 'x' })).rejects.toMatchObject({
      status: 502,
    });
  });
});
