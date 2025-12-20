var express = require('express');
var router = express.Router();
const bodyParser = require('body-parser');
const uc = require('../controllers/usercontroller');
const authsess = require('../middleware/authsess');

router.use(bodyParser.json());

// Public routes
router.post('/register', uc.createUser);
router.post('/login', uc.loginUser);
router.get('/logout', uc.logoutUser);

module.exports = router;
