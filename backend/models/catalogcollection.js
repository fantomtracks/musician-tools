'use strict';

// Story 20.1: a curated, SHARED grouping of catalog entries (no owner, no user_uid —
// architecture §3). Membership is many-to-many via CatalogCollectionSong. Curator-only
// writes (requireCurator); readable by every logged-in user.
module.exports = (sequelize, DataTypes) => {
  const CatalogCollection = sequelize.define('CatalogCollection', {
    uid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'CatalogCollections',
    timestamps: true
  });

  CatalogCollection.associate = function(models) {
    // Many-to-many: a Collection holds many entries; an entry lives in many Collections
    // (multi-appartenance, FR-12). The reverse side is intentionally NOT declared on
    // CatalogSong (additive strict — story 20.1 only queries Collection -> entries).
    CatalogCollection.belongsToMany(models.CatalogSong, {
      through: models.CatalogCollectionSong,
      foreignKey: 'collectionUid',
      otherKey: 'catalogSongUid',
      as: 'songs'
    });
  };

  return CatalogCollection;
};
