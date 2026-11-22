declare function print(value: unknown): void;

const m = new Map<string, number>();
m.set("k1", 10);
m.set("k2", 20);
for (const k of m.keys()) {
  print(k);
}

const s = new Set<number>();
s.add(3);
s.add(4);
for (const k of s.keys()) {
  print(k);
}
