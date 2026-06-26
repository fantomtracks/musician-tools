'use strict';

module.exports = (sequelize, DataTypes) => {
  const Topic = sequelize.define('Topic', {
    uid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    userUid: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_uid',
      references: {
        model: 'Users',
        key: 'uid'
      },
      onDelete: 'CASCADE'
    },
    name: {
      // Per-user uniqueness is case- AND accent-insensitive (story 7.12), enforced
      // by a FUNCTIONAL unique index (user_uid, lower(f_unaccent(name))) created in
      // migration 20260625000000-topics-name-ci-unaccent. That expression isn't
      // representable in Sequelize's index DSL, so it lives only in the migration
      // (see the indexes block below). The column stays a plain STRING.
      type: DataTypes.STRING,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Story 8.2: marks the per-user "Free practice" topic. System topics are
    // pinned in the entry picker and cannot be renamed or deleted. Never set
    // from client input — only the registration seed / backfill flips it true.
    isSystem: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_system'
    }
  }, {
    tableName: 'Topics',
    timestamps: true,
    indexes: [
      // Per-user uniqueness lives in the functional index
      // topics_user_uid_name_ci_unaccent (user_uid, lower(f_unaccent(name))),
      // created in migration 20260625000000 (story 7.12) — case- & accent-
      // insensitive, not expressible in this DSL. sync({alter:false}) never
      // drops it; the afterSync hook below recreates it on sync-built DBs.
      { fields: ['name'], name: 'topics_name' }
    ],
    hooks: {
      // The functional unique index can't be expressed in the `indexes` block
      // above, so it's normally created by migration 20260625000000. But
      // sync()-built databases (fresh dev/CI) never run that migration —
      // server.js boots with sync({alter:false}) only — so without this hook
      // they'd have NO per-user topic uniqueness at all. Recreate the index and
      // its prerequisites here when it's missing. Guarded on existence so a
      // normal prod boot (where the migration already built it) is a no-op and
      // needs no CREATE EXTENSION privilege. Mirrors the migration in full,
      // including the one-shot de-dup, so the unique index build can't abort on
      // a sync-built DB that already holds case/accent-colliding rows (e.g. rows
      // created under the old case-sensitive index before this story).
      async afterSync() {
        const existing = await sequelize.query(
          `SELECT 1 FROM pg_indexes
           WHERE tablename = 'Topics' AND indexname = 'topics_user_uid_name_ci_unaccent'`,
          { type: 'SELECT' }
        );
        if (existing.length > 0) return;

        await sequelize.transaction(async (transaction) => {
          await sequelize.query('CREATE EXTENSION IF NOT EXISTS unaccent;', { transaction });
          await sequelize.query(`
            CREATE OR REPLACE FUNCTION f_unaccent(text)
              RETURNS text
              LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
            AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
          `, { transaction });

          // De-dup BEFORE the unique index build, else it aborts where a user
          // holds e.g. "Jazz"+"jazz" or "Été"+"ete". Survivor per (user_uid,
          // lower(f_unaccent(name))) group = system topic first, then oldest,
          // then uid. Repoint the losers' session items onto the survivor
          // (preserve the entry→topic link; the label snapshot is untouched),
          // then delete the losers.
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

          await sequelize.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS topics_user_uid_name_ci_unaccent
            ON "Topics" (user_uid, lower(f_unaccent(name)));
          `, { transaction });
        });
      }
    }
  });

  Topic.associate = function(models) {
    Topic.belongsTo(models.User, { foreignKey: 'userUid' });
  };

  return Topic;
};
