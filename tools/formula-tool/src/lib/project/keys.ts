const INVALID_CHARS = /[^A-Za-z0-9_]/g;

export function uniqueKey(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  let root = base.replace(INVALID_CHARS, '_');
  if (root.length === 0 || !/^[A-Za-z_]/.test(root)) {
    root = `_${root}`;
  }
  if (!taken.has(root)) return root;
  let i = 2;
  while (taken.has(`${root}_${i}`)) i++;
  return `${root}_${i}`;
}
