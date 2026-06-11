declare function print(value: unknown): void;

const obj: { a?: unknown; b?: unknown } = {};
obj.a = "value";
obj.b = undefined;

const entries: any[] = Object.entries(obj);

print(entries.length);
print(entries[0][0]);
print(entries[0][1]);
print(entries[1][0]);
print(entries[1][1]);
