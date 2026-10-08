declare function print(value: unknown): void;
const array = Array.of(1, 2);
for (const key of array.keys()) { print(key); }
for (const value of array.values()) { print(value); }
for (const [key, value] of array.entries()) { print(key); print(value); }
const iterator = array.values();
const self = iterator[Symbol.iterator]();
print(self === iterator);
for (const value of iterator) { print(value); }
for (const value of iterator) { print("unexpected repeat"); print(value); }
