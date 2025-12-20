'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Songs', 'user_uid', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'uid'
      },
      onDelete: 'CASCADE'
    });

    await queryInterface.addIndex('Songs', ['user_uid']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Songs', 'user_uid');
  }
};
