'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('Topics')) {
      await queryInterface.createTable('Topics', {
        uid: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        user_uid: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'Users',
            key: 'uid'
          },
          onDelete: 'CASCADE'
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false
        },
        category: {
          type: Sequelize.STRING,
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
    }

    // Indexes are guarded individually: sequelize.sync() may have created the
    // table (without indexes) before this migration runs, so the table guard
    // above is not enough.
    const indexes = await queryInterface.showIndex('Topics');
    const indexNames = indexes.map(index => index.name);
    if (!indexNames.includes('topics_user_uid_name')) {
      await queryInterface.addIndex('Topics', ['user_uid', 'name'], {
        unique: true,
        name: 'topics_user_uid_name'
      });
    }
    if (!indexNames.includes('topics_name')) {
      await queryInterface.addIndex('Topics', ['name'], { name: 'topics_name' });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('Topics');
  }
};
