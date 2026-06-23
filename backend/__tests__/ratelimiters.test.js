const express = require('express');
const request = require('supertest');
const { loginLimiter, emailSendLimiter } = require('../middleware/ratelimiters');

// Minimal app: optional session shim -> limiter -> 200 handler -> generic error
// handler mirroring server.js ({ status, message }). Each test builds its own app;
// loginLimiter and emailSendLimiter are distinct instances with distinct stores,
// so they don't contaminate each other.
function appWith(limiter, withSession = false) {
  const app = express();
  if (withSession) {
    app.use((req, _res, next) => {
      req.session = { user: req.get('X-Test-User') };
      next();
    });
  }
  app.post('/t', limiter, (_req, res) => res.status(200).json({ ok: true }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ status: err.status, message: err.message }));
  return app;
}

describe('ratelimiters (story 7.4)', () => {
  test('loginLimiter: the 11th request in the window is rejected with a generic 429', async () => {
    const app = appWith(loginLimiter);

    for (let i = 0; i < 10; i++) {
      const ok = await request(app).post('/t');
      expect(ok.status).toBe(200);
    }

    const blocked = await request(app).post('/t');
    expect(blocked.status).toBe(429);
    // No detail leaked (generic body) — anti-oracle.
    expect(blocked.body).toEqual({ status: 429, message: 'Too Many Requests' });
    // ...and no threshold/window/reset leaked via headers either.
    const leakHeaders = Object.keys(blocked.headers).filter((h) => /ratelimit|retry-after/i.test(h));
    expect(leakHeaders).toEqual([]);
  });

  test('emailSendLimiter: keyed per account — two users do not share the counter', async () => {
    const app = appWith(emailSendLimiter, true);

    // User A exhausts its 5 / h budget.
    for (let i = 0; i < 5; i++) {
      const ok = await request(app).post('/t').set('X-Test-User', 'user-A');
      expect(ok.status).toBe(200);
    }
    const blockedA = await request(app).post('/t').set('X-Test-User', 'user-A');
    expect(blockedA.status).toBe(429);

    // User B is on its own counter — still allowed.
    const okB = await request(app).post('/t').set('X-Test-User', 'user-B');
    expect(okB.status).toBe(200);
  });
});
