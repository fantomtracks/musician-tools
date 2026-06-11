'use strict';

// Story 5.7: backfill the PlaylistSongs join table from the legacy
// Playlist.song_uids JSON arrays. Only UIDs that still match an existing Song
// are migrated — orphan UIDs (songs deleted before the FK existed) are DROPPED,
// which cleans the data. The legacy song_uids column is kept untouched as a
// safety net (decision A: dropped later in a separate migration).
//
// Idempotent: a playlist that already has join rows is skipped, so re-running
// never duplicates or clobbers edited data.
module.exports = {
  up: async (queryInterface) => {
    // Join on the song UID as TEXT (s.uid::text = elem.song_uid_text) so a
    // malformed/garbage legacy value is simply unmatched and dropped — never
    // cast to ::uuid (which would raise and abort the whole backfill). The
    // inserted song_uid is the real Songs.uid, already a valid UUID.
    await queryInterface.sequelize.query(`
      INSERT INTO "PlaylistSongs" (uid, playlist_uid, song_uid, position, "createdAt", "updatedAt")
      SELECT gen_random_uuid(), elem.playlist_uid, s.uid, (elem.ord - 1)::int, NOW(), NOW()
      FROM (
        SELECT p.uid AS playlist_uid, e.value AS song_uid_text, e.ord AS ord
        FROM "Playlists" p
        CROSS JOIN LATERAL json_array_elements_text(p.song_uids) WITH ORDINALITY AS e(value, ord)
        WHERE NOT EXISTS (
          SELECT 1 FROM "PlaylistSongs" ps WHERE ps.playlist_uid = p.uid
        )
      ) elem
      JOIN "Songs" s ON s.uid::text = elem.song_uid_text
    `);
  },

  down: async () => {
    // No-op: the join table is dropped by the create migration's down; the
    // legacy song_uids column was never modified, so nothing to restore here.
  }
};
