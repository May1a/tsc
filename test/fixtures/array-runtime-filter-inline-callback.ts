declare function print(value: unknown): void;
const arr: unknown[] = [1, 2];
const filtered = arr.filter((value) => value);
print(filtered.length);
print(filtered[0]);
print(filtered[1]);
