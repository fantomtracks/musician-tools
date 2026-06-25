'use strict';

// Idempotent create of AuthTokens (story 7.6): guarded by showAllTables so a
// re-run (or sequelize.sync at boot having already made it) is a no-op. Columns
// are snake_case to match the model's `field:` mapping (Songs pattern).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    const exists = tables
      .map((t) => (typeof t === 'string' ? t.toLowerCase() : String(t).toLowerCase()))
      .includes('authtokens');
    if (exists) return;

    await queryInterface.createTable('AuthTokens', {
      uid: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      user_uid: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'uid' },
        onDelete: 'CASCADE'
      },
      type: {
        type: Sequelize.ENUM('verify_email', 'password_reset', 'change_email'),
        allowNull: false
      },
      token_hash: {
        type: Sequelize.STRING,
        allowNull: false
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: null
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Verify hashes the supplied token and looks it up by hash — index it.
    await queryInterface.addIndex('AuthTokens', ['token_hash']);
  },

  // Rollback is not used in prod (release = migrate up only). dropTable leaves
  // the Postgres ENUM type behind; harmless given the up-guard above.
  down: async (queryInterface) => {
    await queryInterface.dropTable('AuthTokens');
  }
};
