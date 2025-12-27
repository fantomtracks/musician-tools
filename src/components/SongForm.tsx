import { useEffect, useState } from 'react';
import type React from 'react';
import type { CreateSongDTO } from '../services/songService';
import type { SongPlay } from '../services/songPlayService';
import { instrumentTypeOptions, instrumentTechniquesMap, instrumentTuningsMap } from '../constants/instrumentTypes';

type Mode = 'add' | 'edit';

type SongFormProps = {
  mode: Mode;
  form: CreateSongDTO;
  loading: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onChangeInstruments: (instruments: string[]) => void;
  onSetTechniques: (techniques: string[]) => void;
  onSetInstrumentDifficulty?: (instrumentType: string, difficulty: number | null) => void;
  onSetMyInstrumentUid: (uid: string | undefined) => void;
  onSetTunning: (tunning: string | null) => void;
  onToggleTechnique: (technique: string) => void;
  onSetInstrumentLinksForInstrument?: (instrumentType: string, links: Array<{ label?: string; url: string }>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onMarkAsPlayedNow?: (instrumentType: string) => void;
  songPlays?: SongPlay[];
  formatLastPlayed?: (dateString: string | undefined) => string;
  tabsFirst?: boolean;
  myInstruments?: Array<{ uid: string; name: string; type?: string | null }>;
  playlistSlot?: React.ReactNode;
};

const keyOptions = ['C','C#','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B'];

const getAvailableTechniques = (instrumentType: string) => {
  if (!instrumentType) return [];
  return instrumentTechniquesMap[instrumentType] || [];
};

const getAvailableTunings = (instrumentType: string) => {
  if (!instrumentType) return [];
  return instrumentTuningsMap[instrumentType] || [];
};


const getLastPlayedForInstrument = (instrumentType: string, plays: SongPlay[] = [], formatter: (date: string | undefined) => string = (d) => d || '-'): string => {
  if (!plays || plays.length === 0) return '-';
  const instrumentPlays = plays.filter(p => p.instrumentType === instrumentType);
  if (instrumentPlays.length === 0) return '-';
  return formatter(instrumentPlays[0].playedAt);
};

export function SongForm({ mode, form, loading, onChange, onChangeInstruments, onSetTechniques, onSetInstrumentDifficulty, onSetMyInstrumentUid, onSetTunning, onToggleTechnique, onSetInstrumentLinksForInstrument, onSubmit, onCancel, onDelete, onMarkAsPlayedNow, songPlays, formatLastPlayed, tabsFirst, myInstruments, playlistSlot }: SongFormProps) {
  const currentInstruments = Array.isArray(form.instrument) ? form.instrument : (form.instrument ? [form.instrument] : []);
  const currentTechniques = Array.isArray(form.technique) ? form.technique : [];
  const [selectedInstrumentType, setSelectedInstrumentType] = useState('');
  const [expandedInstruments, setExpandedInstruments] = useState<Set<string>>(new Set(currentInstruments));
  const [detailsAccordionOpen, setDetailsAccordionOpen] = useState(false);
  const [newLinkInputs, setNewLinkInputs] = useState<Record<string, { label: string; url: string }>>({});
  const availableTechniques = getAvailableTechniques(selectedInstrumentType);
  const filteredMyInstruments = selectedInstrumentType && myInstruments && myInstruments.length > 0
    ? myInstruments.filter(mi => (mi.type || '').toLowerCase() === selectedInstrumentType.toLowerCase())
    : [];
  const allInstrumentLinks = Object.entries(form.instrumentLinks || {}).flatMap(([type, arr]) => (arr || []).map(l => ({ type, url: l.url, label: l.label })));

  useEffect(() => {
    // Filter out techniques that are not available for any of the current instruments
    if (currentInstruments.length === 0 && currentTechniques.length > 0) {
      onSetTechniques([]);
      return;
    }

    const allAvailableTechniques = new Set<string>();
    currentInstruments.forEach(inst => {
      const techniques = getAvailableTechniques(inst);
      techniques.forEach(t => allAvailableTechniques.add(t));
    });

    const nextTechniques = currentTechniques.filter(t => allAvailableTechniques.has(t));
    if (nextTechniques.length !== currentTechniques.length) {
      onSetTechniques(nextTechniques);
    }
  }, [currentInstruments, currentTechniques, onSetTechniques]);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Top quick links aggregated from all instruments */}
      {allInstrumentLinks.length > 0 && (
        <div className="border border-gray-200 rounded-md bg-white">
          <div className="p-2 flex items-center justify-between">
            <span className="font-medium">Quick Links</span>
          </div>
          <div className="p-3 pt-0 flex flex-wrap gap-2">
            {allInstrumentLinks.map((lnk, idx) => (
              <button
                key={`quick-link-${idx}`}
                type="button"
                className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-1 text-sm hover:bg-brand-600 disabled:opacity-50"
                onClick={() => {
                  if (lnk.url && (lnk.url.startsWith('http://') || lnk.url.startsWith('https://'))) {
                    window.open(lnk.url, '_blank');
                  }
                }}
                title={`${lnk.label || lnk.url} • ${lnk.type}`}
              >
                <span className="mr-2 inline-flex items-center rounded bg-white/20 px-2 py-0.5 text-xs">{lnk.type}</span>
                <span className="truncate max-w-[12rem]">{lnk.label || lnk.url}</span>
              </button>
            ))}
          </div>
        </div>
      )}
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
      <div className="border border-gray-200 rounded-md">
        <button
          type="button"
          className="w-full flex items-center justify-between p-2 hover:bg-gray-50"
          onClick={() => setDetailsAccordionOpen(!detailsAccordionOpen)}
          aria-expanded={detailsAccordionOpen}
        >
          <span className="font-medium">Details</span>
          <span>{detailsAccordionOpen ? '▾' : '▸'}</span>
        </button>
        {detailsAccordionOpen && (
          <div className="mt-0 space-y-4 p-3 border-t border-gray-200 bg-gray-50">
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
            <div className="grid grid-cols-3 gap-4">
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
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Instruments</label>
        <div className="space-y-2">
          {currentInstruments.map((instrumentType) => {
            const isExpanded = expandedInstruments.has(instrumentType);
            const filteredMyInstruments = instrumentType && myInstruments && myInstruments.length > 0
              ? myInstruments.filter(mi => (mi.type || '').toLowerCase() === instrumentType.toLowerCase())
              : [];
            const instrumentTechniques = getAvailableTechniques(instrumentType);
            
            return (
              <div key={instrumentType} className="border border-gray-200 rounded-md">
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-2 hover:bg-gray-50"
                  onClick={() => {
                    const next = new Set(expandedInstruments);
                    if (next.has(instrumentType)) {
                      next.delete(instrumentType);
                    } else {
                      next.add(instrumentType);
                    }
                    setExpandedInstruments(next);
                  }}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{instrumentType}</span>
                    {formatLastPlayed && (
                      <span className="text-sm text-gray-600">
                        Last played: <span className="font-medium">{getLastPlayedForInstrument(instrumentType, songPlays, formatLastPlayed)}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {onMarkAsPlayedNow && mode === 'edit' && (
                      <button
                        type="button"
                        className="inline-flex items-center rounded-md bg-green-600 text-white px-2 py-1 text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkAsPlayedNow(instrumentType);
                        }}
                        disabled={loading}
                        title="Mark this instrument as played"
                      >
                        Mark as played
                      </button>
                    )}
                    <button
                      type="button"
                      className="inline-flex items-center rounded-md bg-red-600 text-white px-2 py-1 text-sm hover:bg-red-700 disabled:opacity-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeInstruments(currentInstruments.filter(i => i !== instrumentType));
                        const next = new Set(expandedInstruments);
                        next.delete(instrumentType);
                        setExpandedInstruments(next);
                      }}
                      disabled={loading}
                      title="Remove this instrument"
                    >
                      ✕
                    </button>
                    <span>{isExpanded ? '▾' : '▸'}</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="mt-0 space-y-4 p-3 border-t border-gray-200 bg-gray-50">
                    {filteredMyInstruments && filteredMyInstruments.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">My instrument</label>
                        <select
                          className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          name="myInstrumentUid"
                          value={form.myInstrumentUid || ''}
                          onChange={onChange}
                          disabled={loading}
                        >
                          <option value="">Select my instrument</option>
                          {filteredMyInstruments.map(mi => (
                            <option key={mi.uid} value={mi.uid}>{mi.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-700">Difficulty (1-5)</label>
                        <div className="flex items-center gap-1" role="radiogroup" aria-label="Difficulty" aria-live="polite">
                          {[1,2,3,4,5].map(n => {
                            const current = form.instrumentDifficulty ? form.instrumentDifficulty[instrumentType] : null;
                            const active = typeof current === 'number' && n <= current;
                            return (
                              <button
                                key={n}
                                type="button"
                                className={`text-lg leading-none ${active ? 'text-yellow-500' : 'text-gray-300'} hover:text-yellow-500 focus:outline-none`}
                                onClick={() => {
                                  const next = current === n ? null : n;
                                  onSetInstrumentDifficulty?.(instrumentType, next);
                                }}
                                disabled={loading}
                                aria-pressed={active}
                                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                              >
                                ★
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {instrumentTechniques && instrumentTechniques.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Techniques</label>
                        <div className="space-y-2">
                          {instrumentTechniques.map(technique => (
                            <label key={technique} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={currentTechniques.includes(technique)}
                                onChange={() => onToggleTechnique(technique)}
                                disabled={loading}
                                className="h-4 w-4 rounded border border-gray-300"
                              />
                              <span className="ml-2 text-sm text-gray-700">{technique}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Links</label>
                      <div className="space-y-2">
                        {((form.instrumentLinks && form.instrumentLinks[instrumentType]) || []).map((lnk, idx) => (
                          <div key={`${instrumentType}-link-${idx}`} className="flex items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-1 text-sm hover:bg-brand-600 disabled:opacity-50"
                              onClick={() => {
                                const u = (lnk.url || '').trim();
                                if (u && (u.startsWith('http://') || u.startsWith('https://'))) {
                                  window.open(u, '_blank');
                                }
                              }}
                              title={lnk.label || lnk.url}
                            >
                              <span className="truncate max-w-[12rem]">{lnk.label || lnk.url}</span>
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center rounded-md bg-red-600 text-white px-2 py-1 text-sm hover:bg-red-700 disabled:opacity-50"
                              onClick={() => {
                                const currentLinks = (form.instrumentLinks && form.instrumentLinks[instrumentType]) || [];
                                const nextLinks = currentLinks.filter((_, i) => i !== idx);
                                if (onSetInstrumentLinksForInstrument) {
                                  onSetInstrumentLinksForInstrument(instrumentType, nextLinks);
                                }
                              }}
                              disabled={loading}
                              title="Remove link"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <input
                            className="flex-1 rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            type="text"
                            placeholder="Label (ex, Tabs video)"
                            value={(newLinkInputs[instrumentType]?.label) || ''}
                            onChange={(e) => setNewLinkInputs(prev => ({ ...prev, [instrumentType]: { ...(prev[instrumentType] || { label: '', url: '' }), label: e.target.value } }))}
                            disabled={loading}
                          />
                          <input
                            className="flex-1 rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            type="url"
                            placeholder="https://example.com"
                            value={(newLinkInputs[instrumentType]?.url) || ''}
                            onChange={(e) => setNewLinkInputs(prev => ({ ...prev, [instrumentType]: { ...(prev[instrumentType] || { label: '', url: '' }), url: e.target.value } }))}
                            disabled={loading}
                          />
                          <button
                            type="button"
                            className="inline-flex items-center rounded-md bg-brand-500 text-white px-2 py-1 text-sm hover:bg-brand-600 disabled:opacity-50"
                            onClick={() => {
                              const val = newLinkInputs[instrumentType] || { label: '', url: '' };
                              const url = (val.url || '').trim();
                              if (!url || !(url.startsWith('http://') || url.startsWith('https://'))) return;
                              const label = (val.label || '').trim();
                              const currentLinks = (form.instrumentLinks && form.instrumentLinks[instrumentType]) || [];
                              const nextLinks = [...currentLinks, { url, label: label || undefined }];
                              if (onSetInstrumentLinksForInstrument) {
                                onSetInstrumentLinksForInstrument(instrumentType, nextLinks);
                              }
                              setNewLinkInputs(prev => ({ ...prev, [instrumentType]: { label: '', url: '' } }));
                            }}
                            disabled={loading}
                          >
                            Add link
                          </button>
                        </div>
                        <p className="text-xs text-gray-500">Add resources for this instrument (videos, tabs, lessons).</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          
          <div>
            <label htmlFor="add-instrument" className="block text-sm font-medium text-gray-700 mb-2">Add an instrument</label>
            <select
              id="add-instrument"
              value={selectedInstrumentType}
              onChange={(e) => {
                const value = e.target.value;
                if (value && !currentInstruments.includes(value)) {
                  onChangeInstruments([...currentInstruments, value]);
                  setExpandedInstruments(new Set([...expandedInstruments, value]));
                }
                setSelectedInstrumentType('');
              }}
              className="block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={loading}
            >
              <option value="">Select an instrument to add</option>
              {instrumentTypeOptions.filter(inst => !currentInstruments.includes(inst)).map(inst => (
                <option key={inst} value={inst}>{inst}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {currentInstruments.length > 0 && getAvailableTunings(currentInstruments[0]).length > 0 && (
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
            {getAvailableTunings(selectedInstrumentType).map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      )}
      
      {playlistSlot}

      <div>
        <label htmlFor="song-notes" className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          id="song-notes"
          className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          name="notes"
          value={(form as any).notes}
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
