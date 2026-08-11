import { StrictMode, useState } from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { useBulkAddToSonglist, describeAbandonedBatch, describeAbandonedWork, worthReporting } from '../hooks/useBulkAddToSonglist';
import type { AddToSonglistRecap } from '../hooks/useBulkAddToSonglist';
import { GlobalToastProvider } from '../contexts/GlobalToastProvider';
import { catalogService } from '../services/catalogService';

jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  const { makeCatalogServiceMock } = jest.requireActual('../test/catalogServiceMock');
  return { ...actual, catalogService: makeCatalogServiceMock() };
});
const cat = catalogService as jest.Mocked<typeof catalogService>;

// Story 24.2 — the two properties mutation testing showed were NOT covered: how a never-started
// item is classified, and whether the recap is actually spoken after the page is gone.

// ⚠️ Le hook doit vivre dans un composant RÉELLEMENT démonté. Une première version de ce test
// mettait le hook dans le composant parent et se contentait de changer ce qu'il rendait : le
// cleanup du useEffect ne tournait donc jamais, et le test mesurait un abandon qui n'avait pas
// lieu. Attrapé parce que les 8 items partaient quand même.
function Batch({ uids }: { uids: string[] }) {
  const { run } = useBulkAddToSonglist();
  return <button onClick={() => { run(uids); }}>lancer</button>;
}

function Page({ uids }: { uids: string[] }) {
  const [onPage, setOnPage] = useState(true);
  return (
    <>
      {onPage ? <Batch uids={uids} /> : <div>page partie</div>}
      <button onClick={() => setOnPage(false)}>quitter</button>
    </>
  );
}

const renderPage = (uids: string[]) => render(
  <StrictMode>
    <GlobalToastProvider><Page uids={uids} /></GlobalToastProvider>
  </StrictMode>
);

beforeEach(() => { jest.clearAllMocks(); });

// Un mock dont RIEN ne se résout tant qu'on ne le décide pas : sans ça le lot se termine avant
// même qu'on ait quitté la page, et le scénario testé ne se produit jamais.
function deferredAddMock() {
  const resolvers: Array<(v: never) => void> = [];
  cat.addToSonglist.mockImplementation(() => new Promise(resolve => { resolvers.push(resolve as never); }));
  return {
    started: () => cat.addToSonglist.mock.calls.length,
    resolveAll: async () => { resolvers.forEach(r => r({ uid: 's' } as never)); await Promise.resolve(); },
  };
}

test('un item jamais démarré est compté en skipped, PAS en failed', async () => {
  // `failed` veut dire « le serveur a peut-être été touché, réessaie ». Un item jamais parti n'a
  // rien touché : les confondre envoie l'utilisateur chercher une panne qui n'existe pas.
  const pending = deferredAddMock();
  renderPage(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);

  act(() => { screen.getByRole('button', { name: 'lancer' }).click(); });
  await act(async () => { await Promise.resolve(); });
  const inFlight = pending.started(); // bornées par CONCURRENCY

  act(() => { screen.getByRole('button', { name: 'quitter' }).click(); }); // abandon
  await act(async () => { await pending.resolveAll(); });

  // Le vrai gain : les items non démarrés ne partent JAMAIS, donc ils n'écrivent rien.
  expect(pending.started()).toBe(inFlight);
  expect(pending.started()).toBeLessThan(8);
});

test('LE CŒUR — après le démontage, le récap est quand même annoncé', async () => {
  const pending = deferredAddMock();
  renderPage(['a', 'b', 'c', 'd', 'e', 'f']);

  act(() => { screen.getByRole('button', { name: 'lancer' }).click(); });
  await act(async () => { await Promise.resolve(); });
  act(() => { screen.getByRole('button', { name: 'quitter' }).click(); });
  await act(async () => { await pending.resolveAll(); });

  // La page a disparu, et pourtant l'utilisateur apprend ce qui a été écrit.
  await waitFor(() => expect(screen.getByText(/You left while songs were being added/)).toBeInTheDocument());
  expect(screen.getByText('page partie')).toBeInTheDocument();
});

describe('describeAbandonedBatch — ce que l\'utilisateur lit', () => {
  const base: AddToSonglistRecap = { added: 0, alreadyIn: 0, gone: 0, failed: 0, skipped: 0, needsSonglistRefresh: false };

  test('nomme ce qui a atterri ET ce qui n\'est jamais parti', () => {
    const text = describeAbandonedBatch({ ...base, added: 5, skipped: 7 });
    expect(text).toMatch(/5 added/);
    // Sans cette moitié, « 12 sélectionnées, 5 ajoutées » se lit comme une perte de 7.
    expect(text).toMatch(/7 were not started/);
  });

  test('ne parle pas des non-démarrées quand il n\'y en a pas', () => {
    expect(describeAbandonedBatch({ ...base, added: 3 })).not.toMatch(/not started/);
  });
});

// Constats 4 et 5 de la code review : le formateur est partagé par les 4 surfaces, donc le
// verrouiller ICI couvre les quatre d'un coup — là où quatre phrases écrites à la main
// divergeaient déjà (dont trois disaient « 1 were not started »).
describe('describeAbandonedWork — le contrat partagé', () => {
  test('singulier correct — c\'était « 1 were not started » sur 3 surfaces', () => {
    const t = describeAbandonedWork({ what: 'entries were being deleted', landed: 2, skipped: 1, failed: 0 });
    expect(t).toMatch(/1 was not started/);
    expect(t).not.toMatch(/1 were/);
  });

  test('pluriel correct', () => {
    expect(describeAbandonedWork({ what: 'x', landed: 1, skipped: 3, failed: 0 })).toMatch(/3 were not started/);
  });

  test('un lot dont TOUT a échoué parle quand même', () => {
    // Les 3 pages gardaient sur le succès : un abandon tout-en-échec ne disait RIEN, alors que
    // ces items ont peut-être touché le serveur.
    expect(worthReporting(0, 4)).toBe(true);
    expect(describeAbandonedWork({ what: 'x', landed: 0, skipped: 0, failed: 4 })).toMatch(/4 failed/);
  });

  test('un lot sans rien d\'abouti ni d\'échoué ne mérite pas d\'être annoncé', () => {
    expect(worthReporting(0, 0)).toBe(false);
  });

  test('ne parle jamais des non-démarrées quand il n\'y en a pas', () => {
    expect(describeAbandonedWork({ what: 'x', landed: 3, skipped: 0, failed: 0 })).not.toMatch(/not started/);
  });
});
