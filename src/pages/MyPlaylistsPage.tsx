import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { playlistService, type Playlist, type CreatePlaylistDTO } from '../services/playlistService';
import { songService, type Song } from '../services/songService';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

const initialPlaylist: CreatePlaylistDTO = {
  name: '',
  description: '',
  songUids: [],
};

function MyPlaylistsPage() {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [form, setForm] = useState<CreatePlaylistDTO>(initialPlaylist);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [page, setPage] = useState<'list' | 'form'>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUid, setDeleteUid] = useState<string | null>(null);
  const { user, logout } = useAuth();

  useEffect(() => {
    loadPlaylists();
    loadSongs();
  }, []);

  const loadPlaylists = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await playlistService.getAllPlaylists();
      setPlaylists(data);
    } catch (err) {
      setError('Error while loading playlists');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadSongs = async () => {
    try {
      const data = await songService.getAllSongs();
      setSongs(data);
    } catch (err) {
      console.error('Error while loading songs:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleToggleSong = (songUid: string) => {
    setForm(prevForm => {
      const current = prevForm.songUids || [];
      const updated = current.includes(songUid)
        ? current.filter(uid => uid !== songUid)
        : [...current, songUid];
      return { ...prevForm, songUids: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload: CreatePlaylistDTO = {
      ...form,
      songUids: form.songUids || [],
    };

    try {
      setLoading(true);
      setError(null);

      if (editingUid !== null) {
        const updatedPlaylist = await playlistService.updatePlaylist(editingUid, payload);
        setPlaylists(playlists.map(p => (p.uid === editingUid ? updatedPlaylist : p)));
        setEditingUid(null);
      } else {
        const newPlaylist = await playlistService.createPlaylist(payload);
        setPlaylists([...playlists, newPlaylist]);
      }

      setForm(initialPlaylist);
      setPage('list');
    } catch (err) {
      setError('Error while saving');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (uid: string) => {
    const playlist = playlists.find(p => p.uid === uid);
    if (playlist) {
      const { uid: _uid, createdAt, updatedAt, ...rest } = playlist;
      setForm(rest);
      setEditingUid(uid);
      setPage('form');
    }
  };

  const handleDelete = (uid: string) => {
    setDeleteDialogOpen(true);
    setDeleteUid(uid);
  };

  const handleConfirmDelete = async (uidToDelete: string) => {
    try {
      setLoading(true);
      setError(null);
      await playlistService.deletePlaylist(uidToDelete);
      setPlaylists(playlists.filter(p => p.uid !== uidToDelete));
      setDeleteDialogOpen(false);
      setDeleteUid(null);
    } catch (err) {
      setError('Error while deleting');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getSongTitle = (uid: string): string => {
    const song = songs.find(s => s.uid === uid);
    return song ? `${song.artist} - ${song.title}` : uid;
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="Delete playlist"
        message="Are you sure you want to delete this playlist?"
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (deleteUid) {
            handleConfirmDelete(deleteUid);
          }
        }}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteUid(null);
        }}
      />

      {error && (
        <div className="mx-4 my-4 rounded-md border border-red-300 bg-red-50 text-red-700 p-3 flex items-center justify-between">
          <span>{error}</span>
          <button className="rounded-md px-2 py-1 hover:bg-red-100" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {page === 'list' ? (
        <div className="container mx-auto px-4 py-8">
          <PageHeader loading={loading} />

          <h2 className="text-lg font-medium mb-4">My Playlists</h2>

          <div className="mb-4">
            <button
              className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600 disabled:opacity-50"
              onClick={() => {
                setForm(initialPlaylist);
                setEditingUid(null);
                setPage('form');
              }}
              disabled={loading}
            >
              Create Playlist
            </button>
          </div>

          {loading ? (
            <p>Loading...</p>
          ) : playlists.length === 0 ? (
            <p>No playlists yet. Create one to get started.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b">Name</th>
                  <th className="text-left p-2 border-b">Description</th>
                  <th className="text-left p-2 border-b">Songs</th>
                  <th className="text-left p-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {playlists.map(playlist => (
                  <tr key={playlist.uid} className="border-b hover:bg-gray-100">
                    <td className="p-2 align-top max-w-xs truncate font-semibold" title={playlist.name}>{playlist.name}</td>
                    <td className="p-2 align-top max-w-sm truncate text-gray-600" title={playlist.description}>{playlist.description || '-'}</td>
                    <td className="p-2 align-top text-gray-500">{playlist.songUids?.length || 0}</td>
                    <td className="p-2 align-top">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md bg-blue-600 text-white px-3 py-1 hover:bg-blue-700 disabled:opacity-50 text-sm"
                          onClick={() => handleEdit(playlist.uid)}
                          disabled={loading}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1 hover:bg-red-700 disabled:opacity-50 text-sm"
                          onClick={() => handleDelete(playlist.uid)}
                          disabled={loading}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto p-6">
          <div className="mb-6">
            <Link to="/" className="text-2xl font-semibold text-gray-900 hover:text-brand-500 transition">Musician Tools</Link>
            <p className="text-sm text-gray-600">{editingUid ? 'Edit playlist' : 'Create new playlist'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="playlist-name" className="block text-sm font-medium text-gray-700">Name</label>
              <input
                id="playlist-name"
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="playlist-description" className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                id="playlist-description"
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                name="description"
                value={form.description || ''}
                onChange={handleChange}
                rows={4}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Songs</label>
              <div className="border border-gray-200 rounded-md max-h-96 overflow-y-auto">
                {songs.length === 0 ? (
                  <p className="p-3 text-sm text-gray-600">No songs available. Create songs first.</p>
                ) : (
                  <div className="space-y-2 p-3">
                    {songs.map(song => (
                      <label key={song.uid} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(form.songUids || []).includes(song.uid)}
                          onChange={() => handleToggleSong(song.uid)}
                          disabled={loading}
                          className="h-4 w-4 rounded border border-gray-300"
                        />
                        <span className="text-sm">{song.artist} - {song.title}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center rounded-md bg-brand-500 text-white px-4 py-2 hover:bg-brand-600 disabled:opacity-50"
                disabled={loading}
              >
                {editingUid ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                className="flex-1 inline-flex items-center justify-center rounded-md bg-gray-300 text-gray-800 px-4 py-2 hover:bg-gray-400 disabled:opacity-50"
                onClick={() => {
                  setForm(initialPlaylist);
                  setEditingUid(null);
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

export default MyPlaylistsPage;
