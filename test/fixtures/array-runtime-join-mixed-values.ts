declare function print(value: unknown): void;

const obj: { value?: unknown } = { value: "x" };
const arr: unknown[] = ["a", undefined, true, null, obj];

print(arr.join("|"));
