'use strict';

// Story 19.1 (Epic 19 — Catalog): the shared, read-only pool of canonical song
// entries users copy INTO their personal Songlist. This is the FIRST table with
// NO user_uid: it is not scoped per user (architecture §3 — the existence of a
// Catalog entry is not confidential; it is readable by every logged-in user).
//
// `CatalogSong` mirrors the INTRINSIC subset of Songs columns (same names/shapes)
// so "Add to my songlist" (story 19.4) is a 1:1 copy with no transform layer.
// Instrument/personal columns (instrument, tuning, difficulty, capo, technique,
// notes, lastPlayed, ...) are deliberately EXCLUDED — they only make sense once
// the song is in someone's Songlist (decision DL-17).
//
// Canonical uniqueness is GLOBAL (title+artist), case-insensitive, accents KEPT
// distinct — the SAME functional-index mechanic as story 17.1 but WITHOUT user_uid
// (the first entry locks a (title, artist) for everyone). It is created here by
// migration and intentionally NOT declared on the model, so sync({alter:false})
// never tries to create or drop it. lower()/COALESCE are IMMUTABLE -> no extension.
//
// Idempotent + safe to replay (prod has no staging; the boot path runs migrations
// then sync({alter:false})): the table create is guarded by showAllTables and the
// index uses IF NOT EXISTS.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('CatalogSongs')) {
      await queryInterface.createTable('CatalogSongs', {
        uid: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        title: {
          type: Sequelize.STRING,
          allowNull: false
        },
        artist: {
          type: Sequelize.STRING,
          allowNull: true
        },
        album: {
          type: Sequelize.STRING,
          allowNull: true
        },
        key: {
          type: Sequelize.STRING,
          allowNull: true
        },
        bpm: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        mode: {
          type: Sequelize.STRING,
          allowNull: true
        },
        time_signature: {
          type: Sequelize.STRING,
          allowNull: true
        },
        duration_seconds: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        language: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: null
        },
        genre: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: null
        },
        streaming_links: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: null
        },
        pitch_standard: {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: 440
        },
        // camelCase timestamp columns to match Songs (model uses timestamps:true
        // WITHOUT underscored, so Sequelize expects createdAt/updatedAt).
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('now')
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('now')
        }
      });
    }

    // GLOBAL canonical unique index (case-insensitive, accents kept). COALESCE('')
    // makes two artist-less entries with the same title collide. Mirror of 17.1
    // MINUS user_uid. Functional -> not expressible via the Sequelize indexes DSL,
    // so it lives here only and is absent from the model.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS catalog_songs_title_artist_ci
      ON "CatalogSongs" (lower(title), COALESCE(lower(artist), ''));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS catalog_songs_title_artist_ci;');
    // Guarded like up() so a replayed/partial down is a no-op rather than throwing
    // "table does not exist" (keeps the "safe to replay" contract symmetric).
    const tables = await queryInterface.showAllTables();
    if (tables.includes('CatalogSongs')) {
      await queryInterface.dropTable('CatalogSongs');
    }
  }
};
