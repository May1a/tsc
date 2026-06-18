declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];
// @ts-expect-error The compiler intentionally supports this callback-free runtime slice.
const result: unknown = arr.forEach();
print(result);
print(arr.length);
