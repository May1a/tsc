declare function print(value: unknown): void;

const target: { a?: unknown; b?: unknown; c?: unknown } = {};
const fixed = { a: 1 };
const runtime: { b?: unknown } = { b: "b" };

Object.assign(target, fixed, runtime);

print(target.a);
print(target.b);
