'use strict';

// Story 20.1 (Epic 20 — Catalog Collections): the join table linking a Collection to
// the catalog entries it contains. Mirrors the PlaylistSongs pattern (story 5.7): both
// FKs cascade on delete, so removing either side automatically drops the membership row
// — this is the HARD cleanup required by the story (no dead references), the OPPOSITE
// regime from Songs.sourceCatalogUid (soft, no FK, story 19.4):
//   - catalog_song_uid -> CatalogSongs ON DELETE CASCADE: deleting a catalog entry
//     (story 19.1 deleteCatalogEntry) removes it from every Collection.
//   - collection_uid   -> CatalogCollections ON DELETE CASCADE: deleting a Collection
//     drops its membership rows (the referenced entries themselves are untouched).
//
// A composite UNIQUE (collection_uid, catalog_song_uid) makes "add the same entry twice
// to the same Collection" a no-op; a single entry may still belong to MANY Collections
// (multi-appartenance, FR-12).
//
// Idempotent: table guarded by showAllTables; the unique index guarded individually via
// showIndex (sync({alter:false}) may have created the table WITHOUT indexes before this
// migration runs, so the table guard alone is not enough).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('CatalogCollectionSongs')) {
      await queryInterface.createTable('CatalogCollectionSongs', {
        uid: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        collection_uid: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'CatalogCollections', key: 'uid' },
          onDelete: 'CASCADE'
        },
        catalog_song_uid: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'CatalogSongs', key: 'uid' },
          onDelete: 'CASCADE'
        },
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

    // Indexes guarded individually (sync may have created the table without them first).
    const indexes = await queryInterface.showIndex('CatalogCollectionSongs');
    const indexNames = indexes.map(index => index.name);
    // A catalog entry appears at most once per Collection. Its leftmost column
    // (collection_uid) also covers the CASCADE when a Collection is deleted.
    if (!indexNames.includes('catalog_collection_songs_unique')) {
      await queryInterface.addIndex('CatalogCollectionSongs', ['collection_uid', 'catalog_song_uid'], {
        name: 'catalog_collection_songs_unique',
        unique: true
      });
    }
    // Standalone index on the OTHER FK column: deleting a CatalogSong (story 19.1)
    // cascades on catalog_song_uid, which is NOT covered by the composite's leftmost
    // column — without this, that delete does a sequential scan + row locks here.
    if (!indexNames.includes('catalog_collection_songs_catalog_song_uid')) {
      await queryInterface.addIndex('CatalogCollectionSongs', ['catalog_song_uid'], {
        name: 'catalog_collection_songs_catalog_song_uid'
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('CatalogCollectionSongs')) {
      await queryInterface.dropTable('CatalogCollectionSongs');
    }
  }
};
