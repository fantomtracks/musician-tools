import { useCallback, useEffect, useState } from 'react';
import { songService } from '../services/songService';
import type { Song } from '../services/songService';
import { findDuplicateSong } from '../utils/songDuplicate';

// Story 19.4: computes the "Already in your songlist" flag CLIENT-SIDE. Loads the
// user's OWN Songlist once and matches Catalog entries against it with the shared
// canonical-key rule (findDuplicateSong). This keeps the Catalog read purely shared
// (no userUid on the browse query); the server stays the source of truth (409 on Add).
// Degrades gracefully: if the songlist can't load, no flags are shown (buttons stay
// "Add"; the server 409 still protects against a real duplicate).
export function useSonglistMatcher() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    songService.getAllSongs()
      .then(list => { if (active) setSongs(list); })
      .catch(() => { /* degrade: no client-side flags */ });
    return () => { active = false; };
  }, [reloadToken]);

  // Story 22.4: a bulk add can learn that a song is already in the songlist WITHOUT
  // being told which one (a 409 whose body carries no song). `addToCache` can't help
  // there, so the caller asks for a reload rather than leaving the row advertising
  // "Add" for something it can no longer add.
  const refresh = useCallback(() => setReloadToken(t => t + 1), []);

  const findExisting = useCallback(
    (entry: { title: string; artist?: string | null }): Song | null =>
      findDuplicateSong(songs, { title: entry.title, artist: entry.artist ?? null }),
    [songs],
  );

  // Called after a successful Add so subsequent rows reflect the new song.
  const addToCache = useCallback(
    (song: Song) => setSongs(prev => (prev.some(s => s.uid === song.uid) ? prev : [song, ...prev])),
    [],
  );

  return { findExisting, addToCache, refresh };
}
