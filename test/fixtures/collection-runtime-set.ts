declare function print(value: unknown): void;

const m = new Map<string, number>();
m.set("a", 1);
m.set("a", 3);
print(m.get("a"));
print(m.size);
