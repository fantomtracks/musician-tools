import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { SongForm } from '../components/SongForm';
import { instrumentService, type Instrument } from '../services/instrumentService';
import { playlistService, type Playlist } from '../services/playlistService';
import { songPlayService, type SongPlay } from '../services/songPlayService';
import { songService, type CreateSongDTO, type Song } from '../services/songService';
import { toSlug } from '../utils/slug';

function SongDetailPage() {
  const { artist, title } = useParams<{ artist: string; title: string }>();
  const navigate = useNavigate();

  const [song, setSong] = useState<Song | null>(null);
  const [form, setForm] = useState<CreateSongDTO>({
    title: '',
    bpm: null,
    key: '',
    notes: '',
    tabs: '',
    instrument: [],
    instrumentDifficulty: {},
    instrumentLinks: {},
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
  const [myInstruments, setMyInstruments] = useState<Instrument[]>([]);
  const [songPlays, setSongPlays] = useState<SongPlay[]>([]);
  const [selectedInstrumentType, setSelectedInstrumentType] = useState<string>('');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistUids, setSelectedPlaylistUids] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSong();
    (async () => {
      try {
        const list = await instrumentService.getAll();
        setMyInstruments(list);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [artist, title]);

  const handleTogglePlaylist = (playlistUid: string) => {
    const next = new Set(selectedPlaylistUids);
    if (next.has(playlistUid)) {
      next.delete(playlistUid);
    } else {
      next.add(playlistUid);
    }
    setSelectedPlaylistUids(next);
  };

  const loadSong = async () => {
    if (!artist || !title) return;

    try {
      setLoading(true);
      setError(null);

      const songs = await songService.getAllSongs();
      const found = songs.find(
        s => toSlug(s.artist) === artist && toSlug(s.title) === title
      );

      if (!found) {
        setError('Song not found');
        return;
      }

      setSong(found);

      try {
        const plays = await songPlayService.getPlays(found.uid);
        setSongPlays(plays);
      } catch (err) {
        console.error('Failed to load plays:', err);
        setSongPlays([]);
      }

      try {
        const allPlaylists = await playlistService.getAllPlaylists();
        setPlaylists(allPlaylists);
        const containing = new Set(
          allPlaylists
            .filter(p => (p.songUids || []).includes(found.uid))
            .map(p => p.uid)
        );
        setSelectedPlaylistUids(containing);
      } catch (err) {
        console.error('Failed to load playlists:', err);
      }

      const { uid: _uid, createdAt, updatedAt, ...rest } = found;
      const normalized: CreateSongDTO = {
        ...rest,
        instrument: Array.isArray(rest.instrument)
          ? rest.instrument
          : rest.instrument
            ? [rest.instrument as unknown as string]
            : [],
        technique: Array.isArray(rest.technique)
          ? rest.technique
          : rest.technique
            ? [rest.technique as unknown as string]
            : [],
        myInstrumentUid: rest.myInstrumentUid || undefined,
        instrumentDifficulty: rest.instrumentDifficulty || {},
        instrumentLinks: rest.instrumentLinks || {},
      };
      setForm(normalized);
    } catch (err) {
      setError('Error while loading song');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === 'bpm') {
      setForm({ ...form, bpm: value === '' ? null : Number(value) });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const changeFormInstruments = (instruments: string[]) => {
    setForm(prev => {
      const nextDifficulty = { ...(prev.instrumentDifficulty || {}) };
      Object.keys(nextDifficulty).forEach(key => {
        if (!instruments.includes(key)) {
          delete nextDifficulty[key];
        }
      });

      return { ...prev, instrument: instruments, instrumentDifficulty: nextDifficulty };
    });
    setSelectedInstrumentType(instruments[0] || '');
  };

  const setFormMyInstrumentUid = (uid: string | undefined) => {
    setForm(prev => ({ ...prev, myInstrumentUid: uid }));
  };

  const setFormTechniques = (techniques: string[]) => {
    setForm(prev => ({ ...prev, technique: techniques }));
  };

  const setFormTunning = (tunning: string | null) => {
    setForm(prev => ({ ...prev, tunning: tunning || undefined }));
  };

  const setInstrumentLinksForInstrument = (
    instrumentType: string,
    links: Array<{ label?: string; url: string }>
  ) => {
    setForm(prev => ({
      ...prev,
      instrumentLinks: {
        ...(prev.instrumentLinks || {}),
        [instrumentType]: links,
      },
    }));
  };

  const setInstrumentDifficulty = (
    instrumentType: string,
    difficulty: number | null
  ) => {
    setForm(prev => {
      const next = { ...(prev.instrumentDifficulty || {}) };
      if (difficulty === null || Number.isNaN(difficulty)) {
        delete next[instrumentType];
      } else {
        next[instrumentType] = difficulty;
      }
      return { ...prev, instrumentDifficulty: next };
    });
  };

  const toggleFormTechnique = (technique: string) => {
    setForm(prev => {
      const current = Array.isArray(prev.technique)
        ? prev.technique
        : prev.technique
          ? [prev.technique]
          : [];
      const updated = current.includes(technique)
        ? current.filter(t => t !== technique)
        : [...current, technique];
      return { ...prev, technique: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!song) return;

    const payload: CreateSongDTO = {
      ...form,
      instrument: form.instrument && form.instrument.length > 0 ? form.instrument : null,
      technique: form.technique && form.technique.length > 0 ? form.technique : [],
      myInstrumentUid: form.myInstrumentUid ? form.myInstrumentUid : undefined,
      instrumentDifficulty: form.instrumentDifficulty || {},
      instrumentLinks: form.instrumentLinks || {},
    };

    try {
      setLoading(true);
      setError(null);

      // Reload playlists to use the freshest data
      const latestPlaylists = await playlistService.getAllPlaylists();
      setPlaylists(latestPlaylists);

      // For each playlist, compute the desired songUids and update only if changed
      await Promise.all(
        latestPlaylists.map(async playlist => {
          const hasSong = (playlist.songUids || []).includes(song.uid);
          const shouldHaveSong = selectedPlaylistUids.has(playlist.uid);

          if (shouldHaveSong && !hasSong) {
            const nextSongUids = [...(playlist.songUids || []), song.uid];
            await playlistService.updatePlaylist(playlist.uid, { songUids: nextSongUids });
          } else if (!shouldHaveSong && hasSong) {
            const nextSongUids = (playlist.songUids || []).filter(uid => uid !== song.uid);
            await playlistService.updatePlaylist(playlist.uid, { songUids: nextSongUids });
          }
        })
      );

      await songService.updateSong(song.uid, payload);
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

  const handleMarkAsPlayedNow = async (instrumentType: string) => {
    if (!song) return;

    try {
      setLoading(true);
      setError(null);
      await songPlayService.markPlayed(song.uid, { instrumentType });
      const plays = await songPlayService.getPlays(song.uid);
      setSongPlays(plays);
      const now = new Date().toISOString();
      await songService.updateSong(song.uid, { lastPlayed: now });
    } catch (err) {
      setError('Error while marking as played');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getLastPlayedForInstrument = (): string | undefined => {
    if (songPlays.length === 0) return undefined;
    if (selectedInstrumentType) {
      const plays = songPlays.filter(p => p.instrumentType === selectedInstrumentType);
      return plays.length > 0 ? plays[0].playedAt : undefined;
    }
    return songPlays[0].playedAt;
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

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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
            <Link
              to="/"
              className="text-2xl font-semibold text-gray-900 hover:text-brand-500 transition"
            >
              Musician Tools
+            </Link>
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
          <button
            className="rounded-md px-2 py-1 hover:bg-red-100"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="container mx-auto px-4 py-8">
        <PageHeader loading={loading} />
        <div className="max-w-2xl mx-auto mt-6">
          <p className="text-sm text-gray-600 mb-6">Edit song</p>
          <SongForm
            mode="edit"
            form={form}
            loading={loading}
            onChange={handleChange}
            onChangeInstruments={changeFormInstruments}
            onSetInstrumentDifficulty={setInstrumentDifficulty}
            onSetMyInstrumentUid={setFormMyInstrumentUid}
            onSetTechniques={setFormTechniques}
            onSetTunning={setFormTunning}
            onToggleTechnique={toggleFormTechnique}
            onSetInstrumentLinksForInstrument={setInstrumentLinksForInstrument}
            onMarkAsPlayedNow={handleMarkAsPlayedNow}
            songPlays={songPlays}
            formatLastPlayed={formatLastPlayed}
            onSubmit={handleSubmit}
            onCancel={() => navigate('/songs')}
            onDelete={() => setDeleteDialogOpen(true)}
            tabsFirst
            myInstruments={myInstruments.map(i => ({
              uid: i.uid,
              name: i.name,
              type: i.type,
            }))}
            playlistSlot={(
              <div className="mt-8 space-y-3">
                <h2 className="text-base font-semibold text-gray-900">Add to playlists</h2>
                {playlists.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No playlists found.{' '}
                    <Link
                      to="/my-playlists"
                      className="text-brand-500 hover:text-brand-600"
                    >
                      Create one
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-1">
                    {playlists.map(playlist => (
                      <label
                        key={playlist.uid}
                        className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPlaylistUids.has(playlist.uid)}
                          onChange={() => handleTogglePlaylist(playlist.uid)}
                          className="rounded border-gray-300"
                        />
                        <div className="flex-1">
                          <p className="text-gray-900">{playlist.name}</p>
                          {playlist.description && (
                            <p className="text-sm text-gray-600">{playlist.description}</p>
                          )}
                        </div>
                        <span className="text-sm text-gray-500">
                          {(playlist.songUids || []).length} songs
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default SongDetailPage;
