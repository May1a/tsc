declare function print(value: unknown): void;

const source: { a?: unknown; b?: unknown } = {};
source.a = "a";
source.b = undefined;
const entries: any[] = Object.entries(source);
const obj: { a?: unknown; b?: unknown } = Object.fromEntries(entries);

print(obj.a);
print(obj.b);
print(Object.hasOwn(obj, "b"));
