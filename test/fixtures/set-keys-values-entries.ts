declare function print(value: unknown): void;

const set = new Set();
set.add("x");
set.add("y");

const keys = set.keys();
const key1 = keys.next();
const key2 = keys.next();
const key3 = keys.next();
print(key1.value);
print(key1.done);
print(key2.value);
print(key2.done);
print(key3.done);

const values = set.values();
const value1 = values.next();
const value2 = values.next();
print(value1.value);
print(value1.done);
print(value2.value);
print(value2.done);

const entries = set.entries();
const entry1 = entries.next();
const entryValue1: any = entry1.value;
const entry2 = entries.next();
const entryValue2: any = entry2.value;
const entry3 = entries.next();
print(entryValue1[0]);
print(entryValue1[1]);
print(entry1.done);
print(entryValue2[0]);
print(entryValue2[1]);
print(entry2.done);
print(entry3.done);
