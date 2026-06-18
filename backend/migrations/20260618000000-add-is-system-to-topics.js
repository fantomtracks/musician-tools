'use strict';

// Story 8.2: every user owns exactly one system "Free practice" topic.
// This migration (1) adds the is_system flag and (2) backfills it for every
// existing user, creating the topic when missing or flagging an existing
// same-named row.
//
// Idempotent: the column add is guarded by describeTable, and the backfill
// uses ON CONFLICT against the unique (user_uid, name) index, so re-running
// never duplicates a topic or clobbers data.
const FREE_PRACTICE_NAME = 'Free practice';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('Topics');
    if (!tableDescription.is_system) {
      await queryInterface.addColumn('Topics', 'is_system', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    // Backfill: one "Free practice" topic per existing user. INSERT ... SELECT
    // over Users; ON CONFLICT on the unique (user_uid, name) index turns a
    // pre-existing same-named topic into the system one (idempotent).
    await queryInterface.sequelize.query(`
      INSERT INTO "Topics" (uid, user_uid, name, category, is_system, "createdAt", "updatedAt")
      SELECT gen_random_uuid(), u.uid, :name, NULL, true, NOW(), NOW()
      FROM "Users" u
      ON CONFLICT (user_uid, name) DO UPDATE SET is_system = true
    `, { replacements: { name: FREE_PRACTICE_NAME } });
  },

  async down(queryInterface) {
    // Drop only the rows this migration could have created, then the column.
    await queryInterface.sequelize.query(`
      DELETE FROM "Topics" WHERE is_system = true AND name = :name
    `, { replacements: { name: FREE_PRACTICE_NAME } });
    await queryInterface.removeColumn('Topics', 'is_system');
  }
};
