declare function print(value: unknown): void;

const set = new Set();
print(set.size);
const returned = set.add("a");
print(returned === set);
set.add("a");
set.add("b");
print(set.size);
print(set.has("a"));
print(set.has("c"));
