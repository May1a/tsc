declare function print(value: unknown): void;

const fixed: number[] = [7, 8];
const rt: unknown[] = [1, 2];
const merged: unknown[] = rt.concat(fixed, [9]);
print(merged.length);
print(merged[0]);
print(merged[2]);
print(merged[4]);
