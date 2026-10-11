declare function print(value: unknown): void;
const arr: unknown[] = [1, 2];
const copy = arr.map((value) => value);
print(copy.length);
print(copy[0]);
print(copy[1]);
