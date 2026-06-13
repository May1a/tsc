declare function print(value: unknown): void;

const obj = { x: "ex", y: "why" };
const { x, y } = obj;
print(x);
print(y);

const fixed = { a: 1, b: 2 };
const { a, b } = fixed;
print(a);
print(b);
