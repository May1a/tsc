declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];
// @ts-expect-error Array.prototype.findLast is ES2023 and the repo lib is ES2022.
const found: unknown = arr.findLast((value) => value === 2);
print(found);
