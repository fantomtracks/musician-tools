// Story 24.1 — socle d'environnement.
//
// These tests exist because of a measured incident, not a theory: during Epic 23 a script run
// in a bare shell targeted the PRODUCTION database while printing "development", and only a TLS
// certificate error prevented 82 writes into the shared production Catalog.
//
// The root cause is an ORDER problem, not a logic one: `db.js` computed
// `NODE_ENV || 'production'` on line 2, BEFORE line 3 required `config.js`, which is what loads
// `.env`. So the connection was built from DATABASE_URL_PROD, and every later reader saw the
// `development` that dotenv had just written.
//
// `config/env.js` and `db.js` capture the environment AT REQUIRE TIME, so every test here must
// reset the module registry and restore process.env itself.

const ORIGINAL_ENV = { ...process.env };

const freshEnv = (vars, dotenvImpl) => {
  jest.resetModules();
  // Start from a clean slate: NODE_ENV must be genuinely absent when the test says it is.
  for (const key of ['NODE_ENV', 'DB_ENABLE_SSL', 'DATABASE_URL_DEV', 'DATABASE_URL_PROD']) {
    delete process.env[key];
  }
  Object.assign(process.env, vars);
  jest.doMock('dotenv', () => ({
    config: dotenvImpl || (() => ({ parsed: {} })),
  }));
  return require('../config/env');
};

