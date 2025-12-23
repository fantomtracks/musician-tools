import React from 'react';
import type { CreateSongDTO } from '../services/songService';

type Mode = 'add' | 'edit';

type SongFormProps = {
  mode: Mode;
  form: CreateSongDTO;
  loading: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onToggleInstrument: (instrument: string) => void;
  onToggleTechnique: (technique: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
  tabsFirst?: boolean;
};

const instrumentOptions = ['Guitar', 'Piano', 'Bass', 'Drums', 'Vocals', 'Other'];
const tuningOptions = [
  { value: '', label: 'Select a tuning' },
  { value: 'EADGBE', label: 'EADGBE (Standard)' },
  { value: 'DADGBE', label: 'DADGBE (Drop D)' },
  { value: 'EbAbDbGbBbEb', label: 'EbAbDbGbBbEb (Half-step down)' },
  { value: 'DADGAD', label: 'DADGAD' },
  { value: 'DGDGBD', label: 'DGDGBD (Open G)' },
  { value: 'Other', label: 'Other' },
];

const keyOptions = ['C','C#','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B'];
const techniqueOptions = ['Slap','Pick','Tapping','Fingerstyle','Strumming','Palm Mute','Harmonics','Solo','Other'];

export function SongForm({ mode, form, loading, onChange, onToggleInstrument, onToggleTechnique, onSubmit, onCancel, onDelete, tabsFirst }: SongFormProps) {
  const currentInstruments = Array.isArray(form.instrument) ? form.instrument : [];
  const currentTechniques = Array.isArray(form.technique) ? form.technique : [];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {tabsFirst && (
        <div>
          <label htmlFor="song-tabs" className="block text-sm font-medium text-gray-700">Tabs</label>
          <div className="mt-1 flex gap-2">
            <input
              id="song-tabs"
              className="block flex-1 rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              type="url"
              name="tabs"
              placeholder="https://example.com/tabs"
              value={form.tabs}
              onChange={onChange}
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
      )}
      <div>
        <label htmlFor="song-artist" className="block text-sm font-medium text-gray-700">Artist</label>
        <input
          id="song-artist"
          className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          name="artist"
          value={form.artist}
          onChange={onChange}
          disabled={loading}
        />
      </div>
      <div>
        <label htmlFor="song-title" className="block text-sm font-medium text-gray-700">Title</label>
        <input
          id="song-title"
          className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          name="title"
          value={form.title}
          onChange={onChange}
          required
          disabled={loading}
        />
      </div>
      <div>
        <label htmlFor="song-album" className="block text-sm font-medium text-gray-700">Album</label>
        <input
          id="song-album"
          className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          name="album"
          value={typeof form.album === 'string' ? form.album : ''}
          onChange={onChange}
          disabled={loading}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="song-bpm" className="block text-sm font-medium text-gray-700">BPM</label>
          <input
            id="song-bpm"
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            name="bpm"
            type="number"
            value={form.bpm ?? ''}
            onChange={onChange}
            min={0}
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="song-key" className="block text-sm font-medium text-gray-700">Key</label>
          <select
            id="song-key"
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            name="key"
            value={form.key || ''}
            onChange={onChange}
            disabled={loading}
          >
            <option value="">Select a key</option>
            {keyOptions.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="song-tuning" className="block text-sm font-medium text-gray-700">Tuning</label>
          <select
            id="song-tuning"
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            name="tunning"
            value={typeof form.tunning === 'string' ? form.tunning : ''}
            onChange={onChange}
            disabled={loading}
          >
            {tuningOptions.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="song-pitch-standard" className="block text-sm font-medium text-gray-700">Pitch Standard (Hz)</label>
          <input
            id="song-pitch-standard"
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            name="pitchStandard"
            type="number"
            value={form.pitchStandard ?? 440}
            onChange={onChange}
            min={400}
            max={500}
            disabled={loading}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Instruments</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {instrumentOptions.map(inst => (
            <label key={inst} className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={currentInstruments.includes(inst)}
                onChange={() => onToggleInstrument(inst)}
                disabled={loading}
              />
              <span className="text-sm cursor-pointer">{inst}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Techniques</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {techniqueOptions.map(t => (
            <label key={t} className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={currentTechniques.includes(t)}
                onChange={() => onToggleTechnique(t)}
                disabled={loading}
              />
              <span className="text-sm cursor-pointer">{t}</span>
            </label>
          ))}
        </div>
      </div>
      
      <div>
        <label htmlFor="song-chords" className="block text-sm font-medium text-gray-700">Chord chart</label>
        <textarea
          id="song-chords"
          className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          name="chords"
          value={form.chords}
          onChange={onChange}
          rows={2}
          disabled={loading}
        />
      </div>
      <div>
        {!tabsFirst && (
          <>
            <label htmlFor="song-tabs" className="block text-sm font-medium text-gray-700">Tabs</label>
            <div className="mt-1 flex gap-2">
              <input
                id="song-tabs"
                className="block flex-1 rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                type="url"
                name="tabs"
                placeholder="https://example.com/tabs"
                value={form.tabs}
                onChange={onChange}
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
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          {mode === 'edit' && onDelete && (
            <button
              type="button"
              className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-2 hover:bg-red-700 disabled:opacity-50"
              onClick={onDelete}
              disabled={loading}
            >
              Delete
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-gray-100 text-gray-800 px-3 py-2 hover:bg-gray-200 disabled:opacity-50"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Loading...' : mode === 'edit' ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </form>
  );
}
