declare function print(value: unknown): void;

const arr: unknown[] = ["a", , "c"];
const copy: unknown[] = arr.slice();
print(copy.length);
print(copy[1]);
print(copy[2]);
