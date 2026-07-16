import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AutocompleteInput } from './AutocompleteInput';

// Controlled harness so the input reflects typed/selected values like a real parent.
function Harness({ suggestions, initial = '' }: { suggestions: string[]; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="ac">Field</label>
      <AutocompleteInput id="ac" value={value} onValueChange={setValue} suggestions={suggestions} inputClassName="input-x" />
    </>
  );
}

const opt = (name: string) => screen.queryByRole('option', { name });

test('opens on focus and lists the filtered suggestions', () => {
  render(<Harness suggestions={['The Beatles', 'The Who']} />);
  fireEvent.focus(screen.getByLabelText('Field'));
  expect(opt('The Beatles')).toBeInTheDocument();
  expect(opt('The Who')).toBeInTheDocument();
});

test('typing filters case-insensitively', () => {
  render(<Harness suggestions={['The Beatles', 'The Who']} />);
  fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'who' } });
  expect(opt('The Who')).toBeInTheDocument();
  expect(opt('The Beatles')).not.toBeInTheDocument();
});

test('hides the list on a single EXACT match (no 1-item list of what you typed)', () => {
  render(<Harness suggestions={['The Beatles']} />);
  fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'The Beatles' } });
  expect(opt('The Beatles')).not.toBeInTheDocument();
});

test('ArrowDown highlights then Enter selects (aria-activedescendant + value)', () => {
  render(<Harness suggestions={['The Beatles', 'The Who']} />);
  const input = screen.getByLabelText('Field') as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input).toHaveAttribute('aria-activedescendant', 'ac-list-opt-0');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input.value).toBe('The Beatles');
  expect(opt('The Beatles')).not.toBeInTheDocument(); // closed after select
});

test('Enter does not submit a surrounding form while picking', () => {
  const onSubmit = jest.fn(e => e.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <Harness suggestions={['The Beatles']} />
    </form>,
  );
  const input = screen.getByLabelText('Field');
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSubmit).not.toHaveBeenCalled();
});

test('Enter with NO option highlighted still does not submit the form', () => {
  const onSubmit = jest.fn(e => e.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <Harness suggestions={['The Beatles']} />
    </form>,
  );
  const input = screen.getByLabelText('Field');
  fireEvent.change(input, { target: { value: 'Something not in the list' } }); // no highlight
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSubmit).not.toHaveBeenCalled();
});

test('defaults autoComplete to off (no browser autofill over the custom listbox)', () => {
  render(<Harness suggestions={['The Beatles']} />);
  expect(screen.getByLabelText('Field')).toHaveAttribute('autocomplete', 'off');
});

test('clicking an option selects it and closes the list', () => {
  render(<Harness suggestions={['The Beatles', 'The Who']} />);
  const input = screen.getByLabelText('Field') as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole('option', { name: 'The Who' }));
  expect(input.value).toBe('The Who');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('Escape closes the list', () => {
  render(<Harness suggestions={['The Beatles', 'The Who']} />);
  const input = screen.getByLabelText('Field');
  fireEvent.focus(input);
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('exposes combobox a11y wiring on the input', () => {
  render(<Harness suggestions={['The Beatles']} />);
  const input = screen.getByLabelText('Field');
  expect(input).toHaveAttribute('role', 'combobox');
  expect(input).toHaveAttribute('aria-controls', 'ac-list');
});
