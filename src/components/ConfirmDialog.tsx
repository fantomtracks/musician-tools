import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isDangerous?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDangerous = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const handleConfirmClick = async () => {
    try {
      await onConfirm();
    } catch (err) {
      console.error('Error in confirm callback:', err);
    }
  };

  // Rendered through a portal to document.body: the overlay is `position: fixed`, but any
  // ancestor with a transform / filter / backdrop-filter (e.g. the fiche's .glass-effect card)
  // becomes its containing block and would clip the overlay to that card instead of the
  // viewport. Portaling to the body guarantees the backdrop covers the whole page everywhere.
  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50"
      onClick={onCancel}
      role="dialog"
      tabIndex={-1}
      aria-modal="true"
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm mx-4"
        onClick={e => e.stopPropagation()}
        role="document"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`inline-flex items-center rounded-md text-white px-4 py-2 ${
              isDangerous
                ? 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800'
                : 'bg-brand-500 hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700'
            }`}
            onClick={handleConfirmClick}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
