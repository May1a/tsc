declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];
const found = arr.findIndex((value) => Number(value) > 1);
const missing = arr.findIndex((value) => Number(value) > 9);
print(found);
print(missing);
