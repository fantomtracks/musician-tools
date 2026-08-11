// Single point of truth for "which environment are we in" (story 24.1).
//
// WHY THIS FILE EXISTS — the order, not the logic, was the bug.
// `db.js` used to compute `process.env.NODE_ENV || 'production'` on its line 2, BEFORE its line 3
// required `config/config.js` — which is what loaded `.env`. So a process started without NODE_ENV
// built its connection from DATABASE_URL_PROD, and every later reader saw the `development` that
// dotenv had just written. Measured three times during Epic 23; once, only a TLS certificate error
// stopped 82 writes from landing in the shared PRODUCTION Catalog.
//
// So: dotenv FIRST, then read. Anything that reads NODE_ENV before requiring this module
// reintroduces the bug.
//
// Loading `.env` unconditionally is safe on the deployed path because dotenv NEVER overrides a
// variable already present in the real environment — which is what `both.Dockerfile`
// (ENV NODE_ENV=production), docker-compose and `Makefile:163` rely on.
//
// ⚠️ The first version of this comment also claimed "the container has no .env file". That was
// FALSE: `both.Dockerfile` does `COPY ./backend .` and the repo had no `.dockerignore`, so
// `backend/.env` was being baked into the image. Harmless while config.js skipped dotenv in
// production — not harmless once the load became unconditional. Found in code review; a
// `.dockerignore` now keeps secrets out of the image, which is what makes this premise true.
//
// The path is resolved from THIS file, not from process.cwd(): `node backend/server.js` run from
// the repo root, and sequelize-cli invoked through `.sequelizerc`, do not share a working
// directory. Resolving against cwd would silently find no `.env` and then throw "NODE_ENV is not
// set" — the right error for the wrong reason.
const path = require('path');
const dotenvResult = require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// A missing .env is normal (the deployed container has none). A malformed one is not, and must not
// masquerade as "NODE_ENV is not set".
if (dotenvResult.error && dotenvResult.error.code !== 'ENOENT') {
  throw dotenvResult.error;
}

const VALID_ENVIRONMENTS = ['development', 'test', 'staging', 'production'];

// Trimmed: a trailing space or newline from a .env line or a Fly secret would otherwise be
// rejected with `unknown value: "production "`, a message where the value looks right at a glance.
const raw = typeof process.env.NODE_ENV === 'string' ? process.env.NODE_ENV.trim() : process.env.NODE_ENV;

// No silent fallback. The old one was `|| 'production'`, which made the DANGEROUS case the quiet
// one — a bare shell reached production while everything on screen said development. A missing
// NODE_ENV is an operator mistake, and it must read like one.
if (!raw) {
  throw new Error(
    'NODE_ENV is not set, and there is no safe default.\n' +
    `Expected one of: ${VALID_ENVIRONMENTS.join(', ')}.\n` +
    'Set it in the real environment or in backend/.env before starting anything.\n' +
    'Refusing to guess: the previous default was "production", which silently pointed local ' +
    'tooling at the production database.'
  );
}

if (!VALID_ENVIRONMENTS.includes(raw)) {
  throw new Error(
    `NODE_ENV has an unknown value: "${raw}".\n` +
    `Expected one of: ${VALID_ENVIRONMENTS.join(', ')}.\n` +
    'Refusing to fall back rather than run against an unintended database.'
  );
}

// Explicit comparison. `ssl: process.env.DB_ENABLE_SSL && {...}` tested the STRING, and the string
// 'false' is truthy in JS — so the `.env` of this project, which literally reads
// DB_ENABLE_SSL=false, was ENABLING ssl. The only way to disable it was to empty the variable,
// which nobody guesses from reading the file.
const sslEnabled = process.env.DB_ENABLE_SSL === 'true';

module.exports = {
  env: raw,
  sslEnabled,
  VALID_ENVIRONMENTS,
};
