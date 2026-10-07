declare function print(value: unknown): void;

const arr: unknown[] = [1, 2];
// `for...of` over a call is not lowered at all, so the call is stated on its own to reach the
// builtin dispatch.
const iterator: unknown = arr.values();
print(iterator);
