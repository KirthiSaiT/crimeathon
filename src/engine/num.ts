// Math.min(...array) and Math.max(...array) pass every element as an argument, and fail with
// "Maximum call stack size exceeded" on a few hundred thousand of them. Logs can be that long, so use a loop.
export function maxOf(values: Iterable<number>): number {
  let m = -Infinity;
  for (const v of values) if (v > m) m = v;
  return m;
}

export function minOf(values: Iterable<number>): number {
  let m = Infinity;
  for (const v of values) if (v < m) m = v;
  return m;
}
