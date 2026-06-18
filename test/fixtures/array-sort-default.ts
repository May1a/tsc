declare function print(value: unknown): void;
const values: unknown[] = [10, 2, 1];
const sorted = values.sort();
print(sorted.length);
print(sorted[0]);
print(sorted[1]);
print(sorted[2]);
