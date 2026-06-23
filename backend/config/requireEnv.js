// Validates that required environment variables are present at boot.
// Throws an Error listing any missing/empty keys so the caller can fail-fast
// (no silent fallback secrets). See story 7.1.
function requireEnv(keys) {
  const missing = keys.filter((key) => {
    const value = process.env[key];
    return value === undefined || value === '';
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

module.exports = requireEnv;
