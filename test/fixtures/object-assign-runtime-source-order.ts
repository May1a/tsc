declare function print(value: unknown): void;

const target: { a?: unknown; b?: unknown } = {};
const first: { a?: unknown; b?: unknown } = { a: "first", b: "first-b" };
const second = { a: 2 };

Object.assign(target, first, second);

print(target.a);
print(target.b);
