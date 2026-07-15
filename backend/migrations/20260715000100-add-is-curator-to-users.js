'use strict';

// Story 19.1 (Epic 19 — Catalog): the Curator role. A boolean attribute on User
// (no roles table — over-engineered for a single v1 curator). It gates WRITE
// access to the Catalog (requireCurator middleware -> 403). Set by hand in the DB
// for the maintainer; there is no role-management UI in v1.
//
// Idempotent: guarded by describeTable so a replay is a no-op.
module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('Users');
    if (!desc.is_curator) {
      await queryInterface.addColumn('Users', 'is_curator', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('Users');
    if (desc.is_curator) {
      await queryInterface.removeColumn('Users', 'is_curator');
    }
  }
};
