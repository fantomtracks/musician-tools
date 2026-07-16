'use strict';

// Promote the project owner (northwood) to curator on deploy. The is_curator column
// (migration 20260715000100) defaults to false, so nobody could manage the Catalog
// right after release without a manual step. This runs at deploy, is idempotent, and
// is a harmless no-op wherever that account is absent (dev/test/CI). The owner email
// is stable for this solo project; adjust here if the owner account ever changes.
const OWNER_EMAIL = 'contact.axelbaron@gmail.com';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'UPDATE "Users" SET is_curator = true WHERE email = :email',
      { replacements: { email: OWNER_EMAIL } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'UPDATE "Users" SET is_curator = false WHERE email = :email',
      { replacements: { email: OWNER_EMAIL } },
    );
  },
};
