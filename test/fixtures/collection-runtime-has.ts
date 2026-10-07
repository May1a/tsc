declare function print(value: unknown): void;

const m = new Map<string, number>();
m.set("a", 1);
print(m.has("a"));
print(m.has("b"));

const s = new Set<string>();
s.add("a");
print(s.has("a"));
print(s.has("b"));
