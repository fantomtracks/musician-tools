'use strict';

// Story 7.12: enforce topic uniqueness per user insensitive to BOTH case and
// accents, server-side (the client foldForSearch already folds both; this brings
// the DB in line). Replaces the case-sensitive unique index (user_uid, name) with
// a FUNCTIONAL unique index on (user_uid, lower(f_unaccent(name))).
//
// Idempotent + safe to replay: prod has no staging, and the boot path runs
// migrations then sync({alter:false}). Everything is guarded.
//
// NOTE: the one-shot de-duplication (merging case/accent-duplicate topics) is NOT
// reversible by `down` — it deletes the losing rows after repointing their entries.
module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    await sequelize.transaction(async (transaction) => {
      // 1. unaccent extension (strips diacritics). Already-present is fine.
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS unaccent;', { transaction });

      // 2. IMMUTABLE wrapper: unaccent() is not IMMUTABLE (depends on a dictionary),
      // so it can't be used in an index expression directly. Pinning the dictionary
      // with the two-arg form makes it safe to mark IMMUTABLE.
      await sequelize.query(`
        CREATE OR REPLACE FUNCTION f_unaccent(text)
          RETURNS text
          LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
        AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
      `, { transaction });

      // 3. One-shot de-dup BEFORE creating the unique index, else the index build
      // aborts where a user holds e.g. "Jazz"+"jazz" or "Été"+"ete". Survivor per
      // (user_uid, lower(f_unaccent(name))) group = system topic first, then oldest,
      // then uid. Repoint the losers' session items onto the survivor (preserve the
      // entry→topic link; the topic_name snapshot is untouched), then delete losers.
      await sequelize.query(`
        UPDATE "SessionItems" si
        SET topic_uid = g.survivor
        FROM (
          SELECT uid,
                 first_value(uid) OVER (
                   PARTITION BY user_uid, lower(f_unaccent(name))
                   ORDER BY is_system DESC, "createdAt" ASC, uid ASC
                 ) AS survivor
          FROM "Topics"
        ) g
        WHERE si.topic_uid = g.uid AND g.uid <> g.survivor;
      `, { transaction });

      await sequelize.query(`
        DELETE FROM "Topics" t
        USING (
          SELECT uid,
                 first_value(uid) OVER (
                   PARTITION BY user_uid, lower(f_unaccent(name))
                   ORDER BY is_system DESC, "createdAt" ASC, uid ASC
                 ) AS survivor
          FROM "Topics"
        ) g
        WHERE t.uid = g.uid AND g.uid <> g.survivor;
      `, { transaction });

      // 4. Replace the case-sensitive unique index with the functional one.
      await sequelize.query('DROP INDEX IF EXISTS topics_user_uid_name;', { transaction });
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS topics_user_uid_name_ci_unaccent
        ON "Topics" (user_uid, lower(f_unaccent(name)));
      `, { transaction });
    });
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    await sequelize.transaction(async (transaction) => {
      // Reverse the index swap (down is not run in prod). The de-dup is NOT undone.
      await sequelize.query('DROP INDEX IF EXISTS topics_user_uid_name_ci_unaccent;', { transaction });
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS topics_user_uid_name
        ON "Topics" (user_uid, name);
      `, { transaction });
      await sequelize.query('DROP FUNCTION IF EXISTS f_unaccent(text);', { transaction });
      // Leave the unaccent extension in place (cheap, may be used elsewhere).
    });
  },
};
