'use strict';

// Story 7.2: reshape Users for Discord-style identity (name#discriminator) and
// case-insensitive email. Every step is guarded so the migration is idempotent
// and safe to re-run — prod has no staging, and the boot path runs migrations
// then sync({alter:false}), so this can be replayed.
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. citext extension (case-insensitive text type), used for email.
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS citext;');

    // 2. email -> citext, only if not already converted. varchar -> citext is an
    // implicit assignment cast; the existing unique constraint (Users_email_key)
    // carries over and becomes case-insensitive by construction.
    const [emailCol] = await queryInterface.sequelize.query(`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'Users' AND column_name = 'email';
    `);
    if (emailCol.length && emailCol[0].udt_name !== 'citext') {
      // Fail fast with a clear message if case-insensitive duplicate emails
      // exist: the citext conversion would otherwise abort with a raw unique
      // violation. Two distinct accounts cannot be auto-merged — manual fix only.
      const [dups] = await queryInterface.sequelize.query(`
        SELECT lower(trim(email::text)) AS norm, count(*) AS n
        FROM "Users" GROUP BY 1 HAVING count(*) > 1;
      `);
      if (dups.length) {
        const list = dups.map((d) => `${d.norm} (x${d.n})`).join(', ');
        throw new Error(
          `Cannot convert email to citext: case-insensitive duplicate emails exist, resolve manually first: ${list}`
        );
      }
      await queryInterface.sequelize.query('ALTER TABLE "Users" ALTER COLUMN email TYPE citext;');
    }

    // 3. New columns, each guarded individually.
    const desc = await queryInterface.describeTable('Users');
    if (!desc.discriminator) {
      // Nullable in DB: populated by the backfill, then by register (story 7.7).
      // Real uniqueness is enforced by the (name, discriminator) index below.
      await queryInterface.addColumn('Users', 'discriminator', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!desc.email_verified) {
      await queryInterface.addColumn('Users', 'email_verified', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!desc.pending_email) {
      await queryInterface.addColumn('Users', 'pending_email', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    // 4. Drop the unique constraint on name: Discord-style display names may
    // repeat, disambiguated by discriminator. IF EXISTS keeps this idempotent.
    await queryInterface.sequelize.query('ALTER TABLE "Users" DROP CONSTRAINT IF EXISTS "Users_name_key";');

    // 5. Composite unique (name, discriminator) — guarded via showIndex. Named
    // identically to the model index so sync({alter:false}) sees it as existing.
    const indexes = await queryInterface.showIndex('Users');
    if (!indexes.some((i) => i.name === 'users_name_discriminator_unique')) {
      await queryInterface.addIndex('Users', ['name', 'discriminator'], {
        unique: true,
        name: 'users_name_discriminator_unique',
      });
    }
  },

  async down(queryInterface) {
    // Best-effort reverse (down is not run in prod). Guarded where cheap.
    const indexes = await queryInterface.showIndex('Users');
    if (indexes.some((i) => i.name === 'users_name_discriminator_unique')) {
      await queryInterface.removeIndex('Users', 'users_name_discriminator_unique');
    }
    await queryInterface.sequelize.query('ALTER TABLE "Users" DROP CONSTRAINT IF EXISTS "Users_name_key";');
    await queryInterface.sequelize.query('ALTER TABLE "Users" ADD CONSTRAINT "Users_name_key" UNIQUE (name);');

    const desc = await queryInterface.describeTable('Users');
    if (desc.pending_email) await queryInterface.removeColumn('Users', 'pending_email');
    if (desc.email_verified) await queryInterface.removeColumn('Users', 'email_verified');
    if (desc.discriminator) await queryInterface.removeColumn('Users', 'discriminator');

    // Guard the type restore (symmetry with the up): only revert if currently citext.
    const [emailCol] = await queryInterface.sequelize.query(`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'Users' AND column_name = 'email';
    `);
    if (emailCol.length && emailCol[0].udt_name === 'citext') {
      await queryInterface.sequelize.query('ALTER TABLE "Users" ALTER COLUMN email TYPE varchar;');
    }
  },
};
