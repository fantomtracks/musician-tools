'use strict';

// Story 20.1: join row linking a Collection to one of its catalog entries. Both FKs
// cascade on delete (see migration 20260721000100), so removing either side drops the
// membership automatically — the HARD cleanup the story requires (no dead references).
module.exports = (sequelize, DataTypes) => {
  const CatalogCollectionSong = sequelize.define('CatalogCollectionSong', {
    uid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    collectionUid: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'collection_uid',
      references: {
        model: 'CatalogCollections',
        key: 'uid'
      },
      onDelete: 'CASCADE'
    },
    catalogSongUid: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'catalog_song_uid',
      references: {
        model: 'CatalogSongs',
        key: 'uid'
      },
      onDelete: 'CASCADE'
    }
  }, {
    tableName: 'CatalogCollectionSongs',
    timestamps: true,
    indexes: [
      // A catalog entry appears at most once per Collection (composite unique below,
      // see migration 20260721000100).
      { fields: ['collection_uid', 'catalog_song_uid'], name: 'catalog_collection_songs_unique', unique: true }
    ]
  });

  CatalogCollectionSong.associate = function(models) {
    CatalogCollectionSong.belongsTo(models.CatalogCollection, { foreignKey: 'collectionUid' });
    CatalogCollectionSong.belongsTo(models.CatalogSong, { foreignKey: 'catalogSongUid' });
  };

  return CatalogCollectionSong;
};
