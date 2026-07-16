import { useEffect, useState } from 'react';
import { Navigate, Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CatalogConflictError, CatalogNotFoundError } from '../services/catalogService';
import type { CreateCatalogDTO, CatalogSong } from '../services/catalogService';
import { songService } from '../services/songService';
import { parseDurationToSeconds, formatSecondsToMmss } from '../utils/duration';
import { keyOptions, modeOptions, timeSignatureOptions, genreOptions, languageOptions } from '../utils/songFieldOptions';
import { DuplicateBanner } from '../components/DuplicateBanner';
import { ConfirmDialog } from '../components/ConfirmDialog';

// Curator-only admin screen to create a Catalog entry (story 19.2). Utilitarian
// (DL-14): reuses the design-system utilities, restricted to the INTRINSIC fields
// (DL-17) — no instrument/personal fields. Auto-fill reuses songService.lookupMetadata
// and merges NON-destructively (never overwrites a typed value).

type StreamingLink = { label: string; url: string };

const emptyForm: CreateCatalogDTO = {
  title: '',
  artist: '',
  album: '',
  key: '',
  bpm: null,
  mode: '',
  timeSignature: '',
  durationSeconds: null,
  language: [],
  genre: [],
  streamingLinks: [],
  pitchStandard: 440,
};

// Local mirror of Songs.tsx's link generator (client-side, no network) — replicated
// rather than importing (it lives inline in a 1800-line page). Keep in sync if it moves.
function generateStreamingLinks(title: string, artist: string): StreamingLink[] {
  const searchQuery = `${artist || ''} ${title || ''}`.trim();
  if (!searchQuery) return [];
  return [
    { label: 'YouTube', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}` },
    { label: 'Spotify', url: `https://open.spotify.com/search/${encodeURIComponent(searchQuery)}` },
    { label: 'Apple Music', url: `https://music.apple.com/us/search?term=${encodeURIComponent(searchQuery)}` },
    { label: 'Deezer', url: `https://www.deezer.com/search/${encodeURIComponent(searchQuery)}` },
    { label: 'Tidal', url: `https://tidal.com/search?q=${encodeURIComponent(searchQuery)}&types=TRACKS` },
    { label: 'Qobuz', url: `https://www.qobuz.com/us-en/search?q=${encodeURIComponent(searchQuery)}` },
  ];
}

// Normalize a genre/language field (string[] | string | null) to an array.
const asArr = (value: string[] | string | null | undefined): string[] =>
  Array.isArray(value) ? value : (value ? [value] : []);

// Map a fetched CatalogSong -> the editable form DTO (story 19.5 edit mode). Drops
// uid/timestamps, coerces nullable columns to the form's empty representation, and
// clones streamingLinks so editing never mutates the fetched object.
const mapEntryToForm = (e: CatalogSong): CreateCatalogDTO => ({
  title: e.title ?? '',
  artist: e.artist ?? '',
  album: e.album ?? '',
  key: e.key ?? '',
  bpm: e.bpm ?? null,
  mode: e.mode ?? '',
  timeSignature: e.timeSignature ?? '',
  durationSeconds: e.durationSeconds ?? null,
  language: asArr(e.language),
  genre: asArr(e.genre),
  streamingLinks: (e.streamingLinks ?? []).map(l => ({ ...l })),
  pitchStandard: e.pitchStandard ?? 440,
});

