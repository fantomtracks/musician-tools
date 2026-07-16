'use strict';

// Story 19.6 (Epic 19 — Catalog): draft/publish lifecycle. published_at is NULL for a
// DRAFT (invisible to browsing users) and a timestamp once PUBLISHED. Uniqueness stays
// GLOBAL — the 19.1 canonical unique index is untouched, so every row (draft or
// published) is unique. Every entry that existed before this migration was public →
// backfill published_at = "createdAt" so nothing that was visible disappears. Idempotent.
module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('CatalogSongs');
    if (!desc.published_at) {
      await queryInterface.addColumn('CatalogSongs', 'published_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      });
      await queryInterface.sequelize.query(
        'UPDATE "CatalogSongs" SET published_at = "createdAt" WHERE published_at IS NULL;'
      );
    }
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('CatalogSongs');
    if (desc.published_at) {
      await queryInterface.removeColumn('CatalogSongs', 'published_at');
    }
  }
};
