'use strict';

// Story 5.7: real relational link between playlists and songs. Replaces the
// denormalized Playlist.song_uids JSON array (no FK) with a join table whose
// song_uid FK cascades on song delete — killing the orphan-UID class of bugs.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('PlaylistSongs')) {
      await queryInterface.createTable('PlaylistSongs', {
        uid: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        playlist_uid: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'Playlists', key: 'uid' },
          onDelete: 'CASCADE'
        },
        song_uid: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'Songs', key: 'uid' },
          onDelete: 'CASCADE'
        },
        position: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    // Indexes guarded individually: sequelize.sync() may have created the table
    // (without indexes) before this migration runs, so the table guard is not
    // enough on its own.
    const indexes = await queryInterface.showIndex('PlaylistSongs');
    const indexNames = indexes.map(index => index.name);
    if (!indexNames.includes('playlist_songs_playlist_uid')) {
      await queryInterface.addIndex('PlaylistSongs', ['playlist_uid'], {
        name: 'playlist_songs_playlist_uid'
      });
    }
    // A song appears at most once per playlist.
    if (!indexNames.includes('playlist_songs_unique')) {
      await queryInterface.addIndex('PlaylistSongs', ['playlist_uid', 'song_uid'], {
        name: 'playlist_songs_unique',
        unique: true
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('PlaylistSongs');
  }
};
