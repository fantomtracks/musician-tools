// Shared date validation for the session "day" (FR19): the client's local date
// is the source of truth, the server never stamps the day from its own clock.
// Extracted so the session controller and the song controller (Mark as Played,
// story 4.1) validate a client-supplied day with ONE definition, not two copies.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DATE = '1900-01-01'; // guards against year typos like 0205-06-07

// True when the YYYY-MM-DD string is a real calendar day (rejects 2026-02-31).
function isValidCalendarDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

// The client's local date is the source of truth for the day (FR19). The server
// only sanity-checks against "UTC today + 1 day": a client ahead of the server's
// timezone can legitimately already be on "tomorrow".
function maxAllowedDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

module.exports = { DATE_PATTERN, MIN_DATE, isValidCalendarDate, maxAllowedDate };