afterEach(() => {
  jest.resetModules();
  jest.dontMock('dotenv');
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe('config/env — l\'ordre de chargement (AC1)', () => {
  test('.env est chargé AVANT que NODE_ENV soit lu — le cœur de la story', () => {
    // The real environment has no NODE_ENV; only the .env file provides it. If the module read
    // NODE_ENV before calling dotenv, it would fall back and answer 'production' — which is
    // exactly the incident this story closes.
    const mod = freshEnv({}, () => {
      process.env.NODE_ENV = 'development';
      return { parsed: { NODE_ENV: 'development' } };
    });
    expect(mod.env).toBe('development');
  });

  test('une valeur déjà posée dans l\'environnement réel gagne sur le .env', () => {
    // The mock reproduces dotenv's actual contract — it never overrides an already-set variable.
    // Fly (both.Dockerfile), docker-compose and Makefile:163 all rely on that, which is why the
    // unconditional load added by this story is safe on the deployed path.
    const mod = freshEnv({ NODE_ENV: 'production' }, () => {
      if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
      return { parsed: {} };
    });
    expect(mod.env).toBe('production');
  });
});

describe('config/env — le défaut (AC2)', () => {
  test('NODE_ENV absent partout : on REFUSE de démarrer, on ne vise pas la production', () => {
    // The old fallback was `NODE_ENV || 'production'`. "Default = production" is the worst
    // possible default: it makes the dangerous case the silent one.
    //
    // The assertion targets the ABSENT-value message specifically. A loose /NODE_ENV/ passed even
    // with this guard deleted, because the unknown-value guard below then threw a message that
    // also mentions NODE_ENV — caught by mutation testing, not by review.
    expect(() => freshEnv({})).toThrow(/is not set/);
  });

  test('le message nomme ce qui est attendu — pas un throw nu', () => {
    let message = '';
    try { freshEnv({}); } catch (error) { message = error.message; }
    expect(message).toMatch(/is not set/);
    expect(message).toMatch(/development/);
    expect(message).toMatch(/production/);
  });

  test('une valeur inconnue est refusée, elle ne retombe pas en silence sur la production', () => {
    expect(() => freshEnv({ NODE_ENV: 'prod' })).toThrow(/prod/);
  });

  test('les 4 environnements du projet sont acceptés', () => {
    for (const value of ['development', 'test', 'staging', 'production']) {
      expect(freshEnv({ NODE_ENV: value }).env).toBe(value);
    }
  });
});

describe('config/env — DB_ENABLE_SSL (AC5)', () => {
  // `ssl: process.env.DB_ENABLE_SSL && {...}` tested the STRING, and 'false' is truthy in JS.
  // The .env of this project literally contains DB_ENABLE_SSL=false, so the only way to disable
  // SSL was to empty the variable — which nobody guesses while reading the file.
  test.each([
    ['true', true],
    ['false', false],
    ['0', false],
    ['', false],
    [undefined, false],
    ['TRUE', false], // strict comparison: no accidental leniency
  ])('DB_ENABLE_SSL=%p -> sslEnabled=%p', (value, expected) => {
    const vars = { NODE_ENV: 'test' };
    if (value !== undefined) vars.DB_ENABLE_SSL = value;
    expect(freshEnv(vars).sslEnabled).toBe(expected);
  });
});

describe('config/config — le SSL suit la cible (AC4, AC6)', () => {
  const loadConfig = (vars) => {
    freshEnv(vars);
    return require('../config/config');
  };

  test('development sans DB_ENABLE_SSL ne demande PAS de SSL', () => {
    // The docker-compose Postgres does not speak SSL. The block hardcoded `ssl: { require: true }`,
    // so `NODE_ENV=development` — the project's own official instruction — reached no database at
    // all. An official instruction that does not work is worse than no instruction.
    const config = loadConfig({ NODE_ENV: 'development', DATABASE_URL_DEV: 'postgres://x/y' });
    expect(config.development.connectionoptions.dialectOptions.ssl).toBeFalsy();
  });

  test('development avec DB_ENABLE_SSL=true redemande du SSL', () => {
    const config = loadConfig({ NODE_ENV: 'development', DB_ENABLE_SSL: 'true', DATABASE_URL_DEV: 'postgres://x/y' });
    expect(config.development.connectionoptions.dialectOptions.ssl).toEqual({ require: true, rejectUnauthorized: false });
  });

  test('AC6 — la configuration de PRODUCTION est inchangée', () => {
    // The deployed path must not move. Compared against the values read in the file before the
    // change, not against memory.
    const config = loadConfig({ NODE_ENV: 'production', DATABASE_URL_PROD: 'postgres://prod/db' });
    expect(config.production.url).toBe('postgres://prod/db');
    expect(config.production.dialect).toBe('postgres');
    expect(config.production.connectionoptions.dialectOptions.ssl).toEqual({ require: true, rejectUnauthorized: false });
    expect(config.production.connectionoptions.logging).toBe(false);
    expect(config.production.connectionoptions.pool.max).toBe(5);
    expect(config.production.connectionoptions.pool.evict).toBe(1000);
  });

  test('AC7 — config.js reste un module chargeable sans effet de bord (sequelize-cli)', () => {
    // `.sequelizerc` points the CLI at this file. Requiring it must not open a connection.
    const config = loadConfig({ NODE_ENV: 'production', DATABASE_URL_PROD: 'postgres://prod/db' });
    expect(Object.keys(config).sort()).toEqual(['development', 'production', 'staging', 'test']);
  });
});

describe('AC9 — les décisions de sécurité lisent le MÊME environnement que la base', () => {
  // server.js decides the session cookie `secure` flag, the CORS origin and the production branch
  // by reading `process.env.NODE_ENV` DIRECTLY. Before this story, db.js could resolve
  // 'production' by fallback while those three read the 'development' that dotenv had just
  // written — production data served with the development security posture.
  test('après résolution, process.env.NODE_ENV vaut exactement l\'environnement retenu', () => {
    const mod = freshEnv({}, () => {
      process.env.NODE_ENV = 'production';
      return { parsed: {} };
    });
    // What server.js:105 / :132 will read is what the database layer resolved. No divergence
    // possible, because there is no second source of truth left.
    expect(process.env.NODE_ENV).toBe(mod.env);
    expect(process.env.NODE_ENV === 'production').toBe(true);
  });

  test('un démarrage sans NODE_ENV ne peut plus atteindre les décisions de sécurité', () => {
    // The throw happens at require time, so server.js never reaches the cookie/CORS branches with
    // an undefined NODE_ENV. That is the whole guarantee: the incoherent state is unreachable.
    expect(() => freshEnv({})).toThrow();
  });
});

describe('AC3 — la décision d\'environnement n\'existe qu\'à UN endroit', () => {
  // Comments in both files quote the OLD line on purpose, so a naive grep over the raw source
  // matches its own documentation. Strip comments first, or the assertion tests the prose.
  const codeWithoutComments = (modulePath) => require('fs')
    .readFileSync(require.resolve(modulePath), 'utf8')
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');

  test('db.js ne recalcule pas son propre NODE_ENV', () => {
    expect(codeWithoutComments('../db.js')).not.toMatch(/process\.env\.NODE_ENV\s*\|\|/);
  });

  test('models/index.js ne recalcule pas son propre NODE_ENV', () => {
    expect(codeWithoutComments('../models/index.js')).not.toMatch(/process\.env\.NODE_ENV\s*\|\|/);
  });

  test('server.js ne recalcule pas son propre NODE_ENV', () => {
    expect(codeWithoutComments('../server.js')).not.toMatch(/process\.env\.NODE_ENV\s*\|\|/);
  });

  test('db.js résout son environnement via config/env — vérifié en exécution, pas par un grep', () => {
    // The source assertions above would survive a rename; this one exercises the real path: with
    // NODE_ENV only present in the .env, db.js must build the DEVELOPMENT connection.
    jest.resetModules();
    delete process.env.NODE_ENV;
    process.env.DATABASE_URL_DEV = 'postgres://dev-marker/db';
    jest.doMock('dotenv', () => ({ config: () => { process.env.NODE_ENV = 'development'; return { parsed: {} }; } }));
    const sequelize = require('../db');
    expect(sequelize.config.host).toBe('dev-marker');
  });
});
