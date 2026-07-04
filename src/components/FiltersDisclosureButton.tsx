export interface FiltersDisclosureButtonProps {
  open: boolean;
  onToggle: () => void;
  activeFilterCount: number;
}

// Mobile-only (< lg) disclosure toggle for the filters sidebar. Above lg the sidebar
// is shown statically, so this button is hidden. The active-filter count stays visible
// even when collapsed so no filtering is ever hidden.
export default function FiltersDisclosureButton({ open, onToggle, activeFilterCount }: FiltersDisclosureButtonProps) {
  const label = activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="songs-sidebar"
      aria-label={open ? 'Hide filters' : 'Show filters'}
      className="lg:hidden w-full card-base glass-effect flex items-center justify-between px-3 h-10 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      <span>{label}</span>
      <span className="text-xl" aria-hidden="true">{open ? '▾' : '▸'}</span>
    </button>
  );
}
