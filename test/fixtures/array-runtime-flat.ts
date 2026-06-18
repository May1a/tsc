declare function print(value: unknown): void;

const inner1: unknown[] = [2, 3];
const inner2: unknown[] = [4];
const inner3: unknown[] = [5];
const deep: unknown[] = [inner2, inner3];
const arr: unknown[] = [1, inner1, deep];
const flat: unknown[] = arr.flat();
print(flat.length);
print(flat[0]);
print(flat[1]);
print(flat[2]);
print(flat[3]);
print(flat[4]);
