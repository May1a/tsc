declare function print(value: unknown): void;

const source: { a?: unknown; b?: unknown } = {};
source.a = "a";
source.b = "b";
const entries: any[] = Object.entries(source);
delete entries[1];

const obj: { a?: unknown; b?: unknown } = Object.fromEntries(entries);
const keys: unknown[] = Object.keys(obj);

print(keys.length);
print(obj.a);
print(Object.hasOwn(obj, "b"));
