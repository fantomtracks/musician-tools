// Strict numeric typing: Safari does not restrict <input type="number"> (any
// text can be typed) and Chrome still allows 'e'/'+'/'-' — filter at the
// keystroke so minutes fields only ever hold digits (epic-2 retro action #1)
export function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}
