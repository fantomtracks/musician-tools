import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { songService, type Song, type CreateSongDTO } from '../services/songService';
import { SongForm } from '../components/SongForm';
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

        <SongForm
          mode="edit"
          form={form}
          loading={loading}
          onChange={handleChange}
          onToggleInstrument={toggleFormInstrument}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/songs')}
          onDelete={() => setDeleteDialogOpen(true)}
        />
      </div>
    </div>
  );
}

export default SongDetailPage;
