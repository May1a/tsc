declare function print(value: unknown): void;

const obj = { a: 1, b: 2 };
const keys: unknown[] = Object.keys(obj);
const values: unknown[] = Object.values(obj);
const entries: any = Object.entries(obj);
print(keys.length);
print(keys[0]);
print(keys[1]);
print(values[0]);
print(values[1]);
print(entries.length);
print(entries[0][0]);
print(entries[0][1]);
