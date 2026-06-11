declare function print(value: unknown): void;

const value: unknown = 1;
const values: unknown[] = Object.values(value);
print(values.length);
