declare function print(value: unknown): void;

const map = new WeakMap<object, number>();
const key = {};
map.set(key, 4);
print(map);
print(map.get(key));
print(map.has({}));
