'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('PracticeSessions')) {
      await queryInterface.createTable('PracticeSessions', {
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
        date: {
          type: Sequelize.DATEONLY,
          allowNull: false
        },
        instrument_type: {
          type: Sequelize.STRING,
          allowNull: false
        },
        duration_minutes: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        note: {
          type: Sequelize.TEXT,
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
    const indexes = await queryInterface.showIndex('PracticeSessions');
    const indexNames = indexes.map(index => index.name);
    if (!indexNames.includes('practice_sessions_user_uid_date')) {
      await queryInterface.addIndex('PracticeSessions', ['user_uid', 'date'], {
        name: 'practice_sessions_user_uid_date'
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('PracticeSessions');
  }
};
