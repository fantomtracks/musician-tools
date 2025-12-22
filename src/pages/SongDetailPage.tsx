import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { songService, type Song, type CreateSongDTO } from '../services/songService';
import { toSlug } from '../utils/slug';
import { ConfirmDialog } from '../components/ConfirmDialog';

function SongDetailPage() {
  const { artist, title } = useParams<{ artist: string; title: string }>();
  const navigate = useNavigate();
  const [song, setSong] = useState<Song | null>(null);
  const [form, setForm] = useState<CreateSongDTO>({
    title: '',
    bpm: 120,
    key: '',
    chords: '',
    tabs: '',
    instrument: '',
    artist: '',
    album: '',
    tunning: '',
    lastPlayed: undefined,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    loadSong();
  }, [artist, title]);

  const loadSong = async () => {
    if (!artist || !title) return;

    try {
      setLoading(true);
      setError(null);
      const songs = await songService.getAllSongs();
      const found = songs.find(
        s => toSlug(s.artist) === artist &&
             toSlug(s.title) === title
      );
      
      if (found) {
        setSong(found);
        const { uid: _uid, createdAt, updatedAt, ...rest } = found;
        setForm(rest);
      } else {
        setError('Song not found');
      }
    } catch (err) {
      setError('Error while loading song');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: name === 'bpm' ? Number(value) : value });
  };

  const toggleFormInstrument = (instrument: string) => {
    const current = Array.isArray(form.instrument) ? form.instrument : (form.instrument ? [form.instrument] : []);
    const updated = current.includes(instrument)
      ? current.filter(i => i !== instrument)
      : [...current, instrument];
    setForm({ ...form, instrument: updated as any });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!song) return;

    try {
      setLoading(true);
      setError(null);
      await songService.updateSong(song.uid, form);
      navigate('/songs');
    } catch (err) {
      setError('Error while saving song');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!song) return;

    try {
      setLoading(true);
      setError(null);
      await songService.deleteSong(song.uid);
      navigate('/songs');
    } catch (err) {
      setError('Error while deleting song');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !song) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <p className="p-6">Loading...</p>
      </div>
    );
  }

  if (error && !song) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-2xl mx-auto p-6">
          <div className="mb-6">
            <Link to="/" className="text-2xl font-semibold text-gray-900 hover:text-brand-500 transition">Musician Tools</Link>
          </div>
          <div className="text-center space-y-4">
            <p className="text-red-600">{error || 'Song not found'}</p>
            <Link
              to="/songs"
              className="inline-flex items-center rounded-md bg-brand-500 text-white px-4 py-2 hover:bg-brand-600"
            >
              Back to songs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="Delete song"
        message="Are you sure you want to delete this song?"
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialogOpen(false)}
      />
      {error && (
        <div className="mx-4 my-4 rounded-md border border-red-300 bg-red-50 text-red-700 p-3 flex items-center justify-between">
          <span>{error}</span>
          <button className="rounded-md px-2 py-1 hover:bg-red-100" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      <div className="max-w-2xl mx-auto p-6">
        <div className="mb-6">
          <Link to="/" className="text-2xl font-semibold text-gray-900 hover:text-brand-500 transition">Musician Tools</Link>
          <p className="text-sm text-gray-600">Edit song</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Artist</label>
            <input
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              name="artist"
              value={form.artist}
              onChange={handleChange}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Album</label>
            <input
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              name="album"
              value={typeof form.album === 'string' ? form.album : ''}
              onChange={handleChange}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              name="title"
              value={form.title}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">BPM</label>
              <input
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                name="bpm"
                type="number"
                value={form.bpm}
                onChange={handleChange}
                required
                min={1}
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Key</label>
              <input
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                name="key"
                value={form.key}
                onChange={handleChange}
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Tunning</label>
            <select
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              name="tunning"
              value={typeof form.tunning === 'string' ? form.tunning : ''}
              onChange={handleChange}
              disabled={loading}
            >
              <option value="">Select a tunning</option>
              <option value="EADGBE">EADGBE (Standard)</option>
              <option value="DADGBE">DADGBE (Drop D)</option>
              <option value="EbAbDbGbBbEb">EbAbDbGbBbEb (Half-step down)</option>
              <option value="DADGAD">DADGAD</option>
              <option value="DGDGBD">DGDGBD (Open G)</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Instruments</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {['Guitar', 'Piano', 'Bass', 'Drums', 'Vocals', 'Other'].map(inst => {
                const current = Array.isArray(form.instrument) ? form.instrument : [];
                return (
                  <label key={inst} className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={current.includes(inst)}
                      onChange={() => toggleFormInstrument(inst)}
                      disabled={loading}
                    />
                    <span className="text-sm cursor-pointer">{inst}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Chord chart</label>
            <textarea
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              name="chords"
              value={form.chords}
              onChange={handleChange}
              rows={2}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Tabs</label>
            <div className="mt-1 flex gap-2">
              <input
                className="block flex-1 rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                type="url"
                name="tabs"
                placeholder="https://example.com/tabs"
                value={form.tabs}
                onChange={handleChange}
                disabled={loading}
              />
              <button
                type="button"
                className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600 disabled:opacity-50"
                onClick={() => {
                  if (form.tabs && (form.tabs.startsWith('http://') || form.tabs.startsWith('https://'))) {
                    window.open(form.tabs, '_blank');
                  }
                }}
                disabled={loading || !form.tabs || (!form.tabs.startsWith('http://') && !form.tabs.startsWith('https://'))}
              >
                Visit
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Save'}
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-md bg-gray-100 text-gray-800 px-3 py-2 hover:bg-gray-200 disabled:opacity-50"
              onClick={() => navigate('/songs')}
              disabled={loading}
            >
              Cancel
            </button>
            {song && (
              <button
                type="button"
                className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-2 hover:bg-red-700 disabled:opacity-50"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={loading}
              >
                Delete
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default SongDetailPage;
