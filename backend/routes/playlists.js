var express = require('express');
var router = express.Router();
const bodyParser = require('body-parser');
const playlistController = require('../controllers/playlistcontroller');
const authsess = require('../middleware/authsess');

router.use(bodyParser.json());

// All playlist routes require authentication
router.get('/', authsess, playlistController.getAllPlaylists);
router.get('/:uid', authsess, playlistController.getPlaylist);
router.post('/', authsess, playlistController.createPlaylist);
router.put('/:uid', authsess, playlistController.updatePlaylist);
router.delete('/:uid', authsess, playlistController.deletePlaylist);
router.post('/:uid/songs/:songUid', authsess, playlistController.addSongToPlaylist);
router.delete('/:uid/songs/:songUid', authsess, playlistController.removeSongFromPlaylist);

module.exports = router;
