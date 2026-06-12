declare function print(value: unknown): void;

const inner: unknown[] = [1, 2];
const arr: unknown[] = ["a", inner, true];
print(String(arr));
