import { useEffect, useState } from 'react';
import { songService, type CreateSongDTO, type Song } from '../services/songService';
import { useAuth } from '../contexts/AuthContext';

const initialSong: CreateSongDTO = {
  title: '',
  bpm: 120,
  key: '',
  chords: '',
  tabs: '',
  instrument: '',
  artist: '',
  lastPlayed: undefined,
};

function SongsPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [form, setForm] = useState<CreateSongDTO>(initialSong);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [sortByLastPlayed, setSortByLastPlayed] = useState(false);
  const [page, setPage] = useState<'list' | 'form'>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, logout } = useAuth();

  useEffect(() => {
    loadSongs();
  }, []);

  const loadSongs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await songService.getAllSongs();
      setSongs(data);
    } catch (err) {
      setError('Error while loading songs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const markPlayedNow = async (uid: string) => {
    try {
      const updatedSong = await songService.updateSong(uid, {
        lastPlayed: new Date().toISOString(),
      });
      setSongs(songs.map(song => (song.uid === uid ? updatedSong : song)));
    } catch (err) {
      setError('Error while updating');
      console.error(err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: name === 'bpm' ? Number(value) : value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      if (editingUid !== null) {
        const updatedSong = await songService.updateSong(editingUid, form);
        setSongs(songs.map(song => (song.uid === editingUid ? updatedSong : song)));
        setEditingUid(null);
      } else {
        const newSong = await songService.createSong(form);
        setSongs([...songs, newSong]);
      }

      setForm(initialSong);
      setPage('list');
    } catch (err) {
      setError('Error while saving');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (uid: string) => {
    const song = songs.find(s => s.uid === uid);
    if (song) {
      const { uid: _uid, createdAt, updatedAt, ...rest } = song;
      setForm(rest);
      setEditingUid(uid);
    }
  };

  const handleDelete = async (uid: string) => {
    if (!confirm('Are you sure you want to delete this song?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await songService.deleteSong(uid);
      setSongs(songs.filter(song => song.uid !== uid));

      if (editingUid === uid) {
        setForm(initialSong);
        setEditingUid(null);
      }
    } catch (err) {
      setError('Error while deleting');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sortedSongs = sortByLastPlayed
    ? [...songs].sort((a, b) => {
        if (!a.lastPlayed && !b.lastPlayed) return 0;
        if (!a.lastPlayed) return 1;
        if (!b.lastPlayed) return -1;
        return new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime();
      })
    : songs;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {error && (
        <div className="mx-4 my-4 rounded-md border border-red-300 bg-red-50 text-red-700 p-3 flex items-center justify-between">
          <span>{error}</span>
          <button className="rounded-md px-2 py-1 hover:bg-red-100" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {page === 'list' ? (
        <>
          <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-semibold">Musician Tools</h1>
              <div className="flex items-center gap-3">
                {user && <span className="text-sm text-gray-600">Hello, {user.name}</span>}
                <button
                  className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600 disabled:opacity-50"
                  onClick={() => {
                    setForm(initialSong);
                    setEditingUid(null);
                    setPage('form');
                  }}
                  disabled={loading}
                >
                  Add a song
                </button>
                <button
                  className="inline-flex items-center rounded-md bg-gray-300 text-gray-800 px-3 py-2 hover:bg-gray-400 disabled:opacity-50"
                  onClick={async () => {
                    await logout();
                    window.location.href = '/';
                  }}
                  disabled={loading}
                >
                  Logout
                </button>
              </div>
            </div>
            <div className="mb-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input className="h-4 w-4" type="checkbox" checked={sortByLastPlayed} onChange={e => setSortByLastPlayed(e.target.checked)} />
                Sort by last played date
              </label>
            </div>
            <h2 className="text-lg font-medium mb-2">Song list</h2>
            {loading ? (
              <p>Loading...</p>
            ) : sortedSongs.length === 0 ? (
              <p>No songs saved.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-2 border-b">Artist</th>
                    <th className="text-left p-2 border-b">Title</th>
                    <th className="text-left p-2 border-b">BPM</th>
                    <th className="text-left p-2 border-b">Key</th>
                    <th className="text-left p-2 border-b">Instrument</th>
                    <th className="text-left p-2 border-b">Chord chart</th>
                    <th className="text-left p-2 border-b">Tabs</th>
                    <th className="text-left p-2 border-b">Actions</th>
                    <th className="text-left p-2 border-b">Last played</th>
                    <th className="text-left p-2 border-b">Play now</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSongs.map(song => (
                    <tr key={song.uid} className="border-b">
                      <td className="p-2 align-top">{song.artist}</td>
                      <td className="p-2 align-top">{song.title}</td>
                      <td className="p-2 align-top">{song.bpm}</td>
                      <td className="p-2 align-top">{song.key}</td>
                      <td className="p-2 align-top">{song.instrument}</td>
                      <td className="p-2 align-top">
                        <pre className="whitespace-pre-wrap text-xs">{song.chords}</pre>
                      </td>
                      <td className="p-2 align-top">
                        <pre className="whitespace-pre-wrap text-xs">{song.tabs}</pre>
                      </td>
                      <td className="p-2 align-top">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md bg-blue-600 text-white px-2 py-1 hover:bg-blue-700 disabled:opacity-50"
                          onClick={() => {
                            handleEdit(song.uid);
                            setPage('form');
                          }}
                          disabled={loading}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md bg-red-600 text-white px-2 py-1 hover:bg-red-700 disabled:opacity-50 ml-2"
                          onClick={() => handleDelete(song.uid)}
                          disabled={loading}
                        >
                          Delete
                        </button>
                      </td>
                      <td className="p-2 align-top">{song.lastPlayed ? new Date(song.lastPlayed).toLocaleString() : '-'}</td>
                      <td className="p-2 align-top">
                        <input
                          className="h-4 w-4"
                          type="checkbox"
                          checked={false}
                          onChange={() => markPlayedNow(song.uid)}
                          title="Mark as played now"
                          disabled={loading}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <div className="max-w-2xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Musician Tools</h1>
            <p className="text-sm text-gray-600">{editingUid ? 'Edit a song' : 'Add a song'}</p>
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
              <label className="block text-sm font-medium text-gray-700">Instrument</label>
              <select
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                name="instrument"
                value={form.instrument}
                onChange={handleChange}
                disabled={loading}
              >
                <option value="">-- Select --</option>
                <option value="Guitar">Guitar</option>
                <option value="Piano">Piano</option>
                <option value="Bass">Bass</option>
                <option value="Drums">Drums</option>
                <option value="Vocals">Vocals</option>
                <option value="Other">Other</option>
              </select>
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
              <textarea
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                name="tabs"
                value={form.tabs}
                onChange={handleChange}
                rows={2}
                disabled={loading}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Loading...' : editingUid ? 'Save' : 'Add'}
              </button>
              <button
                type="button"
                className="inline-flex items-center rounded-md bg-gray-100 text-gray-800 px-3 py-2 hover:bg-gray-200 disabled:opacity-50"
                onClick={() => {
                  setEditingUid(null);
                  setForm(initialSong);
                  setPage('list');
                }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default SongsPage;
