import { useEffect, useState } from 'react';
// ...existing code...
import { playlistService, type Playlist, type CreatePlaylistDTO } from '../services/playlistService';
import { songService, type Song } from '../services/songService';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

const initialPlaylist: CreatePlaylistDTO = {
  name: '',
  description: '',
  songUids: [],
};

// Guarded "Artist - Title" label (drop the dash when the artist is empty), aligned on
// the canonical formatSongLabel pattern so an artist-less song never shows "- Title".
const formatSongLabel = (song: Song): string =>
  song.artist ? `${song.artist} - ${song.title}` : song.title;

function MyPlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  // Distinguishes "catalog not loaded yet / load failed" from "song genuinely
  // deleted" — the orphan filter must only hide UIDs once the catalog is known,
  // otherwise a slow/failed getAllSongs would blank out valid playlist songs.
  const [songsLoaded, setSongsLoaded] = useState(false);
  const [form, setForm] = useState<CreatePlaylistDTO>(initialPlaylist);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [page, setPage] = useState<'list' | 'form'>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUid, setDeleteUid] = useState<string | null>(null);
  const [songSearch, setSongSearch] = useState<string>('');
  useAuth(); // keep auth context alive; no direct usage here

  useEffect(() => {
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
        setSongsLoaded(true);
      } catch (err) {
        // Leave songsLoaded false: we can't tell orphans from valid songs, so
        // the list falls back to showing the raw UID rather than hiding content
        console.error('Error while loading songs:', err);
      }
    };
    loadPlaylists();
    loadSongs();
  }, []);

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
      const { uid: _uid, ...rest } = playlist;
      setForm(rest);
      setEditingUid(uid);
      setPage('form');
    }
  };

  const handleDelete = (uid: string) => {
    setDeleteUid(uid);
    setDeleteDialogOpen(true);
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
    return song ? formatSongLabel(song) : uid;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-950 text-gray-900 dark:text-gray-100">
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
        <div className="mx-4 my-4 card-base glass-effect text-red-700 bg-red-50/80 border border-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button className="btn-secondary text-xs" type="button" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {page === 'list' ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

          <div className="card-base glass-effect p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Playlists</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Organize your songs by mood or practice focus.</p>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setForm(initialPlaylist);
                  setEditingUid(null);
                  setSongSearch('');
                  setPage('form');
                }}
                disabled={loading}
              >
                Create Playlist
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
            ) : playlists.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">No playlists yet. Create one to get started.</p>
            ) : (
              <div className="card-base overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm">
                      <tr>
                        <th className="text-left p-2 border-b dark:border-gray-700 uppercase text-xs font-semibold tracking-wide">Name</th>
                        <th className="text-left p-2 border-b dark:border-gray-700 uppercase text-xs font-semibold tracking-wide">Description</th>
                        <th className="text-left p-2 border-b dark:border-gray-700 uppercase text-xs font-semibold tracking-wide">Songs</th>
                        <th className="text-left p-2 border-b dark:border-gray-700 uppercase text-xs font-semibold tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playlists.map(playlist => (
                        <tr key={playlist.uid} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="p-2 align-middle font-medium text-gray-900 dark:text-gray-100">{playlist.name}</td>
                          <td className="p-2 align-middle max-w-md whitespace-pre-wrap text-gray-700 dark:text-gray-300">{playlist.description || '-'}</td>
                          <td className="p-2 align-middle">
                            {/* Defensive: a deleted song can linger as an orphan UID in
                                songUids (no FK — see Story 5.6). Once the catalog is loaded,
                                hide unresolved UIDs so a raw hash is never rendered (the
                                backend now also strips them). Before load / on load failure,
                                keep them: never blank out valid songs we just can't resolve. */}
                            {(playlist.songUids || []).filter(uid => !songsLoaded || songs.some(s => s.uid === uid)).map(uid => (
                              <div key={uid} className="text-xs text-gray-700 dark:text-gray-300">{getSongTitle(uid)}</div>
                            ))}
                          </td>
                          <td className="p-2 align-middle">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn-secondary text-sm"
                                onClick={() => handleEdit(playlist.uid)}
                                disabled={loading}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 disabled:opacity-50 text-sm"
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
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="card-base glass-effect p-6 space-y-6">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{editingUid ? 'Edit playlist' : 'Create playlist'}</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="playlist-name" className="label-base">Name</label>
                <input
                  id="playlist-name"
                  className="input-base"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="playlist-description" className="label-base">Description</label>
                <textarea
                  id="playlist-description"
                  className="input-base"
                  name="description"
                  value={form.description || ''}
                  onChange={handleChange}
                  rows={4}
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="playlist-song-search" className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-3">Songs</label>
                <div className="relative mb-3">
                  <input
                    id="playlist-song-search"
                    type="text"
                    placeholder="Search songs..."
                    value={songSearch}
                    onChange={(e) => setSongSearch(e.target.value)}
                    className="input-base w-full pr-10"
                    disabled={loading}
                  />
                  {songSearch && (
                    <button
                      type="button"
                      onClick={() => setSongSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg font-bold"
                      title="Clear search"
                      disabled={loading}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="card-base max-h-96 overflow-y-auto">
                  {songs.length === 0 ? (
                    <p className="p-3 text-sm text-gray-600 dark:text-gray-400">No songs available. Create songs first.</p>
                  ) : (
                    <div className="space-y-2 p-3">
                      {songs.filter(song => {
                        const searchLower = songSearch.toLowerCase();
                        const songDisplay = formatSongLabel(song).toLowerCase();
                        return songDisplay.includes(searchLower);
                      }).sort((a, b) => {
                        const aDisplay = formatSongLabel(a).toLowerCase();
                        const bDisplay = formatSongLabel(b).toLowerCase();
                        return aDisplay.localeCompare(bDisplay);
                      }).map(song => (
                        <label key={song.uid} className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(form.songUids || []).includes(song.uid)}
                            onChange={() => handleToggleSong(song.uid)}
                            disabled={loading}
                            className="h-4 w-4 rounded border border-gray-300 dark:border-gray-600 accent-brand-500 dark:accent-brand-400"
                          />
                          <span className="text-sm dark:text-gray-100">{formatSongLabel(song)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1 justify-center"
                  onClick={() => {
                    setForm(initialPlaylist);
                    setEditingUid(null);
                    setSongSearch('');
                    setPage('list');
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1 justify-center"
                  disabled={loading}
                >
                  {editingUid ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyPlaylistsPage;
