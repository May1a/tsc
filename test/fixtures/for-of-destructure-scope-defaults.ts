declare function print(value: unknown): void;
function fallback(): number { print("fallback"); return 99; }
const pairs: [number, number?][] = [[1, 2], [3], [4, 0]];
let value = 50;
for (const [value, next = fallback()] of pairs) {
  if (value === 1) { continue; }
  print(value); print(next);
}
for (const [value, next = value] of pairs) { print(value); print(next); }
print(value);
const objects = [{ value: 1 }, { value: 2 }];
for (const { value } of objects) { print(value); }
for (const { value } of objects) { print(value); }
const entries = new Set<number[]>();
entries.add([7, 8]);
for (const [first, second] of entries) { print(first); print(second); }
