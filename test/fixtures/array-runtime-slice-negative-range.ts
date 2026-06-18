declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c"];
const copy: unknown[] = arr.slice(-2, -1);
print(copy.length);
print(copy[0]);
