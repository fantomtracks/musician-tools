'use strict';

// Drop the single-column index `playlist_songs_playlist_uid`: it is redundant with the
// composite unique index `playlist_songs_unique` (playlist_uid, song_uid), whose leading
// column Postgres already uses for playlist_uid lookups. Idempotent: only drops if present.
module.exports = {
  up: async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('PlaylistSongs')) return;

    const indexNames = (await queryInterface.showIndex('PlaylistSongs')).map(index => index.name);
    if (indexNames.includes('playlist_songs_playlist_uid')) {
      await queryInterface.removeIndex('PlaylistSongs', 'playlist_songs_playlist_uid');
    }
  },

  down: async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('PlaylistSongs')) return;

    const indexNames = (await queryInterface.showIndex('PlaylistSongs')).map(index => index.name);
    if (!indexNames.includes('playlist_songs_playlist_uid')) {
      await queryInterface.addIndex('PlaylistSongs', ['playlist_uid'], {
        name: 'playlist_songs_playlist_uid'
      });
    }
  }
};
