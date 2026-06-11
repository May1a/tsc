declare function print(value: unknown): void;

const value: unknown = 1;
const entries: unknown[] = Object.entries(value);
print(entries.length);
