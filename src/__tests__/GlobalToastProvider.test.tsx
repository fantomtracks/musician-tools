import { StrictMode, useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { GlobalToastProvider } from '../contexts/GlobalToastProvider';
import { useGlobalToast } from '../contexts/GlobalToastContext';

// Story 24.2 — the recap must survive the page that raised it. A page-local toast dies with its
// component; that is exactly why this channel exists and why it sits above the router.

function Raiser({ text }: { text: string }) {
  const { showGlobalToast } = useGlobalToast();
  return <button onClick={() => showGlobalToast(text)}>raise</button>;
}

// A page that can remove itself, standing in for a route change / unmount mid-batch.
function DisappearingPage({ text }: { text: string }) {
  const [mounted, setMounted] = useState(true);
  const { showGlobalToast } = useGlobalToast();
  if (!mounted) return <div>page partie</div>;
  return (
    <button onClick={() => { showGlobalToast(text); setMounted(false); }}>
      lancer puis quitter
    </button>
  );
}

const renderWithProvider = (ui: React.ReactNode) => render(
  <StrictMode>
    <GlobalToastProvider>{ui}</GlobalToastProvider>
  </StrictMode>
);

afterEach(() => { jest.useRealTimers(); });

test('un message est annoncé dans la région live partagée', () => {
  renderWithProvider(<Raiser text="5 added of 12" />);
  act(() => { screen.getByRole('button', { name: 'raise' }).click(); });
  expect(screen.getByText('5 added of 12')).toBeInTheDocument();
});

test('LE CŒUR — le message survit au démontage de la page qui l\'a levé', () => {
  renderWithProvider(<DisappearingPage text="5 added · 7 not started" />);
  act(() => { screen.getByRole('button', { name: 'lancer puis quitter' }).click(); });

  // La page a disparu…
  expect(screen.getByText('page partie')).toBeInTheDocument();
  // …et le récap est toujours là. C'est toute la raison d'être de ce canal.
  expect(screen.getByText('5 added · 7 not started')).toBeInTheDocument();
});

test('un second lot remplace le message du premier, il ne fait pas la queue', () => {
  function TwoBatches() {
    const { showGlobalToast } = useGlobalToast();
    return (
      <>
        <button onClick={() => showGlobalToast('premier lot')}>un</button>
        <button onClick={() => showGlobalToast('second lot')}>deux</button>
      </>
    );
  }
  renderWithProvider(<TwoBatches />);

  act(() => { screen.getByRole('button', { name: 'un' }).click(); });
  expect(screen.getByText('premier lot')).toBeInTheDocument();

  act(() => { screen.getByRole('button', { name: 'deux' }).click(); });
  // Le plus récent est celui que l'utilisateur attend ; l'ancien ne doit pas rester à l'écran.
  expect(screen.getByText('second lot')).toBeInTheDocument();
  expect(screen.queryByText('premier lot')).toBeNull();
});

test('le message s\'efface tout seul', () => {
  jest.useFakeTimers();
  renderWithProvider(<Raiser text="fini" />);
  act(() => { screen.getByRole('button', { name: 'raise' }).click(); });
  expect(screen.getByText('fini')).toBeInTheDocument();

  act(() => { jest.advanceTimersByTime(6000 + 10); });
  expect(screen.queryByText('fini')).toBeNull();
});

test('un composant hors provider ne casse pas — il se tait', () => {
  // La valeur par défaut est un no-op : un rendu isolé (test unitaire d'une page) ne doit pas
  // exploser parce qu'il n'a pas monté le provider.
  render(<Raiser text="ignoré" />);
  expect(() => screen.getByRole('button', { name: 'raise' }).click()).not.toThrow();
});
