declare function print(value: unknown): void;

const source = new Set();
source.add("a");
source.add("b");
const copy = new Set(source);
print(copy.size);
print(copy.has("a"));
print(copy.has("b"));
