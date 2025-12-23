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
    bpm: null,
    key: '',
    chords: '',
    tabs: '',
    instrument: '',
    artist: '',
    album: '',
    technique: [],
    pitchStandard: 440,
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
    if (name === 'bpm') {
      setForm({ ...form, bpm: value === '' ? null : Number(value) });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const toggleFormInstrument = (instrument: string) => {
    const current = Array.isArray(form.instrument) ? form.instrument : (form.instrument ? [form.instrument] : []);
    const updated = current.includes(instrument)
      ? current.filter(i => i !== instrument)
      : [...current, instrument];
    setForm({ ...form, instrument: updated as any });
  };

  const toggleFormTechnique = (technique: string) => {
    const current = Array.isArray(form.technique) ? form.technique : (form.technique ? [form.technique] : []);
    const updated = current.includes(technique)
      ? current.filter(t => t !== technique)
      : [...current, technique];
    setForm({ ...form, technique: updated as any });
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

  const handleMarkAsPlayedNow = async () => {
    if (!song) return;

    try {
      setLoading(true);
      setError(null);
      const now = new Date().toISOString();
      const updatedSong = await songService.updateSong(song.uid, { lastPlayed: now });
      setSong(updatedSong);
      const { uid: _uid, createdAt, updatedAt, ...rest } = updatedSong;
      setForm(rest);
    } catch (err) {
      setError('Error while marking as played');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatLastPlayed = (dateString: string | undefined) => {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

        <div className="mb-4 flex items-center gap-4">
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-green-600 text-white px-3 py-2 hover:bg-green-700 disabled:opacity-50"
            onClick={handleMarkAsPlayedNow}
            disabled={loading}
          >
            Mark as played now
          </button>
          {song && (
            <div className="text-sm text-gray-600">
              Last played: <span className="font-medium">{formatLastPlayed(song.lastPlayed)}</span>
            </div>
          )}
        </div>

        <SongForm
          mode="edit"
          form={form}
          loading={loading}
          onChange={handleChange}
          onToggleInstrument={toggleFormInstrument}
          onToggleTechnique={toggleFormTechnique}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/songs')}
          onDelete={() => setDeleteDialogOpen(true)}
          tabsFirst
        />
      </div>
    </div>
  );
}

export default SongDetailPage;
