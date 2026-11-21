declare function print(value: unknown): void;

const orig = [3, 1, 2];
const sorted = orig.toSorted((a: number, b: number) => a - b);
const desc = orig.toSorted((a: number, b: number) => b - a);
print(orig.join(","));
print(sorted.join(","));
print(desc.join(","));
