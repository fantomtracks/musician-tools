// A table cell hosting one of the shared selection checkboxes
// (src/components/SelectionCheckbox.tsx, story 22.1) must establish a positioning
// context: the primitive stretches its <label> over the whole cell (`absolute inset-0`)
// so the hit area is the cell, not the 16px box. Go through this helper rather than
// hand-writing `relative`, so a new list surface cannot forget it and end up with a
// checkbox positioned against some far-away ancestor.
export const selectionCell = (className: string) => `relative ${className}`;
