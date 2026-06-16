declare function print(value: unknown): void;

const map = new Map();
map.set("a", 1);
map.set("b", 2);
map.set("a", 3);
print(map.size);
print(map.has("a"));
print(map.get("a"));
print(map.delete("a"));
print(map.has("a"));
print(map.size);
print(map.delete("a"));
