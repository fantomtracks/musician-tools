var express = require('express');
var router = express.Router();
const bodyParser = require('body-parser');
const uc = require('../controllers/usercontroller');
const authsess = require('../middleware/authsess');

router.use(bodyParser.json());

// Public routes
router.post('/register', uc.createUser);
router.post('/login', uc.loginUser);
// logout destroys the session — a state-changing action, so POST (CSRF-protected), not GET. (7.3)
router.post('/logout', uc.logoutUser);

module.exports = router;
