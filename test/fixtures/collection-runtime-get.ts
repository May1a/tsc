declare function print(value: unknown): void;

const m = new Map<string, number>();
m.set("a", 1);
m.set("b", 2);
print(m.get("a"));
print(m.get("b"));
print(m.get("missing"));
