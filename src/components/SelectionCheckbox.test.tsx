import { StrictMode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RowSelectionCheckbox, SelectAllCheckbox } from './SelectionCheckbox';
import { selectionCell } from '../utils/selectionCell';

// A row checkbox always lives inside a clickable row — that's the whole point of the
// stopPropagation guarantee, so every row test renders it in one.
const renderInRow = (ui: React.ReactElement, onRowClick: () => void) => render(
  <StrictMode>
    <table><tbody>
      <tr onClick={onRowClick}>
        <td className="p-2 text-center w-12">{ui}</td>
      </tr>
    </tbody></table>
  </StrictMode>
);

test('the row checkbox labels itself from the row it selects', () => {
  renderInRow(<RowSelectionCheckbox checked={false} onChange={() => {}} label="Zombie" />, () => {});
  expect(screen.getByLabelText('Select Zombie')).toBeInTheDocument();
});

test('ticking the row checkbox selects the row and NEVER opens it', () => {
  const onChange = jest.fn();
  const onRowClick = jest.fn();
  renderInRow(<RowSelectionCheckbox checked={false} onChange={onChange} label="Zombie" />, onRowClick);

  fireEvent.click(screen.getByLabelText('Select Zombie'));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onRowClick).not.toHaveBeenCalled();
});

test('clicking anywhere in the cell selects the row instead of opening it', () => {
  const onChange = jest.fn();
  const onRowClick = jest.fn();
  const { container } = renderInRow(
    <RowSelectionCheckbox checked={false} onChange={onChange} label="Zombie" />, onRowClick
  );
  // The label is stretched over the whole cell, so a click landing beside the 16px box
  // still reaches it — and is still kept away from the row.
  const wrapper = container.querySelector('label') as HTMLElement;
  fireEvent.click(wrapper);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onRowClick).not.toHaveBeenCalled();
});

// jsdom has no layout, so the only way to pin the full-cell hit area is structural:
// the label must be stretched, and its cell must give it a positioning context.
test('the hit area is stretched over the cell, which the cell helper makes possible', () => {
  const { container } = renderInRow(
    <RowSelectionCheckbox checked={false} onChange={() => {}} label="Zombie" />, () => {}
  );
  expect(container.querySelector('label')).toHaveClass('absolute', 'inset-0');
  expect(selectionCell('p-2 text-center w-12')).toBe('relative p-2 text-center w-12');
});

// The row has no keyboard handler, so the primitive must NOT swallow keydown: doing so
// would kill window-level shortcuts (the header's Escape) from a focused checkbox.
test('keyboard events are left alone, they must keep reaching the page', () => {
  const onKeyDown = jest.fn();
  render(
    <StrictMode>
      <div onKeyDown={onKeyDown}>
        <RowSelectionCheckbox checked={false} onChange={() => {}} label="Zombie" />
      </div>
    </StrictMode>
  );
  fireEvent.keyDown(screen.getByLabelText('Select Zombie'), { key: 'Escape' });
  expect(onKeyDown).toHaveBeenCalledTimes(1);
});

// `disabled` is forwarded to the input, which is what blocks interaction in a real
// browser — jsdom's fireEvent does not emulate that activation block, so asserting the
// attribute is the honest test here (same for the select-all box below).
test('a disabled row checkbox is really disabled, and still never opens the row', () => {
  const onRowClick = jest.fn();
  renderInRow(<RowSelectionCheckbox checked={false} onChange={() => {}} label="Zombie" disabled />, onRowClick);
  const box = screen.getByLabelText('Select Zombie');
  expect(box).toBeDisabled();
  fireEvent.click(box);
  expect(onRowClick).not.toHaveBeenCalled();
});

test('the row checkbox reflects the selected state', () => {
  renderInRow(<RowSelectionCheckbox checked onChange={() => {}} label="Creep" />, () => {});
  expect(screen.getByLabelText('Select Creep')).toBeChecked();
});

test('the select-all checkbox announces the action it will perform', () => {
  const onToggle = jest.fn();
  const { unmount } = render(
    <StrictMode><SelectAllCheckbox allSelected={false} onToggle={onToggle} /></StrictMode>
  );
  const selectAll = screen.getByLabelText('Select all');
  expect(selectAll).not.toBeChecked();
  fireEvent.click(selectAll);
  expect(onToggle).toHaveBeenCalledTimes(1);
  unmount();

  render(<StrictMode><SelectAllCheckbox allSelected onToggle={() => {}} /></StrictMode>);
  expect(screen.getByLabelText('Deselect all')).toBeChecked();
});

test('a disabled select-all is really disabled', () => {
  render(<StrictMode><SelectAllCheckbox allSelected={false} onToggle={() => {}} disabled /></StrictMode>);
  expect(screen.getByLabelText('Select all')).toBeDisabled();
});
