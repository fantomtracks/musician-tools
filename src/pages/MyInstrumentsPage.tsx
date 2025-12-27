import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { instrumentService, type Instrument, type CreateInstrumentDTO, type UpdateInstrumentDTO } from '../services/instrumentService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { instrumentTypeOptions } from '../constants/instrumentTypes';

function MyInstrumentsPage() {
  const { logout } = useAuth();
  const [list, setList] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [deleteUid, setDeleteUid] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editModel, setEditModel] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await instrumentService.getAll();
        setList(data);
      } catch {
        setError('Failed to load instruments');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setLoading(true);
      const payload: CreateInstrumentDTO = { name: name.trim(), type: type || undefined, brand: brand || undefined, model: model || undefined };
      const created = await instrumentService.create(payload);
      setList([created, ...list]);
      setName('');
      setType('');
      setBrand('');
      setModel('');
    } catch {
      setError('Failed to add instrument');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUid) return;
    try {
      setLoading(true);
      await instrumentService.remove(deleteUid);
      setList(list.filter(i => i.uid !== deleteUid));
      setDeleteUid(null);
    } catch {
      setError('Failed to delete instrument');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (item: Instrument) => {
    setEditingUid(item.uid);
    setEditName(item.name);
    setEditType(item.type || '');
    setEditBrand(item.brand || '');
    setEditModel(item.model || '');
  };

  const cancelEdit = () => {
    setEditingUid(null);
  };

  const saveEdit = async () => {
    if (!editingUid) return;
    try {
      setLoading(true);
      const payload: UpdateInstrumentDTO = {
        name: editName.trim() || undefined,
        type: editType || undefined,
        brand: editBrand || undefined,
        model: editModel || undefined,
      };
      const updated = await instrumentService.update(editingUid, payload);
      setList(list.map(i => (i.uid === editingUid ? updated : i)));
      setEditingUid(null);
    } catch {
      setError('Failed to update instrument');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <ConfirmDialog
        isOpen={!!deleteUid}
        title="Delete instrument"
        message="Are you sure you want to delete this instrument?"
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={handleDelete}
        onCancel={() => setDeleteUid(null)}
      />
      {error && (
        <div className="mx-4 my-4 rounded-md border border-red-300 bg-red-50 text-red-700 p-3 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" className="rounded-md px-2 py-1 hover:bg-red-100" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      <div className="container mx-auto px-4 py-8">
        <PageHeader loading={loading} />

        <h2 className="text-lg font-medium mb-2">My instruments</h2>

        <form onSubmit={handleAdd} className="mb-4 grid grid-cols-1 md:grid-cols-5 gap-2">
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            disabled={loading}
          >
            <option value="">Select type</option>
            {instrumentTypeOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <input
            placeholder="Name (ex. 5 strings bass)"
            value={name}
            onChange={e => setName(e.target.value)}
            className="rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            disabled={loading}
          />
          <input
            placeholder="Brand (ex Fender)"
            value={brand}
            onChange={e => setBrand(e.target.value)}
            className="rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            disabled={loading}
          />
          <input
            placeholder="Model (ex. Stratocaster)"
            value={model}
            onChange={e => setModel(e.target.value)}
            className="rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            disabled={loading}
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600 disabled:opacity-50"
            disabled={loading || !name.trim()}
          >
            Add
          </button>
          {/* Notes field removed */}
        </form>

        {loading ? (
          <p>Loading...</p>
        ) : list.length === 0 ? (
          <p>No instruments saved yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left p-2 border-b">Type</th>
                <th className="text-left p-2 border-b">Name</th>
                <th className="text-left p-2 border-b">Brand</th>
                <th className="text-left p-2 border-b">Model</th>
                <th className="text-right p-2 border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                editingUid === item.uid ? (
                  <tr key={item.uid} className="bg-yellow-50">
                    <td className="p-2 align-top">
                      <select
                        value={editType}
                        onChange={e => setEditType(e.target.value)}
                        className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        disabled={loading}
                      >
                        <option value="">Select type</option>
                        {instrumentTypeOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 align-top">
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        disabled={loading}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <input
                        value={editBrand}
                        onChange={e => setEditBrand(e.target.value)}
                        className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        disabled={loading}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <input
                        value={editModel}
                        onChange={e => setEditModel(e.target.value)}
                        className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        disabled={loading}
                      />
                    </td>
                    <td className="p-2 align-top text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md bg-gray-200 text-gray-800 px-3 py-1.5 hover:bg-gray-300 disabled:opacity-50"
                          onClick={cancelEdit}
                          disabled={loading}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 disabled:opacity-50"
                          onClick={saveEdit}
                          disabled={loading || !editName.trim()}
                        >
                          Save
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.uid} className="hover:bg-gray-50">
                    <td className="p-2 align-top">{item.type || '-'}</td>
                    <td className="p-2 align-top">{item.name}</td>
                    <td className="p-2 align-top">{item.brand || '-'}</td>
                    <td className="p-2 align-top">{item.model || '-'}</td>
                    <td className="p-2 align-top text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md bg-gray-200 text-gray-800 px-3 py-1.5 hover:bg-gray-300 disabled:opacity-50"
                          onClick={() => startEdit(item)}
                          disabled={loading}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 disabled:opacity-50"
                          onClick={() => setDeleteUid(item.uid)}
                          disabled={loading}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default MyInstrumentsPage;
