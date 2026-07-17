declare function print(value: unknown): void;

const source = new Map();
source.set("k", 42);
const copy = new Map(source);
print(copy.size);
print(copy.get("k"));
