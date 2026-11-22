declare function print(value: unknown): void;

const m = new Map<string, number>();
m.set("k1", 10);
m.set("k2", 20);
for (const v of m.values()) {
  print(v);
}

const s = new Set<string>();
s.add("p");
s.add("q");
for (const v of s.values()) {
  print(v);
}
