declare function print(value: unknown): void;

const source: { a?: unknown } = {};
source.a = "first";
const entries: any[] = Object.entries(source);
const pair: any = entries[0];
pair[1] = "second";
entries.push(pair);
const obj: { a?: unknown } = Object.fromEntries(entries);
const keys: unknown[] = Object.keys(obj);

print(obj.a);
print(keys.length);
