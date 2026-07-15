import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogService, CatalogNotFoundError } from '../services/catalogService';
import type { CatalogSong } from '../services/catalogService';
import { SongConflictError } from '../services/songService';
import type { Song } from '../services/songService';

// "Add to my songlist" — 3 states (DL-8/DL-11), story 19.4:
//   default  → btn-primary "Add to my songlist"
//   added    → transient green flash "✓ Added"
//   already  → badge-success "✓ Already in your songlist" (clickable → the existing Song)
// Never red, never a disabled-grey failure. The button is a SIBLING of the row/title
// link (never nested in an <a>) and keeps a ≥44px hit area. Outcomes are announced
// via role="status" (aria-live).

const HIT = 'min-h-[44px] inline-flex items-center justify-center';

export default function CatalogAddButton({
  entry,
  existingSong,
  onAdded,
}: {
  entry: CatalogSong;
  existingSong: Song | null;
  onAdded?: (song: Song) => void;
}) {
  const [addedSong, setAddedSong] = useState<Song | null>(null);
  const [duplicateNoLink, setDuplicateNoLink] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState(false);

  const savingRef = useRef(false); // synchronous double-click guard (state lags a render)
  const mountedRef = useRef(true);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const already = existingSong || addedSong;

  const handleAdd = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    try {
      const song = await catalogService.addToSonglist(entry.uid);
      if (!mountedRef.current) return;
      setFlashing(true);
      flashTimer.current = setTimeout(() => { if (mountedRef.current) setFlashing(false); }, 900);
      setAddedSong(song);
      onAdded?.(song);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof SongConflictError) {
        if (err.existingSong) {
          setAddedSong(err.existingSong);
          onAdded?.(err.existingSong);
        } else {
          setDuplicateNoLink(true);
        }
      } else if (err instanceof CatalogNotFoundError) {
        setGone(true); // permanent — not retryable
      } else {
        setFailed(true); // re-tentable
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  if (gone) {
    return <span role="status" className="text-xs text-gray-500 dark:text-gray-400">This song is no longer in the Catalog.</span>;
  }

  if (flashing) {
    return <span role="status" aria-live="polite" className={`${HIT} rounded-md bg-green-500 text-white text-sm px-3`}>✓ Added</span>;
  }

  if (already) {
    return (
      <Link to={`/songs/${already.uid}`} className={`${HIT} badge-success cursor-pointer px-3`}>
        ✓ Already in your songlist
      </Link>
    );
  }

  if (duplicateNoLink) {
    return <span className={`${HIT} badge-success px-3`}>✓ Already in your songlist</span>;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={`btn-primary ${HIT}`}
        onClick={handleAdd}
        disabled={saving}
        aria-label={`Add "${entry.title}" to my songlist`}
      >
        {saving ? 'Adding…' : 'Add to my songlist'}
      </button>
      {failed && <span role="status" aria-live="polite" className="text-xs text-gray-500 dark:text-gray-400">Couldn’t add — try again.</span>}
    </span>
  );
}
