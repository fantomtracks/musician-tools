jest.mock('../models', () => {
  return {
    Topic: {
      create: jest.fn(async (data) => ({ ...data, uid: 'topic-uid' })),
      findAll: jest.fn(async () => []),
      findOne: jest.fn(),
    },
  };
});

const { Topic } = require('../models');
const controller = require('../controllers/topiccontroller');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function mockNext() {
  return jest.fn();
}

describe('topiccontroller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createTopic creates a topic with name only', async () => {
    const req = {
      session: { user: 'user-1' },
      body: { name: 'Pentatonic scale' },
    };
    const res = mockRes();
    const next = mockNext();

    await controller.createTopic(req, res, next);

    expect(Topic.create).toHaveBeenCalled();
    const arg = Topic.create.mock.calls[0][0];
    expect(arg.userUid).toBe('user-1');
    expect(arg.name).toBe('Pentatonic scale');
    expect(arg.category).toBeNull();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('createTopic without a JSON body → 400, not a 500 (story 7.5 req.body guard)', async () => {
    const next = mockNext();
    await controller.createTopic({ session: { user: 'user-1' } }, mockRes(), next); // req.body undefined
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(Topic.create).not.toHaveBeenCalled();
  });

  test('createTopic persists category when provided', async () => {
    const req = {
      session: { user: 'user-1' },
      body: { name: 'Walking bass', category: 'Technique' },
    };
    const res = mockRes();
    const next = mockNext();

    await controller.createTopic(req, res, next);

    const arg = Topic.create.mock.calls[0][0];
    expect(arg.name).toBe('Walking bass');
    expect(arg.category).toBe('Technique');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('createTopic trims name and stores blank category as null', async () => {
    const req = {
      session: { user: 'user-1' },
      body: { name: '  Arpeggios  ', category: '   ' },
    };
    const res = mockRes();
    const next = mockNext();

    await controller.createTopic(req, res, next);

    const arg = Topic.create.mock.calls[0][0];
    expect(arg.name).toBe('Arpeggios');
    expect(arg.category).toBeNull();
  });

  test('createTopic rejects missing or blank name with 400', async () => {
    for (const body of [{}, { name: '' }, { name: '   ' }]) {
      const req = { session: { user: 'user-1' }, body };
      const res = mockRes();
      const next = mockNext();

      await controller.createTopic(req, res, next);

      expect(Topic.create).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
    }
  });

  test('createTopic rejects name or category longer than 255 characters with 400', async () => {
    for (const body of [{ name: 'a'.repeat(256) }, { name: 'Scales', category: 'b'.repeat(256) }]) {
      const req = { session: { user: 'user-1' }, body };
      const res = mockRes();
      const next = mockNext();

      await controller.createTopic(req, res, next);

      expect(Topic.create).not.toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
    }
  });

  test('createTopic maps unique constraint violation to 409', async () => {
    const uniqueError = new Error('duplicate');
    uniqueError.name = 'SequelizeUniqueConstraintError';
    Topic.create.mockRejectedValueOnce(uniqueError);

    const req = { session: { user: 'user-1' }, body: { name: 'Pentatonic scale' } };
    const res = mockRes();
    const next = mockNext();

    await controller.createTopic(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(409);
  });

  // Story 7.12: the per-user uniqueness is now case- AND accent-insensitive
  // (functional index lower(f_unaccent(name))). A case/accent collision surfaces
  // as the same DB unique violation → 409. (The DB folding itself is validated by
  // running the migration locally; here we pin the controller's normalized reply.)
  test.each([
    ['case collision (Pentatonique vs pentatonique)', 'pentatonique'],
    ['accent collision (Pentatonique vs Pentatônique)', 'Pentatônique'],
  ])('createTopic maps a %s to 409', async (_label, name) => {
    const uniqueError = new Error('duplicate');
    uniqueError.name = 'SequelizeUniqueConstraintError';
    Topic.create.mockRejectedValueOnce(uniqueError);

    const req = { session: { user: 'user-1' }, body: { name } };
    const next = mockNext();
    await controller.createTopic(req, mockRes(), next);

    expect(next.mock.calls[0][0].status).toBe(409);
  });

  test('createTopic rejects unauthenticated requests with 401', async () => {
    const req = { session: {}, body: { name: 'Scales' } };
    const res = mockRes();
    const next = mockNext();

    await controller.createTopic(req, res, next);

    expect(Topic.create).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
  });

  test('getAllTopics returns only topics owned by the logged-in user', async () => {
    const topics = [{ uid: 't1', name: 'Pentatonic scale' }];
    Topic.findAll.mockResolvedValue(topics);

    const req = { session: { user: 'user-1' } };
    const res = mockRes();
    const next = mockNext();

    await controller.getAllTopics(req, res, next);

    expect(Topic.findAll).toHaveBeenCalledWith({
      where: { userUid: 'user-1' },
      order: [['createdAt', 'DESC']],
    });
    expect(res.json).toHaveBeenCalledWith(topics);
  });

  test('getAllTopics rejects unauthenticated requests with 401', async () => {
    const req = { session: {} };
    const res = mockRes();
    const next = mockNext();

    await controller.getAllTopics(req, res, next);

    expect(Topic.findAll).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
  });

  describe('updateTopic', () => {
    function mockTopic(overrides = {}) {
      return {
        userUid: 'user-1',
        name: 'Pentatonic scale',
        category: 'Technique',
        update: jest.fn(),
        ...overrides,
      };
    }

    test('updates name and category when both provided', async () => {
      const topic = mockTopic();
      Topic.findOne.mockResolvedValue(topic);

      const req = {
        params: { uid: '11111111-1111-4111-8111-111111111111' },
        session: { user: 'user-1' },
        body: { name: '  Minor pentatonic  ', category: '  Scales  ' },
      };
      const res = mockRes();
      const next = mockNext();

      await controller.updateTopic(req, res, next);

      expect(topic.update).toHaveBeenCalledWith({ name: 'Minor pentatonic', category: 'Scales' });
      expect(res.json).toHaveBeenCalledWith(topic);
      expect(next).not.toHaveBeenCalled();
    });

    test('partial update keeps missing fields unchanged and blank category clears it', async () => {
      const topic = mockTopic();
      Topic.findOne.mockResolvedValue(topic);

      const req = {
        params: { uid: '11111111-1111-4111-8111-111111111111' },
        session: { user: 'user-1' },
        body: { category: '   ' },
      };
      const res = mockRes();
      const next = mockNext();

      await controller.updateTopic(req, res, next);

      expect(topic.update).toHaveBeenCalledWith({ name: 'Pentatonic scale', category: null });
    });

    test('rejects blank or oversized name with 400', async () => {
      for (const name of ['', '   ', 'a'.repeat(256)]) {
        const topic = mockTopic();
        Topic.findOne.mockResolvedValue(topic);

        const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: { user: 'user-1' }, body: { name } };
        const res = mockRes();
        const next = mockNext();

        await controller.updateTopic(req, res, next);

        expect(topic.update).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('rejects non-string category with 400 instead of wiping it', async () => {
      for (const category of [123, true, ['x'], { a: 1 }]) {
        const topic = mockTopic();
        Topic.findOne.mockResolvedValue(topic);

        const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: { user: 'user-1' }, body: { category } };
        const res = mockRes();
        const next = mockNext();

        await controller.updateTopic(req, res, next);

        expect(topic.update).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('explicit null category clears it', async () => {
      const topic = mockTopic();
      Topic.findOne.mockResolvedValue(topic);

      const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: { user: 'user-1' }, body: { category: null } };
      const res = mockRes();
      const next = mockNext();

      await controller.updateTopic(req, res, next);

      expect(topic.update).toHaveBeenCalledWith({ name: 'Pentatonic scale', category: null });
    });

    test('returns 404 for a malformed uid without querying the database', async () => {
      const req = { params: { uid: 'not-a-uuid' }, session: { user: 'user-1' }, body: { name: 'X' } };
      const res = mockRes();
      const next = mockNext();

      await controller.updateTopic(req, res, next);

      expect(Topic.findOne).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    test('maps unique constraint violation on rename to 409', async () => {
      const uniqueError = new Error('duplicate');
      uniqueError.name = 'SequelizeUniqueConstraintError';
      const topic = mockTopic({ update: jest.fn().mockRejectedValue(uniqueError) });
      Topic.findOne.mockResolvedValue(topic);

      const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: { user: 'user-1' }, body: { name: 'Walking bass' } };
      const res = mockRes();
      const next = mockNext();

      await controller.updateTopic(req, res, next);

      expect(next.mock.calls[0][0].status).toBe(409);
    });

    // Story 7.12: rename into a case/accent collision → same unique violation → 409.
    test('maps a case/accent collision on rename to 409', async () => {
      const uniqueError = new Error('duplicate');
      uniqueError.name = 'SequelizeUniqueConstraintError';
      const topic = mockTopic({ update: jest.fn().mockRejectedValue(uniqueError) });
      Topic.findOne.mockResolvedValue(topic);

      const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: { user: 'user-1' }, body: { name: 'Pentatônique' } };
      const next = mockNext();
      await controller.updateTopic(req, mockRes(), next);

      expect(next.mock.calls[0][0].status).toBe(409);
    });

    test('returns 404 when topic does not exist', async () => {
      Topic.findOne.mockResolvedValue(null);

      const req = { params: { uid: '99999999-9999-4999-8999-999999999999' }, session: { user: 'user-1' }, body: { name: 'X' } };
      const res = mockRes();
      const next = mockNext();

      await controller.updateTopic(req, res, next);

      expect(next.mock.calls[0][0].status).toBe(404);
    });

    test('returns 404 when topic belongs to another user (scoped out, story 7.5)', async () => {
      Topic.findOne.mockResolvedValue(null); // scoped where excludes a foreign topic

      const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: { user: 'user-1' }, body: { name: 'X' } };
      const res = mockRes();
      const next = mockNext();

      await controller.updateTopic(req, res, next);

      expect(next.mock.calls[0][0].status).toBe(404);
    });

    test('returns 401 when unauthenticated', async () => {
      const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: {}, body: { name: 'X' } };
      const res = mockRes();
      const next = mockNext();

      await controller.updateTopic(req, res, next);

      expect(Topic.findOne).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(401);
    });

    test('returns 403 and does not update the system topic (story 8.2)', async () => {
      const topic = mockTopic({ isSystem: true });
      Topic.findOne.mockResolvedValue(topic);

      const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: { user: 'user-1' }, body: { name: 'Renamed' } };
      const res = mockRes();
      const next = mockNext();

      await controller.updateTopic(req, res, next);

      expect(topic.update).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
    });
  });

  describe('deleteTopic', () => {
    test('returns 404 for a malformed uid without querying the database', async () => {
      const req = { params: { uid: 'not-a-uuid' }, session: { user: 'user-1' } };
      const res = mockRes();
      const next = mockNext();

      await controller.deleteTopic(req, res, next);

      expect(Topic.findOne).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    test('deletes an owned topic and returns a message', async () => {
      const topic = { userUid: 'user-1', destroy: jest.fn() };
      Topic.findOne.mockResolvedValue(topic);

      const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: { user: 'user-1' } };
      const res = mockRes();
      const next = mockNext();

      await controller.deleteTopic(req, res, next);

      expect(topic.destroy).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Topic deleted successfully' });
    });

    test('returns 404 when topic does not exist', async () => {
      Topic.findOne.mockResolvedValue(null);

      const req = { params: { uid: '99999999-9999-4999-8999-999999999999' }, session: { user: 'user-1' } };
      const res = mockRes();
      const next = mockNext();

      await controller.deleteTopic(req, res, next);

      expect(next.mock.calls[0][0].status).toBe(404);
    });

    test('returns 404 when topic belongs to another user (scoped out, story 7.5)', async () => {
      Topic.findOne.mockResolvedValue(null); // scoped where excludes a foreign topic

      const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: { user: 'user-1' } };
      const res = mockRes();
      const next = mockNext();

      await controller.deleteTopic(req, res, next);

      expect(next.mock.calls[0][0].status).toBe(404);
    });

    test('returns 401 when unauthenticated', async () => {
      const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: {} };
      const res = mockRes();
      const next = mockNext();

      await controller.deleteTopic(req, res, next);

      expect(Topic.findOne).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(401);
    });

    test('returns 403 and does not delete the system topic (story 8.2)', async () => {
      const topic = { userUid: 'user-1', isSystem: true, destroy: jest.fn() };
      Topic.findOne.mockResolvedValue(topic);

      const req = { params: { uid: '11111111-1111-4111-8111-111111111111' }, session: { user: 'user-1' } };
      const res = mockRes();
      const next = mockNext();

      await controller.deleteTopic(req, res, next);

      expect(topic.destroy).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
    });
  });
});
