import { useEffect, useRef } from 'react';

export default function LazyLoadFooter({
  hasMore,
  loading,
  onLoadMore,
  label,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || loading) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const root = node.closest<HTMLElement>('[data-lazy-root]');
    const io = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) onLoadMore();
    }, { root, rootMargin: '40px' });
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore && !loading) return null;

  return (
    <div ref={ref} className="px-3 py-2 text-center border-t border-gray-100 dark:border-gray-700">
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading more…</p>
      ) : (
        <button type="button" className="btn-secondary text-sm" onClick={onLoadMore}>
          {label}
        </button>
      )}
    </div>
  );
}
