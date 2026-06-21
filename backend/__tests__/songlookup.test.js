jest.mock('../services/songMetadataService', () => ({
  fetchSongMetadata: jest.fn(),
}));

const { fetchSongMetadata } = require('../services/songMetadataService');
const controller = require('../controllers/songcontroller');
const httpErrors = require('http-errors');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function mockNext() {
  return jest.fn();
}

describe('lookupSongMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when title or artist missing', async () => {
    const req = { session: { user: 'user-1' }, query: { title: 'Song' } };
    const res = mockRes();
    const next = mockNext();

    await controller.lookupSongMetadata(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(httpErrors.HttpError);
    expect(err.statusCode).toBe(400);
  });

  test('returns metadata when fetch succeeds', async () => {
    const req = { session: { user: 'user-1' }, query: { title: 'Song', artist: 'Artist' } };
    const res = mockRes();
    const next = mockNext();
    fetchSongMetadata.mockResolvedValue({
      bpm: 120,
      key: 'C',
      mode: 'Major',
      timeSignature: '4/4',
      album: 'Album Name',
      genres: ['rock', 'pop'],
      durationSeconds: 225,
      source: 'songbpm, wikipedia, lastfm'
    });

    await controller.lookupSongMetadata(req, res, next);

    expect(fetchSongMetadata).toHaveBeenCalledWith({ title: 'Song', artist: 'Artist' });
    expect(res.json).toHaveBeenCalledWith({
      bpm: 120,
      key: 'C',
      mode: 'Major',
      timeSignature: '4/4',
      album: 'Album Name',
      genres: ['rock', 'pop'],
      durationSeconds: 225,
      source: 'songbpm, wikipedia, lastfm'
    });
  });

  test('returns 401 when not authenticated', async () => {
    const req = { session: {}, query: { title: 'Song', artist: 'Artist' } };
    const res = mockRes();
    const next = mockNext();

    await controller.lookupSongMetadata(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(httpErrors.HttpError);
    expect(err.statusCode).toBe(401);
  });
});
