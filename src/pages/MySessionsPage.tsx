import { useEffect, useMemo, useRef, useState } from 'react';
import { practiceSessionService, type CreatePracticeSessionDTO, type CreateSessionItemDTO, type UpdateSessionItemDTO, type UpdatePracticeSessionDTO, type PracticeSession } from '../services/practiceSessionService';
import { songService, type Song } from '../services/songService';
import { topicService, type Topic } from '../services/topicService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { instrumentTypeOptions } from '../constants/instrumentTypes';
import { digitsOnly } from '../utils/digitsOnly';

type EntryDraft = {
  key: number;
  uid?: string; // present when editing an existing entry (diff-by-uid)
  label?: string; // FR4 snapshot, kept for orphan entries (refs deleted)
  ref: string; // '' | 'song:<uid>' | 'topic:<uid>'
  minutes: string;
  note: string;
};

// Accent-insensitive folding for the instant search: a French catalog must
// match "etude" against "Étude" (NFD strips combining diacritics)
function foldForSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const formatSongLabel = (song: Song): string =>
  song.artist ? `${song.artist} - ${song.title}` : song.title;

// FR12 picker as a single combobox (search + selection merged): type to filter,
// pick from the grouped suggestions below. Replaces the former search-input +
// native-select pair. Each row owns its open/highlight state, hence a component.
function EntryRefPicker({
  index,
  value,
  orphanLabel,
  songs,
  topics,
  recentRefs,
  loading,
  onPick,
}: {
  index: number;
  value: string; // '' | 'song:<uid>' | 'topic:<uid>'
  orphanLabel?: string; // FR4 snapshot when the referenced entity was deleted
  songs: Song[];
  topics: Topic[];
  recentRefs: { ref: string; label: string }[];
  loading: boolean;
  onPick: (ref: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [active, setActive] = useState(-1);

  // The label of the current selection. A deleted ref (orphan) falls back to its
  // FR4 snapshot; an empty ref with no snapshot shows nothing (placeholder).
  const labelForRef = (ref: string): string => {
    if (ref.startsWith('song:')) {
      const song = songs.find(s => `song:${s.uid}` === ref);
      return song ? formatSongLabel(song) : (orphanLabel ?? '');
    }
    if (ref.startsWith('topic:')) {
      const topic = topics.find(t => `topic:${t.uid}` === ref);
      return topic ? topic.name : (orphanLabel ?? '');
    }
    return orphanLabel ?? '';
  };

  // While searching the input shows the typed query; otherwise it shows the
  // selected label — so the field always reflects the actual ref at rest.
  const display = searching ? searchText : labelForRef(value);
  const query = searching ? foldForSearch(searchText.trim()) : '';
  const filterOptions = (options: { value: string; label: string }[]) =>
    query ? options.filter(o => foldForSearch(o.label).includes(query)) : options;

  // Grouped, in display order (Recent first), empty groups dropped. A running
  // counter gives each visible option a stable index for keyboard navigation,
  // robust to the same ref appearing in both Recent and Songs.
  let counter = 0;
  const groups = [
    { label: 'Recent', options: filterOptions(recentRefs.map(r => ({ value: r.ref, label: r.label }))) },
    { label: 'Songs', options: filterOptions(songs.map(s => ({ value: `song:${s.uid}`, label: formatSongLabel(s) }))) },
    { label: 'Topics', options: filterOptions(topics.map(t => ({ value: `topic:${t.uid}`, label: t.name }))) },
  ]
    .filter(group => group.options.length > 0)
    .map(group => ({ label: group.label, options: group.options.map(o => ({ ...o, idx: counter++ })) }));
  const flat = groups.flatMap(group => group.options);

  const pick = (option: { value: string }) => {
    onPick(option.value);
    setSearching(false);
    setSearchText('');
    setActive(-1);
    setOpen(false);
  };

  return (
    <div className="relative w-full sm:flex-1 min-w-0">
      <input
        aria-label={`Entry ${index + 1}`}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        placeholder="Search a song or topic..."
        value={display}
        onFocus={e => { setSearching(false); setActive(-1); setOpen(true); e.target.select(); }}
        onChange={e => { setSearchText(e.target.value); setSearching(true); setActive(-1); setOpen(true); }}
        onBlur={() => window.setTimeout(() => { setOpen(false); setSearching(false); }, 150)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive(a => Math.min(a + 1, flat.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(a => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            // Never submit the session from the picker — pick the highlighted
            // option, or just swallow the keystroke
            e.preventDefault();
            if (open && active >= 0 && flat[active]) pick(flat[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
            setActive(-1);
          }
        }}
        className="input-base text-sm"
        disabled={loading}
      />
      {open && groups.length > 0 && (
        <div
          role="listbox"
          aria-label={`Entry ${index + 1} suggestions`}
          className="absolute z-20 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg"
        >
          {groups.map(group => (
            <div role="group" aria-label={group.label} key={group.label}>
              <div aria-hidden="true" className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {group.label}
              </div>
              {group.options.map(option => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.idx === active}
                  // onMouseDown (not onClick): fire before the input's blur so the
                  // pick is not cancelled by the dropdown closing
                  onMouseDown={e => { e.preventDefault(); pick(option); }}
                  className={`block w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ${option.idx === active ? 'bg-brand-100 dark:bg-brand-900/40' : 'hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Anti-chronological: FR19 client-local date first (a retroactive session
// belongs at its real day), createdAt breaks same-day ties, uid makes the
// order fully deterministic. A session missing createdAt (fresh local insert)
// counts as the newest of its day, matching the server's eventual order.
const NEWEST = '9999-12-31T23:59:59.999Z';
function sortSessions(list: PracticeSession[]): PracticeSession[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const aCreated = a.createdAt ?? NEWEST;
    const bCreated = b.createdAt ?? NEWEST;
    if (aCreated !== bCreated) return aCreated < bCreated ? 1 : -1;
    return a.uid < b.uid ? 1 : a.uid > b.uid ? -1 : 0;
  });
}

// The session day is the device's LOCAL date (FR19) — toISOString() would give
// the UTC date, which is yesterday around midnight in timezones ahead of UTC.
function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MySessionsPage() {
  const [date, setDate] = useState(todayLocalDate());
  const [instrumentType, setInstrumentType] = useState('');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [entries, setEntries] = useState<EntryDraft[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[] | null>(null);
  const [sessionsFailed, setSessionsFailed] = useState(false);
  const [editingSessionUid, setEditingSessionUid] = useState<string | null>(null);
  const [editingSessionLabel, setEditingSessionLabel] = useState('');
  const [deleteSessionUid, setDeleteSessionUid] = useState<string | null>(null);
  // True as soon as the user interacts with the instrument field (or enters
  // edit mode): the FR12 prefill must never fire after that, even if the
  // sessions response lands late
  const instrumentTouchedRef = useRef(false);
  const [durationTouched, setDurationTouched] = useState(false);
  const entryKeyRef = useRef(0);
  // Deep-link ?edit=<uid> from the heatmap day detail (3.2): applied once the
  // sessions list has loaded
  const pendingEditUidRef = useRef<string | null>(null);
  const submitInFlightRef = useRef(false);

  const today = todayLocalDate();

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Heatmap deep-links (3.2). Read from window.location instead of
  // react-router's useSearchParams: the hook would require a <Router>
  // ancestor in every test rendering this page bare. ?edit wins over ?date;
  // the URL is cleaned once consumed so a re-render never re-triggers.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editParam = params.get('edit');
    const dateParam = params.get('date');
    if (editParam) {
      pendingEditUidRef.current = editParam;
    } else if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      && dateParam >= '1900-01-01' && dateParam <= todayLocalDate()) {
      // Round-trip through a LOCAL Date to reject non-calendar dates like
      // 2026-02-31 (never new Date('string') — FR19 read-side trap)
      const [y, m, d] = dateParam.split('-').map(Number);
      const probe = new Date(y, m - 1, d, 12);
      probe.setFullYear(y);
      const roundTrip = `${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, '0')}-${String(probe.getDate()).padStart(2, '0')}`;
      if (roundTrip === dateParam) {
        setDate(dateParam);
      }
    }
    if (params.has('edit') || params.has('date')) {
      // Remove ONLY the consumed params — other query params and the hash
      // belong to someone else
      params.delete('edit');
      params.delete('date');
      const rest = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // allSettled: one failing catalog must not discard the other — the form
      // stays usable (possibly with a partial picker)
      const [songsResult, topicsResult, sessionsResult] = await Promise.allSettled([
        songService.getAllSongs(),
        topicService.getAll(),
        practiceSessionService.getAll(),
      ]);
      if (songsResult.status === 'fulfilled') setSongs(songsResult.value ?? []);
      if (topicsResult.status === 'fulfilled') setTopics(topicsResult.value ?? []);
      if (songsResult.status === 'rejected' || topicsResult.status === 'rejected') {
        setError('Failed to load songs and topics');
      }
      if (sessionsResult.status === 'fulfilled') {
        const fetched = sessionsResult.value ?? [];
        // Merge instead of overwrite: a session logged while this request was
        // in flight must not vanish when the (stale) response lands
        setSessions(prev => {
          if (prev === null) return sortSessions(fetched);
          const fetchedUids = new Set(fetched.map(s => s.uid));
          return sortSessions([...prev.filter(s => !fetchedUids.has(s.uid)), ...fetched]);
        });
        // FR12 one-shot prefill: the instrument of the most recently LOGGED
        // session (max createdAt — not the top of the date sort, which a
        // retroactive session could occupy; missing createdAt counts as
        // newest, consistent with sortSessions). Guarded by the touched ref
        // AND a functional update so a user interaction always wins, and only
        // applied if the value is actually offered by the select (a legacy
        // free-string instrument would submit invisibly otherwise).
        const mostRecent = fetched.reduce<PracticeSession | null>((best, s) => {
          return !best || (s.createdAt ?? NEWEST) > (best.createdAt ?? NEWEST) ? s : best;
        }, null);
        if (mostRecent
          && !instrumentTouchedRef.current
          && instrumentTypeOptions.includes(mostRecent.instrumentType)) {
          setInstrumentType(prev => (prev === '' ? mostRecent.instrumentType : prev));
        }
        // Apply a pending ?edit deep-link now that the sessions are known;
        // an unknown uid is silently ignored, and a submit already in flight
        // (user started typing/logging while the list loaded) wins over the
        // late-arriving deep-link
        if (pendingEditUidRef.current) {
          const target = fetched.find(s => s.uid === pendingEditUidRef.current);
          pendingEditUidRef.current = null;
          if (target && !submitInFlightRef.current) startEditSession(target);
        }
      } else {
        setSessionsFailed(true);
        // The deep-linked edit intent cannot survive a failed list load (and
        // the URL is already cleaned): drop it instead of firing later
        pendingEditUidRef.current = null;
      }
    })();
  }, []);

  // FR13: when every entry has minutes, the total duration is pre-computed as
  // their sum — unless the user typed a duration manually (override wins).
  // A sum beyond the 1440 server cap is never auto-applied: the feature must
  // not manufacture an invalid value the user did not type.
  const entryMinutes = entries.map(e => (e.minutes === '' ? null : Number(e.minutes)));
  const rawSum = entries.length > 0 && entryMinutes.every(m => m !== null && Number.isFinite(m))
    ? entryMinutes.reduce((total, m) => (total as number) + (m as number), 0)
    : null;
  const autoSum = rawSum !== null && rawSum >= 1 && rawSum <= 1440 ? rawSum : null;
  const effectiveDuration = durationTouched ? duration : (autoSum !== null ? String(autoSum) : duration);

  // FR12: refs recently logged, first occurrence over the anti-chronological
  // session list, deduplicated, capped at 5. Deleted refs (absent from the
  // loaded catalogs) are excluded — they cannot be referenced again. Labels
  // come from the CURRENT catalogs (a renamed song shows its new title).
  const recentRefs = useMemo(() => {
    if (!sessions) return [];
    const labelByRef = new Map<string, string>();
    songs.forEach(song => labelByRef.set(`song:${song.uid}`, formatSongLabel(song)));
    topics.forEach(topic => labelByRef.set(`topic:${topic.uid}`, topic.name));
    // "Recently logged" = creation order, NOT the date-sorted display list: a
    // retroactive session logged a minute ago sits low in the date sort but
    // its items are exactly what the user wants at hand (same rationale as
    // the instrument prefill)
    const byCreation = [...sessions].sort((a, b) => {
      const aCreated = a.createdAt ?? NEWEST;
      const bCreated = b.createdAt ?? NEWEST;
      return aCreated < bCreated ? 1 : aCreated > bCreated ? -1 : 0;
    });
    const seen = new Set<string>();
    const result: { ref: string; label: string }[] = [];
    for (const session of byCreation) {
      for (const item of session.items ?? []) {
        const ref = item.songUid ? `song:${item.songUid}` : item.topicUid ? `topic:${item.topicUid}` : '';
        if (!ref || seen.has(ref) || !labelByRef.has(ref)) continue;
        seen.add(ref);
        result.push({ ref, label: labelByRef.get(ref) as string });
        if (result.length >= 5) return result;
      }
    }
    return result;
  }, [sessions, songs, topics]);

  // The session item only snapshots the FR4 title label, not the artist —
  // resolve the artist from the live song catalog for display. A deleted song
  // (orphan entry) or a topic entry has no artist here; the label stands alone.
  const artistBySongUid = useMemo(() => {
    const map = new Map<string, string>();
    songs.forEach(song => { if (song.artist) map.set(song.uid, song.artist); });
    return map;
  }, [songs]);

  const addEntry = () => {
    entryKeyRef.current += 1;
    setEntries(prev => [...prev, { key: entryKeyRef.current, ref: '', minutes: '', note: '' }]);
  };

  const updateEntry = (key: number, patch: Partial<EntryDraft>) => {
    setEntries(prev => prev.map(e => (e.key === key ? { ...e, ...patch } : e)));
  };

  const removeEntry = (key: number) => {
    setEntries(prev => prev.filter(e => e.key !== key));
  };

  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2500);
  };

  const resetForm = () => {
    setEditingSessionUid(null);
    setEditingSessionLabel('');
    setDate(todayLocalDate());
    setInstrumentType('');
    setDuration('');
    setDurationTouched(false);
    setNote('');
    setEntries([]);
  };

  const startEditSession = (session: PracticeSession) => {
    instrumentTouchedRef.current = true;
    setEditingSessionUid(session.uid);
    setEditingSessionLabel(session.date);
    setDate(session.date);
    setInstrumentType(session.instrumentType);
    setDuration(session.durationMinutes != null ? String(session.durationMinutes) : '');
    // FR13 is a capture-time aid only: in edit mode the auto-sum must never
    // assign or overwrite a duration (a deliberately duration-less session
    // must stay that way, and clearing the field must mean "no duration")
    setDurationTouched(true);
    setNote(session.note ?? '');
    setEntries((session.items ?? []).map(item => {
      entryKeyRef.current += 1;
      const isOrphan = !item.songUid && !item.topicUid;
      return {
        key: entryKeyRef.current,
        uid: item.uid,
        // label is only kept for orphan entries: it is the snapshot the combobox
        // shows when the ref was deleted; non-orphan entries resolve their label
        // from the live catalog instead
        label: isOrphan ? item.label : undefined,
        ref: item.songUid ? `song:${item.songUid}` : item.topicUid ? `topic:${item.topicUid}` : '',
        minutes: item.minutes != null ? String(item.minutes) : '',
        note: item.note ?? '',
      };
    }));
    setError(null);
    // Move focus into the form: without it a keyboard/screen-reader user gets
    // no perceivable cue that the top form switched to edit mode
    document.getElementById('session-date')?.focus();
  };

  const handleDeleteSession = async () => {
    if (!deleteSessionUid) return;
    const uid = deleteSessionUid;
    // Close the dialog before the request: prevents a double-click from firing
    // a duplicate DELETE, and keeps the error banner visible if the call fails.
    setDeleteSessionUid(null);
    try {
      setLoading(true);
      setError(null);
      await practiceSessionService.remove(uid);
      setSessions(prev => (prev ?? []).filter(s => s.uid !== uid));
      if (editingSessionUid === uid) resetForm();
      showToast('Session deleted');
    } catch {
      setError('Failed to delete session');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !instrumentType) return;
    // Recompute "today" at submit time: the render-time value goes stale if
    // the page stays open across local midnight.
    const submitToday = todayLocalDate();
    if (date > submitToday) {
      setError('Date cannot be in the future');
      return;
    }
    // An entry row without a song/topic would be silently dropped (and its
    // minutes still counted in the auto-sum) — refuse instead of losing data.
    // Exception: an existing orphan entry (uid + FR4 label, refs deleted)
    // legitimately has no ref — "no ref" means "keep its snapshot label".
    if (entries.some(e => e.ref === '' && !(e.uid && e.label))) {
      setError('Each entry needs a song or topic — fill or remove empty entries');
      return;
    }
    // A session can't be shorter than what its entries already account for: the
    // entries are part of the session, so the (optional) total may exceed their
    // sum (extra un-itemised practice) but never undercut it.
    const enteredMinutesSum = entryMinutes.reduce<number>((sum, m) => sum + (m ?? 0), 0);
    if (effectiveDuration !== '' && Number(effectiveDuration) < enteredMinutesSum) {
      setError(`Session duration can't be less than the ${enteredMinutesSum} min already logged in its entries`);
      return;
    }
    try {
      setLoading(true);
      submitInFlightRef.current = true;
      setError(null);
      const decodeRef = (ref: string) => {
        const separator = ref.indexOf(':');
        const kind = ref.slice(0, separator);
        const uid = ref.slice(separator + 1);
        return kind === 'song' ? { songUid: uid } : { topicUid: uid };
      };

      if (editingSessionUid) {
        const items: UpdateSessionItemDTO[] = entries.map(e => ({
          ...(e.uid ? { uid: e.uid } : {}),
          ...(e.ref !== '' ? decodeRef(e.ref) : {}),
          minutes: e.minutes === '' ? undefined : Number(e.minutes),
          note: e.note.trim() || undefined,
        }));
        const payload: UpdatePracticeSessionDTO = {
          date,
          instrumentType,
          durationMinutes: effectiveDuration === '' ? null : Number(effectiveDuration),
          note: note.trim() || null,
          items,
        };
        const updated = await practiceSessionService.update(editingSessionUid, payload);
        setSessions(prev => sortSessions((prev ?? []).map(s => (s.uid === editingSessionUid ? updated : s))));
        setSessionsFailed(false);
        resetForm();
        showToast('Session updated');
      } else {
        const items: CreateSessionItemDTO[] = entries
          .filter(e => e.ref !== '')
          .map(e => ({
            ...decodeRef(e.ref),
            minutes: e.minutes === '' ? undefined : Number(e.minutes),
            note: e.note.trim() || undefined,
          }));
        const payload: CreatePracticeSessionDTO = {
          date,
          instrumentType,
          // '' means "no duration"; anything typed (including 0) is sent so the
          // server can reject invalid values instead of silently dropping them
          durationMinutes: effectiveDuration === '' ? undefined : Number(effectiveDuration),
          note: note.trim() || undefined,
          items: items.length > 0 ? items : undefined,
        };
        const created = await practiceSessionService.create(payload);
        // Local insert + re-sort: a retroactive session must land at its real
        // chronological place, not on top of the list. A previously failed
        // history load must not keep hiding sessions logged since.
        setSessions(prev => sortSessions([created, ...(prev ?? [])]));
        setSessionsFailed(false);
        setDuration('');
        setDurationTouched(false);
        setNote('');
        setEntries([]);
        showToast('Session logged');
      }
    } catch (err) {
      const generic = editingSessionUid ? 'Failed to update session' : 'Failed to log session';
      setError(err instanceof Error
        && err.message !== 'Failed to create session'
        && err.message !== 'Failed to update session'
        ? err.message
        : generic);
    } finally {
      setLoading(false);
      submitInFlightRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-950 text-gray-900 dark:text-gray-100">
      <ConfirmDialog
        isOpen={!!deleteSessionUid}
        title="Delete session"
        message={(() => {
          const target = (sessions ?? []).find(s => s.uid === deleteSessionUid);
          return target
            ? `Are you sure you want to delete the session of ${target.date} (${target.instrumentType})?`
            : 'Are you sure you want to delete this session?';
        })()}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={handleDeleteSession}
        onCancel={() => setDeleteSessionUid(null)}
      />
      {/* Always mounted: a live region must exist in the DOM before its content
          changes, or screen readers may never announce the toast */}
      <div
        role="status"
        aria-label="Notification"
        className={toastMessage
          ? 'fixed bottom-6 right-6 z-50 rounded-lg bg-green-600 dark:bg-green-700 text-white px-4 py-2 shadow-lg'
          : 'sr-only'}
      >
        {toastMessage}
      </div>
      {error && (
        <div role="alert" className="mx-4 my-4 card-base glass-effect text-red-700 bg-red-50/80 border border-red-200 dark:text-red-300 dark:bg-red-900/40 dark:border-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" className="btn-secondary text-xs" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* relative z-20: the entry picker dropdown overflows the card bottom —
            this lifts the whole form card above the History card so the dropdown
            is not painted under it */}
        <div className="card-base glass-effect p-4 sm:p-5 space-y-4 relative z-20">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {editingSessionUid ? 'Edit session' : 'New session'}
            </h2>
          </div>
          {editingSessionUid && (
            <div className="flex items-center justify-between flex-wrap gap-2 rounded-lg bg-sky-50 dark:bg-sky-900/40 border border-sky-200 dark:border-sky-700/60 px-3 py-2">
              <span className="text-sm text-gray-700 dark:text-gray-200">Editing session of {editingSessionLabel}</span>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary text-sm" onClick={resetForm} disabled={loading}>
                  Cancel edit
                </button>
                {/* The history (and its Delete buttons) is hidden while editing,
                    so deletion must be reachable from here too */}
                <button
                  type="button"
                  aria-label={`Delete session of ${editingSessionLabel}`}
                  className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50"
                  onClick={() => setDeleteSessionUid(editingSessionUid)}
                  disabled={loading}
                >
                  Delete session
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="session-date" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Date
              </label>
              <input
                id="session-date"
                type="date"
                value={date}
                min="1900-01-01"
                max={today}
                onChange={e => setDate(e.target.value)}
                className="input-base text-sm"
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="session-instrument" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Instrument
              </label>
              <select
                id="session-instrument"
                value={instrumentType}
                onChange={e => {
                  instrumentTouchedRef.current = true;
                  setInstrumentType(e.target.value);
                }}
                className="input-base text-sm"
                disabled={loading}
              >
                <option value="">Select instrument</option>
                {instrumentTypeOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="session-duration" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Duration
              </label>
              <input
                id="session-duration"
                type="number"
                min={1}
                max={1440}
                placeholder="Minutes (optional)"
                value={effectiveDuration}
                inputMode="numeric"
                onChange={e => {
                  const digits = digitsOnly(e.target.value);
                  setDuration(digits);
                  // Typing freezes the auto-sum; truly clearing the field
                  // re-arms it (create mode only — in edit mode "cleared"
                  // must persist as "no duration"). badInput ('1e'…) reads
                  // as '' but must NOT re-arm, or it would wipe an override.
                  setDurationTouched(
                    digits !== ''
                    || (e.target.validity?.badInput ?? false)
                    || editingSessionUid !== null
                  );
                }}
                className="input-base text-sm"
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-3">
              <label htmlFor="session-note" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Note
              </label>
              <textarea
                id="session-note"
                placeholder="How did it go? (optional)"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="input-base text-sm"
                rows={2}
                maxLength={5000}
                disabled={loading}
              />
            </div>

            <fieldset className="md:col-span-3 space-y-2 mt-12">
              {/* block (not float): the legend takes its own line so the first
                  entry row starts below "Entries", not beside it */}
              <legend className="block w-full mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Entries
              </legend>
              {entries.map((entry, index) => {
                return (
                <div key={entry.key} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <EntryRefPicker
                    index={index}
                    value={entry.ref}
                    // Only orphan entries (uid + snapshot, ref deleted) carry a
                    // fallback label; a fresh empty row has none
                    orphanLabel={entry.uid && entry.label ? entry.label : undefined}
                    songs={songs}
                    topics={topics}
                    recentRefs={recentRefs}
                    loading={loading}
                    onPick={ref => updateEntry(entry.key, { ref })}
                  />
                  <input
                    aria-label={`Entry ${index + 1} minutes`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1440}
                    placeholder="Min"
                    value={entry.minutes}
                    onChange={e => updateEntry(entry.key, { minutes: digitsOnly(e.target.value) })}
                    className="input-base text-sm sm:w-20 sm:flex-none"
                    disabled={loading}
                  />
                  <input
                    aria-label={`Entry ${index + 1} note`}
                    placeholder="e.g. 30 BPM"
                    value={entry.note}
                    onChange={e => updateEntry(entry.key, { note: e.target.value })}
                    className="input-base text-sm sm:w-40 sm:flex-none"
                    maxLength={1000}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    aria-label={`Remove entry ${index + 1}`}
                    className="shrink-0 inline-flex items-center justify-center rounded-md bg-red-600 text-white px-3 py-2 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => removeEntry(entry.key)}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
                );
              })}
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-brand-300 text-brand-700 font-semibold hover:bg-brand-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:border-brand-600 dark:text-brand-300 dark:hover:bg-brand-900/30"
                onClick={addEntry}
                disabled={loading}
              >
                <span aria-hidden="true" className="text-lg leading-none">＋</span>
                Add entry
              </button>
            </fieldset>

            {/* Primary action at the very bottom, below the entries — full width */}
            <div className="md:col-span-3 pt-2">
              <button
                type="submit"
                className="btn-primary w-full justify-center"
                disabled={loading || !date || !instrumentType}
              >
                {editingSessionUid ? 'Save session' : 'Log session'}
              </button>
            </div>
          </form>
        </div>

        {/* Hidden while editing: a list of other sessions under the edit form
            reads as confusing context (northwood field feedback, 3.2). The
            live region stays MOUNTED (sr-only) — unmounting a role="status"
            silences in-flight announcements for assistive tech */}
        <div className={editingSessionUid ? '' : 'card-base glass-effect p-4 sm:p-5 space-y-4'}>
          {!editingSessionUid && (
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">History</h2>
          )}
          <div
            role="status"
            aria-label="History status"
            className={editingSessionUid ? 'sr-only' : 'text-sm text-gray-600 dark:text-gray-400'}
          >
            {sessionsFailed
              ? 'Sessions could not be loaded.'
              : sessions === null
                ? 'Loading...'
                : sessions.length === 0
                  ? 'No sessions logged yet.'
                  : null}
          </div>
          {!editingSessionUid && !sessionsFailed && sessions !== null && sessions.length > 0 && (
            <ul aria-label="Session history" className="space-y-3">
              {sessions.map(session => (
                <li key={session.uid} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {/* The DATEONLY string is displayed verbatim: new Date('YYYY-MM-DD')
                        would parse as UTC midnight and shift the day in some timezones */}
                    <span className="font-semibold">{session.date}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">{session.instrumentType}</span>
                    {session.durationMinutes ? (
                      <span className="text-sm text-gray-600 dark:text-gray-400">· {session.durationMinutes} min</span>
                    ) : null}
                    <div className="flex gap-2 ml-auto">
                      <button
                        type="button"
                        aria-label={`Edit session of ${session.date}`}
                        className="btn-secondary text-sm"
                        onClick={() => startEditSession(session)}
                        disabled={loading}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete session of ${session.date}`}
                        className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50"
                        onClick={() => setDeleteSessionUid(session.uid)}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {session.note && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{session.note}</p>
                  )}
                  {session.items && session.items.length > 0 && (
                    // pt-3 only when a note precedes: extra breathing room between
                    // the session note and what was played (northwood feedback)
                    <ul className={`space-y-1${session.note ? ' pt-3' : ''}`}>
                      {session.items.map(item => {
                        const artist = item.songUid ? artistBySongUid.get(item.songUid) : undefined;
                        return (
                        <li key={item.uid} className="text-sm text-gray-700 dark:text-gray-300 pl-3 border-l-2 border-gray-200 dark:border-gray-700 break-words">
                          {artist ? <span>{artist} - </span> : null}
                          <span className="font-medium">{item.label}</span>
                          {item.minutes ? <span className="text-gray-500 dark:text-gray-400"> · played during {item.minutes} {item.minutes > 1 ? 'minutes' : 'minute'}</span> : null}
                          {item.note ? <span className="text-gray-500 dark:text-gray-400 italic"> · {item.note}</span> : null}
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default MySessionsPage;
