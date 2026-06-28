'use strict';

// Pin the "discriminator = 4 zero-padded digits" invariant in the DB (it only lived
// in code: backfill 7.2 + register 7.7). discriminator is nullable, so NULL is allowed.
//
// Added as NOT VALID on purpose: the constraint is enforced for every INSERT/UPDATE
// from now on, but Postgres skips scanning pre-existing rows — so a stray legacy value
// can never block the prod deploy (release_command runs migrate up). A later
// `VALIDATE CONSTRAINT` can check the backfilled rows once confirmed clean.
// Idempotent: guarded on pg_constraint by name.
const CONSTRAINT = 'users_discriminator_format';

module.exports = {
  up: async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('Users')) return;

    const [rows] = await queryInterface.sequelize.query(
      `SELECT 1 FROM pg_constraint WHERE conname = '${CONSTRAINT}'`
    );
    if (rows.length === 0) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "Users" ADD CONSTRAINT ${CONSTRAINT} ` +
        `CHECK (discriminator IS NULL OR discriminator ~ '^[0-9]{4}$') NOT VALID`
      );
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `ALTER TABLE "Users" DROP CONSTRAINT IF EXISTS ${CONSTRAINT}`
    );
  }
};
