import type { CatalogFacets } from '../services/catalogService';

type FacetKey = 'genre' | 'key' | 'mode' | 'timeSignature';
type Selected = Record<FacetKey, string[]>;

// Facet pills for the Catalog browse (story 19.3 polish). Values come from the
// server facet endpoint (distinct values present in the whole Catalog), so selecting
// a pill always matches real data — no case/accent mismatch. Multi-select within a
// dimension = OR; across dimensions = AND (handled server-side).
export default function CatalogFilters({
  facets,
  selected,
  onToggle,
}: {
  facets: CatalogFacets;
  selected: Selected;
  onToggle: (param: FacetKey, value: string) => void;
}) {
  const groups: { param: FacetKey; label: string; values: string[] }[] = [
    { param: 'genre', label: 'Genre', values: facets.genre },
    { param: 'key', label: 'Key', values: facets.key },
    { param: 'mode', label: 'Mode', values: facets.mode },
    { param: 'timeSignature', label: 'Time signature', values: facets.timeSignature },
  ];
  const visible = groups.filter(g => g.values.length > 0);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      {visible.map(g => (
        <div key={g.param}>
          <div className="label-base mb-1">{g.label}</div>
          <div className="flex flex-wrap gap-2">
            {g.values.map(v => {
              const active = selected[g.param].includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggle(g.param, v)}
                  className={
                    active
                      ? 'rounded-full px-3 py-1 text-sm transition-colors bg-brand-500 text-white hover:bg-brand-600'
                      : 'rounded-full px-3 py-1 text-sm transition-colors border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
                  }
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
