declare function print(value: unknown): void;
function fallback(): number[] { print("array fallback"); return [7, 8]; }
const rows: [number[]?][] = [[[1, 2]], [], [[3, 4]]];
for (const [[a, b] = fallback()] of rows) { print(a); print(b); }
const objects: { items?: number[] }[] = [{ items: [5, 6] }, {}];
for (const { items: [a, b] = fallback() } of objects) { print(a); print(b); }
