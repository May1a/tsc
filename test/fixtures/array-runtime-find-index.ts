declare function print(value: unknown): void;

const arr: unknown[] = [, "first"];
const empty: unknown[] = [];
// @ts-expect-error The compiler intentionally supports this callback-free runtime slice.
print(arr.findIndex());
// @ts-expect-error The compiler intentionally supports this callback-free runtime slice.
print(empty.findIndex());
