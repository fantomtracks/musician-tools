var express = require('express');
var router = express.Router();
var csrf = require('../middleware/csrf');
var songsRouter = require('./songs');
var authRouter = require('./auth');
var instrumentsRouter = require('./instruments');
var playlistsRouter = require('./playlists');
var topicsRouter = require('./topics');
var sessionsRouter = require('./sessions');

// CSRF guard on every /api route (story 7.3): mints a per-session token, exempts
// safe methods, and rejects mutations without a valid X-CSRF-Token header.
router.use(csrf);

// Exposes the per-session synchronizer token to the front. Pre-auth accessible
// (login/register fetch it first); the guard above has already minted it.
router.get('/csrf-token', function(req, res) {
  res.json({ csrfToken: req.session.csrfToken });
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.json({
    message: 'Musician Tools API',
    version: '1.0.0',
    status: 'running'
  });
});

// Auth routes
router.use('/auth', authRouter);

// Songs routes
router.use('/songs', songsRouter);

// Instruments routes
router.use('/instruments', instrumentsRouter);

// Playlists routes
router.use('/playlists', playlistsRouter);

// Topics routes
router.use('/topics', topicsRouter);

// Practice sessions routes
router.use('/sessions', sessionsRouter);

module.exports = router;
