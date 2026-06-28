'use strict';

// Shared UUID format guard. A malformed `:uid` would otherwise reach Postgres as
// `uuid = 'garbage'` and throw "invalid input syntax for type uuid" → a 500.
// Callers reject early with 404 instead — indistinguishable from "not found",
// consistent with the ownership-by-scope rule (story 7.5).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

module.exports = { UUID_PATTERN, isUuid };
