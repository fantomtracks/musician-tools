var express = require('express');
var router = express.Router();
const bodyParser = require('body-parser');
const songController = require('../controllers/songcontroller');
const songLinksController = require('../controllers/songlinkscontroller');
const authsess = require('../middleware/authsess');

router.use(bodyParser.json());

// All song routes require authentication
router.get('/', authsess, songController.getAllSongs);
router.get('/lookup', authsess, songController.lookupSongMetadata);
router.get('/:uid', authsess, songController.getSong);
// Story 21.1 — refresh a Catalog copy to the current Catalog version (writes the user's
// own Song → authsess only ; CSRF app-wide covers it).
router.post('/:uid/refresh-from-catalog', authsess, songController.refreshSongFromCatalog);
router.post('/', authsess, songController.createSong);
router.put('/:uid', authsess, songController.updateSong);
router.delete('/:uid', authsess, songController.deleteSong);
router.post('/:uid/plays', authsess, songController.markSongPlayed);
router.get('/:uid/plays', authsess, songController.getSongPlays);
router.get('/:uid/streaming-links', authsess, songLinksController.generateStreamingLinks);

module.exports = router;
