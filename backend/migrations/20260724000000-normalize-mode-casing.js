'use strict';

// Fix (Epic 21 test QA) : le `mode` était stocké en minuscule côté Catalog ("major") alors
// que le <select> Mode du formulaire (Song ET Catalog) matche sur la valeur EXACTE capitalisée
// ("Major", cf src/utils/songFieldOptions.ts `modeOptions`). Résultat : toute copie Catalog
// affichait un select Mode VIDE. La normalisation d'entrée (normalizeMode) est désormais
// appliquée aux écritures Song + Catalog ; cette migration réaligne l'existant.
//
// On ne touche QUE les lignes dont le mode (insensible à la casse) correspond à une valeur
// canonique connue, en posant l'orthographe canonique exacte — rien d'inattendu n'est mangé.
// Idempotent : le garde `mode <> canonical` rend le re-run no-op ; garde d'existence colonne.
// Pas de down : c'est une correction de données (repasser en minuscule n'a aucun intérêt).
const CANONICAL = [
  ['major', 'Major'], ['minor', 'Minor'], ['dorian', 'Dorian'], ['phrygian', 'Phrygian'],
  ['lydian', 'Lydian'], ['mixolydian', 'Mixolydian'], ['aeolian', 'Aeolian'],
  ['locrian', 'Locrian'], ['other', 'Other'],
];

async function normalizeTable(queryInterface, table) {
  const desc = await queryInterface.describeTable(table);
  if (!desc.mode) return;
  const values = CANONICAL.map(([lc, c]) => `('${lc}','${c}')`).join(',');
  await queryInterface.sequelize.query(`
    UPDATE "${table}" t
    SET mode = c.canonical
    FROM (VALUES ${values}) AS c(lc, canonical)
    WHERE lower(t.mode) = c.lc AND t.mode <> c.canonical;
  `);
}

module.exports = {
  async up(queryInterface) {
    await normalizeTable(queryInterface, 'Songs');
    await normalizeTable(queryInterface, 'CatalogSongs');
  },

  async down() {
    // no-op — data correction, not reverted
  },
};
