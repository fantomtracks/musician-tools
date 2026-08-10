import { useEffect, useRef, useState } from 'react';
import { catalogService, CatalogNotFoundError } from '../services/catalogService';
import { SongConflictError } from '../services/songService';
import type { Song } from '../services/songService';
import { runBounded } from '../utils/runBounded';

// Shared engine of the reader-side bulk "Add selected to my songlist" (story 22.4).
// Both surfaces — the Catalog browse table and the public Collection page — run the
// exact same action, so it lives here rather than twice.
//
// Unlike the curator batches (22.2 / 22.3), `addToSonglist` has THREE TYPED outcomes,
// and the recap must keep them apart:
//   • 201 -> the created Song           -> "added"
//   • 409 SongConflictError             -> "already in your songlist" (carries the
//                                          existing Song, which feeds the duplicate flag)
//   • 404 CatalogNotFoundError          -> "no longer in the catalog" — the service
//                                          itself calls this permanent, so offering a
//                                          retry would be a lie
//   • anything else                     -> "failed", the only retryable bucket
const CONCURRENCY = 4;

export interface AddToSonglistRecap {
  added: number;
  alreadyIn: number;
  gone: number;
  failed: number;
  // True when at least one 409 came back WITHOUT the existing song (the controller
  // tolerates a failed lookup and answers `song: null`). The duplicate flag then cannot
  // be updated from the response, and the caller must refresh its own view of the
  // songlist — otherwise the row keeps offering "Add" for a song that is already there.
  needsSonglistRefresh: boolean;
}

export interface BulkAddResult {
  recap: AddToSonglistRecap;
  // Everything that must LEAVE the selection: successes, duplicates, and the permanent
  // 404s. Only the retryable failures stay ticked so the batch can be replayed.
  settledUids: string[];
}

export function useBulkAddToSonglist(onSongKnown?: (song: Song) => void) {
  const [recap, setRecap] = useState<AddToSonglistRecap | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false); // the render-time flag lags a click
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const run = async (uids: string[]): Promise<BulkAddResult | null> => {
    if (uids.length === 0 || runningRef.current) return null;
    runningRef.current = true;
    setRunning(true);
    setRecap(null); // the previous batch's numbers must not hang over this one

    try {
      const results = await runBounded(uids, CONCURRENCY, uid => catalogService.addToSonglist(uid));
      if (!mountedRef.current) return null;

      const counts: AddToSonglistRecap = { added: 0, alreadyIn: 0, gone: 0, failed: 0, needsSonglistRefresh: false };
      const settledUids: string[] = [];

      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          counts.added += 1;
          settledUids.push(uids[i]);
          onSongKnown?.(result.value);
          return;
        }
        if (result.reason instanceof SongConflictError) {
          counts.alreadyIn += 1;
          settledUids.push(uids[i]);
          // The 409 body carries the song already in the songlist: feeding it to the
          // matcher makes the "already in" flags correct with no refetch.
          if (result.reason.existingSong) onSongKnown?.(result.reason.existingSong);
          else counts.needsSonglistRefresh = true;
          return;
        }
        if (result.reason instanceof CatalogNotFoundError) {
          counts.gone += 1;
          settledUids.push(uids[i]); // permanent: retrying cannot help
          return;
        }
        counts.failed += 1; // retryable — stays selected
      });

      setRecap(counts);
      return { recap: counts, settledUids };
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setRunning(false);
    }
  };

  return { recap, setRecap, running, run };
}

// One phrasing for both surfaces. A batch that changed nothing says so plainly instead
// of a degraded "0 added" (lesson from retro 20 #5).
// A batch is "bad news" as soon as nothing was added — everything delisted is not a
// neutral outcome, and must not be styled and announced like a success.
export function isAddRecapNegative(r: AddToSonglistRecap): boolean {
  return r.failed > 0 || (r.added === 0 && r.gone > 0);
}

export function describeAddRecap(r: AddToSonglistRecap): string {
  const total = r.added + r.alreadyIn + r.gone + r.failed;
  if (r.added === 0 && r.gone === 0 && r.failed === 0) {
    return `All ${r.alreadyIn} ${r.alreadyIn === 1 ? 'song was' : 'songs were'} already in your songlist.`;
  }
  // `0 added` is never printed: a batch that added nothing says what DID happen. The
  // guard above only covers the all-already-in shape; the other zero-add shapes
  // (everything delisted, everything failed, already-in + failed) fall through here.
  const parts = [
    r.added > 0 ? `${r.added} added` : null,
    r.alreadyIn > 0 ? `${r.alreadyIn} already in your songlist` : null,
    r.gone > 0 ? `${r.gone} no longer in the catalog` : null,
    r.failed > 0 ? `${r.failed} failed` : null,
  ].filter(Boolean);
  const suffix = r.failed > 0 ? ' The failed songs are still selected, so you can retry.' : '';
  return `${parts.join(' · ')} (of ${total}).${suffix}`;
}
