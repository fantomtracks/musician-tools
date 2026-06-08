'use strict';

// Index the sessionItemUid FK (story 4.2 review): the ON DELETE CASCADE scans
// it on every SessionItem delete, and the session controller's play sync filters
// on it (SongPlay.update/destroy where sessionItemUid). Guarded individually:
// sequelize.sync() may already have created it from the model's `indexes`, so the
// addIndex must be conditional.
module.exports = {
  async up(queryInterface) {
    const indexes = await queryInterface.showIndex('SongPlays');
    const names = indexes.map(index => index.name);
    if (!names.includes('song_plays_session_item_uid')) {
      await queryInterface.addIndex('SongPlays', ['sessionItemUid'], {
        name: 'song_plays_session_item_uid'
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('SongPlays');
    const names = indexes.map(index => index.name);
    if (names.includes('song_plays_session_item_uid')) {
      await queryInterface.removeIndex('SongPlays', 'song_plays_session_item_uid');
    }
  }
};
