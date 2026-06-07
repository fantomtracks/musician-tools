import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MySessionsPage from '../pages/MySessionsPage';
import { practiceSessionService, type PracticeSession } from '../services/practiceSessionService';

jest.mock('../services/practiceSessionService', () => ({
  practiceSessionService: {
    create: jest.fn(),
  },
}));

const mockedService = practiceSessionService as jest.Mocked<typeof practiceSessionService>;

// Same local-date logic as the page (FR19: local day, not UTC)
function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders a labelled form with today (local) pre-filled and future dates blocked', () => {
  render(<MySessionsPage />);

  const dateInput = screen.getByLabelText('Date');
  expect(dateInput).toHaveValue(todayLocalDate());
  expect(dateInput).toHaveAttribute('max', todayLocalDate());
  expect(screen.getByLabelText('Instrument')).toBeInTheDocument();
  expect(screen.getByLabelText('Duration')).toBeInTheDocument();
  expect(screen.getByLabelText('Note')).toBeInTheDocument();
});

test('submit is disabled until an instrument is selected', () => {
  render(<MySessionsPage />);

  const submit = screen.getByRole('button', { name: 'Log session' });
  expect(submit).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  expect(submit).not.toBeDisabled();
});

test('submitting sends the payload and shows a confirmation toast', async () => {
  const created: PracticeSession = {
    uid: 's1',
    date: todayLocalDate(),
    instrumentType: 'Bass',
    durationMinutes: 40,
    note: 'bridge still rough',
  };
  mockedService.create.mockResolvedValue(created);

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '40' } });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'bridge still rough' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith({
      date: todayLocalDate(),
      instrumentType: 'Bass',
      durationMinutes: 40,
      note: 'bridge still rough',
    });
  });
  expect(await screen.findByText('Session logged')).toBeInTheDocument();
});

test('after success, duration and note reset but date and instrument are kept', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Bass' });

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '40' } });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'quick run' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await screen.findByText('Session logged');

  expect(screen.getByLabelText('Duration')).toHaveValue(null);
  expect(screen.getByLabelText('Note')).toHaveValue('');
  expect(screen.getByLabelText('Date')).toHaveValue(todayLocalDate());
  expect(screen.getByLabelText('Instrument')).toHaveValue('Bass');
});

test('a session without duration or note is valid (only date + instrument required)', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Guitar' });

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Guitar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith({
      date: todayLocalDate(),
      instrumentType: 'Guitar',
      durationMinutes: undefined,
      note: undefined,
    });
  });
});

test('shows an error banner when creation fails', async () => {
  mockedService.create.mockRejectedValue(new Error('Failed to create session'));

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  expect(await screen.findByText('Failed to log session')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('surfaces specific server validation messages (e.g. clock-skewed client)', async () => {
  mockedService.create.mockRejectedValue(new Error('Date cannot be in the future'));

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  expect(await screen.findByText('Date cannot be in the future')).toBeInTheDocument();
});

test('blocks future dates client-side without calling the API', async () => {
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: tomorrow } });
  // Bypass native constraint validation (max attr): the JS guard is the
  // backstop for platforms where the browser does not enforce it
  fireEvent.submit(screen.getByLabelText('Date').closest('form')!);

  expect(await screen.findByText('Date cannot be in the future')).toBeInTheDocument();
  expect(mockedService.create).not.toHaveBeenCalled();
});

test('typed duration "0" is sent to the server, not silently dropped', async () => {
  mockedService.create.mockRejectedValue(new Error('Duration must be a whole number of minutes between 1 and 1440'));

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '0' } });
  // Bypass native min={1} validation to exercise the JS path
  fireEvent.submit(screen.getByLabelText('Duration').closest('form')!);

  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 0 })
    );
  });
  expect(await screen.findByText('Duration must be a whole number of minutes between 1 and 1440')).toBeInTheDocument();
});

test('the toast live region is mounted before any submission', () => {
  render(<MySessionsPage />);

  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
