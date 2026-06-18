import { useEffect, useState } from 'react';
import { topicService, type Topic, type CreateTopicDTO, type UpdateTopicDTO } from '../services/topicService';
import { ConfirmDialog } from '../components/ConfirmDialog';

function MyTopicsPage() {
  const [list, setList] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [deleteUid, setDeleteUid] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await topicService.getAll();
        setList(data);
        setLoadFailed(false);
      } catch {
        setError('Failed to load topics');
        setLoadFailed(true);
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
      setError(null);
      const payload: CreateTopicDTO = { name: name.trim(), category: category.trim() || undefined };
      const created = await topicService.create(payload);
      setList(prev => [created, ...prev]);
      setName('');
      setCategory('');
    } catch (err) {
      setError(err instanceof Error && err.message === 'Topic already exists'
        ? 'Topic already exists'
        : 'Failed to add topic');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUid) return;
    const uid = deleteUid;
    // Close the dialog before the request: prevents a double-click from firing
    // a duplicate DELETE, and keeps the error banner visible if the call fails.
    setDeleteUid(null);
    try {
      setLoading(true);
      setError(null);
      await topicService.remove(uid);
      setList(prev => prev.filter(t => t.uid !== uid));
    } catch {
      setError('Failed to delete topic');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (item: Topic) => {
    setEditingUid(item.uid);
    setEditName(item.name);
    setEditCategory(item.category || '');
  };

  const cancelEdit = () => {
    setEditingUid(null);
  };

  const saveEdit = async () => {
    if (!editingUid || !editName.trim()) return;
    try {
      setLoading(true);
      setError(null);
      // Always send category: an empty string tells the API to clear it
      // (undefined would be dropped by JSON.stringify and leave it unchanged).
      const payload: UpdateTopicDTO = { name: editName.trim(), category: editCategory.trim() };
      const updated = await topicService.update(editingUid, payload);
      setList(prev => prev.map(t => (t.uid === editingUid ? updated : t)));
      setEditingUid(null);
    } catch (err) {
      setError(err instanceof Error && err.message === 'Topic already exists'
        ? 'Topic already exists'
        : 'Failed to update topic');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-950 text-gray-900 dark:text-gray-100">
      <ConfirmDialog
        isOpen={!!deleteUid}
        title="Delete topic"
        message={`Are you sure you want to delete "${list.find(t => t.uid === deleteUid)?.name ?? 'this topic'}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={handleDelete}
        onCancel={() => setDeleteUid(null)}
      />
      {error && (
        <div role="alert" className="mx-4 my-4 card-base glass-effect text-red-700 bg-red-50/80 border border-red-200 dark:text-red-300 dark:bg-red-900/40 dark:border-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" className="btn-secondary text-xs" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        <div className="card-base glass-effect p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My topics</h2>
          </div>

          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="topic-name" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Name
              </label>
              <input
                id="topic-name"
                placeholder="e.g. Pentatonic scale"
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-base text-sm"
                maxLength={255}
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="topic-category" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Category
              </label>
              <input
                id="topic-category"
                placeholder="e.g. Technique (optional)"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="input-base text-sm"
                maxLength={255}
                disabled={loading}
              />
            </div>
            <div className="flex flex-col justify-end">
              <button
                type="submit"
                className="btn-primary justify-center"
                disabled={loading || !name.trim()}
              >
                Add
              </button>
            </div>
          </form>

          {loading ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {loadFailed ? 'Topics could not be loaded.' : 'No topics saved yet.'}
            </p>
          ) : (
            <div className="card-base overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm">
                    <tr>
                      <th className="text-left p-2 border-b dark:border-gray-700 uppercase text-xs font-semibold tracking-wide">Name</th>
                      <th className="text-left p-2 border-b dark:border-gray-700 uppercase text-xs font-semibold tracking-wide">Category</th>
                      <th className="text-right p-2 border-b dark:border-gray-700 uppercase text-xs font-semibold tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(item => (
                      editingUid === item.uid ? (
                        <tr key={item.uid} className="bg-sky-50 dark:bg-sky-900/40 border border-sky-200 dark:border-sky-700/60">
                          <td className="p-2 align-top">
                            <input
                              aria-label="Edit name"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="input-base text-sm"
                              maxLength={255}
                              disabled={loading}
                            />
                          </td>
                          <td className="p-2 align-top">
                            <input
                              aria-label="Edit category"
                              value={editCategory}
                              onChange={e => setEditCategory(e.target.value)}
                              className="input-base text-sm"
                              maxLength={255}
                              disabled={loading}
                            />
                          </td>
                          <td className="p-2 align-top text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="btn-secondary text-sm"
                                onClick={cancelEdit}
                                disabled={loading}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn-primary text-sm"
                                onClick={saveEdit}
                                disabled={loading || !editName.trim()}
                              >
                                Save
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={item.uid} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="p-2 align-middle">{item.name}</td>
                          <td className="p-2 align-middle">{item.category || '-'}</td>
                          <td className="p-2 align-middle text-right">
                            {/* Story 8.2: the system "Free practice" topic can't be
                                renamed or deleted (the backend blocks it too) —
                                show a discreet badge instead of the actions. */}
                            {item.isSystem ? (
                              <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800">
                                System
                              </span>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  aria-label={`Edit ${item.name}`}
                                  className="btn-secondary text-sm"
                                  onClick={() => startEdit(item)}
                                  disabled={loading}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Delete ${item.name}`}
                                  className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50"
                                  onClick={() => setDeleteUid(item.uid)}
                                  disabled={loading}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyTopicsPage;
