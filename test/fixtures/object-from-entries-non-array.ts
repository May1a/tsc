declare function print(value: unknown): void;

const source: { a?: unknown } = { a: "a" };
const obj: { a?: unknown } = Object.fromEntries(source);
print(obj.a);
