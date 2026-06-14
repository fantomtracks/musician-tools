import type { Song } from '../services/songService';

const norm = (value: string | null | undefined): string => (value ?? '').toLowerCase().trim();

/**
 * Finds an existing song matching the given title + artist (case- and
 * surrounding-whitespace-insensitive), or null.
 *
 * Single source of truth for "does this song already exist", shared by the
 * live hint shown while adding a song and the submit-time guard. Keeping one
 * rule means the warning the user sees can never disagree with the block that
 * actually fires — the previous bug was that this check scanned the full
 * songlist while the visible list was filtered, so a song hidden by an active
 * filter looked absent yet still blocked creation.
 *
 * `excludeUid` lets edit mode ignore the song currently being edited.
 */
export function findDuplicateSong(
  songs: Song[],
  candidate: { title?: string | null; artist?: string | null },
  excludeUid?: string | null,
): Song | null {
  const title = norm(candidate.title);
  if (!title) return null; // title is the required field — empty matches nothing useful
  const artist = norm(candidate.artist);
  return (
    songs.find(
      song =>
        song.uid !== excludeUid &&
        norm(song.title) === title &&
        norm(song.artist) === artist,
    ) ?? null
  );
}
