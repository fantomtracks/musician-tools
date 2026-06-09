import { apiFetch } from './apiFetch';
export type Instrument = {
  uid: string;
  name: string;
  type?: string;
  brand?: string;
  model?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateInstrumentDTO = Omit<Instrument, 'uid' | 'createdAt' | 'updatedAt'>;
export type UpdateInstrumentDTO = Partial<CreateInstrumentDTO>;

const API_BASE = '/api';

export const instrumentService = {
  async getAll(): Promise<Instrument[]> {
    const res = await apiFetch(`${API_BASE}/instruments`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to fetch instruments');
    return res.json();
  },
  async create(payload: CreateInstrumentDTO): Promise<Instrument> {
    const res = await apiFetch(`${API_BASE}/instruments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to create instrument');
    return res.json();
  },
  async update(uid: string, payload: UpdateInstrumentDTO): Promise<Instrument> {
    const res = await apiFetch(`${API_BASE}/instruments/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to update instrument');
    return res.json();
  },
  async remove(uid: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/instruments/${uid}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) throw new Error('Failed to delete instrument');
  },
};
