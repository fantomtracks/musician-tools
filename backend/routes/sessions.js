var express = require('express');
var router = express.Router();
const practiceSessionController = require('../controllers/practicesessioncontroller');
const authsess = require('../middleware/authsess');

router.use(express.json());

// All session routes require authentication
router.post('/', authsess, practiceSessionController.createPracticeSession);

module.exports = router;
