declare function print(value: unknown): void;

const value: unknown = 1;
const keys: unknown[] = Object.keys(value);
print(keys.length);
