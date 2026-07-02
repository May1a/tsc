declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];
const found = arr.find((value) => Number(value) > 1);
const missing = arr.find((value) => Number(value) > 9);
print(found);
print(missing);
