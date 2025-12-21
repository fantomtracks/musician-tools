'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Change instrument column from STRING to JSON to store array of instruments
    await queryInterface.changeColumn('Songs', 'instrument', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert back to STRING
    await queryInterface.changeColumn('Songs', 'instrument', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};
