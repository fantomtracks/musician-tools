var express = require('express');
var router = express.Router();
const accountController = require('../controllers/accountcontroller');
const authsess = require('../middleware/authsess');
const { changePasswordLimiter } = require('../middleware/ratelimiters');

router.use(express.json());

// All account routes require authentication (CSRF is already global on /api, 7.3).
router.get('/', authsess, accountController.getProfile);
router.put('/name', authsess, accountController.updateName);
// Change-password is additionally rate-limited per account (story 7.8).
router.put('/password', authsess, changePasswordLimiter, accountController.changePassword);

module.exports = router;
