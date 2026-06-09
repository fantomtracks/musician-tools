'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('SessionItems')) {
      await queryInterface.createTable('SessionItems', {
        uid: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        session_uid: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'PracticeSessions',
            key: 'uid'
          },
          onDelete: 'CASCADE'
        },
        song_uid: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'Songs',
            key: 'uid'
          },
          onDelete: 'SET NULL'
        },
        topic_uid: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'Topics',
            key: 'uid'
          },
          onDelete: 'SET NULL'
        },
        // Snapshot of the song title / topic name at attach time: history keeps
        // displaying the name even after the referenced entity is deleted (FR4).
        label: {
          type: Sequelize.STRING,
          allowNull: false
        },
        minutes: {
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
    const indexes = await queryInterface.showIndex('SessionItems');
    const indexNames = indexes.map(index => index.name);
    if (!indexNames.includes('session_items_session_uid')) {
      await queryInterface.addIndex('SessionItems', ['session_uid'], {
        name: 'session_items_session_uid'
      });
    }

    // An item may reference a song OR a topic, never both. Both-NULL stays
    // legal: it is the FR4 orphan state after the referenced entity deletion.
    const [constraints] = await queryInterface.sequelize.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = '\"SessionItems\"'::regclass AND conname = 'session_items_one_ref_max'"
    );
    if (constraints.length === 0) {
      await queryInterface.addConstraint('SessionItems', {
        fields: ['song_uid', 'topic_uid'],
        type: 'check',
        name: 'session_items_one_ref_max',
        where: {
          [Sequelize.Op.or]: [{ song_uid: null }, { topic_uid: null }]
        }
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('SessionItems');
  }
};
