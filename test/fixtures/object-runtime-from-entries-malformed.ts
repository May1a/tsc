declare function print(value: unknown): void;

const source: { ok?: unknown } = {};
source.ok = "yes";
const entries: any[] = Object.entries(source);
const numberKey: any[] = ["key", "value"];
numberKey[0] = 1;
const missingValue: any[] = ["missing"];
entries.push("bad");
entries.push(numberKey);
entries.push(missingValue);
const obj: { ok?: unknown; missing?: unknown } = Object.fromEntries(entries);

const keys: unknown[] = Object.keys(obj);
print(keys.length);
print(obj.ok);
print(obj.missing);
