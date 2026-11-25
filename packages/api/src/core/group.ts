// Rows grouped by a key: each key's rows in their input order, keys in the order first seen.
// Each row is pushed onto its group; copying the group for every row is quadratic in a
// worker's history.
export function groupBy<T, K>(rows: Iterable<T>, keyOf: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [row]);
    else group.push(row);
  }
  return groups;
}
