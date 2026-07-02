declare function print(value: unknown): void;

const values = ["a", "b", "a"];
const set = new Set(values);
print(set.size);
print(set.has("a"));
print(set.has("c"));
