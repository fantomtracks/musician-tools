var express = require('express');
var router = express.Router();
const accountController = require('../controllers/accountcontroller');
const authsess = require('../middleware/authsess');
const requireVerified = require('../middleware/requireverified');
const { changePasswordLimiter, emailSendLimiter } = require('../middleware/ratelimiters');

router.use(express.json());

// All account routes require authentication (CSRF is already global on /api, 7.3).
router.get('/', authsess, accountController.getProfile);
router.put('/name', authsess, accountController.updateName);
// Change-password is additionally rate-limited per account (story 7.8).
router.put('/password', authsess, changePasswordLimiter, accountController.changePassword);
// Change-email request (story 7.11): verified users only (soft gate), rate-limited.
router.put('/email', authsess, requireVerified, emailSendLimiter, accountController.requestEmailChange);

module.exports = router;
