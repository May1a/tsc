declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];
// @ts-expect-error Array.prototype.findLastIndex is ES2023 and the repo lib is ES2022.
print(arr.findLastIndex((value) => value === 2));
