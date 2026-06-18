declare function print(value: unknown): void;

const objectKey = Object.create(null);
const otherObject = Object.create(null);
const arrayKey: unknown[] = [1];
const map = new Map();
map.set(objectKey, "object");
map.set(arrayKey, "array");
print(map.get(objectKey));
print(map.has(otherObject));
print(map.get(arrayKey));
