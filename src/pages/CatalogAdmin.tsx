import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CatalogConflictError } from '../services/catalogService';
import type { CreateCatalogDTO } from '../services/catalogService';
import { songService } from '../services/songService';

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

// Comma-separated text <-> string[] for the genre/language inputs.
const toList = (value: string): string[] =>
  value.split(',').map(s => s.trim()).filter(Boolean);
const fromList = (value: string[] | string | null | undefined): string =>
  Array.isArray(value) ? value.join(', ') : (value ?? '');

export default function CatalogAdmin() {
  const { user } = useAuth();

  const [form, setForm] = useState<CreateCatalogDTO>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataSource, setMetadataSource] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  // Role gate: a non-curator never sees the form (route is auth-gated; this adds
  // the role check). Not a 404 oracle — the admin surface is a privilege gate.
  if (!user?.isCurator) {
    return <Navigate to="/" replace />;
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
      await catalogService.createCatalogEntry(form);
      showToast('Catalog entry created');
      setForm(emptyForm);
      setMetadataSource(null);
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

  const removeLink = (url: string) => {
    setForm(prev => ({ ...prev, streamingLinks: (prev.streamingLinks || []).filter(l => l.url !== url) }));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">Curate the Catalog</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Add a shared song entry. Only intrinsic song fields — no instrument settings.</p>

      <form onSubmit={handleSubmit} className="card-base p-4 sm:p-6 space-y-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base" htmlFor="cat-artist">Artist</label>
            <input id="cat-artist" className="input-base" value={form.artist ?? ''} onChange={e => setField('artist', e.target.value)} />
          </div>
          <div>
            <label className="label-base" htmlFor="cat-album">Album</label>
            <input id="cat-album" className="input-base" value={form.album ?? ''} onChange={e => setField('album', e.target.value)} />
          </div>
        </div>

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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label-base" htmlFor="cat-key">Key</label>
            <input id="cat-key" className="input-base" value={form.key ?? ''} onChange={e => setField('key', e.target.value)} />
          </div>
          <div>
            <label className="label-base" htmlFor="cat-mode">Mode</label>
            <input id="cat-mode" className="input-base" value={form.mode ?? ''} onChange={e => setField('mode', e.target.value)} />
          </div>
          <div>
            <label className="label-base" htmlFor="cat-timesig">Time signature</label>
            <input id="cat-timesig" className="input-base" value={form.timeSignature ?? ''} onChange={e => setField('timeSignature', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label-base" htmlFor="cat-bpm">BPM</label>
            <input id="cat-bpm" type="number" className="input-base" value={form.bpm ?? ''} onChange={e => setField('bpm', parseNumber(e.target.value))} />
          </div>
          <div>
            <label className="label-base" htmlFor="cat-duration">Duration (seconds)</label>
            <input id="cat-duration" type="number" className="input-base" value={form.durationSeconds ?? ''} onChange={e => setField('durationSeconds', parseNumber(e.target.value))} />
          </div>
          <div>
            <label className="label-base" htmlFor="cat-pitch">Pitch standard (Hz)</label>
            <input id="cat-pitch" type="number" className="input-base" value={form.pitchStandard ?? ''} onChange={e => setField('pitchStandard', parseNumber(e.target.value))} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base" htmlFor="cat-genre">Genre <span className="text-gray-400">(comma-separated)</span></label>
            <input id="cat-genre" className="input-base" value={fromList(form.genre)} onChange={e => setField('genre', toList(e.target.value))} />
          </div>
          <div>
            <label className="label-base" htmlFor="cat-language">Language <span className="text-gray-400">(comma-separated)</span></label>
            <input id="cat-language" className="input-base" value={fromList(form.language)} onChange={e => setField('language', toList(e.target.value))} />
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

        {conflictMessage && (
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">{conflictMessage}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={!(form.title || '').trim() || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => { setForm(emptyForm); setConflictMessage(null); setMetadataSource(null); }}>
            Cancel
          </button>
        </div>
      </form>

      {toastMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
