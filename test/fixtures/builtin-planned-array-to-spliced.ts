declare function print(value: unknown): void;

const arr: unknown[] = [1, 2];
// @ts-expect-error Array.prototype.toSpliced is ES2023 and the repo lib is ES2022.
const spliced: unknown[] = arr.toSpliced(0, 1);
print(spliced.length);
