'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Songs', 'bpm', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Songs', 'bpm', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 120,
    });
  },
};
