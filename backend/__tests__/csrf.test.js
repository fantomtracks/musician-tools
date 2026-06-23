const csrf = require('../middleware/csrf');

function mockReq({ method = 'GET', session = {}, header } = {}) {
  return {
    method,
    session,
    get: (name) => (name === 'X-CSRF-Token' ? header : undefined),
  };
}

const mockRes = () => ({ set: jest.fn() });
const mockNext = () => jest.fn();

describe('csrf middleware (story 7.3)', () => {
  test('mints a token in the session when absent (and calls next with no error)', () => {
    const req = mockReq({ method: 'GET', session: {} });
    const res = mockRes();
    const next = mockNext();

    csrf(req, res, next);

    expect(req.session.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(next).toHaveBeenCalledWith();
  });

  test('a GET passes without a token header', () => {
    const req = mockReq({ method: 'GET', session: { csrfToken: 'abc' } });
    const res = mockRes();
    const next = mockNext();

    csrf(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  test('a POST without the header is rejected with 403 and the CSRF marker', () => {
    const req = mockReq({ method: 'POST', session: { csrfToken: 'a'.repeat(64) } });
    const res = mockRes();
    const next = mockNext();

    csrf(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(403);
    expect(res.set).toHaveBeenCalledWith('X-CSRF-Token-Invalid', '1');
  });

  test('a POST with a wrong token is rejected with 403 and the CSRF marker', () => {
    const req = mockReq({ method: 'POST', session: { csrfToken: 'a'.repeat(64) }, header: 'b'.repeat(64) });
    const res = mockRes();
    const next = mockNext();

    csrf(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(403);
    expect(res.set).toHaveBeenCalledWith('X-CSRF-Token-Invalid', '1');
  });

  test('a POST with the matching token passes (no marker set)', () => {
    const token = 'a'.repeat(64);
    const req = mockReq({ method: 'POST', session: { csrfToken: token }, header: token });
    const res = mockRes();
    const next = mockNext();

    csrf(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.set).not.toHaveBeenCalled();
  });

  test('a request without a session is rejected with 403 and the CSRF marker', () => {
    const req = { method: 'POST', session: null, get: () => undefined };
    const res = mockRes();
    const next = mockNext();

    csrf(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(403);
    expect(res.set).toHaveBeenCalledWith('X-CSRF-Token-Invalid', '1');
  });
});
