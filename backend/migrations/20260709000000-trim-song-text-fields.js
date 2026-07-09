'use strict';

// Epic 16 story 16.1: collapse duplicate artists/albums/titles created by
// untrimmed input (e.g. "michael jackson" vs "michael jackson "). One-off,
// idempotent (the WHERE re-checks trim => a second run is a no-op), replayable.
//
// WS is the whitespace set kept in sync with the controller's normalizeText
// (JS String.prototype.trim): ASCII space, tab, LF, CR, and NBSP (U+00A0, very
// common from web/Word copy-paste). Plain SQL trim() only strips U+0020, which
// would leave NBSP/tab-padded duplicates behind and diverge from live writes.
// btrim(x, WS) strips any of these characters from both ends.
const WS = "E' \\t\\n\\r\\u00a0'";

module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;

    // artist/album are nullable -> collapse whitespace-only to NULL to match the
    // controller. NULLIF(btrim(x, WS), '') turns a blank into NULL; IS DISTINCT
    // FROM handles the NULL result so blank rows are updated too.
    await seq.query(`UPDATE "Songs" SET artist = NULLIF(btrim(artist, ${WS}), '') WHERE artist IS NOT NULL AND artist IS DISTINCT FROM NULLIF(btrim(artist, ${WS}), '');`);
    await seq.query(`UPDATE "Songs" SET album = NULLIF(btrim(album, ${WS}), '') WHERE album IS NOT NULL AND album IS DISTINCT FROM NULLIF(btrim(album, ${WS}), '');`);

    // title is NOT NULL -> plain trim (never null it).
    await seq.query(`UPDATE "Songs" SET title = btrim(title, ${WS}) WHERE title IS NOT NULL AND title <> btrim(title, ${WS});`);
  },

  async down() {
    // No-op: data backfill, nothing structural to reverse.
  },
};
