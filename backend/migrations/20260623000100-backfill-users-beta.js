'use strict';

// Story 7.2: backfill existing beta users for the new identity model.
// Idempotent / replayable: each step only touches rows that still need it, so
// re-running is a no-op. Runs after 20260623000000-alter-users-identity.
module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;

    // 1. Normalize email to lowercase/trim. email is citext now, so compare as
    // ::text to detect case-only differences (a citext <> would treat them equal
    // and skip the row). Only rows that actually differ are rewritten.
    await seq.query(
      'UPDATE "Users" SET email = lower(trim(email::text)) WHERE email::text <> lower(trim(email::text));'
    );

    // 2. Grandfather existing users as verified (known / trusted beta accounts).
    await seq.query('UPDATE "Users" SET email_verified = true WHERE email_verified = false;');

    // pending_email already NULL by default — nothing to backfill.

    // 3. Assign a free discriminator per name. Names are unique today, so a
    // random 0001-9999 is always free; the collision retry is future-proofing.
    // Only rows with a NULL discriminator are touched -> replayable.
    const [rows] = await seq.query('SELECT uid, name FROM "Users" WHERE discriminator IS NULL;');
    for (const row of rows) {
      let disc = null;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const candidate = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
        const [taken] = await seq.query(
          'SELECT 1 FROM "Users" WHERE name = :name AND discriminator = :disc LIMIT 1;',
          { replacements: { name: row.name, disc: candidate } }
        );
        if (!taken.length) {
          disc = candidate;
          break;
        }
      }
      if (!disc) {
        throw new Error(`Could not assign a free discriminator for name "${row.name}"`);
      }
      await seq.query('UPDATE "Users" SET discriminator = :disc WHERE uid = :uid;', {
        replacements: { disc, uid: row.uid },
      });
    }
  },

  async down() {
    // No-op: data backfill, nothing structural to reverse.
  },
};
