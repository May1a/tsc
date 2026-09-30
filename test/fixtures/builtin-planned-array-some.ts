declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];
// The callback form is the one a user writes; the zero-argument slice the compiler does lower is a
// placeholder whose result is not what JavaScript computes.
const answered: unknown = arr.some(() => true);
print(answered);
