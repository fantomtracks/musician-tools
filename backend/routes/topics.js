var express = require('express');
var router = express.Router();
const topicController = require('../controllers/topiccontroller');
const authsess = require('../middleware/authsess');

router.use(express.json());

// All topic routes require authentication
router.get('/', authsess, topicController.getAllTopics);
router.post('/', authsess, topicController.createTopic);
router.put('/:uid', authsess, topicController.updateTopic);
router.delete('/:uid', authsess, topicController.deleteTopic);

module.exports = router;
