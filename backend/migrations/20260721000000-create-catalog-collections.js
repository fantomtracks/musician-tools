'use strict';

// Story 20.1 (Epic 20 — Catalog Collections): a curated, themed grouping of catalog
// entries ("Rock 90s", ...). Like CatalogSongs (story 19.1) this table has NO user_uid:
// a Collection is SHARED data, readable by every logged-in user (architecture §3). Only
// a curator writes it (requireCurator -> 403). The membership lives in the join table
// CatalogCollectionSongs (separate migration). No name-uniqueness constraint here — the
// personal mirror-playlist uniqueness is a story 20.3 concern (reuses Epic 10), not a
// Collection-name rule.
//
// Idempotent + safe to replay (prod runs migrations then sync({alter:false}) at boot):
// the create is guarded by showAllTables; the down() is symmetrically guarded.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('CatalogCollections')) {
      await queryInterface.createTable('CatalogCollections', {
        uid: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        // camelCase timestamp columns to match CatalogSongs/Songs (model uses
        // timestamps:true WITHOUT underscored, so Sequelize expects createdAt/updatedAt).
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
  },

  async down(queryInterface) {
    // Guarded like up() so a replayed/partial down is a no-op rather than throwing.
    // The join table (with its FK to this one) is dropped by its own migration's down.
    const tables = await queryInterface.showAllTables();
    if (tables.includes('CatalogCollections')) {
      await queryInterface.dropTable('CatalogCollections');
    }
  }
};
