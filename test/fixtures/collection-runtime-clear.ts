declare function print(value: unknown): void;

const m = new Map<string, number>();
m.set("a", 1);
m.set("b", 2);
print(m.size);
m.clear();
print(m.size);
print(m.has("a"));

const s = new Set<number>();
s.add(10);
s.add(20);
print(s.size);
s.clear();
print(s.size);
print(s.has(10));
