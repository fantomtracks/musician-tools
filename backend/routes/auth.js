var express = require('express');
var router = express.Router();
const bodyParser = require('body-parser');
const uc = require('../controllers/usercontroller');
const authsess = require('../middleware/authsess');
const { loginLimiter, emailSendLimiter } = require('../middleware/ratelimiters');

router.use(bodyParser.json());

// Public routes
router.post('/register', uc.createUser);
// Brute-force guard (story 7.4): 10 / 15 min / IP. Effective order on /api is
// csrf (router-level, 7.3) -> loginLimiter -> loginUser; tokenless floods are
// already cut at 403, so only token-bearing attempts count toward the limit.
router.post('/login', loginLimiter, uc.loginUser);
// logout destroys the session — a state-changing action, so POST (CSRF-protected), not GET. (7.3)
router.post('/logout', uc.logoutUser);

// Email verification (story 7.9). verify-email is public (the token authorizes);
// resend is for the logged-in user and rate-limited per account.
router.post('/verify-email', uc.verifyEmail);
router.post('/verify-email/resend', authsess, emailSendLimiter, uc.resendVerification);

module.exports = router;
