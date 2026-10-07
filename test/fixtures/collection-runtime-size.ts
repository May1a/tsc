declare function print(value: unknown): void;

const m = new Map<string, number>();
print(m.size);
m.set("a", 1);
m.set("b", 2);
print(m.size);

const s = new Set<string>();
print(s.size);
s.add("a");
print(s.size);