export default function CatalogAdmin() {
  const { user } = useAuth();

  const [form, setForm] = useState<CreateCatalogDTO>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataSource, setMetadataSource] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  // Duration is entered as m:ss (like the SongForm). durationText is the source while
  // typing; committed to form.durationSeconds on blur. Re-sync when the underlying
  // value changes out-of-band (auto-fill, reset) without clobbering in-progress typing.
  const [durationText, setDurationText] = useState('');
  useEffect(() => {
    const parsed = parseDurationToSeconds(durationText);
    if (parsed !== (form.durationSeconds ?? null)) {
      setDurationText(form.durationSeconds != null ? formatSecondsToMmss(form.durationSeconds) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.durationSeconds]);

  // Edit mode (story 19.5): /catalog/admin/:uid reuses this form to update an
  // existing fiche in place. No uid = create mode (story 19.2, unchanged).
  const { uid } = useParams();
  const isEdit = Boolean(uid);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [notFound, setNotFound] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Pre-fill the form from the existing entry. `active` guard makes it StrictMode-
  // safe (double-mount) and cancels a stale response if the uid changes mid-flight.
  useEffect(() => {
    if (!uid) return;
    let active = true;
    setLoading(true);
    setNotFound(false);
    catalogService.getCatalogEntry(uid)
      .then(entry => {
        if (!active) return;
        const mapped = mapEntryToForm(entry);
        setForm(mapped);
        setDurationText(mapped.durationSeconds != null ? formatSecondsToMmss(mapped.durationSeconds) : '');
        setLoading(false);
      })
      .catch(err => {
        if (!active) return;
        if (err instanceof CatalogNotFoundError) {
          setNotFound(true);
        } else {
          setToastMessage('Could not load the catalog entry.');
          setTimeout(() => setToastMessage(null), 2500);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [uid]);

  // Role gate: a non-curator never sees the form (route is auth-gated; this adds
  // the role check). Not a 404 oracle — the admin surface is a privilege gate.
  if (!user?.isCurator) {
    return <Navigate to="/" replace />;
  }

  // Edit mode: loading / not-found interstitials (calm deep-link handling, AC8).
  if (isEdit && loading) {
    return <div className="max-w-3xl mx-auto px-4 py-6 text-gray-500 dark:text-gray-400">Loading…</div>;
  }
  if (isEdit && notFound) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Catalog entry not found</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">It may have been removed from the Catalog.</p>
        <Link to="/catalog/manage" className="text-brand-600 dark:text-brand-400 hover:underline">← Back to manage</Link>
      </div>
    );
  }

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const setField = <K extends keyof CreateCatalogDTO>(key: K, value: CreateCatalogDTO[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setConflictMessage(null);
  };

  // Never let a NaN reach a controlled input (React warns) or the INTEGER column.
  const parseNumber = (value: string): number | null => {
    if (value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const handleAutoFill = async () => {
    const title = (form.title || '').trim();
    const artist = (form.artist || '').trim();
    // Guard against no title/artist AND against an in-flight lookup/save (a save
    // resolving mid-lookup resets the form → the pending merge would ghost-fill it).
    if (!title || !artist || metadataLoading || saving) return;

    setMetadataLoading(true);
    try {
      const meta = await songService.lookupMetadata(title, artist);
      setMetadataSource(meta?.source || null);

      // Links are generated regardless of metadata; merge inside the functional
      // updater against prev (not the render closure) so a link removed during the
      // await is not resurrected. Tolerant of a metadata-less (null) response.
      const generated = generateStreamingLinks(title, artist);
      setForm(prev => {
        const current = prev.streamingLinks || [];
        const existingUrls = new Set(current.map(l => l.url));
        const streamingLinks = [...current, ...generated.filter(l => !existingUrls.has(l.url))];
        return {
          ...prev,
          bpm: prev.bpm ?? meta?.bpm ?? null,
          key: prev.key || meta?.key || '',
          mode: prev.mode || meta?.mode || '',
          timeSignature: prev.timeSignature || meta?.timeSignature || '',
          album: prev.album || meta?.album || '',
          durationSeconds: prev.durationSeconds ?? meta?.durationSeconds ?? null,
          genre: (Array.isArray(prev.genre) && prev.genre.length > 0)
            ? prev.genre
            : (Array.isArray(meta?.genres) && meta.genres.length > 0 ? meta.genres : prev.genre),
          streamingLinks,
        };
      });
    } catch {
      showToast('Auto-fill unavailable at the moment.');
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(form.title || '').trim() || saving) return;
    setSaving(true);
    setConflictMessage(null);
    try {
      if (isEdit && uid) {
        await catalogService.updateCatalogEntry(uid, form);
        showToast('Catalog entry updated');
        navigate('/catalog/manage');
      } else {
        await catalogService.createCatalogEntry(form);
        showToast('Catalog entry created');
        setForm(emptyForm);
        setDurationText('');
        setMetadataSource(null);
      }
    } catch (err) {
      if (err instanceof CatalogConflictError) {
        const t = (form.title || '').trim();
        const a = (form.artist || '').trim();
        setConflictMessage(a ? `A "${t}" by ${a} is already in the Catalog.` : `A "${t}" is already in the Catalog.`);
      } else {
        showToast('Could not save the catalog entry.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Delete the entry being edited (curator). A 404 (already gone) is treated as done.
  const handleDelete = async () => {
    if (!uid || deleting) return;
    setDeleting(true);
    try {
      await catalogService.deleteCatalogEntry(uid);
      navigate('/catalog/manage');
    } catch (err) {
      if (err instanceof CatalogNotFoundError) { navigate('/catalog/manage'); return; }
      showToast('Could not delete the catalog entry.');
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const removeLink = (url: string) => {
    setForm(prev => ({ ...prev, streamingLinks: (prev.streamingLinks || []).filter(l => l.url !== url) }));
  };

  // Single-value dropdown (key/mode/timeSignature) — preserves an out-of-list value
  // (e.g. from auto-fill) as an extra option so nothing is silently dropped.
  const renderSelect = (param: 'key' | 'mode' | 'timeSignature', label: string, options: string[]) => {
    const value = (form[param] as string | null) ?? '';
    const opts = value && !options.includes(value) ? [value, ...options] : options;
    return (
      <div>
        <label className="label-base" htmlFor={`cat-${param}`}>{label}</label>
        <select
          id={`cat-${param}`}
          className="input-base"
          value={value}
          onChange={e => { setForm(prev => ({ ...prev, [param]: e.target.value || null }) as CreateCatalogDTO); setConflictMessage(null); }}
        >
          <option value="">—</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  };

  // Multi-select dropdown + removable chips (genre/language) — same values as the SongForm.
  const renderMulti = (param: 'genre' | 'language', label: string, options: string[]) => {
    const selected = asArr(form[param] as string[] | string | null);
    const change = (next: string[]) => { setForm(prev => ({ ...prev, [param]: next }) as CreateCatalogDTO); setConflictMessage(null); };
    return (
      <div>
        <label className="label-base" htmlFor={`cat-${param}`}>{label}</label>
        <select
          id={`cat-${param}`}
          className="input-base"
          value=""
          onChange={e => { const v = e.target.value; if (v && !selected.includes(v)) change([...selected, v]); }}
        >
          <option value="">Add {label.toLowerCase()}…</option>
          {options.filter(o => !selected.includes(o)).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {selected.map(v => (
              <span key={v} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1 text-xs text-gray-700 dark:text-gray-200">
                {v}
                <button type="button" aria-label={`Remove ${v}`} className="text-gray-400 hover:text-red-500" onClick={() => change(selected.filter(x => x !== v))}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">{isEdit ? 'Edit catalog entry' : 'Curate the Catalog'}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{isEdit ? 'Update this shared song entry. Only intrinsic song fields — no instrument settings.' : 'Add a shared song entry. Only intrinsic song fields — no instrument settings.'}</p>

      <form onSubmit={handleSubmit} className="card-base p-4 sm:p-6 space-y-4">
        {/* Artist first (DL-18), then Title — same field order as the Song edit form. */}
        <div>
          <label className="label-base" htmlFor="cat-artist">Artist</label>
          <input id="cat-artist" className="input-base" value={form.artist ?? ''} onChange={e => setField('artist', e.target.value)} />
        </div>

        <div>
          <label className="label-base" htmlFor="cat-title">Title</label>
          <input
            id="cat-title"
            className="input-base"
            value={form.title}
            onChange={e => setField('title', e.target.value)}
            required
          />
        </div>

        {/* Conflict banner right after artist+title, same component + spot as SongForm. */}
        {conflictMessage && (
          <DuplicateBanner><p>{conflictMessage}</p></DuplicateBanner>
        )}

        <div>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={handleAutoFill}
            disabled={metadataLoading || saving || !(form.title || '').trim() || !(form.artist || '').trim()}
          >
            {metadataLoading ? 'Auto-filling…' : 'Auto-fill metadata & links'}
          </button>
          {metadataSource && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">source: {metadataSource}</span>}
        </div>

        {/* Genre → Album → Language, then the numeric grids — mirrors SongForm. */}
        {renderMulti('genre', 'Genre', genreOptions)}

        <div>
          <label className="label-base" htmlFor="cat-album">Album</label>
          <input id="cat-album" className="input-base" value={form.album ?? ''} onChange={e => setField('album', e.target.value)} />
        </div>

        {renderMulti('language', 'Language', languageOptions)}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label-base" htmlFor="cat-duration">Duration (m:ss)</label>
            <input
              id="cat-duration"
              className="input-base"
              placeholder="3:45"
              value={durationText}
              onChange={e => setDurationText(e.target.value)}
              onBlur={() => { const s = parseDurationToSeconds(durationText); setField('durationSeconds', s); setDurationText(s != null ? formatSecondsToMmss(s) : ''); }}
            />
          </div>
          <div>
            <label className="label-base" htmlFor="cat-bpm">BPM</label>
            <input id="cat-bpm" type="number" className="input-base" value={form.bpm ?? ''} onChange={e => setField('bpm', parseNumber(e.target.value))} />
          </div>
          {renderSelect('timeSignature', 'Time signature', timeSignatureOptions)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {renderSelect('key', 'Key', keyOptions)}
          {renderSelect('mode', 'Mode', modeOptions)}
          <div>
            <label className="label-base" htmlFor="cat-pitch">Pitch standard (Hz)</label>
            <input id="cat-pitch" type="number" className="input-base" value={form.pitchStandard ?? ''} onChange={e => setField('pitchStandard', parseNumber(e.target.value))} />
          </div>
        </div>

        {(form.streamingLinks && form.streamingLinks.length > 0) && (
          <div>
            <label className="label-base">Streaming links</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {form.streamingLinks.map(link => (
                <span key={link.url} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1 text-xs text-gray-700 dark:text-gray-200">
                  {link.label}
                  <button type="button" aria-label={`Remove ${link.label} link`} className="text-gray-400 hover:text-red-500" onClick={() => removeLink(link.url)}>×</button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          {isEdit && (
            <button
              type="button"
              className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-2 text-sm hover:bg-red-700 disabled:opacity-50"
              onClick={() => setDeleteOpen(true)}
              disabled={deleting}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className={`btn-secondary ${isEdit ? 'ml-auto' : ''}`}
            onClick={() => navigate('/catalog/manage')}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!(form.title || '').trim() || saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Save')}
          </button>
        </div>
      </form>

      {isEdit && (
        <ConfirmDialog
          isOpen={deleteOpen}
          title="Delete catalog entry"
          message={`Delete "${(form.title || '').trim() || 'this entry'}"${(form.artist || '').trim() ? ` by ${(form.artist || '').trim()}` : ''} from the Catalog? Users who already added this song keep their own copy.`}
          confirmText={deleting ? 'Deleting…' : 'Delete'}
          cancelText="Cancel"
          isDangerous
          onConfirm={handleDelete}
          onCancel={() => { if (!deleting) setDeleteOpen(false); }}
        />
      )}

      {toastMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
