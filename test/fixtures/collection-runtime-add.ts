declare function print(value: unknown): void;

const s = new Set<string>();
s.add("a");
s.add("a");
s.add("b");
print(s.size);
