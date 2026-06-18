declare function print(value: unknown): void;

const obj = { value: 1 };
const values: unknown[] = Object.values(obj);
print(values.length);
