declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];
// @ts-expect-error Array.prototype.with is ES2023 and the repo lib is ES2022; the point is the compiler's refusal.
const replaced: unknown[] = arr.with(0, 9);
print(replaced.length);
