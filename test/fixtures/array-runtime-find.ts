declare function print(value: unknown): void;

const arr: unknown[] = [, "first", "second"];
const empty: unknown[] = [];
// @ts-expect-error The compiler intentionally supports this callback-free runtime slice.
print(arr.find());
// @ts-expect-error The compiler intentionally supports this callback-free runtime slice.
print(empty.find());
