declare function print(value: unknown): void;

const obj: { a?: unknown } = { a: 1 };
const grouped = Object.groupBy([1, 2], (value) => String(value));
print(typeof grouped);
