import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SongConflictError } from '../services/songService';
import type { Song } from '../services/songService';
import { catalogService } from '../services/catalogService';
import type { MusicBrainzHit } from '../services/catalogService';

const HIT = 'min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors';
const ALREADY = `${HIT} bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60`;
const ADDED = `${HIT} bg-green-500 text-white`;

export default function MusicBrainzImportButton({
  hit,
  existingSong,
  onAdded,
}: {
  hit: MusicBrainzHit;
  existingSong: Song | null;
  onAdded?: (song: Song) => void;
}) {
  const [addedSong, setAddedSong] = useState<Song | null>(null);
  const [duplicateNoLink, setDuplicateNoLink] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const already = existingSong || addedSong;

  const handleImport = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    try {
      const song = await catalogService.importMusicBrainzRecording(hit);
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
      } else {
        setFailed(true);
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  if (flashing) {
    return <span role="status" aria-live="polite" className={ADDED}>✓ Added</span>;
  }

  if (already) {
    return (
      <Link to={`/songs/${already.uid}`} className={`${ALREADY} cursor-pointer`}>
        ✓ Already in your songlist
      </Link>
    );
  }

  if (duplicateNoLink) {
    return <span className={ALREADY}>✓ Already in your songlist</span>;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={`btn-primary ${HIT}`}
        onClick={handleImport}
        disabled={saving}
        aria-label={`Import "${hit.title}" to my songlist`}
      >
        {saving ? 'Importing…' : 'Import song'}
      </button>
      {failed && <span role="status" aria-live="polite" className="text-xs text-gray-500 dark:text-gray-400">Couldn’t import — try again.</span>}
    </span>
  );
}
