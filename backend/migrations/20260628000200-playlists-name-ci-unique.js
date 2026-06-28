'use strict';

// Story 10.1: enforce playlist name uniqueness per user, insensitive to CASE,
// server-side. Playlists had no unique constraint on name (unlike topics), so
// duplicates were silently allowed. This adds a FUNCTIONAL unique index on
// (user_uid, lower(name)).
//
// Case-only (lower(name)), NOT accent-insensitive: the song-edit playlist picker
// folds with .toLowerCase(), so lower(name) gives exact client/server parity and
// needs no Postgres extension (no CREATE EXTENSION privilege concern).
//
// Idempotent + safe to replay: prod has no staging, and the boot path runs
// migrations then sync({alter:false}). Everything is guarded.
//
// NOTE: the one-shot de-duplication is NON-destructive — it RENAMES the losing
// rows (a playlist holds curated songs, unlike a topic label, so we never merge
// or delete). The rename is NOT reversed by `down`.
module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    await sequelize.transaction(async (transaction) => {
      // 1. One-shot de-dup BEFORE creating the unique index, else the index build
      // aborts where a user holds e.g. "Rock"+"rock". Survivor per
      // (user_uid, lower(name)) group = oldest, then uid; the losers (rn > 1) are
      // RENAMED with a suffix built from the row's own uid — unique by
      // construction, so it can never collide with a pre-existing "Rock (2)"
      // literal (which a plain numeric suffix could). The base name is bounded to
      // 240 chars so the result can't overflow varchar(255).
      await sequelize.query(`
        UPDATE "Playlists" p
        SET name = left(p.name, 240) || ' (' || left(p.uid::text, 8) || ')'
        FROM (
          SELECT uid,
                 row_number() OVER (
                   PARTITION BY user_uid, lower(name)
                   ORDER BY created_at ASC, uid ASC
                 ) AS rn
          FROM "Playlists"
        ) g
        WHERE p.uid = g.uid AND g.rn > 1;
      `, { transaction });

      // 2. Functional unique index (case-insensitive) per user.
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS playlists_user_uid_name_ci
        ON "Playlists" (user_uid, lower(name));
      `, { transaction });
    });
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    // Reverse the index (down is not run in prod). The rename de-dup is NOT undone.
    await sequelize.query('DROP INDEX IF EXISTS playlists_user_uid_name_ci;');
  },
};
