declare function print(value: unknown): void;

const key = "inner";
const obj = { inner: { x: 1 } };
print(obj[key]);
