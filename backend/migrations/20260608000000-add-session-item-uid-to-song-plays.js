'use strict';

// Links a SongPlay to the session entry it represents (story 4.2). A play is
// either tied to a SessionItem (mark-as-played or a journal entry) or standalone
// (retro-imported history, or a no-instrument mark). ON DELETE CASCADE: deleting
// a session — hence its items — removes the linked plays, so the per-instrument
// "last played" derived from SongPlays recalculates on its own (FR23).
//
// NOTE: SongPlays columns are camelCase IN DB (historical exception), so this
// column is camelCase too, matching songUid / instrumentUid / playedAt.
module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('SongPlays');
    if (!desc.sessionItemUid) {
      await queryInterface.addColumn('SongPlays', 'sessionItemUid', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'SessionItems',
          key: 'uid'
        },
        onDelete: 'CASCADE'
      });
    }
  },

  // Sober down: drop only the column, never the table (deferred-work guidance)
  async down(queryInterface) {
    const desc = await queryInterface.describeTable('SongPlays');
    if (desc.sessionItemUid) {
      await queryInterface.removeColumn('SongPlays', 'sessionItemUid');
    }
  }
};
