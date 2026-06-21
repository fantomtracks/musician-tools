import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionHistoryCard } from '../components/SessionHistoryCard';
import type { PracticeSession } from '../services/practiceSessionService';

function makeSession(items: PracticeSession['items']): PracticeSession {
  return { uid: 's1', date: '2026-06-21', instrumentType: 'Guitar', items };
}

function renderCard(session: PracticeSession, artistBySongUid = new Map<string, string>()) {
  return render(
    <MemoryRouter>
      <ul>
        <SessionHistoryCard session={session} artistBySongUid={artistBySongUid} />
      </ul>
    </MemoryRouter>
  );
}

test('a song entry links to its edit form; a topic entry stays plain text', () => {
  renderCard(makeSession([
    { uid: 'i1', sessionUid: 's1', songUid: 'song-1', label: 'Sweet Child', minutes: 10 },
    { uid: 'i2', sessionUid: 's1', topicUid: 't1', label: 'Pentatonic scale' },
  ]));

  const songLink = screen.getByRole('link', { name: 'Sweet Child' });
  expect(songLink).toHaveAttribute('href', '/songs');

  // The topic entry is plain text, never a link.
  expect(screen.queryByRole('link', { name: 'Pentatonic scale' })).not.toBeInTheDocument();
  expect(screen.getByText('Pentatonic scale')).toBeInTheDocument();
});

test('the whole "Artist - Title" is a single link to the song edit form', () => {
  renderCard(
    makeSession([{ uid: 'i1', sessionUid: 's1', songUid: 'song-1', label: 'Sweet Child' }]),
    new Map([['song-1', "Guns N' Roses"]]),
  );

  // Artist and title are both inside one link (navigation is by songUid, not the title).
  const link = screen.getByRole('link', { name: "Guns N' Roses - Sweet Child" });
  expect(link).toHaveAttribute('href', '/songs');
});
