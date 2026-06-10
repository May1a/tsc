declare function print(value: unknown): void;

const arr: unknown[] = ["x"];
const obj: { value?: unknown } = {};

print(Array.isArray(arr));
print(Array.isArray(obj));
