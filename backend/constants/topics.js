'use strict';

// The single system topic every user owns (story 8.2). Seeded at registration
// and backfilled for existing users; pinned in the entry picker and protected
// from rename/delete. Kept here so the registration hook and the backfill
// migration share one literal.
const FREE_PRACTICE_NAME = 'Free practice';

module.exports = { FREE_PRACTICE_NAME };
