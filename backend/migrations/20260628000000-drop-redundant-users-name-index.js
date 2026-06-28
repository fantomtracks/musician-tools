'use strict';

// Drop the single-column index `users_name` (created by 20251220000001-create-users
// via addIndex('Users', ['name'])): it is redundant with the composite unique index
// `users_name_discriminator_unique` (name, discriminator), whose leading column
// Postgres already uses for `name` lookups. Same cleanup as 20260621 on PlaylistSongs.
// Idempotent: only drops if present (a fresh sync-built DB never had it — the model
// declares only the composite index).
module.exports = {
  up: async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('Users')) return;

    const indexNames = (await queryInterface.showIndex('Users')).map(index => index.name);
    if (indexNames.includes('users_name')) {
      await queryInterface.removeIndex('Users', 'users_name');
    }
  },

  down: async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('Users')) return;

    const indexNames = (await queryInterface.showIndex('Users')).map(index => index.name);
    if (!indexNames.includes('users_name')) {
      await queryInterface.addIndex('Users', ['name'], { name: 'users_name' });
    }
  }
};
