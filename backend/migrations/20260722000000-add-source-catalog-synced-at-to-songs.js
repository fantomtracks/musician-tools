'use strict';

// Story 21.1 (Epic 21 — lien Catalog ↔ Song) : `source_catalog_synced_at` marque la
// version de la fiche Catalog au moment de la copie (= CatalogSong.updatedAt). Le drift
// se calcule ensuite par CatalogSong.updatedAt > Song.source_catalog_synced_at.
//
// SOFT (pas de FK, comme source_catalog_uid) — la suppression d'une fiche Catalog ne
// doit jamais toucher la Song copiée.
//
// Backfill des copies existantes : on pose = `createdAt` de la Song (= le moment de la
// copie). On n'a PAS l'historique du updatedAt de la source à ce moment-là ; createdAt est
// la bonne approximation : la copie détient la source telle qu'au moment createdAt, donc si
// la source a été éditée APRÈS (updatedAt_now > createdAt) → drift=true (correct). Poser
// = source.updatedAt courant serait FAUX : ça masquerait le drift des copies réellement
// périmées (source éditée depuis la copie). (Songs : timestamps:true SANS underscored →
// colonne camelCase "createdAt".)
//
// Idempotent : addColumn gardé par describeTable ; backfill gardé par IS NULL.
module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('Songs');
    if (!desc.source_catalog_synced_at) {
      await queryInterface.addColumn('Songs', 'source_catalog_synced_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      });
    }
    await queryInterface.sequelize.query(`
      UPDATE "Songs" s
      SET source_catalog_synced_at = s."createdAt"
      WHERE s.source_catalog_uid IS NOT NULL
        AND s.source_catalog_synced_at IS NULL;
    `);
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('Songs');
    if (desc.source_catalog_synced_at) {
      await queryInterface.removeColumn('Songs', 'source_catalog_synced_at');
    }
  }
};
