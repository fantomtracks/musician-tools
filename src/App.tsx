import React, { useState } from 'react';

type Song = {
  id: number;
  title: string;
  bpm: number;
  key: string;
  chords: string;
  tabs: string;
  instrument: string;
  artist: string;
  lastPlayed?: string; // ISO date string
};


const initialSong: Omit<Song, 'id'> = {
  title: '',
  bpm: 120,
  key: '',
  chords: '',
  tabs: '',
  instrument: '',
  artist: '',
  lastPlayed: undefined,
};

function App() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [form, setForm] = useState(initialSong);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sortByLastPlayed, setSortByLastPlayed] = useState(false);
  const [page, setPage] = useState<'list' | 'form'>('list');

  // Fonction pour marquer une chanson comme jouée maintenant
  const markPlayedNow = (id: number) => {
    setSongs(songs => songs.map(song => song.id === id ? { ...song, lastPlayed: new Date().toISOString() } : song));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: name === 'bpm' ? Number(value) : value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId !== null) {
      setSongs(songs.map(song => song.id === editingId ? { ...song, ...form, id: editingId } : song));
      setEditingId(null);
    } else {
      const newSong: Song = { ...form, id: Date.now() };
      setSongs([...songs, newSong]);
    }
    setForm(initialSong);
    setPage('list');
  };

  const handleEdit = (id: number) => {
    const song = songs.find(s => s.id === id);
    if (song) {
      // On retire l'id du song pour le form
      const { id: _id, ...rest } = song;
      setForm(rest);
      setEditingId(id);
    }
  };

  const handleDelete = (id: number) => {
    setSongs(songs.filter(song => song.id !== id));
    if (editingId === id) {
      setForm(initialSong);
      setEditingId(null);
    }
  };

  // Tri des chansons si demandé
  const sortedSongs = sortByLastPlayed
    ? [...songs].sort((a, b) => {
        if (!a.lastPlayed && !b.lastPlayed) return 0;
        if (!a.lastPlayed) return 1;
        if (!b.lastPlayed) return -1;
        return new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime();
      })
    : songs;

  return (
    <div className="App" style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, boxSizing: 'border-box' }}>
      {page === 'list' ? (
        <>
          <h1>Musician Tools</h1>
          <button style={{ marginBottom: 24 }} onClick={() => { setForm(initialSong); setEditingId(null); setPage('form'); }}>Ajouter une chanson</button>
          <div style={{ marginBottom: 16 }}>
            <label>
              <input type="checkbox" checked={sortByLastPlayed} onChange={e => setSortByLastPlayed(e.target.checked)} />
              Trier par date du dernier joué
            </label>
          </div>
          <h2>Liste des chansons</h2>
          {sortedSongs.length === 0 ? <p>Aucune chanson enregistrée.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Artiste</th>
                  <th>Titre</th>
                  <th>BPM</th>
                  <th>Tonalité</th>
                  <th>Instrument</th>
                  <th>Grille d'accords</th>
                  <th>Tabs</th>
                  <th>Actions</th>
                  <th>Dernier joué</th>
                  <th>Joué maintenant</th>
                </tr>
              </thead>
              <tbody>
                {sortedSongs.map(song => (
                  <tr key={song.id} style={{ borderBottom: '1px solid #ccc' }}>
                    <td>{song.artist}</td>
                    <td>{song.title}</td>
                    <td>{song.bpm}</td>
                    <td>{song.key}</td>
                    <td>{song.instrument}</td>
                    <td><pre style={{ whiteSpace: 'pre-wrap' }}>{song.chords}</pre></td>
                    <td><pre style={{ whiteSpace: 'pre-wrap' }}>{song.tabs}</pre></td>
                    <td>
                      <button type="button" onClick={() => { handleEdit(song.id); setPage('form'); }}>Éditer</button>
                      <button type="button" onClick={() => handleDelete(song.id)} style={{ marginLeft: 8 }}>Supprimer</button>
                    </td>
                    <td>{song.lastPlayed ? new Date(song.lastPlayed).toLocaleString() : '-'}</td>
                    <td>
                      <input type="checkbox" checked={false} onChange={() => markPlayedNow(song.id)} title="Marquer comme joué maintenant" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
  <div style={{ maxWidth: 700, margin: '40px auto', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h1>Musician Tools</h1>
          <h2>{editingId ? 'Modifier une chanson' : 'Ajouter une chanson'}</h2>
          <form onSubmit={handleSubmit} style={{ marginBottom: 30 }}>
            <div>
              <label>Artiste : <input name="artist" value={form.artist} onChange={handleChange} /></label>
            </div>
            <div>
              <label>Titre : <input name="title" value={form.title} onChange={handleChange} required /></label>
            </div>
            <div>
              <label>BPM : <input name="bpm" type="number" value={form.bpm} onChange={handleChange} required min={1} /></label>
            </div>
            <div>
              <label>Tonalité : <input name="key" value={form.key} onChange={handleChange} /></label>
            </div>
            <div>
              <label>Instrument :
                <select name="instrument" value={form.instrument} onChange={handleChange}>
                  <option value="">-- Sélectionner --</option>
                  <option value="Guitare">Guitare</option>
                  <option value="Piano">Piano</option>
                  <option value="Basse">Basse</option>
                  <option value="Batterie">Batterie</option>
                  <option value="Chant">Chant</option>
                  <option value="Autre">Autre</option>
                </select>
              </label>
            </div>
            <div>
              <label>Grille d'accords : <textarea name="chords" value={form.chords} onChange={handleChange} rows={2} /></label>
            </div>
            <div>
              <label>Tabs : <textarea name="tabs" value={form.tabs} onChange={handleChange} rows={2} /></label>
            </div>
            <button type="submit">{editingId ? 'Enregistrer' : 'Ajouter'}</button>
            <button type="button" style={{ marginLeft: 8 }} onClick={() => { setEditingId(null); setForm(initialSong); setPage('list'); }}>Annuler</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
