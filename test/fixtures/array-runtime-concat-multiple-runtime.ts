declare function print(value: unknown): void;

const a: unknown[] = [1, 2];
const b: unknown[] = [3, 4];
const c: unknown[] = [5, 6];
const merged: unknown[] = a.concat(b, c);
print(merged.length);
print(merged[0]);
print(merged[1]);
print(merged[2]);
print(merged[3]);
print(merged[4]);
print(merged[5]);
