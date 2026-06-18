'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('Songs');
    // Stored in whole seconds so a song duration can be entered as m:ss
    // (e.g. 3:30) or as decimal minutes (3.5) without losing precision.
    if (!tableDescription.duration_seconds) {
      await queryInterface.addColumn('Songs', 'duration_seconds', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Songs', 'duration_seconds');
  }
};
