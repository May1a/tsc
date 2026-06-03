declare function print(value: unknown): void;

const fixed = { x: 3 };
const dynamic = { x: "runtime" };
print(fixed.x);
print(dynamic.x);
