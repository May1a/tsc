declare function print(value: unknown): void;

const objectValue = Object.create(null);
const otherObject = Object.create(null);
const arrayValue: unknown[] = [1, 2];
const set = new Set();
set.add(objectValue);
set.add(arrayValue);
print(set.has(objectValue));
print(set.has(otherObject));
print(set.has(arrayValue));
