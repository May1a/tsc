declare function print(value: unknown): void;

const entries = [["a", 1]];
const map = new Map(entries);
print(map.size);
