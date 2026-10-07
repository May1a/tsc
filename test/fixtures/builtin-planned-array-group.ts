declare function print(value: unknown): void;

const arr: unknown[] = [1, 2];
// @ts-expect-error Array.prototype.group is ES2024 and the repo lib is ES2022.
const grouped = arr.group((value) => String(value));
print("unreachable");
