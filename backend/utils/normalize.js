// Shared input normalizers for the Song and Catalog write paths (story 19.8).
// Style: REJECT-TO-NULL (like the former inline normalizeDurationSeconds) — an
// invalid / out-of-range value becomes null (the field simply isn't stored), never
// a clamp (which would record a wrong-but-plausible value) and never a 500 on the
// INTEGER columns. `undefined` is passed through so a partial PUT leaves the field
// untouched.

// Coerce to an integer within [min, max], else null. undefined -> undefined (absent).
const normalizeInt = (value, { min, max }) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  // Only genuine scalars — Number([5])===5, Number(true)===1 would sneak a value the
  // client never typed into the INTEGER column.
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
};

// Duration in whole seconds, 1..86400 (24 h). Thin wrapper kept for call-site clarity
// and back-compat with the previous behavior on both controllers.
const normalizeDurationSeconds = (value) => normalizeInt(value, { min: 1, max: 86400 });

// Title-case a language field (array or single string), dropping empties. Moved
// verbatim from songcontroller (was Song-only); now applied to the Catalog too so
// both sides store the same shape ("English", not "english"). null if nothing valid.
const normalizeLanguage = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  // Handle array of languages
  if (Array.isArray(value)) {
    const normalized = value
      .map(lang => {
        if (!lang) return null;
        const trimmed = String(lang).trim();
        if (!trimmed) return null;
        return trimmed
          .split(/\s+/)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ');
      })
      .filter(lang => lang !== null);
    return normalized.length > 0 ? normalized : null;
  }

  // Handle single language string
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

module.exports = { normalizeInt, normalizeDurationSeconds, normalizeLanguage };
