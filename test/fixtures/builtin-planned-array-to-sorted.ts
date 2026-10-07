declare function print(value: unknown): void;

const arr: unknown[] = [2, 1];
// @ts-expect-error Array.prototype.toSorted is ES2023 and the repo lib is ES2022.
const sorted: unknown[] = arr.toSorted();
print(sorted[0]);
