declare function print(value: unknown): void;
const values: unknown[] = [1, 3, 2];
function descending(left: unknown, right: unknown): number {
  return Number(right) - Number(left);
}
const sorted = values.sort(descending);
print(sorted[0]);
print(sorted[1]);
print(sorted[2]);
