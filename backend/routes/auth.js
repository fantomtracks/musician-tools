var express = require('express');
var router = express.Router();
const bodyParser = require('body-parser');
const uc = require('../controllers/usercontroller');
const authsess = require('../middleware/authsess');
const { loginLimiter } = require('../middleware/ratelimiters');

router.use(bodyParser.json());

// Public routes
router.post('/register', uc.createUser);
// Brute-force guard (story 7.4): 10 / 15 min / IP. Effective order on /api is
// csrf (router-level, 7.3) -> loginLimiter -> loginUser; tokenless floods are
// already cut at 403, so only token-bearing attempts count toward the limit.
router.post('/login', loginLimiter, uc.loginUser);
// logout destroys the session — a state-changing action, so POST (CSRF-protected), not GET. (7.3)
router.post('/logout', uc.logoutUser);

module.exports = router;
