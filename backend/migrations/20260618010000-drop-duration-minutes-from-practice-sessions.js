'use strict';

// Story 8.3 (Epic 8 "everything is an entry"): the session total is no longer a
// stored, overridable field — it is always the sum of the entries' minutes.
//
// Before dropping `duration_minutes`, preserve the historical "undetailed" time:
// for every session whose stored total exceeds the sum of its entries' minutes,
// convert the delta into a one-shot entry on that user's system "Free practice"
// topic (guaranteed to exist by 20260618000000-add-is-system-to-topics). This
// keeps the heatmap totals intact after the switch to summing entries.
//
// Idempotent: the conversion is gated by describeTable (column still present) and
// a NOT EXISTS guard against an already-created delta entry; the column drop is
// guarded by describeTable. Re-running never duplicates an entry.
const FREE_PRACTICE_NAME = 'Free practice';

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('PracticeSessions');
    if (!desc.duration_minutes) {
      return; // already migrated
    }

    // Step 1 — convert the per-session delta into a Free practice entry.
    await queryInterface.sequelize.query(`
      INSERT INTO "SessionItems"
        (uid, session_uid, song_uid, topic_uid, label, minutes, note, position, "createdAt", "updatedAt")
      SELECT gen_random_uuid(), ps.uid, NULL, t.uid, :name,
             ps.duration_minutes - COALESCE(agg.sum_min, 0),
             NULL, COALESCE(agg.cnt, 0), NOW(), NOW()
      FROM "PracticeSessions" ps
      JOIN "Topics" t
        ON t.user_uid = ps.user_uid AND t.is_system = true AND t.name = :name
      LEFT JOIN (
        SELECT session_uid, SUM(minutes) AS sum_min, COUNT(*) AS cnt
        FROM "SessionItems" GROUP BY session_uid
      ) agg ON agg.session_uid = ps.uid
      WHERE ps.duration_minutes IS NOT NULL
        AND ps.duration_minutes > COALESCE(agg.sum_min, 0)
        AND NOT EXISTS (
          SELECT 1 FROM "SessionItems" si2
          WHERE si2.session_uid = ps.uid AND si2.topic_uid = t.uid
            AND si2.minutes = ps.duration_minutes - COALESCE(agg.sum_min, 0)
        )
    `, { replacements: { name: FREE_PRACTICE_NAME } });

    // Step 2 — drop the now-derived column.
    await queryInterface.removeColumn('PracticeSessions', 'duration_minutes');
  },

  async down(queryInterface, Sequelize) {
    // Re-add the column (nullable). The Free practice entries created during the
    // conversion are NOT removed — at beta scale the residual entries are
    // acceptable and safer than guessing which ones to delete.
    const desc = await queryInterface.describeTable('PracticeSessions');
    if (!desc.duration_minutes) {
      await queryInterface.addColumn('PracticeSessions', 'duration_minutes', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  }
};
