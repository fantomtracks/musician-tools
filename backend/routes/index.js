var express = require('express');
var router = express.Router();
var songsRouter = require('./songs');
var authRouter = require('./auth');
var instrumentsRouter = require('./instruments');
var playlistsRouter = require('./playlists');

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

module.exports = router;
