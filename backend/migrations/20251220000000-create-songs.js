'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Songs', {
      uid: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      bpm: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 120
      },
      key: {
        type: Sequelize.STRING,
        allowNull: true
      },
      chords: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      tabs: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      instrument: {
        type: Sequelize.STRING,
        allowNull: true
      },
      artist: {
        type: Sequelize.STRING,
        allowNull: true
      },
      last_played: {
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

    // Ajouter des index pour améliorer les performances
    await queryInterface.addIndex('Songs', ['title']);
    await queryInterface.addIndex('Songs', ['artist']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Songs');
  }
};
