var express = require('express');
var router = express.Router();
const practiceSessionController = require('../controllers/practicesessioncontroller');
const authsess = require('../middleware/authsess');

router.use(express.json());

// All session routes require authentication
// /heatmap and /plays are declared before the parameterized routes
router.get('/heatmap', authsess, practiceSessionController.getHeatmap);
router.get('/plays', authsess, practiceSessionController.getDayPlays);
router.get('/', authsess, practiceSessionController.getAllPracticeSessions);
router.post('/', authsess, practiceSessionController.createPracticeSession);
router.put('/:uid', authsess, practiceSessionController.updatePracticeSession);
router.delete('/:uid', authsess, practiceSessionController.deletePracticeSession);

module.exports = router;
