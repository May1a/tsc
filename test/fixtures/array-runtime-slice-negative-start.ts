declare function print(value: unknown): void;

const arr: unknown[] = ["x"];
const copy: unknown[] = arr.slice(-1);
print(copy.length);
