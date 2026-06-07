'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('SessionItems');
    if (!tableDescription.position) {
      await queryInterface.addColumn('SessionItems', 'position', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });

      // Backfill from the previous implicit order (createdAt, uid). MUST stay
      // inside the addColumn guard: re-running it later would clobber
      // positions the user has since edited.
      await queryInterface.sequelize.query(`
        UPDATE "SessionItems" si
        SET position = sub.rn - 1
        FROM (
          SELECT uid, ROW_NUMBER() OVER (
            PARTITION BY session_uid ORDER BY "createdAt", uid
          ) AS rn
          FROM "SessionItems"
        ) sub
        WHERE si.uid = sub.uid AND si.position <> sub.rn - 1
      `);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('SessionItems', 'position');
  },
};
