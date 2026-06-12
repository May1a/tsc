declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];
const flat: unknown[] = arr.flat(0);
print(flat.length);
print(flat[0]);
print(flat[1]);
print(flat[2]);
