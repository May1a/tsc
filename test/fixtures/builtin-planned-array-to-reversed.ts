declare function print(value: unknown): void;

const arr: unknown[] = [1, 2];
// @ts-expect-error Array.prototype.toReversed is ES2023 and the repo lib is ES2022.
const reversed: unknown[] = arr.toReversed();
print(reversed[0]);
