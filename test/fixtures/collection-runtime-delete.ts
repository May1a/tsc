declare function print(value: unknown): void;

const m = new Map<string, number>();
m.set("a", 1);
print(m.delete("a"));
print(m.delete("a"));
print(m.size);

const s = new Set<string>();
s.add("a");
print(s.delete("a"));
print(s.size);
