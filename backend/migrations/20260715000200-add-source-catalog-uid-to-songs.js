'use strict';

// Story 19.4 (Epic 19 — Catalog): provenance of an "Add to my songlist" copy.
// A personal Song copied from a CatalogSong carries source_catalog_uid.
//
// SOFT REFERENCE — deliberately NO foreign key (no references / onDelete). NFR-4:
// deleting or editing a CatalogSong must NEVER break the copied Song. The pointer
// may dangle (only if the curator deletes the source entry), which is intended —
// it is the hook for the future popularity aggregation (§4.7). Do NOT "fix" this
// by adding an FK constraint.
//
// Idempotent: guarded by describeTable so a replay is a no-op.
module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('Songs');
    if (!desc.source_catalog_uid) {
      await queryInterface.addColumn('Songs', 'source_catalog_uid', {
        type: Sequelize.UUID,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('Songs');
    if (desc.source_catalog_uid) {
      await queryInterface.removeColumn('Songs', 'source_catalog_uid');
    }
  }
};
