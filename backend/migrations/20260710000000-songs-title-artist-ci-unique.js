'use strict';

// Story 17.1: enforce per-user song uniqueness, server-side, insensitive to case
// (NOT accents), on (user_uid, lower(title), COALESCE(lower(artist), '')). The
// COALESCE('') makes two artist-less songs with the same title collide. This is
// the structural guard behind the auto-create flow (17.2) and mirrors 10.1
// (playlists) / 7.12 (topics).
//
// A song in duplicate IS the same song (it carries practice history + playlist
// membership), so we MERGE (unlike 10.1's RENAME): keep the survivor, reassign the
// losers' foreign keys onto it, then delete the losers — BEFORE creating the unique
// index (else the build aborts on any existing duplicate group).
//
// FKs to Songs.uid that must be reassigned (verified in the models):
//   - SongPlays."songUid"  (camelCase column, ON DELETE CASCADE) — reassign, no dedup
//   - SessionItems.song_uid (ON DELETE SET NULL, snapshot `label` kept)  — reassign
//   - PlaylistSongs.song_uid (ON DELETE CASCADE, UNIQUE(playlist_uid, song_uid))
//        — dedup within (playlist, group) THEN reassign, so the unique never trips
//        (robust even if one playlist holds several members of the same group)
// Playlist.songUids (legacy JSON) is NOT a source of truth since 5.7 — left untouched.
//
// Idempotent + safe to replay: prod has no staging, the boot path runs migrations
// then sync({alter:false}). The merge is a no-op once groups are resolved; the index
// uses IF NOT EXISTS. lower()/COALESCE are IMMUTABLE -> no extension, no privilege.
//
// NOTE: the merge (reassign + delete losers) is NOT reversible by `down`.

// Survivor per (user_uid, folded title, folded artist) group: oldest, then uid.
// Inlined into each statement (a CTE can't span statements). g.uid = row, g.survivor
// = the row that group keeps; g.uid <> g.survivor selects the losers.
const SURVIVORS = `
  SELECT uid,
         first_value(uid) OVER (
           PARTITION BY user_uid, lower(title), COALESCE(lower(artist), '')
           ORDER BY "createdAt" ASC, uid ASC
         ) AS survivor
  FROM "Songs"
`;

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    await sequelize.transaction(async (transaction) => {
      // 1. Reassign practice plays (camelCase column, no unique -> plain repoint).
      await sequelize.query(`
        UPDATE "SongPlays" sp
        SET "songUid" = g.survivor
        FROM (${SURVIVORS}) g
        WHERE sp."songUid" = g.uid AND g.uid <> g.survivor;
      `, { transaction });

      // 2. Reassign journal entries (SET NULL FK; the `label` snapshot is untouched).
      await sequelize.query(`
        UPDATE "SessionItems" si
        SET song_uid = g.survivor
        FROM (${SURVIVORS}) g
        WHERE si.song_uid = g.uid AND g.uid <> g.survivor;
      `, { transaction });

      // 3a. Playlist membership: drop duplicate rows within a (playlist, group) so a
      // single row per (playlist, survivor) remains — prefer the row already at the
      // survivor, else the oldest. Prevents the UNIQUE(playlist_uid, song_uid) from
      // tripping when the reassignment below collapses several members onto survivor.
      await sequelize.query(`
        DELETE FROM "PlaylistSongs" ps
        USING (
          SELECT psi.uid,
                 row_number() OVER (
                   PARTITION BY psi.playlist_uid, g.survivor
                   ORDER BY (psi.song_uid = g.survivor) DESC, psi."createdAt" ASC, psi.uid ASC
                 ) AS rn
          FROM "PlaylistSongs" psi
          JOIN (${SURVIVORS}) g ON psi.song_uid = g.uid
        ) d
        WHERE ps.uid = d.uid AND d.rn > 1;
      `, { transaction });

      // 3b. Reassign the surviving membership rows onto the survivor song.
      await sequelize.query(`
        UPDATE "PlaylistSongs" ps
        SET song_uid = g.survivor
        FROM (${SURVIVORS}) g
        WHERE ps.song_uid = g.uid AND g.uid <> g.survivor;
      `, { transaction });

      // 4. Delete the loser songs (all their FKs now point at the survivor, so the
      // ON DELETE cascades/nulls have nothing left to touch).
      await sequelize.query(`
        DELETE FROM "Songs" s
        USING (${SURVIVORS}) g
        WHERE s.uid = g.uid AND g.uid <> g.survivor;
      `, { transaction });

      // 5. Now the base is dedup'd -> create the functional unique index.
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS songs_user_uid_title_artist_ci
        ON "Songs" (user_uid, lower(title), COALESCE(lower(artist), ''));
      `, { transaction });
    });
  },

  async down(queryInterface) {
    // Only the index swap is reversible (down is not run in prod). The merge is not.
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS songs_user_uid_title_artist_ci;');
  },
};
