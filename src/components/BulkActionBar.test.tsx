import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { BulkActionBar } from './BulkActionBar';

// StrictMode by default for new component tests (lesson from epics 18/19).
const renderBar = (ui: React.ReactElement) => render(<StrictMode>{ui}</StrictMode>);

test('renders nothing when the selection is empty (the guard lives here, not in the pages)', () => {
  const { container } = renderBar(
    <BulkActionBar count={0} noun="song(s)"><button>Delete selected</button></BulkActionBar>
  );
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole('button', { name: 'Delete selected' })).toBeNull();
});

test('renders the count label and the actions passed as children', () => {
  renderBar(
    <BulkActionBar count={3} noun="song(s)">
      <button>Add to playlist</button>
      <button>Delete selected</button>
    </BulkActionBar>
  );
  expect(screen.getByText('3 song(s) selected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add to playlist' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete selected' })).toBeInTheDocument();
});

test('a bare noun is used verbatim for any count (the Songlist keeps its "song(s)" label)', () => {
  const { unmount } = renderBar(<BulkActionBar count={1} noun="song(s)"><span>x</span></BulkActionBar>);
  expect(screen.getByText('1 song(s) selected')).toBeInTheDocument();
  unmount();
  renderBar(<BulkActionBar count={2} noun="song(s)"><span>x</span></BulkActionBar>);
  expect(screen.getByText('2 song(s) selected')).toBeInTheDocument();
});

test('nounPlural switches on count (the Catalog says "1 entry" / "2 entries")', () => {
  const { unmount } = renderBar(
    <BulkActionBar count={1} noun="entry" nounPlural="entries"><span>x</span></BulkActionBar>
  );
  expect(screen.getByText('1 entry selected')).toBeInTheDocument();
  unmount();
  renderBar(<BulkActionBar count={2} noun="entry" nounPlural="entries"><span>x</span></BulkActionBar>);
  expect(screen.getByText('2 entries selected')).toBeInTheDocument();
});

test('applies the shared Songlist shell, and appends an optional className without dropping it', () => {
  const { container, unmount } = renderBar(<BulkActionBar count={1} noun="entry"><span>x</span></BulkActionBar>);
  const bar = container.firstChild as HTMLElement;
  expect(bar).toHaveClass('card-base', 'glass-effect', 'p-4');
  unmount();

  const withExtra = renderBar(
    <BulkActionBar count={1} noun="entry" className="mt-4"><span>x</span></BulkActionBar>
  );
  const bar2 = withExtra.container.firstChild as HTMLElement;
  expect(bar2).toHaveClass('card-base', 'glass-effect', 'p-4', 'mt-4');
});
