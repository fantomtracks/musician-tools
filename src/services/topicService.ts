import { apiFetch } from './apiFetch';
export type Topic = {
  uid: string;
  name: string;
  category?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateTopicDTO = Omit<Topic, 'uid' | 'createdAt' | 'updatedAt'>;
export type UpdateTopicDTO = Partial<CreateTopicDTO>;

const API_BASE = '/api';

export const topicService = {
  async getAll(): Promise<Topic[]> {
    const res = await apiFetch(`${API_BASE}/topics`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to fetch topics');
    return res.json();
  },
  async create(payload: CreateTopicDTO): Promise<Topic> {
    const res = await apiFetch(`${API_BASE}/topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });
    if (res.status === 409) throw new Error('Topic already exists');
    if (!res.ok) throw new Error('Failed to create topic');
    return res.json();
  },
  async update(uid: string, payload: UpdateTopicDTO): Promise<Topic> {
    const res = await apiFetch(`${API_BASE}/topics/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });
    if (res.status === 409) throw new Error('Topic already exists');
    if (!res.ok) throw new Error('Failed to update topic');
    return res.json();
  },
  async remove(uid: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/topics/${uid}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) throw new Error('Failed to delete topic');
  },
};
