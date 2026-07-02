declare function print(value: unknown): void;

const entries: [string, number][] = [["a", 1]];
const map = new Map(entries);
print(map.size);
print(map.get("a"));
