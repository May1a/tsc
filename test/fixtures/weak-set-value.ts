declare function print(value: unknown): void;

const set = new WeakSet<object>();
const key = {};
set.add(key);
print(set);
print(set.has(key));
print(set.has({}));
