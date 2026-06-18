// Song duration is stored in whole seconds. The form accepts only two shapes:
//   - m:ss      e.g. "3:30"  → 3 min 30 s
//   - a bare whole number, read as minutes, e.g. "4" → 4:00
// A single-digit seconds part is the TENS place, so "3:3" → 3:30 (not 3:03)
// and "3:7" → 70 s, which is rejected (seconds must stay in 0..59).
// Anything else (decimals, commas, junk) is rejected as null — keeping the
// notation unambiguous (no "3,3 means 3.3 minutes" surprise).

const MAX_DURATION_SECONDS = 86400; // 24h — a sane upper bound for a song

// Parse duration text into whole seconds.
// Returns null for empty or unparseable/out-of-range input.
export function parseDurationToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let seconds: number;
  if (trimmed.includes(':')) {
    // m:ss form — whole minutes and seconds (0..59)
    const parts = trimmed.split(':');
    if (parts.length !== 2) return null;
    const [mm, ss] = parts;
    if (!/^\d+$/.test(mm) || !/^\d{1,2}$/.test(ss)) return null;
    // One digit = tens of seconds ("3" → 30); two digits = exact ("05" → 5).
    const secs = ss.length === 1 ? Number(ss) * 10 : Number(ss);
    if (secs > 59) return null;
    seconds = Number(mm) * 60 + secs;
  } else {
    // Bare number = whole minutes. Only digits accepted (no decimal/comma).
    if (!/^\d+$/.test(trimmed)) return null;
    seconds = Number(trimmed) * 60;
  }

  if (seconds <= 0 || seconds > MAX_DURATION_SECONDS) return null;
  return seconds;
}

// Round a stored second-duration to whole minutes for the practice journal,
// which works in whole minutes. Returns null when there is no usable duration
// (missing / non-integer / rounds to 0, i.e. under 30s) — same semantics as the
// backend markSongPlayed pre-fill (story 6.1), kept in sync for consistency.
export function secondsToWholeMinutes(seconds: number | null | undefined): number | null {
  if (!Number.isInteger(seconds) || (seconds as number) <= 0) return null;
  const rounded = Math.round((seconds as number) / 60);
  return rounded > 0 ? rounded : null;
}

// Format stored seconds as m:ss for display (e.g. 210 → "3:30").
export function formatSecondsToMmss(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '';
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
